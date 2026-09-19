/* Admin dashboard: registrations, skills catalog, announcements */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;

  SB.renderAdmin = function (root) {
    document.title = 'Admin – SkillBridge AI';
    let tab = 'users';
    const body = h('div');
    const stats = h('div', { class: 'stat-grid' });
    const tabsEl = h('div', { class: 'tabs' });

    const loadStats = async () => {
      try {
        const s = await api.get('/api/admin/stats');
        mount(stats,
          h('div', { class: 'card stat pending' }, h('b', null, s.pending), h('span', null, 'Pending approval')),
          h('div', { class: 'card stat' }, h('b', null, s.approved), h('span', null, 'Approved users')),
          h('div', { class: 'card stat' }, h('b', null, s.rejected), h('span', null, 'Rejected')),
          h('div', { class: 'card stat' }, h('b', null, s.assessments), h('span', null, 'Assessments taken')),
          h('div', { class: 'card stat' }, h('b', null, s.resumes), h('span', null, 'Resumes uploaded')),
          h('div', { class: 'card stat' }, h('b', null, s.skills), h('span', null, 'Skills in catalog')));
        return s;
      } catch (e) { SB.err(e); }
    };

    const paintTabs = (pending) => mount(tabsEl, [['users', 'Registrations'], ['skills', 'Skills catalog'], ['news', 'Announcements']].map(([id, l]) =>
      h('button', { class: 'tab' + (tab === id ? ' on' : ''), onclick: () => { tab = id; paintTabs(pending); show(); } }, l, id === 'users' && pending ? h('span', { class: 'count' }, pending) : null)));

    /* ----- users ----- */
    async function users() {
      let filter = 'pending'; let q = '';
      const list = h('div');
      const search = h('input', { class: 'input', placeholder: 'Search name or email…', style: { maxWidth: '280px' } });
      const filters = h('div', { class: 'tabs' });
      const paintFilters = () => mount(filters, ['pending', 'approved', 'rejected', 'all'].map((f) => h('button', { class: 'tab' + (filter === f ? ' on' : ''), onclick: () => { filter = f; paintFilters(); load(); } }, f[0].toUpperCase() + f.slice(1))));
      let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(); }, 250); });

      const act = async (fn, msg) => { try { await fn(); SB.toast(msg, 'ok'); const s = await loadStats(); paintTabs(s && s.pending); load(); } catch (e) { SB.err(e); } };
      const reject = (u) => {
        const reason = h('input', { class: 'input', maxlength: '200', placeholder: 'Reason shown to the user (optional)' });
        const m = SB.modal(`Reject ${u.name}?`, h('div', { class: 'stack sm' }, h('p', { class: 'sub small' }, 'The user will not be able to sign in.'), reason), {
          actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
            h('button', { class: 'btn danger', onclick: () => { m.close(); act(() => api.post(`/api/admin/users/${u.id}/reject`, { reason: reason.value }), 'User rejected'); } }, 'Reject')],
        });
      };
      async function load() {
        mount(list, SB.skeletons(3));
        try {
          const { users: rows } = await api.get('/api/admin/users?' + SB.qs({ status: filter, q }));
          mount(list, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
            h('thead', null, h('tr', null, ['User', 'Status', 'Registered', 'Activity', ''].map((c) => h('th', null, c)))),
            h('tbody', null, rows.map((u) => h('tr', null,
              h('td', null, h('b', null, u.name), h('div', { class: 'small muted' }, u.email)),
              h('td', null, SB.badge(u.status, { pending: 'amber', approved: 'green', rejected: 'red' }[u.status]), u.rejectReason ? h('div', { class: 'xs muted' }, u.rejectReason) : null),
              h('td', { class: 'small' }, SB.date(u.createdAt)),
              h('td', { class: 'small' }, u.assessments ? `${u.assessments} assessment${u.assessments > 1 ? 's' : ''}${u.lastScore !== null ? ' · last ' + u.lastScore + '%' : ''}` : h('span', { class: 'muted' }, u.lastLoginAt ? 'Signed in ' + SB.ago(u.lastLoginAt) : 'No activity')),
              h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
                u.status !== 'approved' ? h('button', { class: 'btn good sm', onclick: () => act(() => api.post(`/api/admin/users/${u.id}/approve`), 'User approved') }, icon('check'), 'Approve') : null,
                u.status !== 'rejected' ? h('button', { class: 'btn danger sm', onclick: () => reject(u) }, icon('x'), 'Reject') : null,
                h('button', { class: 'icon-btn', style: { width: '32px', height: '32px' }, 'aria-label': 'Delete user', onclick: async () => { if (await SB.confirm('Delete this user?', `${u.name} and all their data will be permanently removed.`, 'Delete', true)) act(() => api.del('/api/admin/users/' + u.id), 'User deleted'); } }, icon('trash')))))))))
            : SB.empty('users', filter === 'pending' ? 'No pending registrations' : 'No users found', filter === 'pending' ? 'New sign-ups awaiting approval will appear here.' : 'Try a different filter or search.'));
        } catch (e) { mount(list, SB.callout('err', e.message)); }
      }
      paintFilters(); load();
      return h('div', { class: 'stack' }, h('div', { class: 'row between wrap' }, filters, search), list);
    }

    /* ----- skills ----- */
    async function skills() {
      const list = h('div');
      const name = h('input', { class: 'input', maxlength: '40', placeholder: 'Skill name, e.g. Excel' });
      const cat = h('input', { class: 'input', maxlength: '30', placeholder: 'Category, e.g. Data' });
      const add = h('button', { class: 'btn', type: 'button' }, icon('plus'), 'Add skill');
      add.addEventListener('click', () => SB.busy(add, async () => {
        try { await api.post('/api/admin/skills', { name: name.value, category: cat.value }); name.value = ''; SB.toast('Skill added', 'ok'); load(); loadStats(); } catch (e) { SB.err(e); }
      }));
      async function load() {
        const { skills: rows } = await api.get('/api/admin/skills');
        mount(list, h('div', { class: 'table-wrap' }, h('table', { class: 't' },
          h('thead', null, h('tr', null, ['Skill', 'Category', 'Shown to users', ''].map((c) => h('th', null, c)))),
          h('tbody', null, rows.map((s) => h('tr', null, h('td', null, h('b', null, s.name)), h('td', null, s.category),
            h('td', null, h('button', { class: 'chip' + (s.active ? ' on' : ''), onclick: async () => { try { await api.patch('/api/admin/skills/' + s.id, { active: !s.active }); load(); } catch (e) { SB.err(e); } } }, s.active ? 'Visible' : 'Hidden')),
            h('td', { style: { textAlign: 'right' } }, h('button', { class: 'btn danger sm', onclick: async () => { if (await SB.confirm('Delete skill?', `"${s.name}" will no longer be offered in assessments.`, 'Delete', true)) { try { await api.del('/api/admin/skills/' + s.id); load(); loadStats(); } catch (e) { SB.err(e); } } } }, icon('trash')))))))));
      }
      await load();
      return h('div', { class: 'stack' },
        h('p', { class: 'sub small' }, 'These are the skills users can choose from when starting an assessment. Users can also enter their own skill. Questions themselves are always generated by the AI.'),
        h('div', { class: 'card row wrap' }, h('div', { class: 'grow', style: { minWidth: '180px' } }, name), h('div', { style: { minWidth: '160px' } }, cat), add), list);
    }

    /* ----- announcements ----- */
    async function news() {
      const list = h('div');
      const title = h('input', { class: 'input', maxlength: '120', placeholder: 'Title' });
      const text = h('textarea', { class: 'input', rows: 3, maxlength: '400', placeholder: 'Message shown in every approved user’s notifications' });
      const send = h('button', { class: 'btn', type: 'button' }, icon('megaphone'), 'Send to all users');
      const load = async () => {
        const { announcements } = await api.get('/api/admin/announcements');
        mount(list, announcements.length ? h('div', { class: 'stack sm' }, announcements.map((a) => h('div', { class: 'card', style: { padding: '14px 18px' } }, h('div', { class: 'row between' }, h('b', null, a.title), h('span', { class: 'xs muted' }, SB.ago(a.createdAt))), h('p', { class: 'small sub' }, a.body)))) : h('p', { class: 'muted small' }, 'No announcements sent yet.'));
      };
      send.addEventListener('click', () => SB.busy(send, async () => {
        try { const r = await api.post('/api/admin/announcements', { title: title.value, body: text.value }); title.value = ''; text.value = ''; SB.toast(`Sent to ${r.sent} user${r.sent === 1 ? '' : 's'}`, 'ok'); load(); } catch (e) { SB.err(e); }
      }));
      await load();
      return h('div', { class: 'stack' }, h('div', { class: 'card stack' }, h('h3', null, 'New announcement'), title, text, h('div', null, send)), h('h3', null, 'Sent'), list);
    }

    async function show() {
      mount(body, SB.loading());
      try { mount(body, await ({ users, skills, news }[tab])()); } catch (e) { mount(body, SB.callout('err', e.message)); }
    }

    mount(root, h('div', { class: 'fade-in' },
      h('header', { class: 'topbar' }, h('div', { class: 'row' }, SB.logo(), h('span', { class: 'badge primary' }, icon('shield'), 'Admin')),
        h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Toggle theme', onclick: SB.toggleTheme }, icon('moon')), h('button', { class: 'btn ghost sm', onclick: SB.signOut }, icon('logout'), 'Sign out'))),
      h('main', { class: 'content' }, h('div', { class: 'stack lg' },
        h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'Admin dashboard'), h('p', null, 'Approve registrations, manage the skills users can be assessed on, and send announcements.')),
        stats, tabsEl, body))));
    loadStats().then((s) => { paintTabs(s && s.pending); });
    paintTabs(0); show();
  };
})();
