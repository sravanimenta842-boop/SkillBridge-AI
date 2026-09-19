/* AI Skill Assessment */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;
  const MAX = 5;
  const CAT = { conceptual: 'Conceptual', problem_solving: 'Problem solving', practical: 'Practical' };
  const DIFF = { easy: 'green', medium: 'blue', hard: 'amber' };

  SB.views.assessment = {
    async render(box) {
      const state = { view: null };
      const show = (el) => mount(box, el);

      async function home() {
        const [{ assessment: cur }, { skills }, { history }] = await Promise.all([
          api.get('/api/assessment/current'), api.get('/api/skills'), api.get('/api/assessment/history')]);
        if (cur) return quiz(cur);
        const pre = SB.state.prefillSkills || []; SB.state.prefillSkills = null;
        picker(skills, history, pre);
      }

      function picker(catalog, history, pre) {
        const selected = new Set(pre.slice(0, MAX));
        const catalogNames = new Set(catalog.map((s) => s.name));
        const chipBox = h('div', { class: 'chips' });
        const count = h('span', { class: 'badge primary' });
        const go = h('button', { class: 'btn grad', type: 'button' }, icon('sparkles'), 'Generate my assessment');
        const paint = () => {
          const names = [...catalogNames, ...[...selected].filter((n) => !catalogNames.has(n))];
          mount(chipBox, names.map((n) => {
            const chip = h('button', { class: 'chip' + (selected.has(n) ? ' on' : ''), type: 'button', 'aria-pressed': selected.has(n) }, selected.has(n) ? icon('check') : null, n);
            chip.addEventListener('click', () => {
              if (selected.has(n)) selected.delete(n);
              else if (selected.size >= MAX) return SB.toast(`Choose at most ${MAX} skills for accurate results.`);
              else selected.add(n);
              paint();
            });
            return chip;
          }));
          count.textContent = `${selected.size} of ${MAX} selected`;
          go.disabled = selected.size === 0;
        };
        const other = h('input', { class: 'input', placeholder: 'Other skill, e.g. Excel, React, Data Analysis', maxlength: '40' });
        const addOther = () => {
          const v = other.value.trim(); if (!v) return;
          if (selected.size >= MAX) return SB.toast(`Choose at most ${MAX} skills for accurate results.`);
          selected.add(v); other.value = ''; paint();
        };
        other.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } });
        go.addEventListener('click', () => SB.busy(go, async () => {
          try { const r = await api.post('/api/assessment/generate', { skills: [...selected] }); quiz(r.assessment); }
          catch (e) { SB.err(e); }
        }));
        paint();

        show(h('div', { class: 'stack lg' },
          h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'AI Skill Assessment'),
            h('p', null, 'Choose the skills you want to be assessed on. The AI writes a brand-new set of 10 questions every time, covering concepts, problem solving and practical knowledge.')),
          h('div', { class: 'card pad-lg stack' },
            h('div', { class: 'row between wrap' }, h('h3', null, 'Select skills'), count),
            chipBox,
            h('div', { class: 'row wrap' }, h('div', { class: 'grow', style: { minWidth: '220px' } }, other), h('button', { class: 'btn soft', type: 'button', onclick: addOther }, icon('plus'), 'Add skill')),
            h('div', { class: 'hint' }, 'Generating takes 10–30 seconds. Choose 1–5 skills; 10 questions are spread across them.'),
            h('div', null, go)),
          history.length ? h('div', null,
            h('h2', { style: { marginBottom: '12px' } }, 'Previous assessments'),
            h('div', { class: 'stack sm' }, history.map((x) => h('button', { class: 'card row between wrap', style: { textAlign: 'left', cursor: 'pointer', padding: '16px 20px' }, onclick: () => openResult(x.id) },
              h('div', null, h('b', null, x.skills.join(', ')), h('div', { class: 'small muted' }, SB.date(x.completedAt))),
              h('div', { class: 'row' }, SB.levelBadge(x.level), h('span', { class: 'bold' }, x.percent + '%'), icon('ext')))))) : null));
      }

      async function openResult(id) {
        show(SB.loading('Loading result…'));
        try { const r = await api.get('/api/assessment/' + id); result(r.result); }
        catch (e) { SB.err(e); home(); }
      }

      function quiz(a) {
        const answers = {};
        const qs = a.questions;
        for (const q of qs) { const s = a.savedAnswers && a.savedAnswers[q.id]; if (s !== undefined && s !== null && s !== '') answers[q.id] = s; }
        const prog = h('div', { class: 'bar' }, h('i', { style: { width: '0%' } }));
        const progText = h('span', { class: 'small bold' });
        const update = () => {
          const n = qs.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '' && answers[q.id] !== null).length;
          prog.firstChild.style.width = (n / qs.length) * 100 + '%'; progText.textContent = `${n} of ${qs.length} answered`;
        };
        const cards = qs.map((q, i) => {
          const body = q.format === 'mcq'
            ? h('div', null, q.options.map((o, oi) => {
              const inp = h('input', { type: 'radio', name: q.id, value: oi, checked: answers[q.id] === oi });
              const row = h('label', { class: 'opt' + (answers[q.id] === oi ? ' on' : '') }, inp, h('span', null, o));
              inp.addEventListener('change', () => { answers[q.id] = oi; row.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.remove('on')); row.classList.add('on'); update(); });
              return row;
            }))
            : (() => { const t = h('textarea', { class: 'input', rows: 4, maxlength: '2500', placeholder: 'Write your answer in your own words…', style: { marginTop: '10px' } }, answers[q.id] || '');
              t.addEventListener('input', () => { answers[q.id] = t.value; update(); }); return t; })();
          return h('div', { class: 'q-card' },
            h('div', { class: 'q-meta' }, h('span', { class: 'badge primary' }, `Question ${i + 1}`), h('span', { class: 'badge' }, q.skill),
              h('span', { class: 'badge ' + (DIFF[q.difficulty] || '') }, q.difficulty), h('span', { class: 'xs muted' }, CAT[q.category] || q.category)),
            h('div', { class: 'q-text' }, q.question), q.code ? h('pre', { class: 'code' }, q.code) : null, body);
        });
        const submit = h('button', { class: 'btn grad', type: 'button' }, icon('check'), 'Submit for AI evaluation');
        submit.addEventListener('click', async () => {
          const left = qs.length - qs.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '' && answers[q.id] !== null).length;
          if (left && !(await SB.confirm('Submit with unanswered questions?', `${left} question${left > 1 ? 's are' : ' is'} unanswered and will score zero.`, 'Submit anyway'))) return;
          show(SB.loading('The AI is grading your answers and writing feedback… this can take up to 30 seconds.'));
          try { const r = await api.post(`/api/assessment/${a.id}/submit`, { answers }); SB.refreshNotifications(); result(r.result); window.scrollTo(0, 0); }
          catch (e) { SB.err(e); quiz(a); }
        });
        const discard = h('button', { class: 'btn ghost', type: 'button' }, 'Discard');
        discard.addEventListener('click', async () => {
          if (!(await SB.confirm('Discard this assessment?', 'The questions will be removed and you can generate a new set.', 'Discard', true))) return;
          await api.del('/api/assessment/current'); home();
        });
        update();
        show(h('div', { class: 'stack lg' },
          h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'Your assessment'), h('p', null, `Skills: ${a.skills.join(', ')}. Answer as best you can – short-answer questions are graded on understanding, not exact wording.`)),
          h('div', { class: 'stack' }, cards),
          h('div', { class: 'sticky-bar' }, h('div', { class: 'row between wrap' },
            h('div', { class: 'grow', style: { minWidth: '180px', maxWidth: '360px' } }, progText, h('div', { style: { marginTop: '6px' } }, prog)),
            h('div', { class: 'row' }, discard, submit)))));
      }

      function result(r) {
        const skillRows = r.skillResults.map((s) => h('div', { class: 'skill-row' },
          h('div', null, h('b', null, s.skill), h('div', { class: 'xs muted' }, s.questions + ' questions')),
          SB.bar(s.percent, SB.tone(s.percent)),
          h('div', { class: 'bold', style: { textAlign: 'right' } }, s.percent + '%')));
        const comments = r.skillResults.filter((s) => s.comment).map((s) => h('div', null, h('b', null, s.skill + ': '), s.comment));
        const review = r.questions.map((q, i) => {
          const tone = q.score >= 0.75 ? 'green' : q.score >= 0.4 ? 'amber' : 'red';
          return h('details', { class: 'review' },
            h('summary', null, h('span', { class: 'badge ' + tone }, Math.round(q.score * 100) + '%'), h('span', { class: 'grow' }, `Q${i + 1} · ${q.skill}`), icon('ext')),
            h('div', { class: 'body stack sm' },
              h('div', { class: 'q-text' }, q.question), q.code ? h('pre', { class: 'code' }, q.code) : null,
              q.format === 'mcq'
                ? h('div', null, q.options.map((o) => h('div', { class: 'opt ' + (o === q.correctAnswer ? 'right' : o === q.userAnswer ? 'wrong' : '') }, h('span', null, o, o === q.userAnswer ? '  (your answer)' : '', o === q.correctAnswer ? '  ✓ correct' : ''))))
                : h('div', { class: 'stack sm' }, h('div', null, h('b', null, 'Your answer: '), q.userAnswer || h('i', { class: 'muted' }, 'No answer')), h('div', null, h('b', null, 'Model answer: '), q.correctAnswer)),
              q.feedback ? SB.callout('', q.feedback) : null));
        });
        show(h('div', { class: 'stack lg' },
          h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('h1', null, 'Assessment result'), h('p', null, `Skills assessed: ${r.skills.join(', ')} · ${SB.date(r.completedAt)}`)),
          h('div', { class: 'card pad-lg' }, h('div', { class: 'row wrap', style: { gap: '28px' } },
            SB.ring(r.overall.percent, 'overall', 132),
            h('div', { class: 'grow stack sm', style: { minWidth: '240px' } },
              h('div', { class: 'row wrap' }, h('h2', null, 'Skill level:'), SB.levelBadge(r.overall.level), h('span', { class: 'small muted' }, `${r.overall.answered} of ${r.overall.total} questions answered`)),
              r.ai.summary ? h('p', { class: 'sub' }, r.ai.summary) : null))),
          h('div', { class: 'form-grid' },
            h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('span', { class: 'badge green' }, icon('check'), 'Strong skills')),
              r.strong_skills.length ? h('div', null, r.strong_skills.map((s) => h('span', { class: 'tag green' }, s))) : h('p', { class: 'small muted' }, 'No skill has reached 70% yet – that is a normal starting point.')),
            h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('span', { class: 'badge amber' }, icon('alert'), 'Needs improvement')),
              r.improvement_skills.length ? h('div', null, r.improvement_skills.map((s) => h('span', { class: 'tag amber' }, s))) : h('p', { class: 'small muted' }, 'Great – every assessed skill is above 70%.'))),
          h('div', { class: 'card pad-lg' }, h('h3', { style: { marginBottom: '6px' } }, 'Skill breakdown'), skillRows,
            comments.length ? h('div', { class: 'stack sm small sub mt' }, comments) : null),
          r.ai.practice_areas.length ? h('div', null, h('h2', { style: { marginBottom: '12px' } }, 'Areas that need more practice'),
            h('div', { class: 'form-grid' }, r.ai.practice_areas.map((p) => h('div', { class: 'card' }, h('div', { class: 'row' }, icon('bulb'), h('b', null, p.skill)), h('p', { class: 'small sub mt-sm' }, p.focus), SB.list(p.suggestions))))) : null,
          r.ai.next_steps.length ? h('div', { class: 'card flat' }, h('h3', { style: { marginBottom: '6px' } }, 'Suggested next steps'), SB.list(r.ai.next_steps)) : null,
          h('div', null, h('h2', { style: { marginBottom: '12px' } }, 'Question review'), review),
          h('div', { class: 'row wrap' },
            h('a', { class: 'btn grad', href: '#/skill-gap' }, icon('chart'), 'Run skill gap analysis'),
            h('button', { class: 'btn ghost', type: 'button', onclick: () => home() }, icon('refresh'), 'Take another assessment'))));
      }

      show(SB.loading());
      await home();
    },
  };
})();
