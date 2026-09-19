'use strict';
/**
 * Creates one ready-to-use, already-approved demo user so a fresh install can be demoed immediately.
 *   npm run seed            → demo@example.com / Demo@12345
 *   npm run seed -- name email password
 */
const config = require('../server/config');
const db = require('../server/db');
const auth = require('../server/auth');

(async () => {
  const [name = 'Demo Student', email = 'demo@example.com', password = 'Demo@12345'] = process.argv.slice(2);
  const e = email.toLowerCase();
  if (db.get('SELECT id FROM users WHERE email = ?', e)) { console.log(`User ${e} already exists – nothing to do.`); return; }
  const r = db.run("INSERT INTO users (name, email, password_hash, role, status, created_at, reviewed_at) VALUES (?,?,?,'user','approved',?,?)", name, e, await auth.hashPassword(password), db.now(), db.now());
  const id = r.lastInsertRowid;
  try { db.run('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)', id, db.now()); } catch { /* profile row optional */ }
  console.log(`Demo user created in ${config.dbPath}\n  Email: ${e}\n  Password: ${password}`);
})();
