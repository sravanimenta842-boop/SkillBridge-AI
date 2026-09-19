/* AI Career Coach (conversational UI + structured plan) */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;

  function chatPanel({ channel, empty, starters }) {
    const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const input = h('textarea', { class: 'input', rows: 1, maxlength: '4000', placeholder: 'Type your message…  (Enter to send, Shift+Enter for a new line)' });
    const send = h('button', { class: 'btn', type: 'button', 'aria-label': 'Send' }, icon('send'));
    const clear = h('button', { class: 'btn ghost sm', type: 'button' }, icon('trash'), 'Clear chat');
    let busy = false;

    const bubble = (role, text) => {
      const b = h('div', { class: 'msg ' + role });
      if (role === 'assistant') b.append(SB.markdown(text)); else b.textContent = text;
      return b;
    };
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const paintEmpty = () => mount(log, h('div', { class: 'stack center', style: { margin: 'auto', maxWidth: '520px' } },
      h('div', { class: 'fi', style: { margin: '0 auto' } }, icon(channel === 'coach' ? 'compass' : 'sparkles')), h('h3', null, empty.title), h('p', { class: 'sub small' }, empty.text),
      h('div', { class: 'starter', style: { justifyContent: 'center' } }, starters.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => ask(s) }, s)))));

    async function ask(text) {
      text = (text || '').trim(); if (!text || busy) return;
      busy = true; send.disabled = true; input.value = ''; input.style.height = '';
      if (log.querySelector('.starter')) SB.clear(log);
      log.append(bubble('user', text));
      const typing = h('div', { class: 'msg assistant' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')));
      log.append(typing); scroll();
      try {
        const r = await api.post(`/api/${channel}/message`, { message: text });
        typing.replaceWith(bubble('assistant', r.reply));
      } catch (e) {
        typing.replaceWith(h('div', { class: 'msg assistant' }, SB.callout('err', e.message)));
      }
      busy = false; send.disabled = false; scroll(); input.focus();
    }
    send.addEventListener('click', () => ask(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; });
    clear.addEventListener('click', async () => {
      if (!(await SB.confirm('Clear this conversation?', 'The chat history will be permanently deleted.', 'Clear', true))) return;
      await api.del(`/api/${channel}/history`); paintEmpty();
    });

    const el = h('div', { class: 'card chat' }, log, h('div', { class: 'chat-input' }, h('div', { class: 'grow' }, input), send));
    const load = async () => {
      const { messages } = await api.get(`/api/${channel}/history`);
      if (!messages.length) paintEmpty(); else { mount(log, messages.map((m) => bubble(m.role, m.content))); }
      setTimeout(scroll, 30);
    };
    return { el, clear, load };
  }

  const head = (title, text, extra) => h('div', { class: 'row between wrap page-head' }, h('div', null, h('h1', null, title), h('p', null, text)), extra);

  SB.views['career-coach'] = {
    async render(box) {
      const c = chatPanel({
        channel: 'coach',
        empty: { title: 'Your personal career coach', text: 'I use your profile, assessment results, skill gaps and resume to give advice that fits you.' },
        starters: ['Which skills should I focus on first?', 'What career directions suit me?', 'How can I improve my profile?', 'How do I prepare for my target role?'],
      });
      const planBox = h('div', { class: 'stack' });
      const gen = h('button', { class: 'btn grad block', type: 'button' }, icon('sparkles'), 'Generate my career plan');
      const paintPlan = (p) => {
        if (!p) return mount(planBox, h('div', { class: 'card stack' }, h('h3', null, 'Career plan'), h('p', { class: 'small sub' }, 'Get a structured plan built from your real profile, assessment results, gaps and resume.'), gen));
        const sec = (t, kids) => (kids ? h('div', { class: 'plan-item' }, h('b', null, t), kids) : null);
        mount(planBox, h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('h3', null, 'Your career plan'), h('span', { class: 'xs muted' }, SB.ago(p.createdAt))),
          p.headline ? h('p', { class: 'sub small mt-sm' }, p.headline) : null,
          h('div', { class: 'mt-sm' },
            p.first_steps.length ? sec('Do this week', SB.list(p.first_steps)) : null,
            p.focus_skills.length ? sec('Skills to focus on', h('ul', { class: 'plan-list' }, p.focus_skills.map((f) => h('li', null, h('b', null, f.skill + ': '), f.why, f.how ? [' → ', f.how] : null)))) : null,
            p.improvement_areas.length ? sec('Areas to improve', SB.list(p.improvement_areas)) : null,
            p.career_directions.length ? sec('Career directions', h('ul', { class: 'plan-list' }, p.career_directions.map((d) => h('li', null, h('b', null, d.role + ': '), d.reason)))) : null,
            p.profile_tips.length ? sec('Improve your profile', SB.list(p.profile_tips)) : null,
            p.preparation.length ? sec('Preparing for roles', p.preparation.map((x) => h('div', { style: { marginTop: '6px' } }, h('span', { class: 'badge primary' }, x.role), SB.list(x.steps)))) : null),
          h('div', { class: 'mt' }, gen)));
        gen.lastChild.textContent = 'Regenerate plan';
      };
      gen.addEventListener('click', () => SB.busy(gen, async () => {
        try { const r = await api.post('/api/coach/plan'); SB.refreshNotifications(); paintPlan(r.plan); }
        catch (e) { SB.err(e); }
      }).then(() => { gen.lastChild.textContent = 'Regenerate plan'; }));
      const { plan } = await api.get('/api/coach/plan'); paintPlan(plan);

      mount(box, head('AI Career Coach', 'Talk through your career with guidance grounded in your own data.', c.clear),
        h('div', { class: 'chat-layout with-plan' }, c.el, planBox));
      await c.load();
    },
  };
})();
