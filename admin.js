'use strict';
const db = require('../db');
const { requireAdmin } = require('../auth');
const { HttpError } = require('../http');
const { str, notify } = require('../context');

function getTargetUser(id) {
  const u = db.get('SELECT * FROM users WHERE id = ?', Number(id));
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.role === 'admin') throw new HttpError(400, 'Admin accounts cannot be modified here.');
  return u;
}

module.exports = function (router) {
  router.get('/api/admin/stats', ({ req }) => {
    requireAdmin(req);
    const c = (status) => db.get("SELECT COUNT(*) AS n FROM users WHERE role='user' AND status = ?", status).n;
    return {
      pending: c('pending'), approved: c('approved'), rejected: c('rejected'),
      totalUsers: db.get("SELECT COUNT(*) AS n FROM users WHERE role='user'").n,
      assessments: db.get("SELECT COUNT(*) AS n FROM assessments WHERE status='completed'").n,
      resumes: db.get('SELECT COUNT(*) AS n FROM resumes').n,
      skills: db.get('SELECT COUNT(*) AS n FROM skills_catalog WHERE active = 1').n,
    };
  });

  router.get('/api/admin/users', ({ req, query }) => {
    requireAdmin(req);
    const status = query.status && query.status !== 'all' ? query.status : null;
    if (status && !['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid status filter.');
    const q = (query.q || '').trim().toLowerCase();
    const rows = db.all(
      `SELECT u.id, u.name, u.email, u.status, u.reject_reason AS rejectReason, u.created_at AS createdAt,
              u.reviewed_at AS reviewedAt, u.last_login_at AS lastLoginAt,
              (SELECT COUNT(*) FROM assessments a WHERE a.user_id = u.id AND a.status='completed') AS assessments,
              (SELECT ROUND(overall_score) FROM assessments a WHERE a.user_id = u.id AND a.status='completed' ORDER BY a.id DESC LIMIT 1) AS lastScore
         FROM users u WHERE u.role = 'user' ${status ? 'AND u.status = ?' : ''}
         ORDER BY (u.status = 'pending') DESC, u.created_at DESC LIMIT 500`, ...(status ? [status] : []));
    return { users: q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : rows };
  });

  router.post('/api/admin/users/:id/approve', ({ req, params }) => {
    const admin = requireAdmin(req);
    const u = getTargetUser(params.id);
    db.run("UPDATE users SET status='approved', reject_reason=NULL, reviewed_at=?, reviewed_by=? WHERE id=?", db.now(), admin.id, u.id);
    notify(u.id, 'system', 'Welcome to SkillBridge AI', 'Your account was approved. Start with the AI Skill Assessment to build your profile.', 'assessment');
    return { ok: true };
  });

  router.post('/api/admin/users/:id/reject', async ({ req, params, body }) => {
    const admin = requireAdmin(req);
    const u = getTargetUser(params.id);
    const b = await body();
    const reason = str(b.reason, { field: 'Reason', max: 200 });
    db.tx(() => {
      db.run("UPDATE users SET status='rejected', reject_reason=?, reviewed_at=?, reviewed_by=? WHERE id=?", reason || null, db.now(), admin.id, u.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', u.id); // revoke any active login
    });
    return { ok: true };
  });

  router.delete('/api/admin/users/:id', ({ req, params }) => {
    requireAdmin(req);
    const u = getTargetUser(params.id);
    db.run('DELETE FROM users WHERE id = ?', u.id);
    return { ok: true };
  });

  /* ----- Skill catalog (options shown in the assessment picker) ----- */
  router.get('/api/admin/skills', ({ req }) => {
    requireAdmin(req);
    return { skills: db.all('SELECT id, name, category, active FROM skills_catalog ORDER BY category, name') };
  });

  router.post('/api/admin/skills', async ({ req, body }) => {
    requireAdmin(req);
    const b = await body();
    const name = str(b.name, { field: 'Skill name', min: 2, max: 40, required: true });
    const category = str(b.category, { field: 'Category', max: 30 }) || 'General';
    if (db.get('SELECT id FROM skills_catalog WHERE name = ?', name)) throw new HttpError(409, 'That skill already exists.');
    const r = db.run('INSERT INTO skills_catalog (name, category, active) VALUES (?,?,1)', name, category);
    return { __status: 201, body: { id: Number(r.lastInsertRowid) } };
  });

  router.patch('/api/admin/skills/:id', async ({ req, params, body }) => {
    requireAdmin(req);
    const b = await body();
    const s = db.get('SELECT * FROM skills_catalog WHERE id = ?', Number(params.id));
    if (!s) throw new HttpError(404, 'Skill not found.');
    const name = b.name !== undefined ? str(b.name, { field: 'Skill name', min: 2, max: 40, required: true }) : s.name;
    const category = b.category !== undefined ? (str(b.category, { max: 30 }) || 'General') : s.category;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : s.active;
    db.run('UPDATE skills_catalog SET name=?, category=?, active=? WHERE id=?', name, category, active, s.id);
    return { ok: true };
  });

  router.delete('/api/admin/skills/:id', ({ req, params }) => {
    requireAdmin(req);
    db.run('DELETE FROM skills_catalog WHERE id = ?', Number(params.id));
    return { ok: true };
  });

  /* ----- Announcements → in-app notifications for every approved user ----- */
  router.get('/api/admin/announcements', ({ req }) => {
    requireAdmin(req);
    return { announcements: db.all('SELECT id, title, body, created_at AS createdAt FROM announcements ORDER BY id DESC LIMIT 20') };
  });

  router.post('/api/admin/announcements', async ({ req, body }) => {
    const admin = requireAdmin(req);
    const b = await body();
    const title = str(b.title, { field: 'Title', min: 3, max: 120, required: true });
    const text = str(b.body, { field: 'Message', min: 3, max: 400, required: true });
    let sent = 0;
    db.tx(() => {
      db.run('INSERT INTO announcements (title, body, created_by, created_at) VALUES (?,?,?,?)', title, text, admin.id, db.now());
      for (const u of db.all("SELECT id FROM users WHERE role='user' AND status='approved'")) {
        notify(u.id, 'system', title, text, null);
        sent += 1;
      }
    });
    return { __status: 201, body: { sent } };
  });
};
