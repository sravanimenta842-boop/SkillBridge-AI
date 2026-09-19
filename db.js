'use strict';
/**
 * SQLite persistence layer.
 *
 * Uses Node's built-in `node:sqlite` (Node 22.5+). If that is unavailable it
 * falls back to the optional `better-sqlite3` package. Both expose the same
 * prepare().run/get/all API, so the rest of the app is driver-agnostic.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

let driver = null;
let DatabaseCtor = null;

try {
  // eslint-disable-next-line global-require
  const orig = process.emitWarning;
  process.emitWarning = (w, ...rest) => {
    if (typeof w === 'string' && w.includes('SQLite is an experimental')) return;
    return orig.call(process, w, ...rest);
  };
  DatabaseCtor = require('node:sqlite').DatabaseSync;
  process.emitWarning = orig;
  driver = 'node:sqlite';
} catch (_) {
  try {
    DatabaseCtor = require('better-sqlite3');
    driver = 'better-sqlite3';
  } catch (e2) {
    console.error(
      '\n[FATAL] No SQLite driver available.\n' +
      '  • Use Node.js 22.5 or newer (built-in node:sqlite), or\n' +
      '  • run "npm install better-sqlite3".\n'
    );
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const raw = new DatabaseCtor(config.dbPath);
raw.exec('PRAGMA journal_mode = WAL;');
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec('PRAGMA busy_timeout = 5000;');

/** node:sqlite rejects `undefined` and booleans – normalise all bind values. */
function clean(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

const db = {
  driver,
  exec: (sql) => raw.exec(sql),
  run(sql, ...params) { return raw.prepare(sql).run(...clean(params)); },
  get(sql, ...params) { return raw.prepare(sql).get(...clean(params)); },
  all(sql, ...params) { return raw.prepare(sql).all(...clean(params)); },
  /** Run fn inside a transaction; rolls back on error. */
  tx(fn) {
    raw.exec('BEGIN');
    try {
      const out = fn();
      raw.exec('COMMIT');
      return out;
    } catch (e) {
      try { raw.exec('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    }
  },
  close() { raw.close(); },
};

const now = () => new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  created_at    TEXT NOT NULL,
  reviewed_at   TEXT,
  reviewed_by   INTEGER,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline         TEXT,
  education        TEXT,
  institution      TEXT,
  graduation_year  TEXT,
  experience_level TEXT,
  location_text    TEXT,
  latitude         REAL,
  longitude        REAL,
  country_code     TEXT,
  interests        TEXT,
  skills           TEXT,
  bio              TEXT,
  updated_at       TEXT
);

CREATE TABLE IF NOT EXISTS skills_catalog (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL DEFAULT 'General',
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS assessments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skills_json   TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  answers_json  TEXT,
  result_json   TEXT,
  overall_score REAL,
  level         TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_assess_user ON assessments(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key     TEXT NOT NULL,
  skill_name    TEXT NOT NULL,
  score         REAL NOT NULL,
  level         TEXT NOT NULL,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE SET NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, skill_key)
);

CREATE TABLE IF NOT EXISTS role_requirements (
  role_key      TEXT PRIMARY KEY,
  role_title    TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gap_analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title  TEXT NOT NULL,
  result_json TEXT NOT NULL,
  readiness   REAL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gap_user ON gap_analyses(user_id, created_at);

CREATE TABLE IF NOT EXISTS job_recommendations (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT,
  raw_text      TEXT NOT NULL,
  parsed_json   TEXT NOT NULL,
  improved_json TEXT,
  notes_json    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resume_user ON resumes(user_id, id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('coach','assistant')),
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, channel, id);

CREATE TABLE IF NOT EXISTS coach_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  view       TEXT,
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
`);

/**
 * Skill options offered in the assessment picker. This is configuration data
 * (not questions) and can be edited by the admin from the Admin Dashboard.
 * Only seeded once, when the catalog is empty.
 */
const DEFAULT_SKILLS = [
  ['JavaScript', 'Programming'], ['Python', 'Programming'], ['Java', 'Programming'],
  ['HTML', 'Web'], ['CSS', 'Web'], ['Node.js', 'Web'],
  ['Front-End Development', 'Web'], ['Back-End Development', 'Web'],
  ['Database', 'Data'], ['SQL', 'Data'],
  ['Communication', 'Professional'], ['Problem Solving', 'Professional'],
  ['Software Testing', 'Quality'], ['Technical Writing', 'Professional'],
];
if (db.get('SELECT COUNT(*) AS n FROM skills_catalog').n === 0) {
  db.tx(() => {
    for (const [name, cat] of DEFAULT_SKILLS) {
      db.run('INSERT INTO skills_catalog (name, category, active) VALUES (?,?,1)', name, cat);
    }
  });
}

db.now = now;
module.exports = db;
