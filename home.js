/* Dashboard home + Profile */
(function () {
  'use strict';
  const { h, icon, api } = SB;

  SB.views.home = {
    async render(box) {
      const [d, cfg] = [await api.get('/api/dashboard'), SB.state.config || {}];
      const first = d.name.split(' ')[0];

      // Next best step, derived from the user's real progress (no canned content).
      let next;
      if (d.assessmentInProgress) next = ['Resume your assessment', 'You have an assessment in progress. Finish it to update your skill levels.', 'assessment', 'Continue'];
      else if (!d.assessment) next = ['Start with a skill assessment', 'Pick up to five skills and the AI will write a fresh 10-question assessment for you. Everything else builds on your results.', 'assessment', 'Take assessment'];
      else if (!d.gap) next = ['Compare yourself with a target role', `Your last score was ${d.assessment.score}%. See how it stacks up against the skills a role really needs.`, 'skill-gap', 'Run gap analysis'];
      else if (!d.resume) next = ['Add your resume', 'Upload your resume so job matching and the AI Career Coach can use your real experience.', 'resume-studio', 'Upload resume'];
      else if (!d.jobs) next = ['Find roles that fit you', 'Let the AI analyse your skills, assessment, gap results and resume to suggest job and internship roles.', 'jobs', 'See matching roles'];
      else next = ['Keep the momentum going', 'Ask your AI Career Coach what to focus on next, or re-run your assessment to track progress.', 'career-coach', 'Talk to coach'];

      const ready = (t, done) => h('div', { class: 'state' + (done ? ' done' : '') }, done ? [icon('check'), ' '] : null, t);
      const F = [
        ['assessment', 'AI Skill Assessment', 'target', '', 'Fresh AI-written questions on the skills you choose, graded with detailed feedback.',
          d.assessmentInProgress ? ready('In progress – continue', false) : d.assessment ? ready(`Latest: ${d.assessment.score}% · ${d.assessment.level}`, true) : ready('Not taken yet')],
        ['skill-gap', 'Skill Gap Analysis', 'chart', 'teal', 'Your assessed skills compared with what a target role requires.',
          d.gap ? ready(`${d.gap.role}${d.gap.readiness !== null ? ' · ' + d.gap.readiness + '% ready' : ''}`, true) : ready(d.assessment ? 'Ready to run' : 'Needs an assessment first')],
        ['jobs', 'Jobs & Internships', 'briefcase', 'sky', 'Job and internship roles matched to your skills, results and resume.',
          d.jobs ? ready(`${d.jobs.jobRoles} job roles · ${d.jobs.internshipRoles} internships`, true) : ready('Not analysed yet')],
        ['resume-studio', 'AI Resume Studio', 'file', 'green', 'Upload, polish and download your resume – truthfully, without invented facts.',
          d.resume ? ready(d.resume.improved ? 'Polished version ready' : 'Uploaded – ready to polish', d.resume.improved) : ready('No resume yet')],
        ['career-coach', 'AI Career Coach', 'compass', '', 'Personal guidance built from your profile, results, gaps and resume.',
          ready(d.coachMessages ? `${d.coachMessages} question${d.coachMessages > 1 ? 's' : ''} asked` : 'Start a conversation', d.coachMessages > 0)],
      ];

      const notes = h('div', { class: 'card', style: { padding: 0, overflow: 'hidden' } });
      const paintNotes = (n) => {
        SB.mount(notes,
          h('div', { class: 'row between', style: { padding: '16px 18px', borderBottom: '1px solid var(--line)' } },
            h('h3', null, 'Latest updates'),
            h('button', { class: 'btn ghost sm', onclick: () => SB.state.ui.bell.click() }, icon('bell'), 'Open notifications')),
          n.items.length ? n.items.slice(0, 3).map((x) => SB.notifItem(x, () => x.view && SB.go(x.view)))
            : h('div', { class: 'empty', style: { padding: '26px' } }, h('p', null, 'No updates yet – results, alerts and coach tips will show up here.')));
      };
      paintNotes(SB.state.notif || { items: [] });
      SB.onNotifications = paintNotes;
      const prevCleanup = SB.state.cleanup; SB.state.cleanup = () => { SB.onNotifications = null; if (prevCleanup) prevCleanup(); };

      SB.mount(box, h('div', { class: 'stack lg' },
        h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, `Hello, ${first}`), h('p', null, 'Here is where you stand and what to do next.')),
        cfg.aiConfigured === false ? SB.callout('warn', h('b', null, 'AI is not configured. '), 'Ask the administrator to set AI_API_KEY in the server .env file – AI-powered features are unavailable until then.') : null,
        h('div', { class: 'hero-card' },
          h('div', null, h('h2', null, next[0]), h('p', null, next[1])),
          h('a', { class: 'btn', href: '#/' + next[2] }, next[3], icon('ext'))),
        h('div', { class: 'feature-grid' }, F.map(([id, name, ic, tone, text, state]) =>
          h('a', { class: 'card feature', href: '#/' + id },
            h('div', { class: 'fi ' + tone }, icon(ic)), h('h3', null, name), h('p', { class: 'sub small' }, text), state))),
        notes));
    },
  };

  /* ---------- profile ---------- */
  SB.views.profile = {
    async render(box) {
      const [{ profile: p }, me] = [await api.get('/api/profile'), await api.get('/api/auth/me')];
      const inp = (id, label, val, extra = {}) => h('div', { class: 'field' + (extra.full ? ' full' : '') }, h('label', { for: id }, label),
        extra.area ? h('textarea', { class: 'input', id, maxlength: extra.max, placeholder: extra.ph || '', rows: 3 }, val || '')
          : h('input', { class: 'input', id, value: val || '', maxlength: extra.max || 120, placeholder: extra.ph || '' }), extra.hint ? h('div', { class: 'hint' }, extra.hint) : null);
      const g = (id) => box.querySelector('#' + id).value.trim();
      const save = h('button', { class: 'btn', type: 'button' }, 'Save profile');
      save.addEventListener('click', () => SB.busy(save, async () => {
        try {
          const r = await api.put('/api/profile', {
            name: g('p-name'), headline: g('p-headline'), education: g('p-edu'), institution: g('p-inst'), graduationYear: g('p-year'),
            experienceLevel: g('p-level'), location: g('p-loc'), latitude: null, longitude: null, countryCode: '',
            interests: g('p-int'), skills: g('p-skills'), bio: g('p-bio'),
          });
          SB.state.user.name = g('p-name'); SB.toast('Profile saved', 'ok');
        } catch (e) { SB.err(e); }
      }));
      SB.mount(box, h('div', { class: 'stack lg' },
        h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'Profile & settings'),
          h('p', null, 'This information helps the AI tailor assessments, role matching and coaching. Only fill in what is true – nothing is shared with other users.')),
        h('div', { class: 'card pad-lg' }, h('div', { class: 'form-grid' },
          inp('p-name', 'Full name', me.user.name, { max: 80 }),
          h('div', { class: 'field' }, h('label', null, 'Email'), h('input', { class: 'input', value: me.user.email, disabled: true })),
          inp('p-headline', 'Headline', p.headline, { ph: 'e.g. Final-year CS student interested in web development' }),
          h('div', { class: 'field' }, h('label', { for: 'p-level' }, 'Experience level'),
            (() => { const s = h('select', { class: 'input', id: 'p-level' }, ['', 'Student', 'Fresher / recent graduate', '0–2 years', '2–5 years', '5+ years'].map((o) => h('option', { value: o }, o || 'Select…'))); s.value = p.experienceLevel; return s; })()),
          inp('p-edu', 'Education', p.education, { ph: 'e.g. B.Tech Computer Science' }),
          inp('p-inst', 'Institution', p.institution),
          inp('p-year', 'Graduation year', p.graduationYear, { max: 10, ph: '2026' }),
          inp('p-loc', 'Location', p.location, { ph: 'City, State or Country', hint: 'Used to tailor job searches. Optional.' }),
          inp('p-skills', 'Skills you already have', p.skills, { max: 500, ph: 'e.g. JavaScript, Excel, public speaking', hint: 'Comma-separated. Used as extra context alongside your verified assessment results.' }),
          inp('p-int', 'Career interests', p.interests, { max: 300, full: true, ph: 'e.g. web development, testing, technical writing' }),
          inp('p-bio', 'About you', p.bio, { max: 600, full: true, area: true, ph: 'A few sentences about your goals.' })),
          h('div', { class: 'row mt', style: { justifyContent: 'flex-end' } }, save))));
    },
  };
})();
