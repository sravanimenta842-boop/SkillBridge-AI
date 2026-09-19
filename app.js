/* SkillBridge AI – application shell: boot, auth screens, routing, notifications bell. */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;
  const root = document.getElementById('app');

  /* ---------- theme ---------- */
  const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
  applyTheme((() => { try { return localStorage.getItem('sb-theme') || 'light'; } catch { return 'light'; } })());
  SB.toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next); try { localStorage.setItem('sb-theme', next); } catch { /* ignore */ }
    return next;
  };
  const themeBtn = () => {
    const b = h('button', { class: 'icon-btn', 'aria-label': 'Toggle light / dark theme', title: 'Toggle theme' });
    const paint = () => { SB.mount(b, icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon')); };
    b.addEventListener('click', () => { SB.toggleTheme(); paint(); }); paint();
    return b;
  };

  /* ---------- session ---------- */
  SB.onUnauthorized = () => {
    if (!SB.state.user) return;
    SB.state.user = null; clearInterval(SB.state.poll);
    SB.toast('Your session has ended. Please sign in again.');
    showAuth('login');
  };
  SB.signOut = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    SB.state.user = null; clearInterval(SB.state.poll);
    if (SB.state.cleanup) { SB.state.cleanup(); SB.state.cleanup = null; }
    showAuth('login');
  };

  /* ---------- auth screen ---------- */
  function showAuth(mode = 'login', notice) {
    document.title = 'SkillBridge AI – Sign in';
    const isAdmin = mode === 'admin';
    const isReg = mode === 'register';
    const msg = h('div', { hidden: true });
    const showMsg = (kind, text) => { SB.clear(msg); msg.hidden = false; msg.append(SB.callout(kind, text)); };
    if (notice) { msg.hidden = false; msg.append(SB.callout(notice.kind, notice.text)); }

    const f = {
      name: h('input', { class: 'input', id: 'f-name', autocomplete: 'name', maxlength: '80', placeholder: 'Your full name' }),
      email: h('input', { class: 'input', id: 'f-email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true }),
      pass: h('input', { class: 'input', id: 'f-pass', type: 'password', autocomplete: isReg ? 'new-password' : 'current-password', placeholder: isReg ? 'At least 8 characters, letters and numbers' : 'Your password', required: true }),
    };
    const submit = h('button', { class: 'btn grad block', type: 'submit' }, isReg ? 'Create account' : isAdmin ? 'Sign in as admin' : 'Sign in');
    const form = h('form', { class: 'stack', novalidate: true },
      isReg ? h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'Full name'), f.name) : null,
      h('div', { class: 'field' }, h('label', { for: 'f-email' }, 'Email'), f.email),
      h('div', { class: 'field' }, h('label', { for: 'f-pass' }, 'Password'), f.pass),
      submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.hidden = true;
      await SB.busy(submit, async () => {
        try {
          if (isReg) {
            await api.post('/api/auth/register', { name: f.name.value, email: f.email.value, password: f.pass.value });
            return showAuth('login', { kind: 'ok', text: 'Registration received! An administrator must approve your account before you can sign in. You will be able to log in as soon as it is approved.' });
          }
          const r = await api.post(isAdmin ? '/api/auth/admin/login' : '/api/auth/login', { email: f.email.value, password: f.pass.value }, { noAuthRedirect: true });
          await enter(r.user);
        } catch (err) {
          showMsg(err.data && err.data.code === 'pending' ? 'warn' : 'err', err.message);
        }
      });
    });

    const switchLink = (label, target) => h('button', { class: 'btn ghost sm', type: 'button', onclick: () => showAuth(target) }, label);
    mount(root, h('div', { class: 'auth fade-in' },
      h('section', { class: 'auth-hero' },
        SB.logo(),
        h('div', null,
          h('h1', null, 'Bridge the gap between your skills and your next role.'),
          h('p', null, 'Take an AI-generated skill assessment, see exactly how you compare to real job requirements, polish your resume and find openings near you.')),
        h('div', { class: 'auth-points' },
          h('div', null, icon('target'), 'A fresh AI assessment every time – no fixed question bank'),
          h('div', null, icon('chart'), 'Skill gaps calculated from your real results'),
          h('div', null, icon('briefcase'), 'Job and internship roles matched to your real profile'))),
      h('section', { class: 'auth-panel' },
        h('div', { class: 'auth-box stack lg' },
          h('div', null,
            isAdmin ? h('span', { class: 'badge primary' }, icon('shield'), 'Administrator') : null,
            h('h2', { style: { marginTop: isAdmin ? '10px' : 0 } }, isReg ? 'Create your account' : isAdmin ? 'Admin login' : 'Welcome back'),
            h('p', { class: 'sub' }, isReg ? 'Your account will be reviewed by an administrator before you can sign in.' : isAdmin ? 'Sign in to review registrations and manage the platform.' : 'Sign in with your approved account.')),
          msg, form,
          h('div', { class: 'row wrap', style: { justifyContent: 'space-between' } },
            isReg ? switchLink('I already have an account', 'login')
              : isAdmin ? switchLink('← Back to user sign in', 'login')
                : switchLink('Create an account', 'register'),
            !isAdmin && !isReg ? switchLink('Admin login', 'admin') : null),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, themeBtn())))));
    (isReg ? f.name : f.email).focus();
  }

  /* ---------- enter the app after auth ---------- */
  async function enter(user) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    SB.state.user = user;
    if (user.role === 'admin') return SB.renderAdmin(root);
    try { const c = await api.get('/api/config'); SB.state.config = c; } catch { SB.state.config = {}; }
    renderShell();
  }

  /* ---------- user shell ---------- */
  const NAV = [
    ['home', 'Dashboard', 'home'], ['assessment', 'AI Skill Assessment', 'target'], ['skill-gap', 'Skill Gap Analysis', 'chart'],
    ['jobs', 'Jobs & Internships', 'briefcase'], ['resume-studio', 'AI Resume Studio', 'file'],
    ['career-coach', 'AI Career Coach', 'compass'],
  ];
  SB.nav = NAV;
  const NOTIF_ICON = { system: 'megaphone', assessment: 'target', gap: 'chart', jobs: 'briefcase', resume: 'file', coach: 'compass' };

  function renderShell() {
    const u = SB.state.user;
    const side = h('aside', { class: 'side', id: 'side' },
      SB.logo(),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map(([id, label, ic]) => h('a', { href: '#/' + id, 'data-r': id }, icon(ic), label))),
      h('div', { class: 'side-foot stack sm' },
        h('a', { class: 'nav-profile', href: '#/profile', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 10px', borderRadius: '12px', color: 'inherit' } },
          h('div', { class: 'avatar' }, SB.initials(u.name)),
          h('div', { class: 'grow' }, h('div', { class: 'bold small', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, u.name), h('div', { class: 'xs muted' }, 'Profile & settings'))),
        h('button', { class: 'btn ghost sm block', onclick: SB.signOut }, icon('logout'), 'Sign out')));
    const scrim = h('div', { class: 'scrim', onclick: () => toggleSide(false) });
    const toggleSide = (open) => { side.classList.toggle('open', open); scrim.classList.toggle('open', open); };
    side.addEventListener('click', (e) => { if (e.target.closest('a')) toggleSide(false); });

    const bell = h('button', { class: 'icon-btn', 'aria-label': 'Notifications', 'aria-haspopup': 'true' }, icon('bell'));
    const panel = h('div', { class: 'notif-panel', hidden: true, role: 'dialog', 'aria-label': 'Notifications' });
    const title = h('div', { class: 'bold', id: 'page-title' });
    const main = h('main', { class: 'content', id: 'view' });
    const wrap = h('div', { class: 'panel-wrap' }, bell, panel);

    mount(root, h('div', { class: 'shell fade-in' }, side, scrim,
      h('div', { class: 'main-col' },
        h('header', { class: 'topbar' },
          h('div', { class: 'row' }, h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', onclick: () => toggleSide(true) }, icon('menu')), title),
          h('div', { class: 'row' }, themeBtn(), wrap)),
        main)));

    SB.state.ui = { bell, panel, main, title };
    bell.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) paintPanel(); });
    document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

    SB.state.notif = { items: [], unread: 0 };
    SB.refreshNotifications();
    clearInterval(SB.state.poll);
    SB.state.poll = setInterval(SB.refreshNotifications, 60000);
    window.removeEventListener('hashchange', route); window.addEventListener('hashchange', route);
    if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/home'; else route();
  }

  /* ---------- notifications ---------- */
  SB.refreshNotifications = async () => {
    try {
      const d = await api.get('/api/notifications');
      SB.state.notif = d; paintBell();
      if (SB.state.ui && !SB.state.ui.panel.hidden) paintPanel();
      if (SB.onNotifications) SB.onNotifications(d);
    } catch { /* silent */ }
  };
  function paintBell() {
    const { bell } = SB.state.ui || {}; if (!bell) return;
    bell.querySelector('.dot')?.remove();
    const n = SB.state.notif.unread;
    if (n > 0) bell.append(h('span', { class: 'dot' }, n > 9 ? '9+' : n));
    bell.setAttribute('aria-label', `Notifications${n ? `, ${n} unread` : ''}`);
  }
  async function markRead(ids) {
    try { await api.post('/api/notifications/read', ids ? { ids } : {}); } catch { /* ignore */ }
    SB.refreshNotifications();
  }
  SB.notifItem = (n, onClick) => h('div', { class: 'notif' + (n.read ? '' : ' unread') + (n.view ? ' link' : ''), onclick: onClick },
    h('div', { class: 'ni' }, icon(NOTIF_ICON[n.type] || 'bell')),
    h('div', { class: 'grow' }, h('b', null, n.title), n.body ? h('p', null, n.body) : null, h('time', null, SB.ago(n.createdAt))));
  function paintPanel() {
    const { panel } = SB.state.ui; const { items, unread } = SB.state.notif;
    mount(panel,
      h('div', { class: 'notif-head' }, h('b', null, 'Notifications', unread ? h('span', { class: 'badge primary', style: { marginLeft: '8px' } }, unread + ' new') : null),
        h('div', { class: 'row' },
          unread ? h('button', { class: 'btn ghost sm', onclick: () => markRead() }, 'Mark all read') : null,
          items.length ? h('button', { class: 'btn ghost sm', 'aria-label': 'Clear all', onclick: async () => { await api.del('/api/notifications'); SB.refreshNotifications(); } }, icon('trash')) : null)),
      items.length
        ? h('div', { class: 'notif-list' }, items.map((n) => SB.notifItem(n, () => {
          if (!n.read) markRead([n.id]);
          if (n.view) { SB.state.ui.panel.hidden = true; location.hash = '#/' + n.view; }
        })))
        : h('div', { class: 'empty', style: { padding: '34px 20px' } }, h('p', null, 'You are all caught up. Job alerts, assessment results and coach tips will appear here.')));
  }

  /* ---------- routing ---------- */
  SB.go = (id) => { location.hash = '#/' + id; };
  function route() {
    if (!SB.state.user || SB.state.user.role !== 'user') return;
    const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
    const view = SB.views[id] || SB.views.home;
    const cur = SB.views[id] ? id : 'home';
    if (SB.state.cleanup) { try { SB.state.cleanup(); } catch { /* ignore */ } SB.state.cleanup = null; }
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === cur));
    const ui = SB.state.ui;
    const label = (NAV.find((n) => n[0] === cur) || [0, cur === 'profile' ? 'Profile & settings' : ''])[1];
    ui.title.textContent = cur === 'home' ? '' : label;
    document.title = (label ? label + ' – ' : '') + 'SkillBridge AI';
    SB.mount(ui.main, SB.loading());
    window.scrollTo(0, 0);
    const box = h('div', { class: 'fade-in' });
    Promise.resolve(view.render(box)).then(() => SB.mount(ui.main, box)).catch((e) => {
      console.error(e); SB.mount(ui.main, SB.callout('err', e.message || 'This page could not be loaded.'));
    });
  }

  /* ---------- boot ---------- */
  (async function boot() {
    try {
      const me = await api.get('/api/auth/me', { noAuthRedirect: true });
      await enter(me.user);
    } catch { showAuth('login'); }
  })();
})();
