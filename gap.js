/* Skill Gap Analysis */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;
  const IMP = { critical: ['Critical', 'red'], important: ['Important', 'amber'], nice_to_have: ['Nice to have', ''] };
  const STATUS = { strong: ['Strong', 'green'], improve: ['Needs improvement', 'amber'], not_assessed: ['Not assessed', ''] };

  SB.views['skill-gap'] = {
    async render(box) {
      const [latest, recs, hist, mine] = await Promise.all([
        api.get('/api/gap/latest'), api.get('/api/jobs/recommendations').catch(() => ({})),
        api.get('/api/gap/history'), api.get('/api/skills/mine')]);
      const hasAssessment = mine.skills.length > 0;
      const roleInput = h('input', { class: 'input', id: 'role', maxlength: '80', placeholder: 'e.g. Front-End Developer, QA Tester, Data Analyst', value: latest.analysis ? latest.analysis.role : '' });
      const go = h('button', { class: 'btn grad', type: 'button' }, icon('chart'), 'Analyse gap');
      const out = h('div');
      const suggestions = ((recs.recommendations && recs.recommendations.job_roles) || []).slice(0, 5).map((r) => r.title);

      const run = () => SB.busy(go, async () => {
        try {
          mount(out, SB.loading('Looking up role requirements and comparing with your assessment…'));
          const r = await api.post('/api/gap/analyze', { role: roleInput.value }); SB.refreshNotifications(); paint(r.analysis);
          const hh = await api.get('/api/gap/history'); histBox(hh.history);
        } catch (e) { mount(out); SB.err(e); }
      });
      go.addEventListener('click', run);
      roleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });

      function paint(a) {
        const rows = a.rows.map((r) => {
          const [sl, st] = STATUS[r.status]; const [il, it] = IMP[r.importance] || IMP.important;
          return h('div', { class: 'card', style: { padding: '16px 20px' } },
            h('div', { class: 'row between wrap' },
              h('div', { class: 'row wrap' }, h('b', null, r.skill), h('span', { class: 'badge ' + it }, il), h('span', { class: 'badge ' + st }, sl)),
              r.status === 'not_assessed' ? h('button', { class: 'btn soft sm', onclick: () => { SB.state.prefillSkills = [r.skill]; SB.go('assessment'); } }, 'Assess this skill')
                : h('div', { class: 'small' }, h('b', null, `${r.current}%`), ' now · ', h('b', null, `${r.required}%`), ' required', r.gap > 0 ? [' · ', h('b', { style: { color: 'var(--amber)' } }, `gap ${r.gap}%`)] : null)),
            r.status === 'not_assessed'
              ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, `Required: ${r.required}%. You have not been assessed on this skill yet.`)
              : h('div', { style: { marginTop: '10px' } }, SB.bar(r.current, r.status === 'strong' ? 'green' : 'amber', r.required)),
            r.why ? h('div', { class: 'small sub', style: { marginTop: '8px' } }, r.why) : null);
        });
        const focus = (a.focus || []).map((f) => h('div', { class: 'card' },
          h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, icon('bulb'), h('b', null, f.skill)), h('div', { class: 'row' }, h('span', { class: 'badge ' + (f.priority === 'high' ? 'red' : f.priority === 'low' ? '' : 'amber') }, f.priority + ' priority'), f.timeframe ? h('span', { class: 'badge blue' }, icon('clock'), f.timeframe) : null)),
          f.why ? h('p', { class: 'small sub mt-sm' }, f.why) : null, SB.list(f.actions)));
        mount(out, h('div', { class: 'stack lg fade-in' },
          h('div', { class: 'card pad-lg' }, h('div', { class: 'row wrap', style: { gap: '28px' } },
            SB.ring(a.readiness_percent, 'ready', 128),
            h('div', { class: 'grow stack sm', style: { minWidth: '240px' } },
              h('h2', null, a.role), a.roleSummary ? h('p', { class: 'sub' }, a.roleSummary) : null,
              a.summary ? h('p', null, a.summary) : null,
              h('div', { class: 'row wrap' },
                h('span', { class: 'badge green' }, `${a.strong.length} strong`), h('span', { class: 'badge amber' }, `${a.improve.length} to improve`),
                a.not_assessed.length ? h('span', { class: 'badge' }, `${a.not_assessed.length} not assessed`) : null,
                h('span', { class: 'xs muted' }, `Based on ${a.coverage_percent}% of the role's skills`))))),
          a.not_assessed.length ? SB.callout('', 'Skills marked “Not assessed” are never guessed – assess them to include them in your readiness score.') : null,
          h('div', null, h('h2', { style: { marginBottom: '4px' } }, 'Current vs required'), h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'The dark marker on each bar shows the level the role requires.'), h('div', { class: 'stack sm' }, rows)),
          focus.length ? h('div', null, h('h2', { style: { marginBottom: '12px' } }, 'Recommended focus areas'), h('div', { class: 'form-grid' }, focus)) : null));
      }

      const histWrap = h('div');
      function histBox(list) {
        mount(histWrap, list.length > 1 ? h('div', null, h('h3', { style: { marginBottom: '10px' } }, 'Earlier analyses'),
          h('div', { class: 'chips' }, list.map((x) => h('button', { class: 'chip', onclick: async () => { try { const r = await api.get('/api/gap/' + x.id); paint(r.analysis); roleInput.value = r.analysis.role; } catch (e) { SB.err(e); } } }, `${x.role}${x.readiness !== null ? ' · ' + x.readiness + '%' : ''}`)))) : null);
      }
      histBox(hist.history);
      if (latest.analysis) paint(latest.analysis);

      mount(box, h('div', { class: 'stack lg' },
        h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'Skill Gap Analysis'),
          h('p', null, 'Enter a target role. The AI defines the skill levels that role typically requires, and we compare them with your real assessment scores.')),
        !hasAssessment ? SB.callout('warn', h('b', null, 'Complete an assessment first. '), 'The analysis compares role requirements with your assessed skill levels. ', h('a', { href: '#/assessment' }, 'Take the AI Skill Assessment →')) : null,
        h('div', { class: 'card pad-lg stack' },
          h('div', { class: 'field' }, h('label', { for: 'role' }, 'Target job role'), roleInput),
          suggestions.length ? h('div', null, h('div', { class: 'hint', style: { marginBottom: '8px' } }, 'Roles suggested from your profile:'), h('div', { class: 'chips' }, suggestions.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => { roleInput.value = s; } }, s)))) : null,
          h('div', null, go)),
        out, histWrap));
    },
  };
})();
