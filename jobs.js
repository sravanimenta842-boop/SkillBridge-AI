/* Jobs & Internships – AI-derived role categories with job-board search links */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;
  const FIT = { strong: ['Strong fit', 'green'], good: ['Good fit', 'blue'], stretch: ['Stretch', 'amber'] };

  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* Plain search links on public job boards (no API, no scraping) built from the AI-suggested keywords. */
  function boardLinks(keywords, place, kind) {
    const q = encodeURIComponent(kind === 'internship' ? `${keywords} internship` : keywords);
    const l = encodeURIComponent(place || '');
    const links = [
      ['LinkedIn', `https://www.linkedin.com/jobs/search/?keywords=${q}${l ? '&location=' + l : ''}`],
      ['Indeed', `https://www.indeed.com/jobs?q=${q}${l ? '&l=' + l : ''}`],
      ['Google Jobs', `https://www.google.com/search?q=${encodeURIComponent(keywords + (kind === 'internship' ? ' internship' : ' jobs') + (place ? ' in ' + place : ''))}&ibp=htl;jobs`],
    ];
    if (kind === 'internship') links.splice(1, 0, ['Internshala', `https://internshala.com/internships/keywords-${slug(keywords)}`]);
    else links.splice(1, 0, ['Naukri', `https://www.naukri.com/${slug(keywords)}-jobs`]);
    return links;
  }

  SB.views.jobs = {
    async render(box) {
      let data = await api.get('/api/jobs/recommendations');
      const { profile } = await api.get('/api/profile');
      const place = h('input', { class: 'input', id: 'jp', maxlength: '80', placeholder: 'City or region (optional)', value: profile.location ? profile.location.split(',')[0].trim() : '', style: { maxWidth: '260px' } });
      let tab = 'job';
      const body = h('div');
      const analyze = h('button', { class: 'btn grad', type: 'button' }, icon('sparkles'), data.recommendations ? 'Refresh analysis' : 'Analyse my profile');
      analyze.addEventListener('click', () => SB.busy(analyze, async () => {
        try { mount(body, SB.loading('Analysing your skills, assessments, gap results and resume…')); const r = await api.post('/api/jobs/analyze'); data.recommendations = r.recommendations; SB.refreshNotifications(); paint(); }
        catch (e) { SB.err(e); paint(); }
      }).then(() => { analyze.lastChild.textContent = data.recommendations ? 'Refresh analysis' : 'Analyse my profile'; }));

      function roleCard(r, kind) {
        const [fl, ft] = FIT[r.fit] || FIT.good;
        return h('div', { class: 'card role-card' },
          h('div', { class: 'row between', style: { alignItems: 'flex-start' } },
            h('div', null, h('h3', null, r.title), h('div', { class: 'small muted' }, r.category)),
            r.match_percent !== null ? h('div', { class: 'center' }, h('div', { class: 'match' }, r.match_percent + '%'), h('div', { class: 'xs muted' }, 'skill match')) : null),
          h('div', null, h('span', { class: 'badge ' + ft }, fl)),
          r.why ? h('p', { class: 'small sub' }, r.why) : null,
          r.matched_skills.length ? h('div', null, h('div', { class: 'xs muted' }, 'You bring'), r.matched_skills.map((s) => h('span', { class: 'tag green' }, s))) : null,
          r.missing_skills.length ? h('div', null, h('div', { class: 'xs muted' }, 'To strengthen'), r.missing_skills.map((s) => h('span', { class: 'tag amber' }, s))) : null,
          r.match_percent === null ? h('div', { class: 'xs muted' }, 'Match % appears once you have assessed skills relevant to this role.') : null,
          h('div', null, h('div', { class: 'xs muted', style: { marginBottom: '6px' } }, 'Search openings for this role'),
            h('div', { class: 'row wrap', style: { gap: '8px' } }, boardLinks(r.search_keywords || r.title, place.value.trim(), kind).map(([n, u]) => h('a', { class: 'btn soft sm', href: u, target: '_blank', rel: 'noopener noreferrer' }, n, icon('ext'))))));
      }

      function paint() {
        const rec = data.recommendations;
        if (!rec) {
          return mount(body, data.ready
            ? SB.empty('briefcase', 'Find the roles that fit you', 'The AI will read your assessed skills, gap analysis, resume and profile to suggest job and internship role types you can apply for.')
            : SB.empty('briefcase', 'We need a little information first', 'Take a skill assessment, upload your resume or list your skills in your profile so the recommendations can be based on real data.',
              h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, h('a', { class: 'btn', href: '#/assessment' }, 'Take assessment'), h('a', { class: 'btn ghost', href: '#/resume-studio' }, 'Upload resume'))));
        }
        const list = tab === 'job' ? rec.job_roles : rec.internship_roles;
        mount(body, h('div', { class: 'stack lg fade-in' },
          rec.profile_summary ? h('div', { class: 'card flat' }, h('div', { class: 'row' }, icon('sparkles'), h('b', null, 'Your profile at a glance')), h('p', { class: 'sub mt-sm' }, rec.profile_summary), h('div', { class: 'xs muted mt-sm' }, 'Analysed ' + SB.ago(rec.createdAt))) : null,
          h('div', { class: 'tabs' },
            h('button', { class: 'tab' + (tab === 'job' ? ' on' : ''), onclick: () => { tab = 'job'; paint(); } }, 'Jobs', h('span', { class: 'count' }, rec.job_roles.length)),
            h('button', { class: 'tab' + (tab === 'internship' ? ' on' : ''), onclick: () => { tab = 'internship'; paint(); } }, 'Internships', h('span', { class: 'count' }, rec.internship_roles.length))),
          list.length ? h('div', { class: 'role-grid' }, list.map((r) => roleCard(r, tab))) : h('p', { class: 'muted' }, 'No internship roles were suggested in this analysis.')));
      }
      place.addEventListener('keydown', (e) => { if (e.key === 'Enter') paint(); });
      place.addEventListener('change', paint);
      paint();
      mount(box, h('div', { class: 'stack lg' },
        h('div', { class: 'row between wrap page-head', style: { marginBottom: 0 } },
          h('div', null, h('h1', null, 'Jobs & Internships'), h('p', null, 'Roles you can apply for based on your actual profile – not just software development. Each role links to searches on popular job boards.')), analyze),
        h('div', { class: 'row wrap' }, h('label', { class: 'small bold', for: 'jp' }, 'Search near'), place, h('span', { class: 'hint' }, 'Links below use this location – press Enter to refresh')),
        body));
    },
  };
})();
