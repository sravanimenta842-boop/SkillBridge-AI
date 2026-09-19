'use strict';
/**
 * End-to-end backend test. Starts the real server (fresh temp database) against
 * a local mock of the AI / Adzuna / Nominatim services and walks through the
 * whole product flow, including security checks.   Run:  npm test
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mock = require('./mock-upstream');

let passed = 0; let failed = 0;
const ok = (cond, name, extra = '') => { if (cond) { passed++; console.log('  ✔', name); } else { failed++; console.log('  ✘', name, extra); } };
const section = (t) => console.log('\n' + t);

class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, url, body, headers = {}, raw = false) {
    const h = { ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let payload;
    if (body !== undefined && !Buffer.isBuffer(body)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); } else payload = body;
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    if (raw) return { status: res.status, res, buf: Buffer.from(await res.arrayBuffer()) };
    let data = null; const t = await res.text(); try { data = JSON.parse(t); } catch { data = t; }
    return { status: res.status, data, res };
  }
  get(u) { return this.req('GET', u); }
  post(u, b, h) { return this.req('POST', u, b === undefined ? {} : b, h); }
  put(u, b) { return this.req('PUT', u, b); }
  del(u) { return this.req('DELETE', u); }
}

(async () => {
  const up = await mock.start(0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
  const port = 4300 + Math.floor(Math.random() * 500);
  const env = {
    ...process.env, PORT: String(port), DB_PATH: path.join(tmp, 't.db'),
    ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'AdminPass123',
    AI_RETRY_BASE_MS: '5', AI_PROVIDER: 'gemini', AI_API_KEY: 'test-key-123', AI_BASE_URL: `http://127.0.0.1:${up.port}/v1beta`,
  };
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start\n' + log)), 15000);
    const iv = setInterval(() => { if (log.includes('running at')) { clearInterval(iv); clearTimeout(t); resolve(); } }, 100);
  });
  const base = `http://127.0.0.1:${port}`;

  try {
    const anon = new Client(base); const admin = new Client(base); const user = new Client(base); const other = new Client(base);

    section('Config & static');
    let r = await anon.get('/api/config');
    ok(r.data.aiConfigured === true && Object.keys(r.data).length === 1, 'config endpoint reports AI key as configured (boolean only)');
    ok(!JSON.stringify(r.data).includes('test-key'), 'config endpoint does not leak secrets');
    r = await anon.get('/');
    ok(r.status === 200 && String(r.data).includes('<html'), 'index.html is served');
    for (const p of ['/.env', '/server.js', '/data/t.db', '/../server.js', '/%2e%2e/server.js', '/server/config.js', '/package.json']) {
      const x = await anon.get(p);
      ok(x.status === 404 || x.status === 403 || (x.status === 200 && String(x.data).includes('<html')), `path ${p} does not expose files`, String(x.status));
      ok(!(typeof x.data === 'string' && /AI_API_KEY|require\('/.test(x.data)), `path ${p} leaks no source`);
    }
    ok((await anon.get('/')).res.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP header set');

    section('Registration & approval workflow');
    r = await anon.post('/api/auth/register', { name: 'Priya Sharma', email: 'priya@example.com', password: 'short' });
    ok(r.status === 400, 'weak password rejected');
    r = await anon.post('/api/auth/register', { name: 'P', email: 'bad', password: 'Password123' });
    ok(r.status === 400, 'invalid name/email rejected');
    r = await anon.post('/api/auth/register', { name: 'Priya Sharma', email: 'priya@example.com', password: 'Password123' });
    ok(r.status === 201, 'user registers');
    r = await anon.post('/api/auth/register', { name: 'Priya Again', email: 'PRIYA@example.com', password: 'Password123' });
    ok(r.status === 409, 'duplicate email (case-insensitive) rejected');
    r = await anon.post('/api/auth/register', { name: 'Rahul Reject', email: 'rahul@example.com', password: 'Password123' });
    ok(r.status === 201, 'second user registers');

    r = await user.post('/api/auth/login', { email: 'priya@example.com', password: 'Password123' });
    ok(r.status === 403 && r.data.code === 'pending', 'pending user cannot log in', JSON.stringify(r.data));
    r = await user.post('/api/auth/login', { email: 'priya@example.com', password: 'WrongPass1' });
    ok(r.status === 401, 'wrong password → 401 (no status leak)');
    r = await user.get('/api/dashboard');
    ok(r.status === 401, 'user API blocked without session');

    r = await admin.post('/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123' });
    ok(r.status === 403, 'admin credentials rejected on user login');
    r = await admin.post('/api/auth/admin/login', { email: 'priya@example.com', password: 'Password123' });
    ok(r.status === 401, 'normal user rejected on admin login');
    r = await admin.post('/api/auth/admin/login', { email: 'admin@test.local', password: 'AdminPass123' });
    ok(r.status === 200 && r.data.user.role === 'admin', 'admin logs in');
    r = await user.get('/api/admin/users');
    ok(r.status === 401, 'admin API blocked for anonymous');
    r = await admin.get('/api/dashboard');
    ok(r.status === 403, 'admin cannot use student API');

    r = await admin.get('/api/admin/users?status=pending');
    ok(r.data.users.length === 2, 'admin sees 2 pending registrations');
    ok(!JSON.stringify(r.data).includes('scrypt'), 'password hashes are never returned');
    const priya = r.data.users.find((u) => u.email === 'priya@example.com');
    const rahul = r.data.users.find((u) => u.email === 'rahul@example.com');
    r = await admin.get('/api/admin/stats');
    ok(r.data.pending === 2 && r.data.approved === 0, 'admin stats correct');

    r = await admin.post(`/api/admin/users/${priya.id}/approve`);
    ok(r.status === 200, 'admin approves user');
    r = await admin.post(`/api/admin/users/${rahul.id}/reject`, { reason: 'Not a student' });
    ok(r.status === 200, 'admin rejects user');
    r = await other.post('/api/auth/login', { email: 'rahul@example.com', password: 'Password123' });
    ok(r.status === 403 && r.data.code === 'rejected' && /Not a student/.test(r.data.error), 'rejected user cannot log in');
    r = await other.get('/api/dashboard');
    ok(r.status === 401, 'rejected user has no access');

    r = await user.post('/api/auth/login', { email: 'priya@example.com', password: 'Password123' });
    ok(r.status === 200 && r.data.user.status === 'approved', 'approved user logs in');
    ok(/HttpOnly/i.test(r.res.headers.get('set-cookie')) && /SameSite=Lax/i.test(r.res.headers.get('set-cookie')), 'session cookie is HttpOnly + SameSite');
    r = await user.get('/api/admin/stats');
    ok(r.status === 403, 'student cannot access admin routes');
    r = await user.get('/api/auth/me');
    ok(r.data.user.email === 'priya@example.com', '/me returns the session user');

    // cross-origin write is blocked
    r = await user.req('POST', '/api/notifications/read', {}, { Origin: 'http://evil.example' });
    ok(r.status === 403, 'cross-origin POST blocked');

    section('Admin: skills catalog & announcements');
    r = await user.get('/api/skills');
    ok(r.data.skills.length >= 10 && r.data.skills.some((s) => s.name === 'JavaScript'), 'skill options available to users');
    r = await admin.post('/api/admin/skills', { name: 'Cloud Basics', category: 'Infra' });
    ok(r.status === 201, 'admin adds a skill');
    r = await user.get('/api/skills');
    ok(r.data.skills.some((s) => s.name === 'Cloud Basics'), 'new skill appears for users');
    const cb = (await admin.get('/api/admin/skills')).data.skills.find((s) => s.name === 'Cloud Basics');
    await admin.req('PATCH', `/api/admin/skills/${cb.id}`, { active: false });
    ok(!(await user.get('/api/skills')).data.skills.some((s) => s.name === 'Cloud Basics'), 'disabled skill hidden from users');
    r = await admin.post('/api/admin/announcements', { title: 'Maintenance window', body: 'Sunday 2am.' });
    ok(r.status === 201 && r.data.sent === 1, 'announcement fan-out to approved users');

    section('Profile');
    r = await user.put('/api/profile', { headline: 'CS student', education: 'B.Tech', institution: 'Vignan', location: 'Chirala', latitude: 15.82, longitude: 80.35, countryCode: 'in', interests: 'web development', skills: 'Git' });
    ok(r.status === 200 && r.data.profile.location === 'Chirala', 'profile saved');
    r = await user.put('/api/profile', { latitude: 999 });
    ok(r.status === 400, 'invalid latitude rejected');

    section('AI Skill Assessment');
    r = await user.post('/api/assessment/generate', { skills: [] });
    ok(r.status === 400, 'no skills → 400');
    r = await user.post('/api/assessment/generate', { skills: ['A', 'B', 'C', 'D', 'E', 'F'] });
    ok(r.status === 400, 'too many / invalid skills → 400');
    r = await user.post('/api/assessment/generate', { skills: ['JavaScript', 'HTML', 'Communication'] });
    ok(r.status === 200 && r.data.assessment.questions.length === 10, 'AI generates 10 questions');
    const A = r.data.assessment;
    const raw = JSON.stringify(A);
    ok(!/correct_index|model_answer|rubric/.test(raw), 'answer key & rubric are NOT sent to the browser');
    ok(new Set(A.questions.map((q) => q.skill)).size === 3, 'all selected skills covered');
    ok(A.questions.every((q) => q.format === 'short' || q.options.length === 4), 'MCQs have 4 options');
    const gen = up.calls.ai.filter((c) => c.prompt.startsWith('Create a skill assessment'));
    ok(gen.length === 1 && gen[0].key === 'test-key-123' && gen[0].json, 'AI called with env key + JSON mode');
    r = await user.get('/api/assessment/current');
    ok(r.data.assessment && r.data.assessment.id === A.id, 'in-progress assessment can be resumed');

    // Answer: server shuffles options so find the correct one by reading DB? use trick: answer all mcq with index 0 (random correctness)
    const answers = {};
    for (const q of A.questions) answers[q.id] = q.format === 'mcq' ? 0 : 'My written answer explaining the idea with an example.';
    r = await other.post(`/api/assessment/${A.id}/submit`, { answers });
    ok(r.status === 401, 'submit requires login');
    r = await user.post(`/api/assessment/${A.id}/submit`, { answers: {} });
    ok(r.status === 400, 'empty submission rejected');
    r = await user.post(`/api/assessment/${A.id}/submit`, { answers });
    ok(r.status === 200, 'assessment submitted & evaluated', JSON.stringify(r.data).slice(0, 200));
    const R = r.data.result;
    ok(R.overall.percent >= 0 && R.overall.percent <= 100 && ['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(R.overall.level), 'overall % and level present');
    ok(R.skillResults.length === 3 && R.skillResults.every((s) => typeof s.percent === 'number' && s.level), 'per-skill % and level present');
    ok(Array.isArray(R.strong_skills) && Array.isArray(R.improvement_skills) && R.strong_skills.length + R.improvement_skills.length === 3, 'strong / improvement skills split');
    ok(R.ai.practice_areas.length > 0 && R.ai.summary, 'AI practice areas + summary present');
    ok(R.questions.length === 10 && R.questions.every((q) => q.feedback), 'per-question review with feedback');
    // deterministic scoring check: recompute expected % for first skill
    const W = { easy: 1, medium: 2, hard: 3 };
    const sk = R.skillResults[0];
    const qs = R.questions.filter((q) => q.skill === sk.skill);
    const exp = Math.round((qs.reduce((a, q) => a + W[q.difficulty] * q.score, 0) / qs.reduce((a, q) => a + W[q.difficulty], 0)) * 100);
    ok(exp === sk.percent, `skill % computed from question scores (${sk.skill}: ${sk.percent}%)`);
    r = await user.post(`/api/assessment/${A.id}/submit`, { answers });
    ok(r.status === 409, 'cannot submit twice');
    r = await user.get('/api/skills/mine');
    ok(r.data.skills.length === 3, 'skill levels stored in DB for other modules');
    r = await user.get('/api/assessment/history');
    ok(r.data.history.length === 1, 'assessment history stored');
    r = await other.get(`/api/assessment/${A.id}`);
    ok(r.status === 401, 'results require login');

    // second assessment: avoid-list of previous questions is sent
    r = await user.post('/api/assessment/generate', { skills: ['JavaScript'] });
    const gen2 = up.calls.ai.filter((c) => c.prompt.startsWith('Create a skill assessment')).pop();
    ok(/Do NOT reuse or closely paraphrase/.test(gen2.prompt), 'later assessments ask the AI to avoid earlier questions');
    await user.del('/api/assessment/current');

    section('Skill Gap Analysis');
    r = await user.post('/api/gap/analyze', { role: 'x' });
    ok(r.status === 400, 'role too short rejected');
    r = await user.post('/api/gap/analyze', { role: 'asdf qwerty' });
    ok(r.status === 422, 'non-role rejected by AI with 422', String(r.status));
    r = await user.post('/api/gap/analyze', { role: 'Front-End Developer' });
    ok(r.status === 200, 'gap analysis generated');
    const G = r.data.analysis;
    const mine = Object.fromEntries((await user.get('/api/skills/mine')).data.skills.map((s) => [s.name, s.score]));
    const jsRow = G.rows.find((x) => x.skill === 'JavaScript');
    ok(jsRow.current === mine.JavaScript && jsRow.required === 70, 'current level comes from stored assessment; required from role requirements');
    ok(jsRow.status === (mine.JavaScript >= 70 ? 'strong' : 'improve') && jsRow.gap === Math.max(0, 70 - mine.JavaScript), 'gap = required − current');
    ok(G.rows.find((x) => x.skill === 'Node.js').status === 'not_assessed' && G.rows.find((x) => x.skill === 'Node.js').current === null, 'unassessed skills flagged, not faked');
    ok(G.focus.length > 0 && G.readiness_percent !== null, 'focus areas + readiness present');
    const before = up.calls.ai.length;
    await user.post('/api/gap/analyze', { role: 'front-end developer' });
    const roleCalls = up.calls.ai.slice(before).filter((c) => c.prompt.includes('Job role: "'));
    ok(roleCalls.length === 0, 'role requirements are cached after first generation');
    ok((await user.get('/api/gap/latest')).data.analysis.role === 'Front-End Developer', 'latest gap analysis stored');

    section('Jobs & Internships');
    r = await user.get('/api/jobs/recommendations');
    ok(r.data.ready === true && r.data.recommendations === null, 'ready but not analysed yet');
    r = await user.post('/api/jobs/analyze');
    ok(r.status === 200 && r.data.recommendations.job_roles.length === 3 && r.data.recommendations.internship_roles.length === 2, 'job + internship roles generated');
    const ctxCall = up.calls.ai.filter((c) => c.prompt.includes('decide which job roles')).pop();
    ok(/JavaScript: \d+%/.test(ctxCall.prompt) && ctxCall.prompt.includes('Front-End Developer'), 'AI prompt contains real assessed skills + skill-gap result');
    const jr = r.data.recommendations.job_roles;
    ok(jr[0].fit === 'strong', 'roles sorted by fit');
    const fe = jr.find((x) => x.title === 'Front-End Developer');
    const jsScore = mine.JavaScript; const comm = mine.Communication;
    const expMatch = Math.round(((Math.min(jsScore / 65, 1) + Math.min(comm / 50, 1)) / 2) * 100);
    ok(fe.match_percent === expMatch && fe.assessed_count === 2, `match % computed from real scores over assessed key skills (${fe.match_percent}%)`);
    r = await user.get('/api/jobs/openings?keywords=front%20end%20developer&kind=job');
    ok(r.status === 404, 'no third-party job API endpoint exists any more');
    r = await user.get('/api/radar?lat=15.8&lng=80.3&radius=10');
    ok(r.status === 404, 'Local Job Radar endpoint removed');

    section('AI Resume Studio');
    const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'resume.pdf'));
    const docx = fs.readFileSync(path.join(__dirname, 'fixtures', 'resume.docx'));
    r = await other.req('POST', '/api/resume/upload', pdf, { 'X-Filename': 'r.pdf', 'Content-Type': 'application/octet-stream' });
    ok(r.status === 401, 'resume upload requires login');
    r = await user.req('POST', '/api/resume/upload', Buffer.from('MZ not a resume'), { 'X-Filename': 'evil.exe', 'Content-Type': 'application/octet-stream' });
    ok(r.status === 415, 'unsupported file type rejected');
    r = await user.req('POST', '/api/resume/upload', pdf, { 'X-Filename': 'Priya Resume.pdf', 'Content-Type': 'application/octet-stream' });
    ok(r.status === 200 && r.data.resume.original.name === 'Priya Sharma', 'PDF resume parsed', JSON.stringify(r.data).slice(0, 200));
    ok(r.data.resume.original.skills.includes('Python') && r.data.resume.original.contact.email === 'priya@example.com', 'PDF text extracted → structured data');
    r = await user.req('POST', '/api/resume/upload', docx, { 'X-Filename': 'resume.docx', 'Content-Type': 'application/octet-stream' });
    ok(r.status === 200 && r.data.resume.original.education[0].institution.includes('Vignan'), 'DOCX resume parsed');
    r = await user.post('/api/resume/improve', { targetRole: 'Python Developer' });
    ok(r.status === 200 && r.data.resume.improved, 'AI improves resume');
    const imp = r.data.resume.improved;
    ok(imp.summary.length > 20, 'improved summary present');
    ok(!imp.skills.includes('Kubernetes'), 'invented skill removed by truthfulness guard');
    ok(r.data.resume.notes.warnings.some((w) => /Kubernetes/.test(w)), 'user warned about removed invented skill');
    ok(r.data.resume.notes.warnings.some((w) => /40%/.test(w)), 'user warned about invented figure (40%)');
    ok(r.data.resume.notes.suggestions.length >= 1 && r.data.resume.notes.changes.length >= 1, 'change list + suggestions returned');
    ok(r.data.resume.completeness.improved.percent >= r.data.resume.completeness.original.percent, 'completeness checklist computed');
    const impCall = up.calls.ai.filter((c) => c.system.includes('professional resume editor')).pop();
    ok(/never add|Never add/i.test(impCall.system), 'prompt enforces truthfulness');
    imp.summary = 'Edited by the user: enthusiastic developer.';
    r = await user.put('/api/resume', { improved: imp });
    ok(r.status === 200 && r.data.resume.improved.summary.startsWith('Edited by the user'), 'user edits are saved');
    r = await user.req('POST', '/api/resume/export', { version: 'improved' }, {}, true);
    ok(r.status === 200 && /wordprocessingml/.test(r.res.headers.get('content-type')) && r.buf.slice(0, 2).toString() === 'PK', 'DOCX export downloads a valid file');
    fs.writeFileSync(path.join(tmp, 'out.docx'), r.buf);
    r = await user.post('/api/resume/text', { text: 'too short' });
    ok(r.status === 400, 'pasted text validated');

    section('AI Career Coach');
    r = await user.post('/api/coach/message', { message: 'What should I focus on?' });
    ok(r.status === 200 && r.data.reply.includes('[coach]') && r.data.reply.includes('context=yes'), 'coach replies with user context included');
    r = await user.post('/api/assistant/message', { message: 'Explain closures in JS' });
    ok(r.status === 404, 'AI Assistant endpoint removed');
    const chatSys = up.calls.ai.filter((c) => !c.json).pop().system;
    ok(chatSys.includes('Front-End Developer') && /JavaScript: \d+%/.test(chatSys), 'chat context includes skill-gap target + assessed scores');
    r = await user.get('/api/coach/history');
    ok(r.data.messages.length === 2 && r.data.messages[0].role === 'user', 'coach history persisted in DB');
    r = await user.post('/api/coach/message', { message: '' });
    ok(r.status === 400, 'empty message rejected');
    r = await user.post('/api/coach/plan');
    ok(r.status === 200 && r.data.plan.focus_skills.length > 0, 'structured career plan generated');
    r = await user.del('/api/coach/history');
    ok((await user.get('/api/coach/history')).data.messages.length === 0, 'history can be cleared');

    section('AI failure handling');
    up.calls.failNextAi = true;
    r = await user.post('/api/coach/message', { message: 'hello again' });
    ok(r.status === 200 || r.status === 502, 'transient provider error is retried or reported cleanly', String(r.status));

    up.calls.failPrimary = true;
    r = await user.post('/api/coach/message', { message: 'primary model is overloaded' });
    ok(r.status === 200 && up.calls.ai[up.calls.ai.length - 1].model === 'gemini-2.5-flash', 'overloaded (503) primary model → retried, then answered by fallback model');
    up.calls.failPrimary = false; up.calls.failAll = true;
    r = await user.post('/api/coach/message', { message: 'everything is overloaded' });
    ok(r.status === 503 && /very busy/.test(r.data.error) && !/experiencing high demand/.test(r.data.error), 'persistent overload → friendly message, no raw provider text', r.data.error);
    up.calls.failAll = false;
    r = await user.post('/api/coach/message', { message: 'recovered' });
    ok(r.status === 200, 'service recovers once the provider is healthy');

    section('Notifications & dashboard');
    r = await user.get('/api/notifications');
    const types = new Set(r.data.items.map((n) => n.type));
    ok(['system', 'assessment', 'gap', 'jobs', 'resume', 'coach'].every((t) => types.has(t)), 'all notification kinds generated', [...types].join(','));
    ok(r.data.unread === r.data.items.length, 'all unread initially');
    await user.post('/api/notifications/read', { ids: [r.data.items[0].id] });
    ok((await user.get('/api/notifications')).data.unread === r.data.items.length - 1, 'mark one as read');
    await user.post('/api/notifications/read', {});
    ok((await user.get('/api/notifications')).data.unread === 0, 'mark all as read');
    r = await user.get('/api/dashboard');
    ok(r.data.assessment && r.data.gap.role === 'Front-End Developer' && r.data.jobs.jobRoles === 3 && r.data.resume.improved, 'dashboard summarises real data');

    section('Isolation & persistence');
    const u2 = new Client(base);
    await anon.post('/api/auth/register', { name: 'Second User', email: 'second@example.com', password: 'Password123' });
    const sid = (await admin.get('/api/admin/users?status=pending')).data.users.find((u) => u.email === 'second@example.com').id;
    await admin.post(`/api/admin/users/${sid}/approve`);
    await u2.post('/api/auth/login', { email: 'second@example.com', password: 'Password123' });
    ok((await u2.get('/api/skills/mine')).data.skills.length === 0, 'users cannot see each other’s skills');
    ok((await u2.get(`/api/assessment/${A.id}`)).status === 404, 'users cannot read each other’s assessments');
    ok((await u2.get('/api/resume')).data.resume === null, 'users cannot see each other’s resume');
    ok((await u2.get('/api/coach/history')).data.messages.length === 0, 'chat history is per user');

    // revoke access: admin rejects an approved user → active session dies
    await admin.post(`/api/admin/users/${sid}/reject`, { reason: 'revoked' });
    ok((await u2.get('/api/dashboard')).status === 401, 'rejecting a user revokes their active session');
    r = await admin.del(`/api/admin/users/${sid}`);
    ok(r.status === 200, 'admin can delete a user');

    // persistence across restart
    child.kill();
    await new Promise((res) => setTimeout(res, 400));
    const child2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log2 = ''; child2.stdout.on('data', (d) => { log2 += d; }); child2.stderr.on('data', (d) => { log2 += d; });
    await new Promise((res) => { const iv = setInterval(() => { if (log2.includes('running at')) { clearInterval(iv); res(); } }, 100); });
    const again = new Client(base);
    r = await again.post('/api/auth/login', { email: 'priya@example.com', password: 'Password123' });
    ok(r.status === 200, 'users persist after server restart');
    ok((await again.get('/api/skills/mine')).data.skills.length === 3, 'assessment results persist after restart');
    ok((await again.get('/api/resume')).data.resume.improved.summary.startsWith('Edited'), 'resume persists after restart');
    child2.kill();
  } catch (e) {
    failed++; console.log('  ✘ UNEXPECTED ERROR', e);
  } finally {
    child.kill(); up.server.close();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) console.log('\n--- server log ---\n' + log);
    process.exit(failed ? 1 : 0);
  }
})();
