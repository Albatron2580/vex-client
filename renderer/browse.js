// Modrinth browser (shared by mods, modpacks, resource packs and shaders) plus the Mods and Modpacks pages.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  const SORTS = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'downloads', label: 'Most downloads' },
    { value: 'follows', label: 'Most followed' },
    { value: 'newest', label: 'Newest' },
    { value: 'updated', label: 'Recently updated' },
  ];
  const LOADER_FILTER = [
    { value: '', label: 'Any loader' },
    { value: 'fabric', label: 'Fabric' },
    { value: 'forge', label: 'Forge' },
    { value: 'neoforge', label: 'NeoForge' },
    { value: 'quilt', label: 'Quilt' },
  ];

  // o: { type, useProfile, action: {label, icon, run(hit)}, compat(hit) -> {ok, reason} }
  V.createBrowser = (o) => {
    const st = { query: '', category: '', sort: 'relevance', version: '', loader: '', offset: 0, total: 0, hits: [] };
    const withLoader = o.type === 'mod' || o.type === 'modpack';
    const results = h('div', { class: 'results' });
    const more = h('div', { class: 'more' });

    const q = h('input', { type: 'search', placeholder: `Search ${o.noun || 'Modrinth'}`, 'aria-label': 'Search', onKeydown: (e) => { if (e.key === 'Enter') go(); } });
    const cat = h('select', { 'aria-label': 'Category', onChange: (e) => { st.category = e.target.value; go(); } }, h('option', { value: '' }, 'All categories'));
    const sort = V.select(SORTS, st.sort, (v) => { st.sort = v; go(); }, { 'aria-label': 'Sort by' });
    const ver = h('select', { 'aria-label': 'Minecraft version', onChange: (e) => { st.version = e.target.value; go(); } }, h('option', { value: '' }, 'Any version'));
    const loader = V.select(LOADER_FILTER, '', (v) => { st.loader = v; go(); }, { 'aria-label': 'Mod loader' });
    const bar = h('div', { class: 'filters' },
      h('div', { class: 'searchbox' }, V.icon('search'), q),
      cat, sort, ver, withLoader ? loader : null,
      h('button', { class: 'btn primary', onClick: () => go() }, 'Search'));

    const root = h('div', { class: 'browser' }, bar, results, more);

    function syncProfile() {
      const p = V.profile();
      if (o.useProfile && p) {
        st.version = p.version;
        st.loader = p.loader === 'vanilla' ? '' : p.loader;
        ver.value = st.version;
        loader.value = st.loader;
      }
    }

    V.call('mods:categories', o.type).then((list) => list.forEach((c) => cat.append(h('option', { value: c }, c.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase()))))).catch(() => {});
    V.versions().then((vs) => {
      vs.versions.filter((v) => v.type === 'release').forEach((v) => ver.append(h('option', { value: v.id }, v.id)));
      ver.value = st.version;
    }).catch(() => {});

    function card(hit) {
      const compat = o.compat ? o.compat(hit) : { ok: true };
      const btn = h('button', {
        class: 'btn primary sm',
        disabled: !compat.ok,
        title: compat.ok ? '' : compat.reason,
        onClick: (e) => V.busy(e.currentTarget, () => o.action.run(hit)),
      }, o.action.icon ? V.icon(o.action.icon) : null, o.action.label);
      return h('article', { class: 'hit card' },
        V.thumb(hit.icon, hit.title, 'lg'),
        h('div', { class: 'hit-body' },
          h('div', { class: 'hit-title' }, h('strong', null, hit.title), h('span', { class: 'dim' }, ` by ${hit.author}`)),
          h('p', null, hit.description),
          h('div', { class: 'chips' },
            hit.categories.slice(0, 3).map((c) => h('span', { class: 'chip sm' }, c)),
            h('span', { class: 'chip sm dim' }, V.icon('download'), V.fmt.count(hit.downloads)),
            hit.loaders.slice(0, 3).map((l) => h('span', { class: 'chip sm dim' }, V.fmt.loader(l)))),
          compat.ok ? null : h('p', { class: 'hint warn' }, compat.reason)),
        h('div', { class: 'hit-actions' }, btn,
          h('button', { class: 'btn sm ghost', title: 'Open on modrinth.com', onClick: () => V.call('mods:page', hit.type || o.type, hit.slug).catch(V.error) }, V.icon('external'), 'Modrinth')));
    }

    function render() {
      results.replaceChildren();
      if (!st.hits.length) { results.append(V.empty('Nothing found', 'Try different words, or remove a filter.')); more.replaceChildren(); return; }
      st.hits.forEach((hit) => results.append(card(hit)));
      more.replaceChildren(st.offset < st.total ? h('button', { class: 'btn', onClick: (e) => V.busy(e.currentTarget, () => go(false)) }, `Show more (${st.total - st.offset} left)`) : h('p', { class: 'dim center' }, `${st.total} result${st.total === 1 ? '' : 's'}`));
    }

    async function go(reset = true) {
      if (reset) { st.query = q.value.trim(); st.offset = 0; st.hits = []; results.replaceChildren(V.loading('Searching Modrinth…')); more.replaceChildren(); }
      try {
        const r = await V.call('mods:search', { type: o.type, query: st.query, version: st.version, loader: st.loader, category: st.category, sort: st.sort, offset: st.offset, limit: 20 });
        st.total = r.total;
        st.hits.push(...r.hits);
        st.offset += r.hits.length;
        render();
      } catch (e) {
        results.replaceChildren(V.errorBox(e.message, () => go(true)));
      }
    }

    root.reload = () => { syncProfile(); return go(true); };
    root.syncProfile = syncProfile;
    syncProfile();
    go(true);
    return root;
  };

  // ---------- Mods ----------
  const STATUS = {
    loaded: { label: 'Loaded', kind: 'ok', tip: 'Minecraft reported this mod as loaded in the running game.' },
    'in-session': { label: 'In this session', kind: '', tip: 'This file was in the mods folder when the game started. The loader has not confirmed it in the log yet.' },
    restart: { label: 'Restart required', kind: 'warn', tip: 'Added after the game started. It loads the next time Minecraft starts.' },
    installed: { label: 'Installed', kind: '', tip: 'Loads the next time this profile starts.' },
    disabled: { label: 'Disabled', kind: 'warn', tip: 'Not loaded. Turn it on to use it at the next launch.' },
    'pending-install': { label: 'Pending install', kind: 'accent', tip: 'Downloaded and verified. It is copied into the mods folder when Minecraft closes.' },
    'pending-remove': { label: 'Removal pending', kind: 'warn', tip: 'Removed when Minecraft closes.' },
    'pending-enable': { label: 'Turns on after restart', kind: 'accent', tip: 'Enabled when Minecraft closes.' },
    'pending-disable': { label: 'Turns off after restart', kind: 'warn', tip: 'Disabled when Minecraft closes.' },
  };
  const FILTERS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'active', label: 'Active now', test: (m) => m.status === 'loaded' || m.status === 'in-session' },
    { id: 'pending', label: 'Pending', test: (m) => m.status.startsWith('pending') || m.status === 'restart' || m.updateQueued },
    { id: 'problems', label: 'Problems', test: (m) => m.issues.length || m.error },
    { id: 'disabled', label: 'Disabled', test: (m) => m.status === 'disabled' },
  ];

  function installedView(onChanged) {
    const box = h('div');
    let updates = new Map();
    let filter = 'all';
    const toastQueued = (r, title, verb) => V.toast(r && r.queued ? `${title} will be ${verb} when Minecraft closes.` : `${title} ${verb}.`, r && r.queued ? 'info' : 'ok');

    async function load() {
      await V.load(box, async () => {
        const st = await V.call('mods:status');
        const mods = st.mods;
        const prof = V.profile();
        const problems = mods.filter((m) => m.issues.length || m.error).length;
        const shown = mods.filter(FILTERS.find((f) => f.id === filter).test);
        const list = h('div', { class: 'list' });
        if (!mods.length) list.append(V.empty('No mods in this profile yet', 'Search Modrinth on the other tab, or add .jar files you already have.'));
        else if (!shown.length) list.append(V.empty('Nothing here', 'No mods match this filter.'));
        for (const m of shown) {
          const up = updates.get(m.file);
          const S = STATUS[m.status] || STATUS.installed;
          const pending = m.status.startsWith('pending');
          list.append(h('div', { class: 'row-item' + (m.enabled ? '' : ' off') + (m.status === 'loaded' ? ' on' : '') },
            V.thumb(m.icon, m.title),
            h('div', { class: 'grow' },
              h('div', { class: 'hit-title' }, h('strong', null, m.title), m.version ? h('span', { class: 'dim' }, ` ${m.version}`) : null,
                h('span', { class: `badge ${S.kind}`, title: S.tip }, S.label),
                V.badge(m.source === 'modrinth' ? 'Modrinth' : 'Added manually'),
                m.updateQueued ? h('span', { class: 'badge accent', title: 'Downloaded. Replaces the current file when Minecraft closes.' }, `Update to ${m.updateQueued} pending`) : null),
              h('small', { class: 'dim' }, m.size ? `${m.file} · ${V.fmt.bytes(m.size)}` : m.file),
              m.error ? h('p', { class: 'hint warn' }, V.icon('alert'), m.error) : null,
              m.issues.map((i) => h('p', { class: 'hint warn' }, V.icon('alert'), i))),
            h('div', { class: 'row' },
              up && !pending ? h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('mods:update', up); updates.delete(m.file); V.toast(st.running ? `${m.title} ${up.to} is downloaded and replaces the old version when Minecraft closes.` : `Updated ${m.title}`, st.running ? 'info' : 'ok'); await load(); }) }, V.icon('download'), `Update to ${up.to}`) : null,
              pending ? h('button', { class: 'btn sm', title: 'Cancel this pending change', onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('mods:cancel', m.pendingId); V.toast('Pending change cancelled', 'ok'); await load(); }) }, V.icon('x'), 'Cancel') : null,
              !pending ? V.switch(m.enabled, async () => { try { const r = await V.call('mods:toggle', m.file); toastQueued(r, m.title, m.enabled ? 'disabled' : 'enabled'); await load(); } catch (e) { V.error(e); } }, `Enable ${m.title}`) : null,
              m.status !== 'pending-install' && m.status !== 'pending-remove' ? h('button', {
                class: 'icon-btn danger', 'aria-label': `Remove ${m.title}`, title: 'Remove',
                onClick: async () => {
                  if (!(await V.confirm({ title: `Remove ${m.title}?`, text: st.running ? 'Minecraft is running, so the mod is removed when the game closes. Its config files are kept.' : 'The mod file is deleted from this profile. Its config files are kept.', confirm: 'Remove', danger: true }))) return;
                  try { const r = await V.call('mods:remove', m.file); toastQueued(r, m.title, 'removed'); await V.refreshProfiles(); await load(); onChanged(); } catch (e) { V.error(e); }
                },
              }, V.icon('trash')) : null)));
        }

        let banner = null;
        if (st.running) {
          banner = h('div', { class: 'banner' }, V.icon('activity'), h('span', null,
            h('strong', null, 'Minecraft is running. '), st.support.modsReason, ' Changes you make now are downloaded and checked right away, then applied as soon as you close the game.',
            st.support.resourcePacks ? ' Resource packs' + (st.support.shaders ? ' and shader packs' : '') + ' can be switched in-game without a restart.' : ''));
        } else if (st.pending) {
          banner = h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, `${st.pending} queued change${st.pending === 1 ? '' : 's'} could not be applied yet.`),
            h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('mods:apply'); if (r.failed.length) V.toast(r.failed.join(' · '), 'error'); else V.toast(`Applied ${r.applied.length} change${r.applied.length === 1 ? '' : 's'}`, 'ok'); await V.refreshProfiles(); await load(); }) }, 'Apply now'));
        }

        const counts = Object.fromEntries(FILTERS.map((f) => [f.id, mods.filter(f.test).length]));
        const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter mods' }, FILTERS.filter((f) => f.id !== 'active' || st.running).map((f) => h('button', { class: filter === f.id ? 'on' : '', onClick: () => { filter = f.id; load(); } }, `${f.label}${f.id === 'all' ? '' : ` (${counts[f.id]})`}`)));

        return h('div', null,
          prof && prof.loader === 'vanilla' ? h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, 'This profile is Vanilla, so mods are not loaded. Edit the profile and choose Fabric, Forge or NeoForge.')) : null,
          banner,
          h('div', { class: 'toolbar' },
            seg,
            h('span', { class: 'dim' }, `${mods.length} mod${mods.length === 1 ? '' : 's'}${problems ? ` · ${problems} with problems` : ''}${updates.size ? ` · ${updates.size} update${updates.size === 1 ? '' : 's'}` : ''}`),
            h('span', { class: 'grow' }),
            h('button', { class: 'btn sm', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('mods:addLocal'); if (r.length) { V.toast(st.running ? `${r.length} file${r.length === 1 ? '' : 's'} queued for the next launch` : `Added ${r.length} file${r.length === 1 ? '' : 's'}`, 'ok'); await V.refreshProfiles(); await load(); onChanged(); } }) }, V.icon('plus'), 'Add .jar files'),
            h('button', {
              class: 'btn sm',
              onClick: (e) => V.busy(e.currentTarget, async () => {
                const r = await V.call('mods:checkUpdates');
                updates = new Map(r.map((u) => [u.file, u]));
                V.state.updates = r.length;
                V.toast(r.length ? `${r.length} update${r.length === 1 ? '' : 's'} available` : 'Everything is up to date', r.length ? 'info' : 'ok');
                await load();
              }),
            }, V.icon('refresh'), 'Check for updates'),
            updates.size ? h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('mods:updateAll'); updates = new Map(); V.state.updates = 0; V.toast(st.running ? `${r.length} update${r.length === 1 ? '' : 's'} downloaded, applied when Minecraft closes` : `Updated ${r.length} mod${r.length === 1 ? '' : 's'}`, 'ok'); await load(); }) }, 'Update all') : null,
            h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'mods').catch(V.error) }, V.icon('folder'), 'Open folder')),
          list);
      });
    }
    box.reload = load;
    load();
    return box;
  }

  V.register({
    id: 'mods',
    title: 'Mods',
    icon: 'package',
    group: 'main',

    build(el) {
      this.host = h('div');
      el.append(this.host);
      // Game started or closed (queued changes applied): refresh statuses if the list is on screen.
      const refresh = () => { if (V.current === 'mods' && this.installed && document.body.contains(this.installed)) this.installed.reload(); };
      V.on('game', refresh);
      V.on('modsApplied', refresh);
    },

    async show() {
      await V.refreshProfiles();
      const p = V.profile();
      if (!p) return;
      const sub = `For profile "${p.name}" (${V.fmt.loader(p.loader)} ${p.version}). Mods are installed into this profile only.`;
      const makeBrowser = () => V.createBrowser({
        type: 'mod',
        useProfile: true,
        action: {
          label: 'Install', icon: 'download',
          run: async (hit) => {
            const r = await V.call('mods:install', hit.id);
            await V.refreshProfiles();
            const names = r.installed.map((x) => x.title).join(', ');
            if (r.installed.length && r.queued) V.toast(`${names} downloaded and verified. Minecraft is running and only loads mods at startup, so ${r.installed.length === 1 ? 'it is' : 'they are'} added when the game closes. Status: Pending install.`, 'info');
            else if (r.installed.length) V.toast(`Installed ${names}. Ready for the next launch.`, 'ok');
            else V.toast(`${hit.title} is already installed or queued`, 'info');
          },
        },
        compat: (hit) => {
          const cur = V.profile();
          if (cur.loader === 'vanilla') return { ok: false, reason: 'Switch this profile to a mod loader to install mods.' };
          if (!hit.versions.includes(cur.version)) return { ok: false, reason: `No build for Minecraft ${cur.version}.` };
          if (!hit.loaders.includes(cur.loader)) return { ok: false, reason: `Not available for ${V.fmt.loader(cur.loader)}.` };
          return { ok: true };
        },
      });
      const tabs = V.tabs([
        { id: 'installed', label: 'Installed mods', render: () => (this.installed = installedView(() => {})) },
        { id: 'browse', label: 'Browse Modrinth', render: makeBrowser },
      ]);
      this.host.replaceChildren(
        V.pageHeader('Mods', sub, h('button', { class: 'btn', onClick: () => V.go('profiles') }, V.icon('layers'), 'Change profile')),
        tabs);
      tabs.open(p.modCount ? 'installed' : 'browse');
    },
  });

  // ---------- Modpacks ----------
  async function chooseVersion(hit) {
    const versions = await V.call('modpacks:versions', hit.id);
    if (!versions.length) throw new Error('This modpack has no versions to install.');
    let chosen = versions[0].id;
    const progress = h('p', { class: 'dim', role: 'status' });
    const list = h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Modpack version' }, versions.map((v, i) => h('label', { class: 'radio' },
      h('input', { type: 'radio', name: 'mpv', checked: i === 0, onChange: () => { chosen = v.id; } }),
      h('div', null,
        h('strong', null, v.name || v.number), ' ', V.badge(v.type, v.type === 'release' ? 'ok' : 'warn'),
        h('div', { class: 'dim small' }, `${v.gameVersions.slice(0, 3).join(', ')}${v.gameVersions.length > 3 ? '…' : ''} · ${v.loaders.map(V.fmt.loader).join(', ')} · ${V.fmt.date(v.date)}`)))));
    const tick = () => { const t = V.tasks.get('pack'); if (document.body.contains(progress) && t) progress.textContent = `${t.label}: ${t.received} of ${t.total} files`; };
    V.on('tasks', tick);
    return new Promise((resolve) => {
      V.modal({
        title: `Install ${hit.title}`,
        wide: true,
        onClose: () => resolve(null),
        body: h('div', null, h('p', { class: 'dim' }, 'The modpack is installed as a new profile with its own mods, configs and worlds. Your other profiles are not touched.'), list, progress),
        actions: [
          { label: 'Cancel' },
          { label: 'Install modpack', kind: 'primary', onClick: async () => { const p = await V.call('modpacks:install', chosen); resolve(p); } },
        ],
      });
    });
  }

  async function afterInstall(profile) {
    if (!profile) return;
    await V.refreshProfiles();
    if (await V.confirm({ title: 'Modpack installed', text: `"${profile.name}" is ready as a new profile. Switch to it now?`, confirm: 'Switch to it' })) {
      await V.selectProfile(profile.id);
      V.go('home');
    }
  }

  V.register({
    id: 'modpacks',
    title: 'Modpacks',
    icon: 'archive',
    group: 'main',

    build(el) {
      this.host = h('div');
      el.append(
        V.pageHeader('Modpacks', 'Install a ready-made collection of mods as its own profile, or import a .mrpack file.',
          h('button', { class: 'btn', onClick: (e) => V.busy(e.currentTarget, async () => { afterInstall(await V.call('modpacks:importFile')); }) }, V.icon('plus'), 'Import .mrpack file')),
        this.host);
    },

    show() {
      if (this.host.firstChild) return; // built once, on first visit
      this.host.append(V.createBrowser({
        type: 'modpack',
        useProfile: false,
        noun: 'modpacks',
        action: { label: 'Install', icon: 'download', run: async (hit) => { afterInstall(await chooseVersion(hit)); } },
      }));
    },
  });
})();
