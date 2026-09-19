'use strict';
/**
 * Shared helpers used by several routes: notifications, user "context" for AI
 * prompts, and small validation utilities.
 */
const db = require('./db');
const { HttpError } = require('./http');

/* ---------- Validation ---------- */
function str(v, { min = 0, max = 500, field = 'Value', required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${field} is required.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  const s = v.replace(/\u0000/g, '').trim();
  if (required && s.length < Math.max(1, min)) throw new HttpError(400, `${field} must be at least ${Math.max(1, min)} characters.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

function parseJson(text, fallback = null) {
  if (text === null || text === undefined) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

/* ---------- Notifications ---------- */
function notify(userId, type, title, body = '', view = null) {
  db.run(
    'INSERT INTO notifications (user_id, type, title, body, view, created_at) VALUES (?,?,?,?,?,?)',
    userId, type, String(title).slice(0, 140), String(body || '').slice(0, 500), view, db.now()
  );
}

/* ---------- User context for prompts ---------- */
function getProfile(userId) {
  const p = db.get('SELECT * FROM profiles WHERE user_id = ?', userId) || {};
  return {
    headline: p.headline || '', education: p.education || '', institution: p.institution || '',
    graduationYear: p.graduation_year || '', experienceLevel: p.experience_level || '',
    location: p.location_text || '', latitude: p.latitude ?? null, longitude: p.longitude ?? null,
    countryCode: p.country_code || '', interests: p.interests || '', skills: p.skills || '', bio: p.bio || '',
  };
}

function getAssessedSkills(userId) {
  return db.all(
    'SELECT skill_name AS name, score, level, updated_at AS updatedAt FROM user_skills WHERE user_id = ? ORDER BY score DESC', userId
  ).map((r) => ({ name: r.name, score: Math.round(r.score), level: r.level, updatedAt: r.updatedAt }));
}

function getLatestResume(userId) {
  const r = db.get('SELECT * FROM resumes WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
  if (!r) return null;
  return {
    id: r.id, filename: r.filename, rawText: r.raw_text,
    parsed: parseJson(r.parsed_json, {}), improved: parseJson(r.improved_json, null),
    notes: parseJson(r.notes_json, null), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function getLatestGap(userId) {
  const g = db.get('SELECT * FROM gap_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
  if (!g) return null;
  return { id: g.id, role: g.role_title, createdAt: g.created_at, ...parseJson(g.result_json, {}) };
}

function getJobRecs(userId) {
  const r = db.get('SELECT * FROM job_recommendations WHERE user_id = ?', userId);
  return r ? { createdAt: r.created_at, ...parseJson(r.result_json, {}) } : null;
}

function compactResume(res) {
  if (!res) return null;
  const src = res.improved || res.parsed || {};
  return {
    headline: src.headline || '', summary: src.summary || '',
    skills: src.skills || [],
    experience: (src.experience || []).map((e) => ({ title: e.title, company: e.company, start: e.start, end: e.end, highlights: (e.bullets || []).slice(0, 3) })),
    education: (src.education || []).map((e) => ({ degree: e.degree, institution: e.institution, end: e.end })),
    projects: (src.projects || []).map((p) => ({ name: p.name, technologies: p.technologies || [], description: p.description })),
    certifications: src.certifications || [],
  };
}

/**
 * Builds a compact text/JSON snapshot of everything the platform knows about a
 * user. It is embedded in AI prompts so answers reflect the real profile.
 */
function buildUserContext(userId, { resume = true } = {}) {
  const user = db.get('SELECT name FROM users WHERE id = ?', userId);
  const profile = getProfile(userId);
  const skills = getAssessedSkills(userId);
  const gap = getLatestGap(userId);
  const recs = getJobRecs(userId);
  const res = resume ? compactResume(getLatestResume(userId)) : null;
  const lastAssessment = db.get(
    "SELECT overall_score, level, completed_at, result_json FROM assessments WHERE user_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1", userId);
  const ar = lastAssessment ? parseJson(lastAssessment.result_json, {}) : {};

  const ctx = {
    name: user?.name || '',
    profile: {
      headline: profile.headline, education: profile.education, institution: profile.institution,
      graduationYear: profile.graduationYear, experienceLevel: profile.experienceLevel, location: profile.location,
      careerInterests: profile.interests, selfListedSkills: profile.skills, bio: profile.bio,
    },
    assessedSkills: skills.map((s) => `${s.name}: ${s.score}% (${s.level})`),
    latestAssessment: lastAssessment ? {
      overallPercent: Math.round(lastAssessment.overall_score), level: lastAssessment.level,
      strongSkills: ar.strong_skills || [], skillsNeedingImprovement: ar.improvement_skills || [],
      practiceAreas: (ar.ai?.practice_areas || []).map((p) => p.skill + ': ' + p.focus),
    } : null,
    latestSkillGap: gap ? {
      targetRole: gap.role, readinessPercent: gap.readiness_percent ?? null,
      gaps: (gap.rows || []).filter((r) => r.status === 'improve').map((r) => `${r.skill}: current ${r.current}% vs required ${r.required}%`),
      strong: (gap.rows || []).filter((r) => r.status === 'strong').map((r) => r.skill),
      notAssessed: (gap.rows || []).filter((r) => r.status === 'not_assessed').map((r) => r.skill),
    } : null,
    recommendedRoles: recs ? {
      jobs: (recs.job_roles || []).map((r) => r.title), internships: (recs.internship_roles || []).map((r) => r.title),
    } : null,
    resume: res,
  };
  return ctx;
}

module.exports = {
  str, parseJson, notify, getProfile, getAssessedSkills, getLatestResume, getLatestGap, getJobRecs,
  compactResume, buildUserContext,
};
