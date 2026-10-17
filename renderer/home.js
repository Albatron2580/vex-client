// Home: player preview, Launch button, quick facts and Minecraft news.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  V.register({
    id: 'home',
    title: 'Home',
    icon: 'home',
    group: 'main',

    build(el) {
      let back = false;
      let animate = true;
      const bg = h('canvas', { class: 'bg', 'aria-hidden': 'true' });
      const tag = h('div', { class: 'tag' });
      const figure = h('canvas', { class: 'player', role: 'img', 'aria-label': 'Your Minecraft skin' });
      const dock = h('div', { class: 'dock' });
      const gate = h('div', { class: 'gate card' });
      const serverBox = h('div', { class: 'server-wrap' });
      const newsList = h('div', { class: 'news-list' }, V.loading('Loading news…'));

      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
        h('button', { class: 'on', onClick: () => setBack(false) }, 'Front'),
        h('button', { onClick: () => setBack(true) }, 'Back'));
      const setBack = (b) => { back = b; V.$$('button', seg).forEach((x, i) => x.classList.toggle('on', (i === 1) === b)); drawPlayer(); };
      const anim = h('label', { class: 'switch-row' }, h('span', null, 'Animation'), V.switch(true, (on) => { animate = on; stage.classList.toggle('anim', on); }, 'Skin animation'));

      const stage = h('div', { class: 'stage anim' },
        bg,
        h('div', { class: 'stage-top' }, seg, anim),
        serverBox,
        h('div', { class: 'figure' }, tag, figure, gate),
        dock);
      el.append(h('div', { class: 'home' }, stage, h('aside', { class: 'news' }, h('h3', null, 'Minecraft news'), newsList)));

      async function drawPlayer() {
        const p = V.player;
        tag.textContent = p.name ? `⚡ ${p.name}` : 'Not signed in';
        let cape = null;
        if (back && V.getLocalCape) { try { cape = await V.getLocalCape(); } catch { /* no cape */ } }
        V.drawPlayer(figure, { skin: p.skin, slim: p.slim, back, cape: cape && cape.img, capeUnit: cape && cape.unit, scale: 10 });
      }

      function renderGate() {
        gate.replaceChildren();
        gate.hidden = !!V.state.active;
        // signed out: the sign-in card takes the skin's place instead of covering the page
        tag.hidden = figure.hidden = !V.state.active;
        if (V.state.active) return;
        gate.append(
          h('strong', null, 'Sign in to play'),
          h('p', null, 'Vex Client signs you in through Microsoft, the same way the official launcher does. You need an account that owns Minecraft: Java Edition.'),
          h('button', { class: 'btn primary', onClick: () => V.go('account') }, V.icon('user'), 'Go to Account'));
      }

      let launching = false;
      async function startGame(join) {
        launching = true; V.gameLog.length = 0; renderDock(); renderServer();
        try { await V.call('game:launch', { join: !!join }); } catch (e) { V.setStatus(e.message); V.error(e); }
        launching = false; renderDock(); renderServer();
      }

      // ---------- featured server (package.json -> vexServer), live like the multiplayer list ----------
      let server = null;
      let serverStatus = null;
      const MC = { black: '#000000', dark_blue: '#0000aa', dark_green: '#00aa00', dark_aqua: '#00aaaa', dark_red: '#aa0000', dark_purple: '#aa00aa', gold: '#ffaa00', gray: '#aaaaaa', dark_gray: '#555555', blue: '#5555ff', green: '#55ff55', aqua: '#55ffff', red: '#ff5555', light_purple: '#ff55ff', yellow: '#ffff55', white: '#ffffff' };
      const motd = (parts) => {
        const lines = [h('div', { class: 'motd-line' })];
        for (const p of parts || []) {
          p.text.split('\n').forEach((chunk, i) => {
            if (i > 0) lines.push(h('div', { class: 'motd-line' }));
            if (!chunk) return;
            const col = MC[p.color] || (/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '');
            lines[lines.length - 1].append(h('span', { style: { color: col || '', fontWeight: p.bold ? '700' : '', fontStyle: p.italic ? 'italic' : '' } }, chunk));
          });
        }
        return h('div', { class: 'motd' }, lines.slice(0, 2));
      };
      const bars = (ms, online) => {
        const n = !online ? 0 : ms < 80 ? 5 : ms < 150 ? 4 : ms < 250 ? 3 : ms < 500 ? 2 : 1;
        return h('span', { class: 'signal' + (online ? '' : ' off'), title: online ? `${ms} ms` : 'Offline' }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= n ? 'on' : '', style: { height: `${i * 3 + 2}px` } })));
      };
      function renderServer() {
        if (!server) { serverBox.hidden = true; return; }
        serverBox.hidden = false;
        const st = serverStatus;
        const g = V.state.game.state;
        const icon = st && st.icon ? h('img', { class: 'srv-icon', src: st.icon, alt: '' }) : h('div', { class: 'srv-icon srv-fallback' }, server.name.slice(0, 1));
        const canJoin = V.state.active && g === 'idle' && !launching;
        serverBox.replaceChildren(h('div', { class: 'srv-card' + (st && !st.online ? ' offline' : '') },
          h('div', { class: 'srv-label' }, V.icon('star'), 'Featured server'),
          h('div', { class: 'srv-row' },
            icon,
            h('div', { class: 'srv-body' },
              h('div', { class: 'srv-head' }, h('strong', { class: 'srv-name' }, server.name),
                h('span', { class: 'srv-players' }, st ? (st.online ? `${st.players.online}/${st.players.max}` : 'Offline') : '…', bars(st && st.latency, st && st.online))),
              st && st.online ? motd(st.motd) : h('div', { class: 'motd dim' }, st ? st.error || 'Offline' : 'Pinging server…'),
              h('div', { class: 'srv-meta' },
                server.region ? h('span', { class: 'srv-tag' }, server.region) : null,
                st && st.version ? h('span', { class: 'srv-tag' }, st.version) : null,
                h('span', { class: 'srv-tag addr' }, server.host)))),
          h('div', { class: 'srv-actions' },
            h('button', {
              class: 'btn primary srv-join', disabled: !canJoin,
              title: !V.state.active ? 'Sign in first' : g !== 'idle' ? 'Minecraft is already running' : '',
              onClick: () => startGame(true),
            }, V.icon('play'), g === 'running' ? 'Playing' : launching ? 'Starting…' : `Join ${server.name}`),
            server.discord ? h('button', { class: 'btn srv-discord', onClick: () => V.call('shell:link', server.discord).catch(V.error) }, V.icon('users'), 'Discord') : null,
            h('button', { class: 'icon-btn', title: 'Refresh', 'aria-label': 'Refresh server status', onClick: () => pingServer(true) }, V.icon('refresh')))));
      }
      async function pingServer(force) {
        try { serverStatus = await V.call('server:status', !!force); } catch (e) { serverStatus = { online: false, error: e.message }; }
        renderServer();
      }
      V.call('server:info').then((s) => { server = s; renderServer(); if (s) pingServer(false); }).catch(() => {});
      setInterval(() => { if (server && V.current === 'home' && !document.hidden) pingServer(false); }, 60000);
      for (const ev of ['game', 'accounts']) V.on(ev, renderServer);

      function renderDock() {
        const prof = V.profile();
        const g = V.state.game.state;
        const acc = V.state.active;
        const s = V.state.settings;
        const select = h('select', { 'aria-label': 'Profile', onChange: (e) => V.selectProfile(e.target.value).catch(V.error) },
          V.state.profiles.map((p) => h('option', { value: p.id }, p.name)));
        select.value = prof ? prof.id : '';

        let main;
        if (!acc) main = h('button', { class: 'launch-btn', onClick: () => V.go('account') }, h('b', null, 'Sign in to play'), h('small', null, 'Microsoft account required'));
        else if (g === 'starting' || launching) main = h('button', { class: 'launch-btn busy', disabled: true }, h('b', null, 'Starting…'), h('small', null, V.state.status || 'Please wait'));
        else if (g === 'running') main = h('button', { class: 'launch-btn', disabled: true }, h('b', null, 'Running'), h('small', null, 'Minecraft is open'));
        else {
          main = h('button', {
            class: 'launch-btn',
            onClick: () => startGame(false),
          }, h('b', null, 'Launch'), h('small', null, prof ? `${V.fmt.loader(prof.loader)} ${prof.version}` : ''));
        }

        const stop = g === 'running' ? h('button', { class: 'btn danger', onClick: (e) => V.busy(e.currentTarget, () => V.call('game:stop')) }, V.icon('stop'), 'Stop') : null;

        const chips = prof ? [
          h('span', { class: 'chip' }, V.icon('package'), `${prof.modCount || 0} mods`),
          h('span', { class: 'chip' }, V.icon('activity'), `${s.ram} GB RAM`),
          h('span', { class: 'chip' }, V.icon('play'), `Last played: ${V.fmt.ago(prof.lastPlayed)}`),
        ] : [];

        const updates = V.state.updates > 0 ? h('div', { class: 'banner' }, V.icon('download'), h('span', null, `${V.state.updates} mod update${V.state.updates > 1 ? 's' : ''} available for this profile`),
          h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('mods:updateAll'); V.state.updates = 0; V.toast(`Updated ${r.length} mod${r.length === 1 ? '' : 's'}`, 'ok'); renderDock(); }) }, 'Update all')) : null;

        const log = h('details', { class: 'log', onToggle: (e) => { logOpen = e.target.open; } }, h('summary', null, 'Game output'), h('pre', { id: 'home-log', 'aria-live': 'off' }, V.gameLog.slice(-300).join('\n')));
        log.open = logOpen === null ? g !== 'idle' : logOpen;
        const pre = V.$('pre', log);
        setTimeout(() => { pre.scrollTop = pre.scrollHeight; });

        barHost = h('div', { class: 'bar-host' });
        dock.replaceChildren(
          updates,
          h('div', { class: 'chips' }, chips),
          h('div', { class: 'launch-row' }, select, main, stop),
          barHost,
          V.state.status && g === 'idle' && !launching ? h('p', { class: 'status-line', role: 'status' }, V.state.status) : null,
          log);
        renderBar();
      }

      // Progress updates arrive many times a second, so only the bar is redrawn for them.
      let barHost = null;
      let logOpen = null;
      function renderBar() {
        if (!barHost) return;
        const t = [...V.tasks.values()][0];
        barHost.replaceChildren(t ? h('div', { class: 'progress-row' }, h('span', null, t.label), h('div', { class: 'bar' }, h('i', { style: { width: t.total ? `${Math.min(100, (t.received / t.total) * 100)}%` : '30%' } }))) : '');
      }

      const refresh = () => { renderGate(); renderDock(); drawPlayer(); };
      for (const ev of ['accounts', 'profiles', 'settings', 'game', 'status']) V.on(ev, () => { if (V.current === 'home') renderDock(); if (ev === 'accounts') renderGate(); });
      V.on('tasks', () => { if (V.current === 'home') renderBar(); });
      V.on('player', drawPlayer);
      const own = () => document.documentElement.dataset.bg === 'plain';
      V.on('theme', () => { if (own()) V.drawLandscape(bg); });
      V.on('gamelog', (lines) => { const pre = V.$('#home-log'); if (pre) { pre.append(document.createTextNode(lines.join('\n') + '\n')); pre.scrollTop = pre.scrollHeight; } });
      new ResizeObserver(() => { if (!el.hidden && own()) V.drawLandscape(bg); }).observe(stage);
      this.refresh = refresh;

      V.call('news:list').then((items) => {
        newsList.replaceChildren();
        if (!items.length) { newsList.append(V.empty('No news right now', 'News needs an internet connection.')); return; }
        for (const n of items) {
          const img = n.image ? h('img', { src: n.image, alt: '', loading: 'lazy' }) : null;
          if (img) img.addEventListener('error', () => img.remove());
          const card = h('article', { class: 'news-card' + (n.link ? ' link' : ''), tabindex: n.link ? '0' : null, role: n.link ? 'link' : null },
            img, h('div', { class: 'news-body' }, h('strong', null, n.title), n.text ? h('p', null, n.text) : null, n.date ? h('small', null, V.fmt.date(n.date)) : null));
          if (n.link) {
            const open = () => V.call('shell:link', n.link).catch(V.error);
            card.addEventListener('click', open);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
          }
          newsList.append(card);
        }
      }).catch(() => { newsList.replaceChildren(V.empty('No news right now', 'News needs an internet connection.')); });
    },

    async show() {
      this.refresh();
      if (document.documentElement.dataset.bg === 'plain') requestAnimationFrame(() => V.drawLandscape(V.$('#page-home canvas.bg')));
      V.refreshProfiles().catch(V.error);
      const s = V.state.settings;
      const prof = V.profile();
      if (s.modUpdates !== 'off' && prof && prof.loader !== 'vanilla' && prof.modCount) {
        try { V.state.updates = (await V.call('mods:checkUpdates')).length; } catch { V.state.updates = 0; }
        V.emit('status', V.state.status);
      }
    },
  });
})();
