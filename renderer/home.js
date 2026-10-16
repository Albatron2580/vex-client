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
      const newsList = h('div', { class: 'news-list' }, V.loading('Loading news…'));

      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
        h('button', { class: 'on', onClick: () => setBack(false) }, 'Front'),
        h('button', { onClick: () => setBack(true) }, 'Back'));
      const setBack = (b) => { back = b; V.$$('button', seg).forEach((x, i) => x.classList.toggle('on', (i === 1) === b)); drawPlayer(); };
      const anim = h('label', { class: 'switch-row' }, h('span', null, 'Animation'), V.switch(true, (on) => { animate = on; stage.classList.toggle('anim', on); }, 'Skin animation'));

      const stage = h('div', { class: 'stage anim' },
        bg,
        h('div', { class: 'stage-top' }, seg, anim),
        h('div', { class: 'figure' }, tag, figure),
        gate,
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
        if (V.state.active) return;
        gate.append(
          h('strong', null, 'Sign in to play'),
          h('p', null, 'Vex Client signs you in through Microsoft, the same way the official launcher does. You need an account that owns Minecraft: Java Edition.'),
          h('button', { class: 'btn primary', onClick: () => V.go('account') }, V.icon('user'), 'Go to Account'));
      }

      let launching = false;
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
            onClick: async () => {
              launching = true; V.gameLog.length = 0; renderDock();
              try { await V.call('game:launch'); } catch (e) { V.setStatus(e.message); V.error(e); }
              launching = false; renderDock();
            },
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
