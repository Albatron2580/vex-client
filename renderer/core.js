// Shared UI toolkit: DOM builder, icons, toasts, modals, tabs, formatting, state.
(function () {
  'use strict';
  const V = (window.V = {
    pages: [],
    tasks: new Map(),
    history: [],
    gameLog: [],
    listeners: {},
    state: { settings: {}, profiles: [], selected: '', accounts: [], active: null, secure: true, versions: null, game: { state: 'idle' }, status: '', updates: 0, info: {} },
  });

  V.call = (channel, ...args) => window.vex.call(channel, ...args);
  V.$ = (s, r) => (r || document).querySelector(s);
  V.$$ = (s, r) => [...(r || document).querySelectorAll(s)];

  // The browser turns null/undefined/false passed to append() and friends into the text "null".
  // Make them mean "nothing" and accept nested arrays, like the h() builder below does.
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const native = Element.prototype[m];
    Element.prototype[m] = function (...kids) {
      return native.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
    };
  }

  // ---------- DOM builder (text is always inserted as text, never as HTML) ----------
  function add(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  V.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false || k === 'value') continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) (sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv));
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    add(el, kids);
    if (attrs && attrs.value != null) el.value = attrs.value; // after children so <select> works
    return el;
  };
  const h = V.h;

  // ---------- icons ----------
  const ICONS = {
    home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
    layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    package: ['M16.5 9.4l-9-5.19', 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
    archive: ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4'],
    image: ['M3 3h18v18H3z', 'M10 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', 'M21 15l-5-5L5 21'],
    sun: ['M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z', 'M12 1v2', 'M12 21v2', 'M4.22 4.22l1.42 1.42', 'M18.36 18.36l1.42 1.42', 'M1 12h2', 'M21 12h2', 'M4.22 19.78l1.42-1.42', 'M18.36 5.64l1.42-1.42'],
    star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M17 13a5 5 0 1 1-10 0 5 5 0 0 1 10 0z'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
    sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
    help: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
    play: ['M5 3l14 9-14 9z'],
    stop: ['M6 6h12v12H6z'],
    search: ['M21 21l-4.35-4.35', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    trash: ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    folder: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
    plus: ['M12 5v14', 'M5 12h14'],
    refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
    external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
    down: ['M6 9l6 6 6-6'],
    up: ['M18 15l-6-6-6 6'],
    x: ['M18 6L6 18', 'M6 6l12 12'],
    check: ['M20 6L9 17l-5-5'],
    copy: ['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    edit: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    zap: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
    activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
    clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 6v6l4 2'],
    key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  };
  V.icon = (name, cls) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICONS[name] || []) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  };

  // ---------- formatting ----------
  V.fmt = {
    bytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
      if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
      return `${(n / 1024 ** 3).toFixed(1)} GB`;
    },
    count: (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0),
    ago(ts) {
      if (!ts) return 'Never';
      const s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 60) return 'Just now';
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
      return new Date(ts).toLocaleDateString();
    },
    date: (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''),
    loader: (l) => ({ vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }[l] || l),
  };

  // ---------- events ----------
  V.on = (type, fn) => { (V.listeners[type] ||= []).push(fn); };
  V.emit = (type, data) => (V.listeners[type] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  // ---------- toasts ----------
  V.toast = (text, kind = 'info') => {
    const root = V.$('#toasts');
    const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status', onClick: () => t.remove() }, V.icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'activity'), h('span', null, text));
    root.append(t);
    setTimeout(() => t.remove(), kind === 'error' ? 9000 : 5000);
  };
  V.error = (e) => { console.error(e); V.toast((e && e.message) || String(e), 'error'); };

  // ---------- modal ----------
  V.modal = ({ title, body, actions = [], wide = false, onClose }) => {
    const root = V.$('#modal-root');
    let overlay;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (onClose) onClose();
    };
    overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } },
      h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: close }, V.icon('x'))),
        h('div', { class: 'modal-body' }, body),
        actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
          class: 'btn ' + (a.kind || ''),
          onClick: async (e) => {
            if (a.onClick) {
              e.currentTarget.disabled = true;
              let r;
              try { r = await a.onClick(e); } catch (err) { V.error(err); r = false; }
              e.currentTarget.disabled = false;
              if (r === false) return;
            }
            close();
          },
        }, a.label))) : null));
    root.append(overlay);
    document.addEventListener('keydown', onKey);
    const first = V.$('input, select, button.primary', overlay);
    if (first) first.focus();
    return { close, el: overlay };
  };

  V.confirm = ({ title, text, confirm = 'Confirm', danger = false }) => new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    V.modal({
      title,
      body: h('p', null, text),
      onClose: () => done(false), // closing any other way (X, Escape, click outside) counts as "no"
      actions: [
        { label: 'Cancel' },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { done(true); } },
      ],
    });
  });

  // ---------- small components ----------
  V.spinner = () => h('span', { class: 'spinner', role: 'progressbar', 'aria-label': 'Loading' });
  V.loading = (text = 'Loading…') => h('div', { class: 'loading' }, V.spinner(), h('span', null, text));
  V.empty = (title, sub, action) => h('div', { class: 'empty' }, h('strong', null, title), sub ? h('p', null, sub) : null, action || null);
  V.errorBox = (msg, retry) => h('div', { class: 'errorbox' }, V.icon('alert'), h('div', null, h('strong', null, 'Something went wrong'), h('p', null, msg)), retry ? h('button', { class: 'btn sm', onClick: retry }, 'Try again') : null);

  V.load = async (container, fn) => {
    container.replaceChildren(V.loading());
    try {
      const node = await fn();
      container.replaceChildren(node);
    } catch (e) {
      container.replaceChildren(V.errorBox(e.message, () => V.load(container, fn)));
    }
  };

  V.busy = async (btn, fn) => {
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    try { return await fn(); } catch (e) { V.error(e); } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
  };

  V.select = (options, value, onChange, attrs = {}) => {
    const s = h('select', { ...attrs, onChange: (e) => onChange && onChange(e.target.value) }, options.map((o) => h('option', { value: o.value }, o.label)));
    s.value = value;
    return s;
  };

  V.switch = (checked, onChange, label) => {
    const input = h('input', { type: 'checkbox', 'aria-label': label || 'Toggle', onChange: (e) => onChange(e.target.checked) });
    input.checked = !!checked;
    return h('label', { class: 'switch' }, input, h('i'));
  };

  V.badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);

  V.tabs = (defs) => {
    const bar = h('div', { class: 'tabs', role: 'tablist' });
    const body = h('div', { class: 'tab-body' });
    const btns = {};
    const open = (id) => {
      for (const d of defs) { btns[d.id].classList.toggle('on', d.id === id); btns[d.id].setAttribute('aria-selected', String(d.id === id)); }
      body.replaceChildren(defs.find((d) => d.id === id).render());
    };
    for (const d of defs) {
      btns[d.id] = h('button', { class: 'tab', role: 'tab', onClick: () => open(d.id) }, d.label);
      bar.append(btns[d.id]);
    }
    const wrap = h('div', { class: 'tabs-wrap' }, bar, body);
    wrap.open = open;
    open(defs[0].id);
    return wrap;
  };

  V.pageHeader = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', null, h('h2', null, title), sub ? h('p', { class: 'dim' }, sub) : null), h('div', { class: 'row' }, actions));

  // Avatar tile for icons that may fail to load
  V.thumb = (src, name, cls = '') => {
    const letter = h('span', { class: 'letter' }, (name || '?').slice(0, 1).toUpperCase());
    const box = h('div', { class: `thumb ${cls}` }, letter);
    if (src) {
      const img = h('img', { src, alt: '', loading: 'lazy' });
      img.addEventListener('load', () => { letter.remove(); box.append(img); });
    }
    return box;
  };

  // ---------- theme ----------
  const shadeHex = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  };

  // Biome colours: the theme's own palette, or one built from the accent colour.
  V.biomeFor = (theme, acc) => {
    if (theme.land) return theme.land;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt((acc || theme.accent).slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    let hue = 220;
    if (d) hue = Math.round(60 * (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4));
    return V.biomeFromHue((hue + 360) % 360);
  };

  // Background images found in renderer/themes/<id>/ (filled at boot from the main process).
  V.themeAssets = {};
  V.themeImage = (id) => (V.themeAssets[id] ? new URL(V.themeAssets[id], location.href).href : '');

  // Applies the theme that should be on screen now (manual choice or the current season) without reloading.
  V.applyTheme = () => {
    const T = window.VexThemes;
    const s = V.state.settings;
    const r = document.documentElement;
    const eff = T.effective(s, new Date());
    const theme = T.get(eff.id);
    V.state.themeInfo = eff;
    r.dataset.theme = theme.id;
    r.dataset.fx = s.themeEffects === false ? 'off' : 'on';
    const v = theme.vars;
    const map = { '--bg': v.bg, '--bg-solid': v.bgSolid, '--panel': v.panel, '--panel2': v.panel2, '--line': v.line, '--text': v.text, '--dim': v.dim };
    for (const [k, val] of Object.entries(map)) r.style.setProperty(k, val);
    // A season always uses its own colours; otherwise a custom accent (if any) wins over the theme's.
    const custom = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '';
    const acc = !eff.auto && custom ? custom : theme.accent;
    const n = parseInt(acc.slice(1), 16);
    const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    r.style.setProperty('--accent', acc);
    r.style.setProperty('--accent-rgb', `${R},${G},${B}`);
    r.style.setProperty('--on-accent', (0.299 * R + 0.587 * G + 0.114 * B) / 255 > 0.62 ? '#06101f' : '#ffffff');

    // Background: the pixel-art landscape in the theme's colours, or (if chosen) the theme's picture.
    const img = theme.image ? V.themeImage(theme.id) : '';
    const picture = s.themeBackground === 'picture' && !!img;
    r.dataset.bg = picture ? 'image' : 'land';
    const bg = V.$('#theme-bg');
    if (bg) {
      bg.style.backgroundImage = picture ? `${theme.overlay}, url("${img}")` : '';
      bg.style.backgroundPosition = theme.position || 'center';
      bg.hidden = !picture;
    }
    V.currentTheme = theme;
    const land = V.$('#land');
    if (land) {
      land.hidden = picture;
      if (!picture && V.paintBiome) V.paintBiome(land, V.biomeFor(theme, acc));
    }
    // Falling Minecraft leaves in every theme, in the theme's colours (plain themes: shades of the accent).
    const leafColors = theme.leafColors || [acc, shadeHex(acc, 0.3), shadeHex(acc, -0.3), shadeHex(acc, 0.55)];
    if (V.fx) V.fx.set(s.themeEffects === false ? null : theme.effect || 'leaves', leafColors);
    V.emit('theme');
  };

  // Keep the landscape sized to the window.
  let landTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(landTimer);
    landTimer = setTimeout(() => {
      const land = V.$('#land');
      if (land && !land.hidden && V.paintBiome && V.currentTheme) V.paintBiome(land, V.biomeFor(V.currentTheme, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()));
    }, 120);
  });

  // Re-check the date every few minutes so seasons switch (and end) while the launcher stays open.
  let lastThemeId = '';
  setInterval(() => {
    if (!window.VexThemes || !V.state.settings) return;
    const id = window.VexThemes.effective(V.state.settings, new Date()).id;
    if (lastThemeId && id !== lastThemeId) V.applyTheme();
    lastThemeId = id;
  }, 5 * 60 * 1000);

  // ---------- shared state helpers ----------
  V.profile = () => V.state.profiles.find((p) => p.id === V.state.selected) || V.state.profiles[0] || null;
  V.refreshProfiles = async () => {
    const r = await V.call('profiles:list');
    V.state.profiles = r.profiles;
    V.state.selected = r.selected;
    V.emit('profiles');
  };
  V.refreshAccounts = async () => {
    const r = await V.call('accounts:status');
    V.state.accounts = r.accounts;
    V.state.secure = r.secureStorage;
    V.state.active = r.accounts.find((a) => a.active) || null;
    V.emit('accounts');
  };
  V.saveSettings = async (patch) => {
    V.state.settings = await V.call('settings:save', patch);
    V.applyTheme();
    V.emit('settings');
    return V.state.settings;
  };
  V.versions = () => (V.state.versions ||= V.call('versions:list').then((v) => { V.state.versions = v; return v; }, (e) => { V.state.versions = null; throw e; }));
  V.selectProfile = async (id) => {
    V.state.settings = await V.call('profiles:select', id);
    await V.refreshProfiles();
  };

  // ---------- navigation ----------
  V.register = (page) => V.pages.push(page);
  V.go = (id) => {
    const page = V.pages.find((p) => p.id === id);
    if (!page) return;
    V.current = id;
    for (const p of V.pages) {
      const sec = V.$(`#page-${p.id}`);
      sec.hidden = p.id !== id;
      const nav = V.$(`[data-nav="${p.id}"]`);
      nav.classList.toggle('on', p.id === id);
      if (p.id === id) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
    }
    V.$('#page-title').textContent = page.title;
    const sec = V.$(`#page-${id}`);
    sec.classList.remove('enter');
    void sec.offsetWidth; // restart the fade-in
    sec.classList.add('enter');
    if (page.show) Promise.resolve(page.show(sec)).catch(V.error);
  };

  // ---------- downloads / activity ----------
  V.setStatus = (text) => { V.state.status = text; V.emit('status', text); };
  V.onTask = (t) => {
    if (t.done) {
      const prev = V.tasks.get(t.id);
      V.tasks.delete(t.id);
      if (prev) { V.history.unshift({ label: prev.label, at: Date.now() }); V.history.length = Math.min(V.history.length, 15); }
    } else {
      V.tasks.set(t.id, { label: t.label, received: t.received || 0, total: t.total || 0 });
    }
    V.emit('tasks');
  };
})();
