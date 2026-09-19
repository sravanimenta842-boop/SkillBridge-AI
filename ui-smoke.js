/* Browser smoke test (Playwright): drives the real UI against the mock upstream. Dev only. */
const { spawn } = require('child_process');
const path = require('path'); const os = require('os'); const fs = require('fs');
const mock = require('./mock-upstream');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const up = await mock.start(0); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-ui-'));
  const port = 4900 + Math.floor(Math.random() * 90);
  const env = { ...process.env, PORT: String(port), DB_PATH: path.join(tmp, 'u.db'), ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'AdminPass123',
    AI_PROVIDER: 'gemini', AI_API_KEY: 'k', AI_BASE_URL: `http://127.0.0.1:${up.port}/v1beta`
  };
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1800));
  const base = `http://127.0.0.1:${port}`; const shots = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch(); const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  let fails = 0; const ok = (c, n) => { console.log(c ? '  ✔' : '  ✘', n); if (!c) fails++; };
  const snap = async (n) => { await page.waitForTimeout(600); return page.screenshot({ path: `${shots}/${n}.png` }); };
  try {
    await page.goto(base); await page.waitForSelector('.auth'); await snap('01-login');
    await page.click('text=Create an account');
    await page.fill('#f-name', 'Priya Sharma'); await page.fill('#f-email', 'priya@example.com'); await page.fill('#f-pass', 'Passw0rdX1');
    await page.click('button[type=submit]'); await page.waitForSelector('.callout.ok');
    ok(true, 'registration shows pending notice');
    await page.fill('#f-email', 'priya@example.com'); await page.fill('#f-pass', 'Passw0rdX1'); await page.click('button[type=submit]');
    await page.waitForSelector('.callout.warn'); ok(true, 'pending user blocked at login');

    // admin approves via UI
    await page.click('text=Admin login'); await page.fill('#f-email', 'admin@test.local'); await page.fill('#f-pass', 'AdminPass123'); await page.click('button[type=submit]');
    await page.waitForSelector('text=Admin dashboard'); await page.waitForSelector('text=Approve'); await snap('02-admin');
    await page.click('td button:has-text("Approve")'); await page.waitForSelector('text=No pending registrations'); ok(true, 'admin approved user');
    await page.click('text=Skills catalog'); await page.waitForSelector('text=JavaScript'); await snap('03-admin-skills');
    await page.click('.tab:has-text("Announcements")'); await page.fill('input[placeholder=Title]', 'Welcome'); await page.fill('textarea', 'Hello everyone'); await page.click('text=Send to all users'); await page.waitForSelector('text=Sent to 1 user');
    ok(true, 'announcement sent');
    await page.click('text=Sign out'); await page.waitForSelector('.auth');

    // user flow
    await page.fill('#f-email', 'priya@example.com'); await page.fill('#f-pass', 'Passw0rdX1'); await page.click('button[type=submit]');
    await page.waitForSelector('.feature-grid'); await snap('04-home'); ok((await page.$$('.feature')).length === 5, 'home shows 5 feature cards');
    ok(!(await page.$('text=Courses')) && !(await page.$('text=Badges')) && !(await page.$('text=XP')), 'no gamification / courses / tracker');
    await page.click('.icon-btn[aria-label^=Notifications]'); await page.waitForSelector('.notif'); await snap('05-notifs'); await page.keyboard.press('Escape'); await page.click('h1');

    await page.click('.nav a[data-r=assessment]'); await page.waitForSelector('.chip'); await page.click('.chip:has-text("JavaScript")'); await page.click('.chip:has-text("Python")');
    await page.click('text=Generate my assessment'); await page.waitForSelector('.q-card'); ok((await page.$$('.q-card')).length === 10, '10 questions generated'); await snap('06-quiz');
    for (const g of await page.$$('.q-card')) { const o = await g.$('input[type=radio]'); if (o) await o.check(); else { const t = await g.$('textarea'); await t.fill('Because it keeps state in a closure and returns a function.'); } }
    await page.click('text=Submit for AI evaluation'); await page.waitForSelector('text=Assessment result'); await snap('07-result'); ok(true, 'assessment graded');

    await page.click('.nav a[data-r=skill-gap]'); await page.fill('#role', 'Front-End Developer'); await page.click('text=Analyse gap'); await page.waitForSelector('.ring'); await page.waitForSelector('text=Current vs required'); await snap('08-gap'); ok(true, 'gap analysis shown');
    await page.click('.nav a[data-r=jobs]'); await page.click('text=Analyse my profile'); await page.waitForSelector('.role-card'); await page.waitForSelector('.role-card a[href*="linkedin.com"]'); await snap('09-jobs'); ok(true, 'jobs + job-board search links');
    await page.click('.nav a[data-r=resume-studio]'); await page.waitForSelector('.drop'); await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures', 'resume.pdf')); await page.waitForSelector('.paper');
    await page.click('button:has-text("Improve with AI")'); await page.waitForSelector('text=What was improved'); await snap('11-resume'); ok(true, 'resume uploaded + improved');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download DOCX')]); ok(/\.docx$/.test(dl.suggestedFilename()), 'docx downloads');
    await page.click('.nav a[data-r=career-coach]'); await page.fill('.chat-input textarea', 'What should I focus on?'); await page.keyboard.press('Enter'); await page.waitForSelector('.msg.assistant'); await snap('12-coach'); ok(true, 'coach replies');
    await page.click('.nav-profile'); await page.waitForSelector('text=Profile & settings'); await page.click('text=Save profile'); await page.waitForSelector('.toast.ok'); ok(true, 'profile saved');
    await page.setViewportSize({ width: 390, height: 800 }); await page.click('.nav-profile', { force: true }).catch(() => {}); await page.click('a[href="#/home"]', { force: true }).catch(() => {}); await page.waitForTimeout(400); await snap('13-mobile');
  } catch (e) { console.log('  ✘ FAILED:', e.message.split('\n')[0]); await snap('zz-fail'); fails++; }
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); child.kill(); up.server.close();
  console.log(fails ? `\n${fails} failed` : '\nUI smoke test passed'); process.exit(fails ? 1 : 0);
})();
