'use strict';
/** Resume data model: normalisation, completeness check, truthfulness verification. */

const s = (v, max = 300) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const arr = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter((x) => (typeof x === 'string' ? x : x && Object.values(x).some((y) => (Array.isArray(y) ? y.length : y)))) : []);
const strList = (v, max, len = 200) => arr(v, max, (x) => s(typeof x === 'string' ? x : '', len)).filter(Boolean);

function normalizeResume(o = {}) {
  const c = o.contact || {};
  return {
    name: s(o.name, 100),
    headline: s(o.headline, 140),
    contact: {
      email: s(c.email, 120), phone: s(c.phone, 40), location: s(c.location, 120),
      links: strList(c.links, 5, 200),
    },
    summary: s(o.summary, 900),
    skills: strList(o.skills, 40, 50),
    experience: arr(o.experience, 10, (e) => ({
      title: s(e?.title, 100), company: s(e?.company, 100), location: s(e?.location, 80),
      start: s(e?.start, 30), end: s(e?.end, 30), bullets: strList(e?.bullets, 8, 400),
    })).filter((e) => e.title || e.company),
    education: arr(o.education, 6, (e) => ({
      degree: s(e?.degree, 140), institution: s(e?.institution, 140), location: s(e?.location, 80),
      start: s(e?.start, 30), end: s(e?.end, 30), details: strList(e?.details, 5, 250),
    })).filter((e) => e.degree || e.institution),
    projects: arr(o.projects, 8, (p) => ({
      name: s(p?.name, 120), description: s(p?.description, 500),
      technologies: strList(p?.technologies, 12, 40), bullets: strList(p?.bullets, 6, 400),
    })).filter((p) => p.name),
    certifications: strList(o.certifications, 12, 200),
    achievements: strList(o.achievements, 10, 300),
    languages: strList(o.languages, 8, 60),
  };
}

/** Deterministic checklist (no AI) so the user sees concrete, honest gaps. */
function completeness(r) {
  const checks = [
    ['Name and contact details', !!(r.name && (r.contact.email || r.contact.phone))],
    ['Professional summary', r.summary.length >= 60],
    ['Skills section (5+ skills)', r.skills.length >= 5],
    ['Education listed', r.education.length > 0],
    ['Experience or projects listed', r.experience.length + r.projects.length > 0],
    ['Bullet points describe work', r.experience.concat(r.projects).some((x) => x.bullets.length >= 2)],
    ['Location provided', !!r.contact.location],
  ];
  const done = checks.filter((c) => c[1]).length;
  return { percent: Math.round((done / checks.length) * 100), items: checks.map(([label, ok]) => ({ label, ok })) };
}

/* ---------- truthfulness ---------- */
const flat = (t) => String(t).toLowerCase();
function tokenPresent(rawLower, token) {
  const t = token.toLowerCase().replace(/[^a-z0-9+#]/g, '');
  if (t.length < 2) return true;
  return rawLower.includes(t.slice(0, Math.min(t.length, 5)));
}
function phrasePresent(rawLower, phrase) {
  const toks = String(phrase).split(/[\s/,&()-]+/).filter((x) => x.replace(/[^a-z0-9]/gi, '').length >= 3);
  if (!toks.length) return true;
  return toks.every((t) => tokenPresent(rawLower, t));
}
const NUM_RE = /\b\d[\d,.]*\s?(?:%|\+|k|lakh|crore|x)?/gi;
const normNum = (n) => n.toLowerCase().replace(/[\s,]/g, '');

/**
 * Removes skills that are not supported by the source text and reports
 * companies, institutions, certifications and figures that do not appear in it.
 */
function verifyTruthful(rawText, improved) {
  const raw = flat(rawText);
  const rawNums = new Set((raw.match(NUM_RE) || []).map(normNum));
  const warnings = [];
  const out = JSON.parse(JSON.stringify(improved));

  const keptSkills = [];
  for (const sk of out.skills) {
    if (phrasePresent(raw, sk)) keptSkills.push(sk);
    else warnings.push(`Removed the skill "${sk}" because it does not appear in your original resume.`);
  }
  out.skills = keptSkills;

  for (const e of out.experience) {
    if (e.company && !phrasePresent(raw, e.company)) warnings.push(`Employer "${e.company}" was not found in your original text – please verify.`);
  }
  for (const e of out.education) {
    if (e.institution && !phrasePresent(raw, e.institution)) warnings.push(`Institution "${e.institution}" was not found in your original text – please verify.`);
  }
  const certKept = [];
  for (const c of out.certifications) {
    if (phrasePresent(raw, c)) certKept.push(c);
    else warnings.push(`Removed the certification "${c}" because it does not appear in your original resume.`);
  }
  out.certifications = certKept;

  const textBlocks = [out.summary, ...out.experience.flatMap((e) => e.bullets), ...out.projects.flatMap((p) => [p.description, ...p.bullets]), ...out.achievements];
  const flagged = new Set();
  for (const block of textBlocks) {
    for (const n of (block || '').match(NUM_RE) || []) {
      const k = normNum(n);
      if (!rawNums.has(k) && !/^(19|20)\d\d$/.test(k) && k.length > 0 && !flagged.has(k) && !/^\d$/.test(k)) {
        flagged.add(k);
        warnings.push(`The figure "${n.trim()}" appears in the polished resume but not in your original – keep it only if it is accurate.`);
      }
    }
  }
  return { resume: out, warnings };
}

module.exports = { normalizeResume, completeness, verifyTruthful };
