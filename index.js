'use strict';
const http = require('http');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const { Router, HttpError, json, readJson, serveStatic, securityHeaders, checkOrigin } = require('./http');

const router = new Router();
for (const name of ['auth', 'admin', 'profile', 'notifications', 'dashboard', 'assessment', 'gap', 'jobs', 'resume', 'chat']) {
  require(`./routes/${name}`)(router);
}

async function handleApi(req, res, url) {
  checkOrigin(req);
  const m = router.match(req.method, url.pathname);
  if (!m.route) {
    throw new HttpError(m.pathMatched ? 405 : 404, m.pathMatched ? 'Method not allowed' : 'Not found');
  }
  const query = Object.fromEntries(url.searchParams.entries());
  const ctx = { req, res, params: m.params, query, body: (limit) => readJson(req, limit) };
  let result;
  for (const h of m.route.handlers) result = await h(ctx);
  if (res.writableEnded) return;
  if (result && result.__raw) {
    res.writeHead(result.__raw.status || 200, result.__raw.headers || {});
    return res.end(result.__raw.body);
  }
  if (result && result.__status) return json(res, result.__status, result.body);
  json(res, 200, result === undefined ? { ok: true } : result);
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error: 'Bad request' }); }
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error('[error]', req.method, url.pathname, e);
      json(res, 500, { error: 'Something went wrong on the server. Please try again.' });
    }
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  serveStatic(req, res, url.pathname);
});

async function start() {
  await auth.bootstrapAdmin();
  auth.purgeExpiredSessions();
  setInterval(auth.purgeExpiredSessions, 60 * 60 * 1000).unref();
  const shutdown = () => {
    // Merge the write-ahead log into the .db file so the database is a single, portable file after stopping.
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  server.listen(config.port, () => {
    console.log(`SkillBridge AI running at http://localhost:${config.port}  (db: ${db.driver})`);
    if (!config.aiConfigured()) console.log('  ⚠  AI_API_KEY is not set – AI features will show a "not configured" message.');
  });
}

module.exports = { server, start };
if (require.main === module) start();
