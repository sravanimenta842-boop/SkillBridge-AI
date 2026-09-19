/* AI Resume Studio */
(function () {
  'use strict';
  const { h, icon, api, mount } = SB;

  /* ----- resume preview ("paper") ----- */
  function paper(r) {
    const sec = (title, kids) => (kids && kids.length ? [h('h4', null, title), kids] : null);
    const contact = [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links || [])].filter(Boolean).join('  |  ');
    return h('div', { class: 'paper' },
      h('h1', null, r.name || 'Your Name'), r.headline ? h('div', { class: 'p-head' }, r.headline) : null, contact ? h('div', { class: 'p-contact' }, contact) : null,
      sec('Summary', r.summary ? [h('p', null, r.summary)] : null),
      sec('Skills', r.skills.length ? [h('p', null, r.skills.join('  •  '))] : null),
      sec('Experience', r.experience.map((e) => h('div', null,
        h('div', { class: 'p-row' }, h('span', null, e.title), h('span', null, [e.start, e.end].filter(Boolean).join(' – '))),
        h('div', { class: 'p-sub' }, [e.company, e.location].filter(Boolean).join(', ')), e.bullets.length ? h('ul', null, e.bullets.map((b) => h('li', null, b))) : null))),
      sec('Projects', r.projects.map((p) => h('div', null,
        h('div', { class: 'p-row' }, h('span', null, p.name), h('span', null, p.technologies.join(', '))),
        p.description ? h('div', { class: 'p-sub' }, p.description) : null, p.bullets.length ? h('ul', null, p.bullets.map((b) => h('li', null, b))) : null))),
      sec('Education', r.education.map((e) => h('div', null,
        h('div', { class: 'p-row' }, h('span', null, e.degree), h('span', null, [e.start, e.end].filter(Boolean).join(' – '))),
        h('div', { class: 'p-sub' }, [e.institution, e.location].filter(Boolean).join(', ')), e.details.length ? h('ul', null, e.details.map((b) => h('li', null, b))) : null))),
      sec('Certifications', r.certifications.length ? [h('ul', null, r.certifications.map((b) => h('li', null, b)))] : null),
      sec('Achievements', r.achievements.length ? [h('ul', null, r.achievements.map((b) => h('li', null, b)))] : null),
      sec('Languages', r.languages.length ? [h('p', null, r.languages.join(', '))] : null));
  }

  /* ----- editor for the improved version ----- */
  function editor(orig, onSave, onCancel) {
    const r = JSON.parse(JSON.stringify(orig));
    const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
    const csv = (t) => t.split(',').map((x) => x.trim()).filter(Boolean);
    const F = (label, val, set, o = {}) => {
      const el = o.area ? h('textarea', { class: 'input', rows: o.rows || 3 }, val) : h('input', { class: 'input', value: val });
      el.addEventListener('input', () => set(el.value));
      return h('div', { class: 'field' + (o.full ? ' full' : '') }, h('label', null, label), el, o.hint ? h('div', { class: 'hint' }, o.hint) : null);
    };
    const wrap = h('div', { class: 'stack' });
    const list = (title, arr, blank, fields) => {
      const box = h('div', { class: 'stack' });
      const paint = () => mount(box, arr.map((item, i) => h('div', { class: 'edit-block stack sm' },
        h('div', { class: 'form-grid' }, fields(item)),
        h('div', null, h('button', { class: 'btn danger sm', type: 'button', onclick: () => { arr.splice(i, 1); paint(); } }, icon('trash'), 'Remove')))));
      paint();
      return h('div', { class: 'stack sm' }, h('div', { class: 'row between' }, h('h3', null, title), h('button', { class: 'btn soft sm', type: 'button', onclick: () => { arr.push(blank()); paint(); } }, icon('plus'), 'Add')), box);
    };
    const save = h('button', { class: 'btn', type: 'button' }, 'Save changes');
    save.addEventListener('click', () => SB.busy(save, () => onSave(r)));
    mount(wrap,
      h('div', { class: 'form-grid' },
        F('Full name', r.name, (v) => { r.name = v; }), F('Headline', r.headline, (v) => { r.headline = v; }),
        F('Email', r.contact.email, (v) => { r.contact.email = v; }), F('Phone', r.contact.phone, (v) => { r.contact.phone = v; }),
        F('Location', r.contact.location, (v) => { r.contact.location = v; }), F('Links', r.contact.links.join(', '), (v) => { r.contact.links = csv(v); }, { hint: 'Comma-separated' }),
        F('Summary', r.summary, (v) => { r.summary = v; }, { area: true, full: true }),
        F('Skills', r.skills.join(', '), (v) => { r.skills = csv(v); }, { full: true, hint: 'Comma-separated. Only list skills you genuinely have.' })),
      list('Experience', r.experience, () => ({ title: '', company: '', location: '', start: '', end: '', bullets: [] }), (e) => [
        F('Job title', e.title, (v) => { e.title = v; }), F('Company', e.company, (v) => { e.company = v; }), F('Location', e.location, (v) => { e.location = v; }),
        F('Start', e.start, (v) => { e.start = v; }), F('End', e.end, (v) => { e.end = v; }),
        F('Bullet points', e.bullets.join('\n'), (v) => { e.bullets = lines(v); }, { area: true, full: true, rows: 4, hint: 'One per line' })]),
      list('Projects', r.projects, () => ({ name: '', description: '', technologies: [], bullets: [] }), (p) => [
        F('Project name', p.name, (v) => { p.name = v; }), F('Technologies', p.technologies.join(', '), (v) => { p.technologies = csv(v); }),
        F('Description', p.description, (v) => { p.description = v; }, { area: true, full: true }),
        F('Bullet points', p.bullets.join('\n'), (v) => { p.bullets = lines(v); }, { area: true, full: true, rows: 3, hint: 'One per line' })]),
      list('Education', r.education, () => ({ degree: '', institution: '', location: '', start: '', end: '', details: [] }), (e) => [
        F('Degree', e.degree, (v) => { e.degree = v; }), F('Institution', e.institution, (v) => { e.institution = v; }), F('Location', e.location, (v) => { e.location = v; }),
        F('Start', e.start, (v) => { e.start = v; }), F('End', e.end, (v) => { e.end = v; }),
        F('Details', e.details.join('\n'), (v) => { e.details = lines(v); }, { area: true, full: true, hint: 'One per line' })]),
      h('div', { class: 'form-grid' },
        F('Certifications', r.certifications.join('\n'), (v) => { r.certifications = lines(v); }, { area: true, hint: 'One per line' }),
        F('Achievements', r.achievements.join('\n'), (v) => { r.achievements = lines(v); }, { area: true, hint: 'One per line' }),
        F('Languages', r.languages.join(', '), (v) => { r.languages = csv(v); }, { full: true })),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', type: 'button', onclick: onCancel }, 'Cancel'), save));
    return wrap;
  }

  SB.views['resume-studio'] = {
    async render(box) {
      let { resume } = await api.get('/api/resume');
      let ver = 'improved'; let editing = false;

      /* ----- empty state: upload / paste ----- */
      function uploader() {
        const file = h('input', { type: 'file', accept: '.pdf,.docx,.txt', hidden: true });
        const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Upload resume' },
          h('div', { class: 'fi' }, icon('upload')), h('h3', null, 'Upload your resume'), h('p', { class: 'sub small' }, 'PDF, DOCX or TXT · up to 6 MB · drag & drop or click to browse'));
        const send = async (f) => {
          if (!f) return;
          if (f.size > 6 * 1024 * 1024) return SB.toast('That file is larger than 6 MB.', 'err');
          mount(box, SB.loading('Reading your resume and extracting its content…'));
          try { const buf = await f.arrayBuffer(); const r = await api.raw('/api/resume/upload', buf, { 'X-Filename': encodeURIComponent(f.name), 'Content-Type': 'application/octet-stream' }); resume = r.resume; ver = 'original'; paint(); SB.toast('Resume uploaded', 'ok'); }
          catch (e) { SB.err(e); paint(); }
        };
        drop.addEventListener('click', () => file.click());
        drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
        file.addEventListener('change', () => send(file.files[0]));
        ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', (e) => send(e.dataTransfer.files[0]));

        const ta = h('textarea', { class: 'input', rows: 8, maxlength: '30000', placeholder: 'Paste your resume text here…' });
        const sendText = h('button', { class: 'btn soft', type: 'button' }, 'Use pasted text');
        sendText.addEventListener('click', () => SB.busy(sendText, async () => {
          try { const r = await api.post('/api/resume/text', { text: ta.value }); resume = r.resume; ver = 'original'; paint(); } catch (e) { SB.err(e); }
        }));
        return h('div', { class: 'stack lg' }, drop, file,
          h('div', { class: 'card stack' }, h('h3', null, 'Or paste your resume text'), ta, h('div', null, sendText)));
      }

      /* ----- main state ----- */
      function paint() {
        if (!resume) return mount(box, header(), uploader());
        const imp = resume.improved; if (!imp) ver = 'original';
        const shown = ver === 'improved' && imp ? imp : resume.original;

        const role = h('input', { class: 'input', maxlength: '80', placeholder: 'Optional – e.g. Junior Python Developer', value: (resume.notes && resume.notes.targetRole) || '' });
        const instr = h('input', { class: 'input', maxlength: '300', placeholder: 'Optional – e.g. keep it to one page, more concise' });
        const improve = h('button', { class: 'btn grad', type: 'button' }, icon('sparkles'), imp ? 'Improve again' : 'Improve with AI');
        improve.addEventListener('click', () => SB.busy(improve, async () => {
          try { const r = await api.post('/api/resume/improve', { targetRole: role.value, instructions: instr.value }); resume = r.resume; ver = 'improved'; editing = false; SB.refreshNotifications(); paint(); SB.toast('Your resume has been polished – review it below.', 'ok'); }
          catch (e) { SB.err(e); }
        }));

        const dl = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Download DOCX');
        dl.addEventListener('click', () => SB.busy(dl, async () => {
          try {
            const blob = await api.blob('/api/resume/export', { version: ver });
            const a = h('a', { href: URL.createObjectURL(blob), download: ((shown.name || 'resume').replace(/[^\w]+/g, '_') || 'resume') + '_Resume.docx' });
            document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          } catch (e) { SB.err(e); }
        }));

        const notes = resume.notes;
        const side = h('div', { class: 'stack' },
          h('div', { class: 'card stack' }, h('h3', null, 'Improve with AI'),
            h('p', { class: 'small sub' }, 'Rewrites wording, grammar, structure and skill presentation. It will never add experience, education, skills or numbers you did not provide.'),
            h('div', { class: 'field' }, h('label', null, 'Target role'), role), h('div', { class: 'field' }, h('label', null, 'Style preference'), instr), improve),
          h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Resume checklist'), SB.badge((imp && ver === 'improved' ? resume.completeness.improved : resume.completeness.original).percent + '%', 'primary')),
            h('div', { class: 'check-list mt-sm' }, (imp && ver === 'improved' ? resume.completeness.improved : resume.completeness.original).items.map((i) => h('div', { class: i.ok ? '' : 'no' }, icon(i.ok ? 'check' : 'x'), i.label)))));

        const noteCards = [];
        if (imp && notes) {
          if (notes.warnings && notes.warnings.length) noteCards.push(SB.callout('warn', h('b', null, 'Truthfulness check: '), 'the AI added details that are not in your original resume, so they were removed or flagged.', SB.list(notes.warnings)));
          if (notes.changes && notes.changes.length) noteCards.push(h('div', { class: 'card' }, h('div', { class: 'row' }, icon('check'), h('b', null, 'What was improved')), SB.list(notes.changes)));
          if (notes.suggestions && notes.suggestions.length) noteCards.push(h('div', { class: 'card' }, h('div', { class: 'row' }, icon('bulb'), h('b', null, 'Suggestions for you')), h('p', { class: 'xs muted' }, 'Add these only if they are true – the AI did not put them in your resume.'), SB.list(notes.suggestions)));
        }

        mount(box, header(), h('div', { class: 'chat-layout with-plan', style: { gridTemplateColumns: undefined } },
          h('div', { class: 'stack' },
            h('div', { class: 'row between wrap' },
              h('div', { class: 'tabs' },
                h('button', { class: 'tab' + (ver === 'original' ? ' on' : ''), onclick: () => { ver = 'original'; editing = false; paint(); } }, 'Original'),
                imp ? h('button', { class: 'tab' + (ver === 'improved' ? ' on' : ''), onclick: () => { ver = 'improved'; paint(); } }, 'Improved') : null),
              h('div', { class: 'row' },
                imp && ver === 'improved' && !editing ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = true; paint(); } }, icon('edit'), 'Edit') : null, dl)),
            !imp ? SB.callout('', 'This is the information extracted from your upload. Check it looks right, then use ', h('b', null, 'Improve with AI'), '.') : null,
            editing
              ? h('div', { class: 'card' }, editor(imp, async (r) => { try { const x = await api.put('/api/resume', { improved: r }); resume = x.resume; editing = false; paint(); SB.toast('Changes saved', 'ok'); } catch (e) { SB.err(e); } }, () => { editing = false; paint(); }))
              : paper(shown),
            noteCards),
          side));
      }

      function header() {
        return h('div', { class: 'row between wrap page-head' },
          h('div', null, h('h1', null, 'AI Resume Studio'),
            h('p', null, resume ? `Working on: ${resume.filename} · uploaded ${SB.ago(resume.createdAt)}` : 'Upload your resume, let the AI polish the writing – truthfully – then download a professional version.')),
          resume ? h('div', { class: 'row' },
            h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => { if (await SB.confirm('Replace your resume?', 'This removes the current resume and its improved version so you can upload a new one.', 'Replace', true)) { await api.del('/api/resume'); resume = null; paint(); } } }, icon('upload'), 'Replace'),
            h('button', { class: 'btn danger sm', type: 'button', onclick: async () => { if (await SB.confirm('Delete your resume?', 'Your uploaded and improved resume will be permanently deleted.', 'Delete', true)) { await api.del('/api/resume'); resume = null; paint(); } } }, icon('trash'), 'Delete')) : null);
      }
      paint();
    },
  };
})();
