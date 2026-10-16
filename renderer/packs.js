// Resource packs and shader packs: import, enable, reorder, remove, and find more on Modrinth.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;
  // Packs work without restarting the game: say where to switch them on when it is running.
  const liveNote = (kind, text) => (V.state.game.state === 'running'
    ? `${text} Minecraft is running: turn it on in ${kind === 'shader' ? 'Options → Video Settings → Shader Packs' : 'Options → Resource Packs'}, no restart needed.`
    : text);

  function makePage(kind) {
    const isShader = kind === 'shader';
    const cfg = isShader
      ? { id: 'shaders', title: 'Shaders', icon: 'sun', noun: 'shader packs', single: 'shader pack', folder: 'shaderpacks' }
      : { id: 'resourcepacks', title: 'Resource packs', icon: 'image', noun: 'resource packs', single: 'resource pack', folder: 'resourcepacks' };

    return {
      id: cfg.id,
      title: cfg.title,
      icon: cfg.icon,
      group: 'main',

      build(el) {
        this.st = { packs: [], meta: null, search: '', sort: isShader ? 'name' : 'priority' };
        this.head = h('div');
        this.banner = h('div');
        this.list = h('div', { class: 'list' });
        this.more = h('details', { class: 'more-box' }, h('summary', null, `Find more ${cfg.noun} on Modrinth`));
        this.moreBuilt = false;
        this.more.addEventListener('toggle', () => {
          if (!this.more.open || this.moreBuilt) return;
          this.moreBuilt = true;
          this.more.append(V.createBrowser({
            type: kind,
            useProfile: true,
            noun: cfg.noun,
            action: {
              label: 'Add to profile', icon: 'download',
              run: async (hit) => { const n = await V.call('packs:install', kind, hit.id); V.toast(liveNote(kind, `Added ${n}.`), 'ok'); await this.load(); },
            },
            compat: (hit) => (hit.versions.includes(V.profile().version) ? { ok: true } : { ok: false, reason: `No build for Minecraft ${V.profile().version}.` }),
          }));
        });
        el.append(this.head, this.banner, this.list, this.more);
      },

      async show() {
        await V.refreshProfiles();
        this.moreBuilt = false;
        this.more.open = false;
        V.$$('.browser', this.more).forEach((b) => b.remove());
        await this.load();
      },

      async load() {
        const p = V.profile();
        if (!p) return;
        await V.load(this.list, async () => {
          const data = await V.call('packs:list', kind);
          this.st.packs = data.packs;
          this.st.meta = data;
          this.renderHead(p);
          this.renderBanner(p, data);
          return this.renderList();
        });
      },

      renderHead(p) {
        const search = h('input', { type: 'search', placeholder: `Search installed ${cfg.noun}`, 'aria-label': 'Search installed packs', value: this.st.search, onInput: (e) => { this.st.search = e.target.value; this.list.replaceChildren(this.renderList()); } });
        const sortOpts = [{ value: 'name', label: 'Name' }, { value: 'size', label: 'Size' }];
        if (!isShader) sortOpts.unshift({ value: 'priority', label: 'Priority' });
        const sort = V.select(sortOpts, this.st.sort, (v) => { this.st.sort = v; this.list.replaceChildren(this.renderList()); }, { 'aria-label': 'Sort by' });
        const doImport = (mode) => (e) => V.busy(e.currentTarget, async () => {
          const names = await V.call('packs:import', kind, mode);
          if (names.length) { V.toast(liveNote(kind, `Imported ${names.join(', ')}.`), 'ok'); await this.load(); }
        });
        this.head.replaceChildren(
          V.pageHeader(cfg.title, `For profile "${p.name}" (${V.fmt.loader(p.loader)} ${p.version}).`,
            h('button', { class: 'btn primary', onClick: doImport('file') }, V.icon('plus'), 'Import .zip'),
            h('button', { class: 'btn', onClick: doImport('folder') }, V.icon('folder'), 'Import folder'),
            h('button', { class: 'btn', onClick: () => V.call('shell:folder', cfg.folder).catch(V.error) }, V.icon('external'), 'Open folder')),
          h('div', { class: 'filters' }, h('div', { class: 'searchbox' }, V.icon('search'), search), sort));
      },

      renderBanner(p, data) {
        this.banner.replaceChildren();
        if (isShader) {
          const s = data.status;
          if (!s.loaderOk) {
            this.banner.append(h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, `Shaders need the Iris mod, which works with Fabric and NeoForge. This profile uses ${V.fmt.loader(p.loader)}. OptiFine is not supported.`), h('button', { class: 'btn sm', onClick: () => V.go('profiles') }, 'Edit profile')));
          } else if (!s.iris) {
            this.banner.append(h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, 'Install the Iris mod (it brings Sodium along) so Minecraft can use shader packs.'),
              h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('mods:install', 'iris'); await V.refreshProfiles(); V.toast(r.installed.length ? (r.queued ? `${r.installed.map((x) => x.title).join(' and ')} downloaded; added when Minecraft closes (mods load only at startup).` : `Installed ${r.installed.map((x) => x.title).join(' and ')}`) : 'Iris is already installed', 'ok'); await this.load(); }) }, V.icon('download'), 'Install Iris')));
          } else {
            this.banner.append(h('div', { class: 'banner ok' }, V.icon('check'), h('span', null, 'Iris is installed. Switch a shader pack on below, then start the game.')));
          }
        } else {
          this.banner.append(h('p', { class: 'hint' }, 'Packs higher in the priority order win when two packs change the same texture. Changes apply the next time you start the game.'));
        }
      },

      renderList() {
        const { search, sort } = this.st;
        let packs = this.st.packs.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
        packs = [...packs].sort((a, b) => {
          if (sort === 'size') return b.size - a.size;
          if (sort === 'priority') return (b.enabled - a.enabled) || (a.priority || 99) - (b.priority || 99) || a.name.localeCompare(b.name);
          return a.name.localeCompare(b.name);
        });
        const box = h('div', { class: 'list' });
        if (!this.st.packs.length) { box.append(V.empty(`No ${cfg.noun} yet`, `Import a .zip or folder, or find one on Modrinth below.`)); return box; }
        if (!packs.length) { box.append(V.empty('No matches', 'Try a different search.')); return box; }
        const enabledCount = this.st.packs.filter((p) => p.enabled).length;
        for (const p of packs) {
          const ck = p.compat.status;
          const canMove = !isShader && p.enabled;
          box.append(h('div', { class: 'row-item' + (p.enabled ? ' on' : '') },
            V.thumb(p.icon, p.name, 'lg'),
            h('div', { class: 'grow' },
              h('div', { class: 'hit-title' }, h('strong', null, p.name), V.badge(p.type), V.badge(V.fmt.bytes(p.size)),
                ck === 'ok' ? V.badge('Compatible', 'ok') : ck === 'unknown' ? V.badge('Unchecked') : V.badge(ck === 'old' ? 'Older pack' : 'Newer pack', 'warn'),
                p.enabled && !isShader ? V.badge(`Priority ${p.priority}`, 'accent') : null),
              p.description ? h('p', { class: 'dim clamp' }, p.description) : null,
              ck === 'old' || ck === 'new' ? h('p', { class: 'hint warn' }, V.icon('alert'), p.compat.message) : null),
            h('div', { class: 'row' },
              canMove ? h('button', { class: 'icon-btn', 'aria-label': 'Higher priority', title: 'Higher priority', disabled: p.priority === 1, onClick: () => this.move(p, 'up') }, V.icon('up')) : null,
              canMove ? h('button', { class: 'icon-btn', 'aria-label': 'Lower priority', title: 'Lower priority', disabled: p.priority === enabledCount, onClick: () => this.move(p, 'down') }, V.icon('down')) : null,
              V.switch(p.enabled, (on) => this.enable(p, on), `Enable ${p.name}`),
              h('button', { class: 'icon-btn danger', 'aria-label': `Remove ${p.name}`, title: 'Remove', onClick: () => this.remove(p) }, V.icon('trash')))));
        }
        return box;
      },

      async enable(p, on) {
        try {
          if (isShader) await V.call('packs:shader', on ? p.name : null);
          else await V.call('packs:enable', p.name, on);
          await this.load();
        } catch (e) { V.error(e); await this.load(); }
      },

      async move(p, dir) {
        try { await V.call('packs:move', p.name, dir); await this.load(); } catch (e) { V.error(e); }
      },

      async remove(p) {
        if (!(await V.confirm({ title: `Remove ${p.name}?`, text: `This deletes the ${cfg.single} from this profile. Other files are not touched.`, confirm: 'Remove', danger: true }))) return;
        try { await V.call('packs:remove', kind, p.name); V.toast('Removed', 'ok'); await this.load(); } catch (e) { V.error(e); }
      },
    };
  }

  V.register(makePage('resourcepack'));
  V.register(makePage('shader'));
})();
