'use strict';
/**
 * Central configuration. Reads a local ".env" file (if present) without any
 * third-party dependency, then exposes typed settings. Secrets are only ever
 * read from environment variables – never from source code.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // strip trailing inline comment ("value  # comment")
      val = val.replace(/\s+#.*$/, '');
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const env = process.env;
const str = (k, d = '') => (env[k] !== undefined && env[k] !== '' ? String(env[k]) : d);
const int = (k, d) => {
  const n = parseInt(env[k], 10);
  return Number.isFinite(n) ? n : d;
};
const bool = (k, d = false) => {
  if (env[k] === undefined || env[k] === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(String(env[k]).toLowerCase());
};

const provider = str('AI_PROVIDER', 'gemini').toLowerCase();

const config = {
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  port: int('PORT', 3000),
  isProd: str('NODE_ENV', 'development') === 'production',
  cookieSecure: bool('COOKIE_SECURE', str('NODE_ENV') === 'production'),
  dbPath: path.resolve(ROOT, str('DB_PATH', './data/skillbridge.db')),
  sessionTtlHours: int('SESSION_TTL_HOURS', 24 * 7),

  admin: {
    name: str('ADMIN_NAME', 'Platform Admin'),
    email: str('ADMIN_EMAIL', '').toLowerCase(),
    password: str('ADMIN_PASSWORD', ''),
  },

  ai: {
    provider,
    apiKey: str('AI_API_KEY', ''),
    model: str('AI_MODEL', ''),
    baseUrl: str('AI_BASE_URL', ''),
    timeoutMs: int('AI_TIMEOUT_MS', 120000),
    retries: Math.max(1, int('AI_RETRIES', 5)),
    retryBaseMs: int('AI_RETRY_BASE_MS', 1000),
    fallbackModels: str('AI_FALLBACK_MODELS', '').split(',').map((x) => x.trim()).filter(Boolean),
  },

};

config.aiConfigured = () => !!config.ai.apiKey;

module.exports = config;
