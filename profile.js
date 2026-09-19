'use strict';
const db = require('../db');
const { requireUser } = require('../auth');
const { HttpError } = require('../http');
const { str, getProfile, getAssessedSkills } = require('../context');

module.exports = function (router) {
  router.get('/api/profile', ({ req }) => ({ profile: getProfile(requireUser(req).id) }));

  router.put('/api/profile', async ({ req, body }) => {
    const u = requireUser(req);
    const b = await body();
    const num = (v, lo, hi, name) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, `${name} is out of range.`);
      return n;
    };
    const country = str(b.countryCode, { max: 2 }).toLowerCase();
    if (country && !/^[a-z]{2}$/.test(country)) throw new HttpError(400, 'Country code must be 2 letters.');
    const name = b.name !== undefined ? str(b.name, { field: 'Name', min: 2, max: 80, required: true }) : null;
    db.tx(() => {
      if (name) db.run('UPDATE users SET name = ? WHERE id = ?', name, u.id);
      db.run(
        `INSERT INTO profiles (user_id, headline, education, institution, graduation_year, experience_level, location_text,
                               latitude, longitude, country_code, interests, skills, bio, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET headline=excluded.headline, education=excluded.education,
           institution=excluded.institution, graduation_year=excluded.graduation_year,
           experience_level=excluded.experience_level, location_text=excluded.location_text,
           latitude=excluded.latitude, longitude=excluded.longitude, country_code=excluded.country_code,
           interests=excluded.interests, skills=excluded.skills, bio=excluded.bio, updated_at=excluded.updated_at`,
        u.id,
        str(b.headline, { max: 120 }), str(b.education, { max: 120 }), str(b.institution, { max: 120 }),
        str(b.graduationYear, { max: 10 }), str(b.experienceLevel, { max: 40 }), str(b.location, { max: 120 }),
        num(b.latitude, -90, 90, 'Latitude'), num(b.longitude, -180, 180, 'Longitude'), country || null,
        str(b.interests, { max: 300 }), str(b.skills, { max: 500 }), str(b.bio, { max: 600 }), db.now()
      );
    });
    return { profile: getProfile(u.id) };
  });

  /** Skill options for the assessment picker (managed by the admin). */
  router.get('/api/skills', ({ req }) => {
    requireUser(req);
    return { skills: db.all('SELECT id, name, category FROM skills_catalog WHERE active = 1 ORDER BY category, name') };
  });

  router.get('/api/skills/mine', ({ req }) => ({ skills: getAssessedSkills(requireUser(req).id) }));
};
