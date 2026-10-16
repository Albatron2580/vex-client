// Profiles: separate Minecraft installations, each with its own version, loader, mods, packs and worlds.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  const LOADERS = [
    { value: 'fabric', label: 'Fabric' },
    { value: 'forge', label: 'Forge' },
    { value: 'neoforge', label: 'NeoForge' },
    { value: 'vanilla', label: 'Vanilla (no mods)' },
  ];

  async function openForm(existing) {
    let vs;
    try { vs = await V.versions(); } catch (e) { V.error(new Error("Couldn't load the Minecraft version list. " + e.message)); return; }
    const editing = !!existing;
    const data = {
      name: existing ? existing.name : '',
      version: existing ? existing.version : vs.latest.release || vs.versions[0].id,
      loader: existing ? existing.loader : 'fabric',
      loaderVersion: existing ? existing.loaderVersion : '',
    };
    let loaderOk = true;
    let req = 0;

    const nameIn = h('input', { type: 'text', maxlength: '40', placeholder: 'My survival world', value: data.name, 'aria-label': 'Profile name' });
    const allBox = h('input', { type: 'checkbox', onChange: fillVersions });
    const verSel = h('select', { 'aria-label': 'Minecraft version', onChange: (e) => { data.version = e.target.value; loadLoaderVersions(); } });
    const loaderSel = V.select(LOADERS, data.loader, (v) => { data.loader = v; data.loaderVersion = ''; loadLoaderVersions(); }, { 'aria-label': 'Mod loader' });
    const lvSel = h('select', { 'aria-label': 'Loader version', onChange: (e) => { data.loaderVersion = e.target.value; } });
    const note = h('p', { class: 'hint' });

    function fillVersions() {
      const all = allBox.checked;
      const list = vs.versions.filter((v) => all || v.type === 'release' || v.id === data.version);
      verSel.replaceChildren(...list.map((v) => h('option', { value: v.id }, v.id + (v.type === 'release' ? '' : ` (${v.type.replace('old_', 'old ')})`))));
      verSel.value = data.version;
    }

    async function loadLoaderVersions() {
      const token = ++req;
      if (data.loader === 'vanilla') { lvSel.replaceChildren(h('option', { value: '' }, 'Not needed')); lvSel.disabled = true; note.textContent = ''; loaderOk = true; return; }
      lvSel.disabled = true;
      lvSel.replaceChildren(h('option', null, 'Loading…'));
      try {
        const choices = await V.call('loaders:choices', data.loader, data.version);
        if (token !== req) return;
        if (!choices.length) {
          lvSel.replaceChildren(h('option', { value: '' }, 'Not available'));
          note.textContent = `${V.fmt.loader(data.loader)} isn't available for Minecraft ${data.version}. Pick another version or loader.`;
          loaderOk = false;
          return;
        }
        lvSel.replaceChildren(h('option', { value: '' }, 'Automatic (recommended)'), ...choices.map((c) => h('option', { value: c.value }, c.label)));
        lvSel.value = choices.some((c) => c.value === data.loaderVersion) ? data.loaderVersion : '';
        data.loaderVersion = lvSel.value;
        lvSel.disabled = false;
        note.textContent = '';
        loaderOk = true;
      } catch (e) {
        if (token !== req) return;
        lvSel.replaceChildren(h('option', { value: '' }, 'Automatic'));
        lvSel.disabled = false;
        note.textContent = `Couldn't check ${V.fmt.loader(data.loader)} versions (${e.message}). You can still save; it is checked again when you play.`;
        loaderOk = true;
      }
    }

    const body = h('div', { class: 'form' },
      h('label', null, h('span', null, 'Name'), nameIn),
      h('label', null, h('span', null, 'Minecraft version'), verSel),
      h('label', { class: 'check' }, allBox, h('span', null, 'Show snapshots and old versions')),
      h('label', null, h('span', null, 'Mod loader'), loaderSel),
      h('label', null, h('span', null, 'Loader version'), lvSel),
      note,
      editing ? h('p', { class: 'hint warn' }, 'Changing the version or loader does not convert existing mods or worlds. Duplicate the profile first if you want a backup.') : null);

    fillVersions();
    loadLoaderVersions();
    V.modal({
      title: editing ? 'Edit profile' : 'New profile',
      body,
      actions: [
        { label: 'Cancel' },
        {
          label: editing ? 'Save changes' : 'Create profile',
          kind: 'primary',
          onClick: async () => {
            if (!loaderOk) { V.toast(note.textContent, 'error'); return false; }
            const payload = { name: nameIn.value.trim() || `Minecraft ${data.version}`, version: data.version, loader: data.loader, loaderVersion: data.loaderVersion };
            if (editing) await V.call('profiles:update', existing.id, payload);
            else await V.call('profiles:create', payload);
            await V.refreshProfiles();
            V.toast(editing ? 'Profile saved' : 'Profile created', 'ok');
          },
        },
      ],
    });
  }

  V.register({
    id: 'profiles',
    title: 'Profiles',
    icon: 'layers',
    group: 'main',

    build(el) {
      const grid = h('div', { class: 'grid cards' });
      el.append(
        V.pageHeader('Profiles', 'Each profile keeps its own Minecraft version, mod loader, mods, resource packs, shaders and worlds.',
          h('button', { class: 'btn primary', onClick: () => openForm() }, V.icon('plus'), 'New profile')),
        grid);

      const render = () => {
        grid.replaceChildren();
        for (const p of V.state.profiles) {
          const sel = p.id === V.state.selected;
          grid.append(h('article', { class: 'card profile' + (sel ? ' selected' : '') },
            h('div', { class: 'card-top' }, h('h3', null, p.name), sel ? V.badge('Selected', 'accent') : null),
            h('div', { class: 'chips' }, h('span', { class: 'chip' }, V.fmt.loader(p.loader)), h('span', { class: 'chip' }, p.version), p.loaderVersion ? h('span', { class: 'chip dim' }, p.loaderVersion) : null),
            h('p', { class: 'dim' }, `${p.modCount || 0} mods · Last played: ${V.fmt.ago(p.lastPlayed)}`),
            h('div', { class: 'row wrap' },
              h('button', { class: 'btn sm' + (sel ? '' : ' primary'), disabled: sel, onClick: () => V.selectProfile(p.id).then(() => V.toast(`Selected "${p.name}"`, 'ok')).catch(V.error) }, sel ? 'In use' : 'Select'),
              h('button', { class: 'btn sm', onClick: () => openForm(p) }, V.icon('edit'), 'Edit'),
              h('button', { class: 'btn sm', onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('profiles:duplicate', p.id); await V.refreshProfiles(); V.toast('Profile duplicated', 'ok'); }) }, V.icon('copy'), 'Duplicate'),
              h('button', {
                class: 'btn sm danger',
                onClick: async () => {
                  if (!(await V.confirm({ title: `Delete "${p.name}"?`, text: 'This permanently deletes the profile with its mods, worlds, screenshots and settings. This cannot be undone.', confirm: 'Delete profile', danger: true }))) return;
                  try { await V.call('profiles:delete', p.id); await V.refreshProfiles(); V.toast('Profile deleted', 'ok'); } catch (e) { V.error(e); }
                },
              }, V.icon('trash'), 'Delete'))));
        }
      };
      V.on('profiles', () => { if (V.current === 'profiles') render(); });
      this.render = render;
    },

    async show() {
      await V.refreshProfiles();
      this.render();
    },
  });
})();
