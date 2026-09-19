/* SkillBridge AI – core helpers: DOM builder, icons, API client, toasts, modals. No inline handlers (CSP). */
(function () {
  'use strict';
  const SB = (window.SB = { views: {}, state: {} });

  /* ---------- DOM builder (text is always set via textContent → no XSS) ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv === undefined) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  SB.h = h;
  SB.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  SB.mount = (el, ...kids) => { SB.clear(el); add(el, kids); return el; };

  /* ---------- icons (static SVG markup only) ---------- */
  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M3 13h18"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a2 2 0 003.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14a6.5 6.5 0 013.5 6"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    refresh: '<path d="M20 11a8 8 0 00-14.5-4M4 5v4h4"/><path d="M4 13a8 8 0 0014.5 4M20 19v-4h-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    megaphone: '<path d="M3 11v3a1 1 0 001 1h3l8 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M19 9a4 4 0 010 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gps: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    bridge: '<path d="M3 17h18M5 17V9M19 17V9M5 9c2 6 12 6 14 0M9 14v3M12 15v2M15 14v3"/>',
  };
  SB.icon = (name, cls) => {
    const s = document.createElement('span');
    s.className = 'ico' + (cls ? ' ' + cls : '');
    s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`; // static markup from table above
    return s;
  };
  SB.logo = () => h('div', { class: 'logo' }, h('div', { class: 'logo-mark' }, SB.icon('bridge')), h('span', null, 'SkillBridge AI'));

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; }
  }
  SB.ApiError = ApiError;
  async function request(method, url, body, opts = {}) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.raw) { init.body = body; Object.assign(init.headers, opts.headers || {}); }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    let res;
    try { res = await fetch(url, init); }
    catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.'); }
    if (opts.blob && res.ok) return res.blob();
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      if (res.status === 401 && !opts.noAuthRedirect && SB.onUnauthorized) SB.onUnauthorized();
      throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`, data);
    }
    return data;
  }
  SB.api = {
    get: (u, o) => request('GET', u, undefined, o),
    post: (u, b, o) => request('POST', u, b === undefined ? {} : b, o),
    put: (u, b) => request('PUT', u, b),
    patch: (u, b) => request('PATCH', u, b),
    del: (u) => request('DELETE', u),
    raw: (u, buf, headers) => request('POST', u, buf, { raw: true, headers }),
    blob: (u, b) => request('POST', u, b, { blob: true }),
  };
  SB.qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  /* ---------- feedback ---------- */
  let toastBox;
  SB.toast = (msg, kind = '') => {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
    const t = h('div', { class: 'toast ' + kind }, msg);
    toastBox.append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6500 : 3800);
  };
  SB.err = (e) => SB.toast(e && e.message ? e.message : 'Something went wrong.', 'err');

  SB.modal = (title, body, { wide = false, actions = [] } = {}) => {
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'row between', style: { marginBottom: '14px' } }, h('h2', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, SB.icon('x'))),
      body,
      actions.length ? h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '20px' } }, actions) : null);
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } }, box);
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('input, textarea, select'); if (first) first.focus();
    return { close, box };
  };
  SB.confirm = (title, text, okLabel = 'Confirm', danger = false) => new Promise((resolve) => {
    let m;
    const done = (v) => { m.close(); resolve(v); };
    m = SB.modal(title, h('p', { class: 'sub' }, text), {
      actions: [h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: 'btn' + (danger ? ' danger' : ''), onclick: () => done(true) }, okLabel)],
    });
  });

  /* run an async action on a button with spinner + disabled state */
  SB.busy = async (btn, fn) => {
    if (btn.disabled) return;
    const keep = Array.from(btn.childNodes);
    btn.disabled = true; SB.clear(btn); btn.append(h('span', { class: 'spinner' }), ' Working…');
    try { return await fn(); }
    finally { btn.disabled = false; SB.clear(btn); btn.append(...keep); }
  };

  /* ---------- small components ---------- */
  SB.loading = (text = 'Loading…') => h('div', { class: 'loading' }, h('span', { class: 'spinner' }), h('div', null, text));
  SB.skeletons = (n = 3) => h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skeleton' })));
  SB.empty = (icon, title, text, action) => h('div', { class: 'card empty' }, h('div', { class: 'fi' }, SB.icon(icon)), h('h3', null, title), h('p', null, text), action ? h('div', { class: 'mt' }, action) : null);
  SB.callout = (kind, ...kids) => h('div', { class: 'callout ' + (kind || '') }, SB.icon(kind === 'warn' || kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'info'), h('div', null, kids));
  SB.badge = (text, kind = '') => h('span', { class: 'badge ' + kind }, text);
  SB.ring = (pct, label, size = 120) => {
    const p = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
    const c = p >= 70 ? '#22a37a' : p >= 40 ? '#4f46e5' : '#e6a23c';
    return h('div', { class: 'ring', style: { '--p': p, '--c': c, '--s': size + 'px' } },
      h('div', null, h('strong', null, pct === null || pct === undefined ? '–' : pct + '%'), label ? h('span', null, label) : null));
  };
  SB.bar = (pct, tone, mark) => h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct ?? 0, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('i', { class: tone || '', style: { width: Math.max(0, Math.min(100, pct ?? 0)) + '%' } }),
    mark !== undefined && mark !== null ? h('b', { style: { left: `calc(${Math.min(100, mark)}% - 1.5px)` }, title: 'Required: ' + mark + '%' }) : null);
  SB.tone = (pct) => (pct >= 70 ? 'green' : pct >= 40 ? '' : 'amber');
  SB.levelBadge = (level) => SB.badge(level, { Beginner: 'amber', Intermediate: 'blue', Advanced: 'green', Expert: 'primary' }[level] || '');

  SB.ago = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  SB.date = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  SB.initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  SB.list = (items, cls = 'plan-list') => h('ul', { class: cls }, (items || []).map((x) => h('li', null, x)));

  /* Minimal safe markdown for AI chat replies (paragraphs, lists, bold, inline/fenced code) → DOM nodes. */
  SB.markdown = (text) => {
    const root = document.createDocumentFragment();
    const inline = (s) => {
      const frag = document.createDocumentFragment();
      const re = /(`[^`]+`|\*\*[^*]+\*\*)/g; let last = 0; let m;
      while ((m = re.exec(s))) {
        if (m.index > last) frag.append(s.slice(last, m.index));
        const tok = m[0];
        frag.append(tok[0] === '`' ? h('code', null, tok.slice(1, -1)) : h('strong', null, tok.slice(2, -2)));
        last = m.index + tok.length;
      }
      if (last < s.length) frag.append(s.slice(last));
      return frag;
    };
    const lines = String(text).replace(/\r/g, '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (/^```/.test(ln)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; root.append(h('pre', null, h('code', null, buf.join('\n')))); continue;
      }
      if (/^\s*([-*•]|\d+\.)\s+/.test(ln)) {
        const ordered = /^\s*\d+\./.test(ln); const ul = h(ordered ? 'ol' : 'ul');
        while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) { ul.append(h('li', null, inline(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, '')))); i++; }
        root.append(ul); continue;
      }
      if (!ln.trim()) { i++; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^\s*([-*•]|\d+\.)\s+/.test(lines[i])) para.push(lines[i++]);
      const p = h('p'); para.forEach((t, idx) => { if (idx) p.append(h('br')); p.append(inline(t.replace(/^#{1,4}\s+/, ''))); });
      root.append(p);
    }
    return root;
  };
})();
