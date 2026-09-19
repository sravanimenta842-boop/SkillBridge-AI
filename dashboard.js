'use strict';
const db = require('../db');
const { requireUser } = require('../auth');
const { getProfile, getAssessedSkills, getLatestGap, getJobRecs, getLatestResume } = require('../context');

module.exports = function (router) {
  router.get('/api/dashboard', ({ req }) => {
    const u = requireUser(req);
    const last = db.get(
      "SELECT id, overall_score AS score, level, completed_at AS completedAt FROM assessments WHERE user_id = ? AND status='completed' ORDER BY id DESC LIMIT 1", u.id);
    const pending = db.get("SELECT id FROM assessments WHERE user_id = ? AND status='in_progress' ORDER BY id DESC LIMIT 1", u.id);
    const gap = getLatestGap(u.id);
    const recs = getJobRecs(u.id);
    const resume = getLatestResume(u.id);
    const profile = getProfile(u.id);
    return {
      name: u.name,
      assessment: last ? { score: Math.round(last.score), level: last.level, completedAt: last.completedAt } : null,
      assessmentInProgress: !!pending,
      skillsAssessed: getAssessedSkills(u.id).length,
      gap: gap ? { role: gap.role, readiness: gap.readiness_percent ?? null } : null,
      jobs: recs ? { jobRoles: (recs.job_roles || []).length, internshipRoles: (recs.internship_roles || []).length } : null,
      resume: resume ? { filename: resume.filename, improved: !!resume.improved } : null,
      profile: { location: profile.location },
      coachMessages: db.get("SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND channel='coach' AND role='user'", u.id).n,
      unread: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id).n,
    };
  });
};
