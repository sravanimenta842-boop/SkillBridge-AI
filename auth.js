'use strict';
const db = require('../db');
const auth = require('../auth');
const config = require('../config');
const { HttpError, createLimiter } = require('../http');
const { str, getProfile } = require('../context');

const loginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const registerLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status };
}

module.exports = function (router) {
  router.get('/api/config', () => ({
    aiConfigured: config.aiConfigured(),
  }));

  router.post('/api/auth/register', async ({ req, body }) => {
    registerLimiter.check(req.socket.remoteAddress || 'ip');
    const b = await body();
    const name = str(b.name, { field: 'Name', min: 2, max: 80, required: true });
    const email = str(b.email, { field: 'Email', max: 254, required: true }).toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8–128 characters.');
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new HttpError(400, 'Password must include at least one letter and one number.');
    if (db.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists.');

    const hash = await auth.hashPassword(password);
    db.tx(() => {
      const r = db.run("INSERT INTO users (name, email, password_hash, role, status, created_at) VALUES (?,?,?,'user','pending',?)", name, email, hash, db.now());
      db.run('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)', r.lastInsertRowid, db.now());
    });
    return { __status: 201, body: { message: 'Registration received. An administrator must approve your account before you can sign in.' } };
  });

  async function doLogin(req, res, body, wantRole) {
    const b = await body();
    const email = str(b.email, { field: 'Email', max: 254, required: true }).toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const key = `${req.socket.remoteAddress}|${email}`;
    loginLimiter.check(key);

    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) { await auth.dummyVerify(password); throw new HttpError(401, 'Invalid email or password.'); }
    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Invalid email or password.');

    if (wantRole === 'admin' && user.role !== 'admin') throw new HttpError(401, 'Invalid email or password.');
    if (wantRole === 'user' && user.role === 'admin') throw new HttpError(403, 'This is an admin account. Use the Admin Login instead.');
    if (user.status === 'pending') throw new HttpError(403, 'Your registration is still awaiting admin approval.', { code: 'pending' });
    if (user.status === 'rejected') {
      throw new HttpError(403, 'Your registration was not approved' + (user.reject_reason ? `: ${user.reject_reason}` : '.'), { code: 'rejected' });
    }
    loginLimiter.reset(key);
    auth.createSession(req, res, user.id);
    db.run('UPDATE users SET last_login_at = ? WHERE id = ?', db.now(), user.id);
    return { user: publicUser(user) };
  }

  router.post('/api/auth/login', ({ req, res, body }) => doLogin(req, res, body, 'user'));
  router.post('/api/auth/admin/login', ({ req, res, body }) => doLogin(req, res, body, 'admin'));

  router.post('/api/auth/logout', ({ req, res }) => {
    auth.destroySession(req, res);
    return { ok: true };
  });

  router.get('/api/auth/me', ({ req }) => {
    const u = auth.currentUser(req);
    if (!u) throw new HttpError(401, 'Not signed in.');
    return { user: publicUser(u), profile: u.role === 'user' ? getProfile(u.id) : null };
  });
};
