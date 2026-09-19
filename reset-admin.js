'use strict';
/**
 * Reset (or create) the admin account.
 *   npm run reset-admin                      → uses ADMIN_EMAIL / ADMIN_PASSWORD from .env
 *   npm run reset-admin -- me@x.com NewPass123
 * Also clears the login rate limit by design (it is in-memory: just restart the server).
 */
const crypto = require('crypto');
const config = require('../server/config');
const db = require('../server/db');
const auth = require('../server/auth');

(async () => {
  const email = (process.argv[2] || config.admin.email || 'admin@skillbridge.local').toLowerCase();
  let password = process.argv[3] || config.admin.password;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url'); generated = true; }
  if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
  const hash = await auth.hashPassword(password);
  const admin = db.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (admin) {
    db.run("UPDATE users SET email = ?, password_hash = ?, status = 'approved' WHERE id = ?", email, hash, admin.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', admin.id);
  } else {
    db.run("INSERT INTO users (name, email, password_hash, role, status, created_at, reviewed_at) VALUES (?,?,?,'admin','approved',?,?)", config.admin.name, email, hash, db.now(), db.now());
  }
  const check = db.get("SELECT email, password_hash FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const verified = await auth.verifyPassword(password, check.password_hash);
  console.log(`\nDatabase: ${config.dbPath}`);
  console.log(`Admin ${admin ? 'updated' : 'created'}.\n  Email   : ${email}\n  Password: ${password}${generated ? '  (generated)' : ''}\n  Self-check: password ${verified ? 'verified OK' : 'FAILED verification'}\n`);
  console.log('Restart the server, then sign in via "Admin login".');
})();
