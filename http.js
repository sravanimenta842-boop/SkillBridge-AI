'use strict';
/**
 * Minimal HTTP toolkit: routing, JSON helpers, body parsing, static files,
 * security headers and simple in-memory rate limiting. No dependencies.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const MIME = {
  '.html': 'text/html; charset=UTF-8', '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8', '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=UTF-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', CSP);
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > limit) return reject(new HttpError(413, 'Request body too large'));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1024 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    const v = JSON.parse(buf.toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
    return v;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/* ---------- Router ---------- */
class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return { route: null, pathMatched };
  }
}

/* ---------- Rate limiting (in-memory; fine for a single-node app) ---------- */
function createLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
  }, windowMs).unref();
  return {
    check(key) {
      const t = Date.now();
      let e = hits.get(key);
      if (!e || t - e.start > windowMs) { e = { start: t, count: 0 }; hits.set(key, e); }
      e.count += 1;
      if (e.count > max) {
        const retry = Math.ceil((e.start + windowMs - t) / 1000);
        throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute(s).`);
      }
    },
    reset(key) { hits.delete(key); },
  };
}

/* ---------- Static files ---------- */
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  try { rel = decodeURIComponent(rel); } catch { return json(res, 400, { error: 'Bad request' }); }
  if (rel.includes('\0')) return json(res, 400, { error: 'Bad request' });
  const filePath = path.resolve(config.publicDir, '.' + path.posix.normalize(rel));
  if (filePath !== config.publicDir && !filePath.startsWith(config.publicDir + path.sep)) {
    return json(res, 403, { error: 'Forbidden' });
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // Single-page app: unknown non-file paths fall back to index.html
      if (!path.extname(rel)) {
        return fs.readFile(path.join(config.publicDir, 'index.html'), (e2, buf) => {
          if (e2) return json(res, 404, { error: 'Not found' });
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(buf);
        });
      }
      return json(res, 404, { error: 'Not found' });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

/** Block cross-site state-changing requests (defence in depth on top of SameSite cookies). */
function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients (curl, tests) send no Origin
  let host;
  try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Invalid origin'); }
  if (host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
}

module.exports = { HttpError, Router, json, readBody, readJson, serveStatic, securityHeaders, createLimiter, checkOrigin, MIME };
