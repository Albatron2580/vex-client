// Admin panel: publish launcher updates, follow the build, manage releases.
// Only shown to the accounts in package.json -> vexAdmins; the main process re-checks the account
// with Minecraft's servers, and every action needs the admin's own GitHub token.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  const TYPES = [
    { id: 'patch', label: 'Patch', desc: 'Bug and security fixes' },
    { id: 'minor', label: 'Minor', desc: 'New features, themes, UI changes' },
    { id: 'major', label: 'Major', desc: 'Big redesigns' },
  ];
  const bump = (v, kind) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v || '0.0.0') || [0, 0, 0, 0];
    const [a, b, c] = [+m[1], +m[2], +m[3]];
    return kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  };
  const isAdmin = () => {
    const acc = V.state.active;
    const list = (V.state.info.admins || []).map((x) => String(x).toLowerCase());
    return !!acc && list.includes(String(acc.name).toLowerCase());
  };
  V.isAdmin = isAdmin;

  const stat = (icon, label, value, sub, kind) => h('div', { class: `stat ${kind || ''}` },
    h('div', { class: 'stat-ico' }, V.icon(icon)),
    h('div', null, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null));

  const runBadge = (b) => {
    if (!b) return V.badge('No builds yet');
    if (b.status !== 'completed') return h('span', { class: 'badge accent' }, h('span', { class: 'spinner tiny' }), ' Building');
    return b.conclusion === 'success' ? V.badge('Succeeded', 'ok') : V.badge(b.conclusion === 'cancelled' ? 'Cancelled' : 'Failed', 'warn');
  };

  V.register({
    id: 'admin',
    title: 'Admin',
    icon: 'shield',
    group: 'bottom',
    visible: isAdmin,

    build(el) {
      this.host = h('div', { class: 'admin' });
      el.append(this.host);
      this.form = { bump: 'patch', critical: false, minimum: '', notes: '', preview: false };
      V.on('accounts', () => { if (V.current === 'admin' && !isAdmin()) V.go('home'); });
    },

    async show() {
      if (!isAdmin()) { this.host.replaceChildren(V.errorBox('This account does not have admin access.')); return; }
      this.host.replaceChildren(V.loading('Checking admin access with Minecraft…'));
      try {
        this.status = await V.call('admin:status');
      } catch (e) {
        this.host.replaceChildren(V.pageHeader('Admin', ''), V.errorBox(e.message, () => this.show()));
        return;
      }
      if (this.status.github && !this.status.github.error) await this.loadOverview();
      this.render();
    },

    async loadOverview() {
      try { this.data = await V.call('admin:overview'); this.dataError = ''; } catch (e) { this.dataError = e.message; }
      const running = this.data && this.data.builds.find((b) => b.status !== 'completed');
      if (running) this.track(running.id);
    },

    header() {
      const st = this.status;
      return h('div', { class: 'admin-hero' },
        h('div', { class: 'admin-hero-ico' }, V.icon('shield')),
        h('div', { class: 'grow' },
          h('h2', null, 'Admin panel'),
          h('p', null, 'Publish launcher updates to every player, follow the build, and control which release is live.')),
        h('div', { class: 'admin-who' },
          h('span', { class: 'badge ok' }, V.icon('check'), ' Verified'),
          h('strong', null, st.name),
          st.github && st.github.login ? h('span', { class: 'dim small' }, `GitHub @${st.github.login}`) : null));
    },

    render() {
      const st = this.status;
      const parts = [this.header()];
      if (!st.repo) {
        parts.push(h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, 'Updates are not set up in this build yet. On your PC run "npm run setup-updates -- <github-user>/<repo>" and add the signing key secret (see RELEASING.md), then rebuild.')));
      }
      if (!st.github || st.github.error) parts.push(this.connectCard(st.github && st.github.error));
      else {
        if (this.dataError) parts.push(V.errorBox(this.dataError, () => this.show()));
        if (this.data) parts.push(this.stats(), h('div', { class: 'admin-grid' }, this.publishCard(), h('div', { class: 'admin-side' }, this.buildCard(), this.buildsCard())), this.releasesCard());
        parts.push(h('div', { class: 'admin-foot dim small' }, V.icon('key'), ` Connected to ${st.github.repo} as @${st.github.login}. The token is stored encrypted on this PC and only sent to GitHub.`,
          h('button', { class: 'btn sm ghost', onClick: async () => { if (await V.confirm({ title: 'Disconnect GitHub?', text: 'The token is removed from this PC. You can connect again at any time.', confirm: 'Disconnect', danger: true })) { await V.call('admin:disconnect').catch(V.error); this.show(); } } }, 'Disconnect')));
      }
      this.host.replaceChildren(...parts);
    },

    connectCard(err) {
      const input = h('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'GitHub token' });
      const go = (e) => V.busy(e.currentTarget, async () => { this.status = await V.call('admin:connect', input.value); input.value = ''; V.toast('GitHub connected', 'ok'); await this.loadOverview(); this.render(); });
      return h('section', { class: 'card connect-card' },
        h('div', { class: 'connect-ico' }, V.icon('key')),
        h('h3', null, 'Connect GitHub'),
        h('p', { class: 'dim' }, `Publishing runs on GitHub (${this.status.repo || 'your launcher repository'}), so each admin connects their own GitHub account once. Vex Client itself contains no publishing secrets.`),
        err ? h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, err)) : null,
        h('ol', { class: 'connect-steps' },
          h('li', null, 'Make sure your GitHub account is a collaborator on the repository.'),
          h('li', null, 'Create a fine-grained token: Repository access → only this repository; Permissions → Contents: Read and write, Actions: Read and write.'),
          h('li', null, 'Paste it below. It is encrypted with Windows and stays on this PC.')),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onClick: () => V.call('admin:open', 'https://github.com/settings/personal-access-tokens/new').catch(V.error) }, V.icon('external'), 'Create token on GitHub')),
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('div', { class: 'grow' }, input), h('button', { class: 'btn primary', onClick: go }, 'Connect')));
    },

    stats() {
      const d = this.data;
      const live = d.releases.find((r) => r.latest);
      const lastBuild = d.builds[0];
      return h('div', { class: 'stats' },
        stat('zap', 'Live version', live ? live.version : '—', live ? `since ${V.fmt.date(live.date)}` : 'nothing published yet', 'accent'),
        stat('download', 'Installer downloads', V.fmt.count(d.totalDownloads), `${d.releases.length} release${d.releases.length === 1 ? '' : 's'}`),
        stat('sliders', 'This launcher', this.status.version, live && live.version !== this.status.version ? 'not the live version' : 'up to date'),
        stat('activity', 'Last build', lastBuild ? (lastBuild.status !== 'completed' ? 'Building…' : lastBuild.conclusion === 'success' ? 'Succeeded' : 'Failed') : '—', lastBuild ? V.fmt.ago(Date.parse(lastBuild.date)) : '', lastBuild && lastBuild.status === 'completed' && lastBuild.conclusion !== 'success' ? 'bad' : ''));
    },

    publishCard() {
      const f = this.form;
      const live = (this.data.releases.find((r) => r.latest) || {}).version || this.status.version;
      const next = bump(live, f.bump);
      const card = h('section', { class: 'card publish-card' });
      const rerender = () => card.replaceWith(this.publishCard());
      const notesBox = f.preview
        ? h('div', { class: 'notes-preview' }, V.renderNotes ? V.renderNotes(f.notes) : f.notes)
        : h('textarea', { class: 'notes-input', rows: '8', placeholder: '### New\n- Painted biome backgrounds\n### Fixed\n- Crash when opening Shaders', onInput: (e) => { f.notes = e.target.value; } });
      if (!f.preview) notesBox.value = f.notes;
      const busy = this.data.builds.some((b) => b.status !== 'completed');
      card.append(
        h('div', { class: 'card-top' }, h('h3', null, 'Publish an update'), h('span', { class: 'version-flow' }, h('span', { class: 'dim' }, live), V.icon('down', 'rot'), h('strong', null, next))),
        h('div', { class: 'type-cards', role: 'radiogroup', 'aria-label': 'Update type' }, TYPES.map((t) => h('button', {
          class: 'type-card' + (f.bump === t.id ? ' on' : ''), role: 'radio', 'aria-checked': String(f.bump === t.id),
          onClick: () => { f.bump = t.id; rerender(); },
        }, h('strong', null, t.label), h('small', null, t.desc), h('span', { class: 'type-ver' }, bump(live, t.id))))),
        h('div', { class: 'row-item crit' + (f.critical ? ' on' : '') },
          h('div', { class: 'grow' }, h('strong', null, 'Critical update'), h('div', { class: 'dim small' }, 'Security or compatibility fix: players get a warning, it downloads even with auto-download off, and it cannot be skipped.')),
          V.switch(f.critical, (on) => { f.critical = on; rerender(); }, 'Critical update')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Minimum version ', h('span', { class: 'dim small' }, '(optional)')),
          h('input', { type: 'text', placeholder: 'e.g. 1.1.0: older launchers must update', value: f.minimum, onInput: (e) => { f.minimum = e.target.value.trim(); } })),
        h('div', { class: 'field' },
          h('div', { class: 'row' }, h('span', { class: 'field-label grow' }, 'Release notes'),
            h('div', { class: 'seg' }, h('button', { class: f.preview ? '' : 'on', onClick: () => { f.preview = false; rerender(); } }, 'Write'), h('button', { class: f.preview ? 'on' : '', onClick: () => { f.preview = true; rerender(); } }, 'Preview'))),
          notesBox,
          h('small', { class: 'dim' }, 'Shown to every player in Settings → Launcher updates. Use ### headings and - bullets.')),
        h('button', {
          class: 'btn primary publish-btn', disabled: busy,
          title: busy ? 'A build is already running' : '',
          onClick: async (e) => {
            if (f.notes.trim().length < 3) { V.toast('Write what changed first. Every player sees these notes.', 'error'); return; }
            const ok = await V.confirm({ title: `Publish Vex Client ${next}?`, text: `GitHub will build, sign and publish ${next} (${f.bump}${f.critical ? ', critical' : ''}). Every launcher installs it automatically: on restart, or when it's closed, never during a game.`, confirm: `Publish ${next}` });
            if (!ok) return;
            V.busy(e.currentTarget, async () => {
              await V.call('admin:publish', { bump: f.bump, critical: f.critical, minimum: f.minimum, notes: f.notes });
              V.toast(`Build for ${next} started on GitHub`, 'ok');
              this.form = { bump: 'patch', critical: false, minimum: '', notes: '', preview: false };
              await this.waitForRun();
            });
          },
        }, V.icon('upload'), busy ? 'A build is running…' : `Publish ${next}`));
      return card;
    },

    // After dispatching, GitHub needs a few seconds to create the run.
    async waitForRun() {
      const before = new Set(this.data.builds.map((b) => b.id));
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        await this.loadOverview();
        const fresh = this.data && this.data.builds.find((b) => !before.has(b.id));
        if (fresh) { this.track(fresh.id); break; }
      }
      if (V.current === 'admin') this.render();
    },

    track(id) {
      if (this.tracking === id) return;
      this.tracking = id;
      clearTimeout(this.timer);
      const tick = async () => {
        if (this.tracking !== id) return;
        try {
          this.run = await V.call('admin:build', id);
          if (this.run.status === 'completed') {
            this.tracking = null;
            V.toast(this.run.conclusion === 'success' ? 'The update is live. Launchers will pick it up.' : `The build ${this.run.conclusion}. Open it on GitHub to see why.`, this.run.conclusion === 'success' ? 'ok' : 'error');
            await this.loadOverview();
            if (V.current === 'admin') this.render();
            return;
          }
          const box = V.$('#build-card');
          if (box) box.replaceWith(this.buildCard());
        } catch { /* keep polling */ }
        this.timer = setTimeout(tick, 6000);
      };
      tick();
    },

    buildCard() {
      const r = this.run;
      const card = h('section', { class: 'card', id: 'build-card' });
      if (!r) {
        card.append(h('h3', null, 'Build'), h('p', { class: 'dim' }, 'Press Publish to start a build. Its progress shows here: version, tests, installer, signing, release.'));
        return card;
      }
      const icon = (s) => (s.status !== 'completed' ? (s.status === 'in_progress' ? h('span', { class: 'spinner tiny' }) : h('span', { class: 'step-dot' })) : s.conclusion === 'success' ? V.icon('check', 'ok') : s.conclusion === 'skipped' ? h('span', { class: 'step-dot skip' }) : V.icon('x', 'bad'));
      card.append(
        h('div', { class: 'card-top' }, h('h3', null, 'Build'), runBadge(r)),
        h('p', { class: 'dim small' }, r.title || ''),
        h('ol', { class: 'steps' }, r.steps.length ? r.steps.map((s) => h('li', { class: `step ${s.status} ${s.conclusion || ''}` }, icon(s), h('span', null, s.name))) : h('li', { class: 'step' }, h('span', { class: 'spinner tiny' }), h('span', null, 'Waiting for a GitHub runner…'))),
        h('button', { class: 'btn sm ghost', onClick: () => V.call('admin:open', r.url).catch(V.error) }, V.icon('external'), 'Open on GitHub'));
      return card;
    },

    buildsCard() {
      const b = this.data.builds;
      return h('section', { class: 'card' },
        h('h3', null, 'Recent builds'),
        b.length ? h('div', { class: 'list tight' }, b.slice(0, 5).map((x) => h('button', { class: 'row-item build-row', onClick: () => { this.run = null; this.track(x.id); } },
          h('div', { class: 'grow' }, h('strong', null, x.title), h('div', { class: 'dim small' }, `${x.event === 'workflow_dispatch' ? 'Admin panel' : 'Tag push'}${x.actor ? ` · @${x.actor}` : ''} · ${V.fmt.ago(Date.parse(x.date))}`)),
          runBadge(x)))) : h('p', { class: 'dim' }, 'No builds yet.'));
    },

    releasesCard() {
      const rows = this.data.releases;
      return h('section', { class: 'card' },
        h('div', { class: 'card-top' }, h('h3', null, 'Releases'), h('span', { class: 'dim small' }, 'Pausing stops launchers that haven\'t updated yet from getting a release. The previous release becomes the live one again.')),
        rows.length ? h('div', { class: 'list' }, rows.map((r) => h('div', { class: 'row-item release-row' + (r.latest ? ' on' : '') },
          h('div', { class: 'rel-ver' }, r.version),
          h('div', { class: 'grow' },
            h('div', { class: 'chips' },
              r.latest ? V.badge('Live', 'ok') : null,
              r.draft ? V.badge('Draft', 'warn') : r.prerelease ? V.badge('Paused', 'warn') : !r.latest ? V.badge('Older') : null,
              r.critical ? V.badge('Critical', 'warn') : null,
              r.signed ? null : V.badge('Not signed: launchers ignore it', 'warn')),
            h('div', { class: 'dim small' }, `${V.fmt.date(r.date)} · ${V.fmt.count(r.downloads)} installer downloads`)),
          h('div', { class: 'row' },
            r.prerelease && !r.draft ? h('button', { class: 'btn sm', onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('admin:rollout', r.id, 'resume'); V.toast(`${r.version} is live again`, 'ok'); await this.loadOverview(); this.render(); }) }, V.icon('play'), 'Resume') : null,
            r.latest ? h('button', { class: 'btn sm danger', onClick: async (e) => {
              if (!(await V.confirm({ title: `Pause ${r.version}?`, text: 'Launchers that have not updated yet stop getting it, and the previous release becomes the live one. Players who already installed it keep it: publish a fix to move them on.', confirm: 'Pause rollout', danger: true }))) return;
              V.busy(e.currentTarget, async () => { const x = await V.call('admin:rollout', r.id, 'pause'); V.toast(x.fallback ? `${r.version} paused. ${x.fallback} is live again.` : `${r.version} paused.`, 'ok'); await this.loadOverview(); this.render(); });
            } }, V.icon('pause'), 'Pause') : null,
            h('button', { class: 'icon-btn', title: 'Open on GitHub', 'aria-label': 'Open on GitHub', onClick: () => V.call('admin:open', r.url).catch(V.error) }, V.icon('external')))))) : V.empty('No releases yet', 'Publish your first update with the form above.'));
    },
  });
})();
