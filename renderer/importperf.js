// "Import from other launchers" and "Performance" dialogs (used on the Profiles page).
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;
  const LOADERS = [{ value: 'fabric', label: 'Fabric' }, { value: 'forge', label: 'Forge' }, { value: 'neoforge', label: 'NeoForge' }, { value: 'quilt', label: 'Quilt (uses Fabric)' }, { value: 'vanilla', label: 'Vanilla' }];
  const SOURCE_ICON = { minecraft: 'package', modrinth: 'download', norisk: 'shield', folder: 'folder' };

  // ---------- import ----------
  V.openImport = async () => {
    let scan;
    const body = h('div', { class: 'import' }, V.loading('Looking for Minecraft Launcher, Modrinth App and NoRisk Client…'));
    const dlg = V.modal({ title: 'Import from other launchers', wide: true, body, actions: [{ label: 'Close' }] });
    try { scan = await V.call('import:scan'); } catch (e) { body.replaceChildren(V.errorBox(e.message)); return; }
    const extra = [];

    const card = (it) => {
      const parts = Object.fromEntries(Object.entries(scan.parts).map(([k, p]) => [k, !!(p.default && it.parts[k])]));
      const name = h('input', { type: 'text', value: it.name, maxlength: '40', 'aria-label': 'Profile name' });
      const ver = h('input', { type: 'text', value: it.version || '', placeholder: '1.21.1', 'aria-label': 'Minecraft version', style: { width: '110px' } });
      const loader = V.select(LOADERS, it.loader || 'fabric', () => {}, { 'aria-label': 'Mod loader' });
      const result = h('div');
      const sizeOf = (k) => (it.parts[k] && it.parts[k].size ? ` · ${V.fmt.bytes(it.parts[k].size)}` : it.parts[k] && it.parts[k].count > 1 ? ` · ${it.parts[k].count}` : '');
      const checks = h('div', { class: 'import-parts' }, Object.entries(scan.parts).filter(([k]) => it.parts[k]).map(([k, p]) => {
        const cb = h('input', { type: 'checkbox', onChange: (e) => { parts[k] = e.target.checked; } });
        cb.checked = parts[k];
        return h('label', { class: 'check chip' }, cb, `${p.label}${sizeOf(k)}`);
      }));
      const go = h('button', {
        class: 'btn primary sm',
        onClick: (e) => V.busy(e.currentTarget, async () => {
          const r = await V.call('import:run', { path: it.path, source: it.source, name: name.value, version: ver.value.trim(), loader: loader.value, loaderVersion: it.loaderVersion || '', parts });
          await V.refreshProfiles();
          go.disabled = true;
          result.replaceChildren(h('div', { class: 'banner ok' }, V.icon('check'), h('span', null, `Imported as "${r.profile.name}": ${r.files} files (${V.fmt.bytes(r.bytes)}). ${r.notes.join(' ')}`),
            h('button', { class: 'btn sm', onClick: (ev) => V.busy(ev.currentTarget, async () => { await V.call('import:undo', r.profile.id); await V.refreshProfiles(); result.replaceChildren(h('p', { class: 'dim small' }, 'Import undone. The new profile was removed; the original was never changed.')); go.disabled = false; }) }, 'Undo'),
            h('button', { class: 'btn sm primary', onClick: async () => { await V.selectProfile(r.profile.id); dlg.close(); V.go('home'); } }, 'Use it')));
          V.toast(`Imported "${r.profile.name}"`, 'ok');
        }),
      }, V.icon('download'), 'Import');
      return h('div', { class: 'import-item' },
        h('div', { class: 'row' }, V.icon(SOURCE_ICON[it.source] || 'folder'), h('strong', { class: 'grow' }, it.name), h('span', { class: 'dim small' }, `${it.modCount} mods`), it.guessed ? h('span', { class: 'badge warn', title: 'Worked out from the mods or the game log: check it before importing.' }, 'version guessed') : null),
        h('code', { class: 'path' }, it.path),
        h('div', { class: 'row' }, h('label', { class: 'grow' }, h('small', { class: 'dim' }, 'New profile name'), name), h('label', null, h('small', { class: 'dim' }, 'Version'), ver), h('label', null, h('small', { class: 'dim' }, 'Loader'), loader)),
        checks,
        h('div', { class: 'row' }, h('span', { class: 'grow dim small' }, 'Copies into a new Vex profile. The original is only read, never changed.'), go),
        result);
    };

    const render = () => {
      const groups = scan.groups.map((g) => h('section', { class: 'import-group' },
        h('h4', null, g.label, ' ', V.badge(g.items.length ? `${g.items.length} found` : 'not found', g.items.length ? 'ok' : '')),
        g.items.length ? g.items.map(card) : h('p', { class: 'dim small' }, `No ${g.label} installation found on this PC. If it lives somewhere else, use "Choose a folder".`)));
      body.replaceChildren(
        h('div', { class: 'banner' }, V.icon('alert'), h('span', null, 'Your Microsoft sign-in can\'t be copied: other launchers lock it to themselves. Sign in once on the Account page. Everything else (mods, packs, shaders, settings, keybinds, servers, worlds) can be imported.')),
        groups,
        extra.length ? h('section', { class: 'import-group' }, h('h4', null, 'From a folder'), extra.map(card)) : null,
        h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('import:folder'); if (r) { extra.push(...r); render(); } }) }, V.icon('folder'), 'Choose a folder (Prism, CurseForge, MultiMC…)')));
    };
    render();
  };

  // ---------- performance ----------
  V.openPerformance = async (profile) => {
    const info = await V.call('perf:presets');
    const cur = profile.perf || {};
    const st = { preset: cur.preset || 'balanced', ram: cur.ram || info.presets.balanced.ram, jvmFlags: cur.jvmFlags !== false, installMods: cur.installMods !== false, video: { ...(cur.video || info.presets.balanced.video) } };
    const body = h('div', { class: 'perf' });
    const maxRam = Math.max(2, Math.min(32, (info.totalMemGb || 8) - 1));
    const render = () => {
      const presetCards = h('div', { class: 'type-cards perf-cards' }, [...Object.entries(info.presets), ['custom', { label: 'Custom', desc: 'Pick every value yourself.' }]].map(([id, p]) => h('button', {
        class: 'type-card' + (st.preset === id ? ' on' : ''),
        onClick: () => { st.preset = id; if (info.presets[id]) { st.ram = Math.min(maxRam, info.presets[id].ram); st.video = { ...info.presets[id].video }; } render(); },
      }, h('strong', null, p.label), h('small', null, p.desc))));
      const v = st.video;
      const custom = st.preset === 'custom';
      const num = (k, label, min, max, step = 1) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, `${label}: `, h('strong', null, String(v[k]))),
        h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(v[k]), disabled: !custom, onInput: (e) => { v[k] = Number(e.target.value); e.target.previousSibling.lastChild.textContent = e.target.value; } }));
      const sel = (k, label, opts) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), V.select(opts, String(v[k]), (x) => { v[k] = /^\d+$/.test(x) ? Number(x) : x; }, { disabled: !custom }));
      const tog = (k, label) => h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', disabled: !custom, onChange: (e) => { v[k] = e.target.checked; } }); c.checked = !!v[k]; return c; })(), label);
      const mods = (info.presets[st.preset] || info.presets.balanced).mods.map((m) => info.mods[m]).filter((m) => m.loaders.includes(profile.loader));
      body.replaceChildren(
        presetCards,
        h('div', { class: 'settings-grid', style: { marginTop: '14px' } },
          h('section', { class: 'card' }, h('h3', null, 'Memory & Java'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Memory: ', h('strong', null, `${st.ram} GB`)),
              h('input', { type: 'range', min: '1', max: String(maxRam), value: String(Math.min(st.ram, maxRam)), onInput: (e) => { st.ram = Number(e.target.value); e.target.previousSibling.lastChild.textContent = `${st.ram} GB`; } }),
              h('small', { class: 'dim' }, `This PC has ${info.totalMemGb} GB. More is not faster: 4–6 GB suits almost every modpack.`)),
            h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', onChange: (e) => { st.jvmFlags = e.target.checked; } }); c.checked = st.jvmFlags; return c; })(), 'Optimised Java flags (G1GC tuning, fewer lag spikes)'),
            h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', onChange: (e) => { st.installMods = e.target.checked; } }); c.checked = st.installMods; return c; })(), 'Install performance mods'),
            profile.loader === 'vanilla' ? h('p', { class: 'hint warn' }, V.icon('alert'), 'Vanilla profiles can\'t load performance mods. Switch the profile to Fabric for the biggest FPS boost.')
              : h('div', { class: 'chips' }, mods.map((m) => h('span', { class: 'chip sm', title: m.what }, m.title)))),
          h('section', { class: 'card' }, h('h3', null, 'Video settings'), custom ? null : h('p', { class: 'dim small' }, 'Choose Custom to change these.'),
            num('renderDistance', 'Render distance', 2, 32), num('simulationDistance', 'Simulation distance', 5, 32), num('maxFps', 'Max FPS', 30, 260, 10),
            sel('graphicsMode', 'Graphics', [{ value: '0', label: 'Fast' }, { value: '1', label: 'Fancy' }, { value: '2', label: 'Fabulous' }]),
            sel('particles', 'Particles', [{ value: '0', label: 'All' }, { value: '1', label: 'Decreased' }, { value: '2', label: 'Minimal' }]),
            sel('renderClouds', 'Clouds', [{ value: '"false"', label: 'Off' }, { value: '"fast"', label: 'Fast' }, { value: '"true"', label: 'Fancy' }]),
            h('div', { class: 'row' }, tog('entityShadows', 'Entity shadows'), tog('ao', 'Smooth lighting'), tog('enableVsync', 'VSync')))));
    };
    render();
    V.modal({
      title: `Performance: ${profile.name}`, wide: true, body,
      actions: [{ label: 'Cancel' }, {
        label: 'Apply', kind: 'primary',
        onClick: async () => {
          const r = await V.call('perf:apply', profile.id, st);
          await V.refreshProfiles();
          const parts = [];
          if (r.video) parts.push('video settings applied');
          if (r.mods.length) parts.push(`installed ${r.mods.join(', ')}`);
          V.toast(`${(info.presets[st.preset] || { label: 'Custom' }).label} preset: ${parts.join(', ') || 'saved'}. ${r.notes.join(' ')}${r.skipped.length ? ` Skipped: ${r.skipped.join('; ')}` : ''}`, r.skipped.length ? 'info' : 'ok');
        },
      }],
    });
  };
})();
