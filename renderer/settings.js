// Settings: memory, Java, game folder, window, appearance, updates and download status.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  const ACCENTS = ['#3d7bff', '#19c2e8', '#2fd39a', '#ff9f43', '#ff5fa2', '#9b6bff'];

  const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', { class: 'dim' }, hint) : null);

  V.register({
    id: 'settings',
    title: 'Settings',
    icon: 'sliders',
    group: 'bottom',

    build(el) {
      this.host = h('div');
      el.append(this.host);
      V.on('tasks', () => { if (V.current === 'settings') this.renderTasks(); });
    },

    async show() {
      V.state.settings = await V.call('settings:get');
      V.state.info = await V.call('app:info');
      this.render();
    },

    save(patch, msg = 'Saved') {
      return V.saveSettings(patch).then(() => V.toast(msg, 'ok')).catch(V.error);
    },

    render() {
      const s = V.state.settings;
      const info = V.state.info;
      const maxRam = Math.max(2, Math.min(32, (info.totalMemGb || 8) - 1));

      // Memory and window
      const ramLabel = h('strong', null, `${s.ram} GB`);
      const ramWarn = h('small', { class: 'hint warn' });
      const checkRam = (v) => { ramWarn.textContent = v > (info.totalMemGb || 8) * 0.75 ? 'That leaves little memory for Windows and other programs. Minecraft often runs fine with 4–8 GB.' : ''; };
      checkRam(s.ram);
      const ram = h('input', { type: 'range', min: '1', max: String(maxRam), step: '1', value: String(Math.min(s.ram, maxRam)), 'aria-label': 'Memory in gigabytes', onInput: (e) => { ramLabel.textContent = `${e.target.value} GB`; checkRam(Number(e.target.value)); }, onChange: (e) => this.save({ ram: Number(e.target.value) }) });
      const w = h('input', { type: 'number', min: '320', max: '7680', value: String(s.width), 'aria-label': 'Window width', onChange: (e) => this.save({ width: Number(e.target.value) }) });
      const hh = h('input', { type: 'number', min: '240', max: '4320', value: String(s.height), 'aria-label': 'Window height', onChange: (e) => this.save({ height: Number(e.target.value) }) });
      const mode = V.select([{ value: 'windowed', label: 'Windowed' }, { value: 'fullscreen', label: 'Fullscreen' }], s.windowMode, (v) => this.save({ windowMode: v }), { 'aria-label': 'Window mode' });

      const game = h('section', { class: 'card' }, h('h3', null, 'Game'),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Memory', ' ', ramLabel), ram, h('small', { class: 'dim' }, `This PC has ${info.totalMemGb || '?'} GB of memory.`), ramWarn),
        h('div', { class: 'row' }, field('Window width', w), field('Window height', hh), field('Window mode', mode)));

      // Java
      const javaBox = h('div');
      const loadJava = (force) => V.load(javaBox, async () => {
        const list = await V.call('java:detect', !!force);
        const cur = V.state.settings.javaPath;
        const set = (path) => this.save({ javaPath: path }, path ? 'Java selected' : 'Using automatic Java').then(() => loadJava(false));
        return h('div', null,
          h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'java', checked: !cur, onChange: () => set('') }), h('div', null, h('strong', null, 'Automatic (recommended)'), h('div', { class: 'dim small' }, 'Picks the Java each Minecraft version needs: Java 8 up to 1.16, 17 for 1.17 to 1.20.4, 21 from 1.20.5.'))),
          h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'java', checked: !!cur, disabled: !cur, onChange: () => {} }), h('div', null, h('strong', null, 'A specific Java'), h('div', { class: 'dim small' }, cur || 'Choose one from the list below, or browse for java.exe.'))),
          list.length ? h('div', { class: 'list tight' }, list.map((j) => h('div', { class: 'row-item' + (cur === j.exe ? ' on' : '') }, h('div', { class: 'grow' }, h('strong', null, `Java ${j.major}`), h('span', { class: 'dim' }, ` ${j.version}`), h('div', { class: 'dim small break' }, j.exe)), h('button', { class: 'btn sm', disabled: cur === j.exe, onClick: () => set(j.exe) }, cur === j.exe ? 'In use' : 'Use this')))) :
            h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, 'No Java found on this PC. Install it with this command in PowerShell: winget install EclipseAdoptium.Temurin.21.JRE (add .17 or .8 versions for older Minecraft), or download it from adoptium.net.'), h('button', { class: 'btn sm', onClick: () => V.call('shell:link', 'https://adoptium.net/').catch(V.error) }, 'Open adoptium.net')),
          h('div', { class: 'row' },
            h('button', { class: 'btn sm', onClick: (e) => V.busy(e.currentTarget, async () => { const j = await V.call('java:browse'); if (j) await set(j.exe); }) }, V.icon('folder'), 'Browse…'),
            h('button', { class: 'btn sm', onClick: () => loadJava(true) }, V.icon('refresh'), 'Scan again')));
      });
      const java = h('section', { class: 'card' }, h('h3', null, 'Java'), javaBox);
      loadJava(false);

      // Game folder
      const folder = h('section', { class: 'card' }, h('h3', null, 'Game folder'),
        h('p', { class: 'dim' }, 'Where Minecraft files, libraries and all profiles are stored.'),
        h('code', { class: 'path' }, info.gameRoot || ''),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'root').catch(V.error) }, V.icon('folder'), 'Open'),
          h('button', {
            class: 'btn sm',
            onClick: async () => {
              const d = await V.call('shell:chooseFolder').catch(V.error);
              if (!d) return;
              if (!(await V.confirm({ title: 'Change the game folder?', text: `New folder: ${d}. Existing profiles stay in the old folder, and shared game files are downloaded again. To move your profiles, copy the "profiles" folder over yourself.`, confirm: 'Use this folder' }))) return;
              await this.save({ gameRoot: d }, 'Game folder changed');
              V.state.info = await V.call('app:info');
              await V.refreshProfiles();
              this.render();
            },
          }, 'Change…'),
          s.gameRoot ? h('button', { class: 'btn sm', onClick: async () => { await this.save({ gameRoot: '' }, 'Using the default folder'); V.state.info = await V.call('app:info'); await V.refreshProfiles(); this.render(); } }, 'Use default') : null));

      const appearance = this.appearanceCard(s);

      // Updates
      const updates = h('section', { class: 'card' }, h('h3', null, 'Updates'),
        field('Mod updates', V.select([
          { value: 'off', label: 'Never check' },
          { value: 'notify', label: 'Tell me when updates are available' },
          { value: 'auto', label: 'Install automatically before launching' },
        ], s.modUpdates, (v) => this.save({ modUpdates: v }), { 'aria-label': 'Mod updates' }), 'Applies to mods installed from Modrinth. Updates only use builds made for the profile\'s Minecraft version and loader.'));

      // Downloads
      this.tasksBox = h('div');
      const downloads = h('section', { class: 'card' }, h('h3', null, 'Downloads and installs'), this.tasksBox);

      this.host.replaceChildren(V.pageHeader('Settings', 'Changes are saved as soon as you make them.'),
        h('div', { class: 'settings-grid' }, appearance, V.updaterCard ? V.updaterCard() : null, game, java, folder, updates, downloads));
      this.renderTasks();
    },

    // Theme picker with live previews, seasonal switching, effects and accent colour.
    appearanceCard(s) {
      const T = window.VexThemes;
      const eff = V.state.themeInfo || T.effective(s, new Date());
      const now = new Date();
      const season = T.seasonFor(now);
      const pick = (id) => this.save(T.choosePatch(s, id, now), `${T.get(id).name} theme`).then(() => this.render());

      const preview = (t) => {
        const img = t.image && s.bgMode === 'picture' ? V.themeImage(t.id) : '';
        const v = t.vars;
        const box = h('div', { class: 'theme-prev', style: { backgroundColor: v.bgSolid, backgroundImage: img ? `${t.overlay}, url("${img}")` : 'none' } });
        if (!img) {
          const c = h('canvas', { class: 'theme-canvas', 'aria-hidden': 'true' });
          box.append(c);
          requestAnimationFrame(() => { c.width = box.clientWidth || 168; c.height = box.clientHeight || 92; V.paintBiomeInto && V.paintBiomeInto(c, V.biomeFor(t, t.accent)); });
        }
        box.append(
          h('div', { class: 'p-side', style: { background: v.panel, borderRight: `1px solid ${v.line}` } }),
          h('div', { class: 'p-main' },
            h('div', { class: 'p-card', style: { background: v.panel, borderColor: v.line } }),
            h('div', { class: 'p-btn', style: { background: t.accent, boxShadow: `0 0 8px ${t.accent}` } })));
        return box;
      };

      const cards = T.THEMES.map((t) => {
        const on = eff.id === t.id;
        const chosen = s.theme === t.id;
        const tags = [];
        if (t.id === T.DEFAULT_THEME) tags.push(V.badge('Default'));
        if (t.seasonal) tags.push(V.badge('Seasonal'));
        if (on && eff.auto) tags.push(V.badge('Auto', 'accent'));
        return h('button', { class: 'theme-card' + (on ? ' on' : ''), 'aria-pressed': String(on), title: chosen ? 'Your chosen theme' : `Use the ${t.name} theme`, onClick: () => pick(t.id) },
          preview(t),
          on ? h('span', { class: 'tick' }, V.icon('check')) : null,
          h('div', { class: 'theme-meta' }, h('strong', null, t.name), h('small', null, t.tagline), tags.length ? h('div', { class: 'chips', style: { marginTop: '6px' } }, tags) : null));
      });

      let seasonNote = null;
      if (season) {
        const st = T.get(season.theme);
        const ends = season.ends.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
        seasonNote = eff.auto
          ? h('div', { class: 'banner' }, V.icon('star'), h('span', null, `The ${st.name} theme is on automatically until ${ends}. After that you're back on ${T.get(eff.preferred).name}. Picking another theme now keeps it for the rest of this season.`))
          : h('div', { class: 'banner' }, V.icon('star'), h('span', null, `You chose ${T.get(eff.preferred).name} for this ${st.name} season.`), h('button', { class: 'btn sm', onClick: () => this.save({ seasonOptOut: '' }, `${st.name} theme on`).then(() => this.render()) }, `Use ${st.name} theme`));
      }

      const custom = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '';
      const themeAccent = T.get(eff.id).accent;
      const accent = h('input', { type: 'color', value: custom || themeAccent, 'aria-label': 'Accent color', onChange: (e) => this.save({ accent: e.target.value }).then(() => this.render()) });
      const isDefault = s.theme === T.DEFAULT_THEME && !custom && s.themeEffects !== false;

      return h('section', { class: 'card wide' },
        h('div', { class: 'card-top' }, h('h3', null, 'Appearance'),
          h('button', { class: 'btn sm', disabled: isDefault, onClick: () => this.save({ theme: T.DEFAULT_THEME, accent: '', seasonOptOut: '', themeEffects: true }, 'Default theme restored').then(() => this.render()) }, V.icon('refresh'), 'Reset to default')),
        h('p', { class: 'dim' }, 'Themes change the background, sidebar, buttons, cards and accents on every page. They switch instantly and are remembered.'),
        seasonNote,
        h('div', { class: 'theme-grid', role: 'group', 'aria-label': 'Themes' }, cards),
        h('div', { class: 'list tight' },
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Seasonal themes'), h('div', { class: 'dim small' }, 'Halloween 1–31 Oct, Christmas 1–26 Dec, New Year 27 Dec–3 Jan, based on this PC\'s date. Your own theme returns afterwards.')),
            V.switch(s.seasonalThemes, (on) => this.save({ seasonalThemes: on, seasonOptOut: '' }, on ? 'Seasonal themes on' : 'Seasonal themes off').then(() => this.render()), 'Seasonal themes')),
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Spring, summer and autumn'), h('div', { class: 'dim small' }, 'Spring Mar–May, Summer Jun–Aug, Autumn Sep–Nov. Holiday themes still win on their dates. Off by default because these cover most of the year.')),
            V.switch(!!s.natureSeasons, (on) => this.save({ natureSeasons: on, seasonOptOut: '' }, on ? 'Nature seasons on' : 'Nature seasons off').then(() => this.render()), 'Spring, summer and autumn themes')),
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Theme effects'), h('div', { class: 'dim small' }, 'Falling Minecraft leaves in the theme\'s colours. Light on your PC, and paused while Minecraft is running.')),
            V.switch(s.themeEffects !== false, (on) => this.save({ themeEffects: on }, on ? 'Effects on' : 'Effects off'), 'Theme effects')),
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Vex look in Minecraft'), h('div', { class: 'dim small' }, `VEX CLIENT title logo, Vex buttons and panorama in every profile, plus the in-game Vex menu (Right Shift) on Fabric 1.21.11.${V.state.info && V.state.info.vexMod ? ` Launcher ${V.state.info.version} · in-game mod ${V.state.info.vexMod}.` : ''}`)),
            V.switch(s.vexInGame !== false, (on) => this.save({ vexInGame: on }, on ? 'Vex look on: applied at the next launch' : 'Vex look off for new launches'), 'Vex look in Minecraft')),
          (() => {
            const pics = T.THEMES.filter((t) => t.image && V.themeAssets[t.id]).map((t) => t.name);
            const setBg = (v) => this.save({ bgMode: v }, v === 'picture' ? 'Using the theme picture' : v === 'landscape' ? 'Using the painted landscape' : 'Just falling leaves').then(() => this.render());
            const mode = s.bgMode === 'picture' ? 'picture' : s.bgMode === 'landscape' ? 'landscape' : 'leaves';
            return h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Background'),
              h('div', { class: 'dim small' }, 'Leaves: the theme\'s colours with falling leaves, nothing else. Landscape: a painted Minecraft biome. Picture: the theme\'s own image' + (pics.length ? ` (${pics.join(', ')})` : ' (none added yet)') + '.')),
            h('div', { class: 'seg', role: 'group', 'aria-label': 'Background' },
              h('button', { class: mode === 'leaves' ? 'on' : '', onClick: () => setBg('leaves') }, 'Leaves'),
              h('button', { class: mode === 'landscape' ? 'on' : '', onClick: () => setBg('landscape') }, 'Landscape'),
              h('button', { class: mode === 'picture' ? 'on' : '', disabled: !pics.length, onClick: () => setBg('picture') }, 'Picture')));
          })()),
        h('div', { class: 'field', style: { marginTop: '14px' } }, h('span', { class: 'field-label' }, 'Accent color'),
          h('div', { class: 'row' }, accent, ACCENTS.map((c) => h('button', { class: 'swatch' + (custom === c ? ' on' : ''), 'aria-label': `Accent ${c}`, style: { background: c }, onClick: () => this.save({ accent: c }).then(() => this.render()) })),
            h('button', { class: 'btn sm' + (custom ? '' : ' ghost'), disabled: !custom, onClick: () => this.save({ accent: '' }, 'Using the theme colour').then(() => this.render()) }, 'Use theme color')),
          eff.auto ? h('small', { class: 'dim' }, 'Seasonal themes always use their own colours.') : null));
    },

    renderTasks() {
      if (!this.tasksBox) return;
      const active = [...V.tasks.values()];
      this.tasksBox.replaceChildren(
        active.length ? h('div', { class: 'list tight' }, active.map((t) => h('div', { class: 'progress-row' }, h('span', null, t.label), h('div', { class: 'bar' }, h('i', { style: { width: t.total ? `${Math.min(100, (t.received / t.total) * 100)}%` : '30%' } }))))) : h('p', { class: 'dim' }, 'Nothing is downloading right now.'),
        V.history.length ? h('div', null, h('small', { class: 'dim' }, 'Recently finished'), h('ul', { class: 'plain' }, V.history.slice(0, 6).map((x) => h('li', null, V.icon('check'), `${x.label} · ${V.fmt.ago(x.at)}`)))) : null);
    },
  });
})();
