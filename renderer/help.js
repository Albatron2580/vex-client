// About and troubleshooting: version info, diagnostics, common fixes and honest limits.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  const FAQ = [
    ['The Launch button asks me to sign in', 'Open the Account page and sign in with the Microsoft account that owns Minecraft: Java Edition. Vex Client cannot start the game without one.'],
    ['It says Minecraft needs a newer Java', 'Each Minecraft version needs a minimum Java: 8 up to 1.16, 17 for 1.17 to 1.20.4, 21 from 1.20.5. Install the one you need (PowerShell: winget install EclipseAdoptium.Temurin.21.JRE), then press "Scan again" in Settings. Automatic mode picks the right one for you.'],
    ['Minecraft closes right after it starts', 'Open Screens & logs and read the latest game log and any crash report. The usual causes are a mod made for another Minecraft version (look for warnings on the Mods page), too little or too much memory, or an old graphics driver.'],
    ['Fabric, Forge or NeoForge says it is not available', 'Not every loader supports every Minecraft version. Fabric starts at 1.14, NeoForge at 1.20.2. Edit the profile and pick another version or loader.'],
    ['Sign-in fails or expires', 'Try signing in again from the Account page. If it says the account does not own Minecraft, you are signed in with a different Microsoft account than the one that bought the game. A child account needs an adult to allow online play at account.microsoft.com/family.'],
    ['My cape does not show in the game', 'Only capes your Minecraft account owns are visible to other players, and you equip them on the Cosmetics page. Local capes are preview-only in this launcher.'],
    ['Can I add a mod while Minecraft is running?', 'You can install it, but it starts working only after a restart. Fabric, Forge and NeoForge load mods once, when the game starts. Vex Client downloads and checks the mod right away, marks it "Pending install", and adds it the moment you close Minecraft. Resource packs and shader packs are different: switch them on in the game\'s Options menu, no restart needed.'],
    ['How do launcher updates work?', 'The installed version checks for updates when it starts and every few hours. Updates download in the background, are checked against a signed release, and install when you press "Restart to update" or close the launcher, never while you are playing. Your settings, sign-ins, profiles, mods and worlds are kept. See Settings → Launcher updates.'],
    ['Shaders do nothing', 'Shaders need the Iris mod on a Fabric or NeoForge profile. The Shaders page can install it. Pick a pack, start the game, and make sure shaders are on in Video Settings.'],
  ];

  V.register({
    id: 'help',
    title: 'Help',
    icon: 'help',
    group: 'bottom',

    build(el) {
      const results = h('div');
      let report = '';
      this.info = h('div');
      el.append(
        V.pageHeader('About and troubleshooting', 'Check that everything the launcher needs is working.'),
        h('div', { class: 'settings-grid' },
          h('section', { class: 'card' }, h('h3', null, 'About'), this.info),
          h('section', { class: 'card' },
            h('div', { class: 'card-top' }, h('h3', null, 'Diagnostics'),
              h('button', {
                class: 'btn sm primary',
                onClick: (e) => V.busy(e.currentTarget, async () => {
                  results.replaceChildren(V.loading('Running checks…'));
                  const r = await V.call('diag:run');
                  report = r.report;
                  results.replaceChildren(
                    h('div', { class: 'list tight' }, r.checks.map((c) => h('div', { class: 'check-row' + (c.ok ? ' ok' : ' bad') }, V.icon(c.ok ? 'check' : 'alert'), h('div', null, h('strong', null, c.name), h('div', { class: 'dim small break' }, c.detail))))),
                    h('button', { class: 'btn sm', onClick: () => V.call('app:copy', report).then(() => V.toast('Report copied', 'ok')).catch(V.error) }, V.icon('copy'), 'Copy report'));
                }),
              }, V.icon('activity'), 'Run checks')),
            h('p', { class: 'dim' }, 'Tests Java, your connection to Mojang, Modrinth and Microsoft, disk space and secure storage.'),
            results),
          h('section', { class: 'card wide' }, h('h3', null, 'Common problems'),
            FAQ.map(([q, a]) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a)))),
          h('section', { class: 'card wide' }, h('h3', null, 'What Vex Client does not do'),
            h('ul', { class: 'plain' },
              h('li', null, 'It cannot start Minecraft without a Microsoft account that owns Java Edition.'),
              h('li', null, 'It supports Vanilla, Fabric, Forge and NeoForge. Quilt modpacks and OptiFine are not supported.'),
              h('li', null, 'Local capes are previews. They are not drawn in the game and other players cannot see them.'),
              h('li', null, 'Mods cannot be loaded into a game that is already running. They are added when Minecraft closes.'),
              h('li', null, 'Running from source (Start Vex Client.bat) cannot update itself. The installed version can.')))));
    },

    async show() {
      const i = await V.call('app:info');
      V.state.info = i;
      const row = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'dim' }, k), h('span', { class: 'break' }, v));
      this.info.replaceChildren(
        row('Vex Client', i.version), row('Electron', i.electron), row('Node', i.node), row('System', i.platform),
        row('Launcher data', i.baseDir), row('Game folder', i.gameRoot),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'base').catch(V.error) }, V.icon('folder'), 'Open launcher data'),
          h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'profile').catch(V.error) }, V.icon('folder'), 'Open profile folder'),
          h('button', { class: 'btn sm', onClick: () => V.call('shell:link', 'https://modrinth.com/').catch(V.error) }, V.icon('external'), 'Modrinth')));
    },
  });
})();
