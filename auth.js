'use strict';
/**
 * Authentication: scrypt password hashing, DB-backed sessions (only a SHA-256
 * hash of the token is stored), cookie handling and access guards.
 */
const crypto = require('crypto');
const { promisify } = require('util');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./http');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sb_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// A valid-looking hash used to keep login timing constant for unknown emails.
let DUMMY_HASH = null;
async function dummyVerify(password) {
  if (!DUMMY_HASH) DUMMY_HASH = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, DUMMY_HASH);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieString(value, maxAgeSec) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttlSec = config.sessionTtlHours * 3600;
  db.run(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)',
    sha256(token), userId, db.now(), new Date(Date.now() + ttlSec * 1000).toISOString(),
    req.socket.remoteAddress || null, String(req.headers['user-agent'] || '').slice(0, 200)
  );
  res.setHeader('Set-Cookie', cookieString(token, ttlSec));
}

function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', cookieString('', 0));
}

/** Returns the session's user row or null. */
function currentUser(req) {
  if (req._user !== undefined) return req._user;
  const token = parseCookies(req)[COOKIE];
  let user = null;
  if (token) {
    const row = db.get(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, sha256(token));
    if (row) {
      if (new Date(row.expires_at) < new Date()) {
        db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
      } else {
        user = { id: row.id, name: row.name, email: row.email, role: row.role, status: row.status, createdAt: row.created_at };
      }
    }
  }
  req._user = user;
  return user;
}

/* ---------- Guards (used as route middleware) ---------- */
function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in to continue.');
  if (u.role !== 'user') throw new HttpError(403, 'This area is for student accounts.');
  if (u.status !== 'approved') throw new HttpError(403, 'Your account has not been approved yet.');
  return u;
}
function requireAdmin(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in as admin.');
  if (u.role !== 'admin') throw new HttpError(403, 'Admin access required.');
  return u;
}

/** Create the admin account on first start (credentials come from the environment). */
async function bootstrapAdmin() {
  const existing = db.get("SELECT id, email, password_hash FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (existing) {
    // .env is the source of truth for the admin login: if ADMIN_PASSWORD (and/or ADMIN_EMAIL) is set and
    // differs from what is stored, update it. This makes the project portable (a copied database or a
    // changed .env never leaves you locked out).
    const wantEmail = (config.admin.email || existing.email).toLowerCase();
    const pwdOk = config.admin.password ? await verifyPassword(config.admin.password, existing.password_hash) : true;
    if (config.admin.password && (!pwdOk || wantEmail !== existing.email)) {
      const clash = db.get('SELECT id FROM users WHERE email = ? AND id != ?', wantEmail, existing.id);
      if (clash) { console.warn(`[admin] ADMIN_EMAIL ${wantEmail} belongs to another account – admin login unchanged.`); return; }
      db.run("UPDATE users SET email = ?, password_hash = ?, status = 'approved' WHERE id = ?", wantEmail, await hashPassword(config.admin.password), existing.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', existing.id);
      console.log(`[admin] Admin login synced from .env  →  ${wantEmail}`);
    }
    return;
  }
  const email = config.admin.email || 'admin@skillbridge.local';
  let password = config.admin.password;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const hash = await hashPassword(password);
  db.run(
    "INSERT INTO users (name, email, password_hash, role, status, created_at, reviewed_at) VALUES (?,?,?,'admin','approved',?,?)",
    config.admin.name, email, hash, db.now(), db.now()
  );
  console.log('\n──────────────────────────────────────────────');
  console.log(' Admin account created');
  console.log('   Email   :', email);
  if (generated) {
    console.log('   Password:', password, ' (shown once – save it now)');
  } else {
    console.log('   Password: taken from ADMIN_PASSWORD in your .env');
  }
  console.log('──────────────────────────────────────────────\n');
}

function purgeExpiredSessions() {
  db.run('DELETE FROM sessions WHERE expires_at < ?', db.now());
}

module.exports = {
  hashPassword, verifyPassword, dummyVerify, createSession, destroySession, currentUser,
  requireUser, requireAdmin, bootstrapAdmin, purgeExpiredSessions,
};
