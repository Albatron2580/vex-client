// Boot: builds the sidebar and pages, wires events from the main process, loads first data.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  // ---------- sidebar and pages ----------
  const navMain = V.$('#nav-main');
  const navBottom = V.$('#nav-bottom');
  const pagesEl = V.$('#pages');
  for (const p of V.pages) {
    const btn = h('button', { class: 'nav-btn', dataset: { nav: p.id }, title: p.title, onClick: () => V.go(p.id) }, V.icon(p.icon), h('span', null, p.title));
    (p.group === 'bottom' ? navBottom : navMain).append(btn);
    const sec = h('section', { class: 'page', id: `page-${p.id}`, hidden: true, 'aria-label': p.title });
    pagesEl.append(sec);
    try { p.build(sec); } catch (e) { console.error(`Page ${p.id} failed to build`, e); sec.append(V.errorBox(e.message)); }
  }

  // Pages with visible() (the Admin panel) only show in the sidebar for the right accounts.
  const syncNav = () => V.pages.forEach((p) => { if (p.visible) V.$(`[data-nav="${p.id}"]`).hidden = !p.visible(); });
  V.on('accounts', syncNav);
  syncNav();

  // ---------- header ----------
  const profileChip = V.$('#profile-chip');
  const acctChip = V.$('#acct-chip');
  const activity = V.$('#activity');
  profileChip.addEventListener('click', () => V.go('profiles'));
  acctChip.addEventListener('click', () => V.go('account'));

  function renderChips() {
    const p = V.profile();
    profileChip.replaceChildren(V.icon('layers'), h('span', null, p ? `${p.name} · ${V.fmt.loader(p.loader)} ${p.version}` : 'No profile'));
    const head = h('canvas', { class: 'head', 'aria-hidden': 'true' });
    V.drawHead(head, V.player.skin, 28);
    const acc = V.state.active;
    acctChip.replaceChildren(head, h('span', null, acc ? acc.name : 'Sign in'));
  }
  function renderActivity() {
    const t = [...V.tasks.values()][0];
    let text = '';
    if (t) text = t.total ? `${t.label} · ${Math.min(100, Math.round((t.received / t.total) * 100))}%` : t.label;
    else if (V.state.status && V.state.game.state !== 'idle') text = V.state.status;
    activity.hidden = !text;
    activity.replaceChildren(V.spinner(), h('span', null, text));
  }
  ['profiles', 'accounts', 'player'].forEach((e) => V.on(e, renderChips));
  ['tasks', 'status', 'game'].forEach((e) => V.on(e, renderActivity));

  // ---------- events from the main process ----------
  window.vex.onEvent((e) => {
    switch (e.type) {
      case 'task': V.onTask(e); break;
      case 'status': V.setStatus(e.text); break;
      case 'log':
        for (const l of e.lines) V.gameLog.push(l);
        if (V.gameLog.length > 2000) V.gameLog.splice(0, V.gameLog.length - 2000);
        V.emit('gamelog', e.lines);
        break;
      case 'game':
        V.state.game = { state: e.state, profileId: e.profileId };
        if (e.state === 'closed') {
          V.setStatus('');
          if (e.crashed) V.toast(`Minecraft closed unexpectedly (code ${e.code}). Open Screens & logs to see why.`, 'error');
          else V.toast('Minecraft closed.', 'info');
          V.refreshProfiles().catch(() => {});
        }
        if (e.state === 'idle') V.setStatus(V.state.status);
        if (V.fx) V.fx.pause(e.state === 'running' || e.state === 'starting'); // leave the GPU to Minecraft
        V.emit('game');
        break;
      case 'mods':
        if (e.applied && e.applied.length) V.toast(`Minecraft closed, so the queued mod changes were applied: ${e.applied.join(', ')}.`, 'ok');
        if (e.failed && e.failed.length) V.toast(`Some queued mod changes could not be applied: ${e.failed.join(' · ')}`, 'error');
        V.refreshProfiles().catch(() => {});
        V.emit('modsApplied', e);
        break;
      default: break;
    }
  });

  // ---------- start ----------
  async function boot() {
    try {
      V.state.settings = await V.call('settings:get');
      try { V.themeAssets = (await V.call('themes:assets')) || {}; } catch { V.themeAssets = {}; }
      V.applyTheme();
      V.state.info = await V.call('app:info');
      await V.refreshAccounts();
      await V.refreshProfiles();
      V.refreshPlayer();
      V.state.game = await V.call('game:state');
      if (V.fx) V.fx.pause(V.state.game.state === 'running');
      renderChips();
      V.go('home');
      V.call('app:ready').catch(() => {}); // tells the updater this version starts fine
      if (V.refreshUpdater) V.refreshUpdater();
    } catch (e) {
      console.error(e);
      pagesEl.replaceChildren(h('div', { class: 'boot-error' }, V.errorBox(`Vex Client could not start: ${e.message}`, () => location.reload())));
    }
  }
  boot();
})();
