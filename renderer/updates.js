// Launcher updates: the Settings card, the header pill and critical-update notices.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  V.state.updater = null;
  let lastNotified = '';

  const KIND = { major: 'Major update', minor: 'Feature update', patch: 'Bug-fix update', rollback: 'Previous version' };
  const ago = (ts) => (ts ? V.fmt.ago(ts) : 'never');

  async function refresh() {
    try { V.state.updater = await V.call('updater:state'); } catch { V.state.updater = null; }
    V.emit('updater');
  }

  function onState(s) {
    V.state.updater = { ...(V.state.updater || {}), ...s };
    V.emit('updater');
    const u = V.state.updater;
    const key = `${u.status}:${u.latest && u.latest.version}`;
    if (key === lastNotified) return;
    if (u.status === 'ready') {
      lastNotified = key;
      V.toast(V.state.game.state === 'running'
        ? `Vex Client ${u.latest.version} is downloaded and verified. It installs after you close Minecraft. Press Restart in Settings, or just close the launcher.`
        : `Vex Client ${u.latest.version} is ready. Restart to update (Settings → Launcher updates), or it installs when you close the launcher.`, 'ok');
    } else if (u.status === 'available' && u.critical) {
      lastNotified = key;
      V.toast(`Important update ${u.latest.version} is available: ${firstLine(u.latest.notes) || 'security or compatibility fix'}.`, 'error');
    }
  }
  const firstLine = (t) => String(t || '').split('\n').map((l) => l.replace(/^[-*#\s]+/, '').trim()).find(Boolean) || '';

  // header pill: visible when an update is downloading or ready
  function pill() {
    const top = V.$('#top');
    let el = V.$('#update-pill');
    if (!el) {
      el = h('button', { id: 'update-pill', class: 'chip-btn update-pill', hidden: true, onClick: () => { V.go('settings'); setTimeout(() => { const c = V.$('#updates-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); } });
      top.insertBefore(el, V.$('#profile-chip'));
    }
    const u = V.state.updater;
    const show = u && (u.status === 'downloading' || u.status === 'verifying' || u.status === 'ready' || (u.status === 'available' && u.critical));
    el.hidden = !show;
    if (!show) return;
    el.classList.toggle('critical', !!u.critical);
    el.replaceChildren(V.icon(u.status === 'ready' ? 'refresh' : u.critical ? 'alert' : 'download'),
      h('span', null, u.status === 'ready' ? `Update ${u.latest.version} ready` : u.status === 'verifying' ? 'Verifying update…' : u.status === 'downloading' ? `Updating ${u.progress ? u.progress.percent : 0}%` : `Important update ${u.latest.version}`));
  }

  function notes(text) {
    // Release notes are shown as plain text (never as HTML): headings, bullets and paragraphs.
    const box = h('div', { class: 'notes' });
    for (const raw of String(text || '').split('\n')) {
      const l = raw.trim();
      if (!l) continue;
      if (/^#{1,6}\s/.test(l)) box.append(h('strong', { class: 'notes-h' }, l.replace(/^#+\s*/, '')));
      else if (/^[-*]\s/.test(l)) box.append(h('div', { class: 'notes-li' }, '• ', l.replace(/^[-*]\s*/, '').replace(/\*\*/g, '')));
      else box.append(h('p', null, l.replace(/\*\*/g, '')));
    }
    if (!box.childNodes.length) box.append(h('p', { class: 'dim' }, 'No notes for this release.'));
    return box;
  }

  V.renderNotes = notes;

  V.updaterCard = () => {
    const card = h('section', { class: 'card wide', id: 'updates-card' });
    const render = () => {
      const u = V.state.updater;
      const s = V.state.settings;
      const running = V.state.game.state !== 'idle';
      if (!u) { card.replaceChildren(h('h3', null, 'Launcher updates'), V.loading()); return; }
      const latest = u.latest;
      const newer = latest && u.status !== 'up-to-date';
      let statusText = {
        idle: 'Not checked yet.',
        checking: 'Checking for updates…',
        'up-to-date': 'You have the latest version.',
        available: newer ? `Version ${latest.version} is available.` : '',
        downloading: `Downloading ${latest ? latest.version : ''}…`,
        verifying: 'Checking the download\'s signature and checksum…',
        ready: `Version ${latest && latest.version} is downloaded and verified.`,
        skipped: `You skipped version ${latest && latest.version}.`,
        error: u.error,
      }[u.status] || '';
      if (u.status === 'error' && !u.configured) statusText = u.error;

      const badge = u.status === 'up-to-date' ? V.badge('Up to date', 'ok') : u.status === 'ready' ? V.badge('Ready to install', 'accent') : u.status === 'error' ? V.badge('Problem', 'warn') : newer ? V.badge(u.critical ? 'Critical' : KIND[u.kind] || 'Update', u.critical ? 'warn' : 'accent') : null;
      const p = u.progress;
      const bar = (u.status === 'downloading' || u.status === 'verifying') ? h('div', { class: 'progress-row' },
        h('span', null, u.status === 'verifying' ? 'Verifying…' : p ? `${p.percent}% · ${V.fmt.bytes(p.transferred)} of ${V.fmt.bytes(p.total)}${p.bytesPerSecond ? ` · ${V.fmt.bytes(p.bytesPerSecond)}/s` : ''}` : 'Starting…'),
        h('div', { class: 'bar' }, h('i', { style: { width: `${u.status === 'verifying' ? 100 : p ? p.percent : 2}%` } }))) : null;

      const actions = [];
      const busy = u.status === 'checking' || u.status === 'downloading' || u.status === 'verifying';
      actions.push(h('button', { class: 'btn sm', disabled: busy || !u.configured, onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('updater:check'); onState(r); if (r.status === 'up-to-date') V.toast('Vex Client is up to date', 'ok'); }) }, V.icon('refresh'), 'Check for updates'));
      if (newer && (u.status === 'available' || u.status === 'skipped' || u.status === 'error') && u.supported) {
        actions.push(h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => onState(await V.call('updater:download'))) }, V.icon('download'), `Download ${latest.version}`));
      }
      if (u.status === 'ready') {
        actions.push(h('button', { class: 'btn sm primary', disabled: running, title: running ? 'Close Minecraft first. Your game is never interrupted.' : '', onClick: (e) => V.busy(e.currentTarget, () => V.call('updater:install')) }, V.icon('refresh'), 'Restart to update'));
      }
      if (newer && !u.critical && (u.status === 'available' || u.status === 'ready')) {
        actions.push(h('button', { class: 'btn sm ghost', onClick: (e) => V.busy(e.currentTarget, async () => { onState(await V.call('updater:skip')); V.toast(`Version ${latest.version} skipped. You'll be told about the next one.`, 'info'); }) }, 'Skip this version'));
      }
      if (u.rollbackTarget && u.supported) {
        actions.push(h('button', { class: 'btn sm ghost', title: 'Reinstall the last version that worked on this PC', onClick: async (e) => {
          if (!(await V.confirm({ title: `Go back to ${u.rollbackTarget}?`, text: 'The older version is downloaded, checked against its signed release and installed. Your settings, sign-ins, profiles and worlds stay as they are.', confirm: 'Reinstall' }))) return;
          V.busy(e.currentTarget, async () => onState(await V.call('updater:rollback', u.rollbackTarget)));
        } }, `Reinstall ${u.rollbackTarget}`));
      }
      if (u.configured) actions.push(h('button', { class: 'btn sm ghost', onClick: () => V.call('updater:openReleases').catch(V.error) }, V.icon('external'), 'All releases'));

      const sourceNote = !u.supported ? h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, 'This copy runs from source (Start Vex Client.bat), so it can check for updates but cannot install them. Install Vex Client with "Vex-Client-Setup.exe" from the Releases page to get automatic updates. Your settings and sign-ins carry over.')) : null;
      const critical = newer && u.critical ? h('div', { class: 'banner warn' }, V.icon('alert'), h('span', null, h('strong', null, 'Important update. '), u.status === 'ready' ? 'It is ready: restart when you can.' : 'It downloads automatically, even when automatic downloads are off.')) : null;
      const doneNote = u.startInfo && u.startInfo.upgraded ? h('div', { class: 'banner ok' }, V.icon('check'), h('span', null, `Updated from ${u.startInfo.previous} to ${u.current}. Your settings were backed up first.`)) : null;

      const history = (u.history || []).filter((r) => !latest || r.version !== latest.version).slice(0, 6);
      card.replaceChildren(
        h('div', { class: 'card-top' }, h('h3', null, 'Launcher updates'), badge),
        doneNote, sourceNote, critical,
        h('div', { class: 'update-grid' },
          h('div', { class: 'kv' }, h('span', { class: 'dim' }, 'Installed'), h('strong', null, u.current)),
          h('div', { class: 'kv' }, h('span', { class: 'dim' }, 'Latest'), h('strong', null, latest ? latest.version : '—'), latest && latest.releaseDate ? h('span', { class: 'dim small' }, ` · ${V.fmt.date(latest.releaseDate)}`) : null),
          h('div', { class: 'kv' }, h('span', { class: 'dim' }, 'Status'), h('span', { role: 'status' }, statusText)),
          h('div', { class: 'kv' }, h('span', { class: 'dim' }, 'Last check'), h('span', null, ago(u.lastCheck)))),
        bar,
        h('div', { class: 'row', style: { margin: '12px 0' } }, actions),
        h('div', { class: 'list tight' },
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Check automatically'), h('div', { class: 'dim small' }, 'When the launcher starts and every 4 hours while it is open.')),
            V.switch(s.autoCheckUpdates !== false, (on) => V.saveSettings({ autoCheckUpdates: on }).then(() => V.toast(on ? 'Automatic checks on' : 'Automatic checks off', 'ok')).catch(V.error), 'Check for updates automatically')),
          h('div', { class: 'row-item' }, h('div', { class: 'grow' }, h('strong', null, 'Download automatically'), h('div', { class: 'dim small' }, 'Downloads in the background and installs when you restart or close the launcher. Never while you play. Critical updates always download.')),
            V.switch(s.autoDownloadUpdates !== false, (on) => V.saveSettings({ autoDownloadUpdates: on }).then(() => V.toast(on ? 'Automatic downloads on' : 'Automatic downloads off', 'ok')).catch(V.error), 'Download updates automatically'))),
        latest && newer ? h('details', { class: 'more-box', open: true }, h('summary', null, `What's new in ${latest.version}`), notes(latest.notes)) : null,
        history.length ? h('details', { class: 'more-box' }, h('summary', null, 'Changelog'),
          history.map((r) => h('div', { class: 'changelog-entry' }, h('div', { class: 'row' }, h('strong', null, r.version), h('span', { class: 'dim small' }, V.fmt.date(r.date))), notes(r.notes)))) : null);
    };
    render();
    const off = () => { if (document.body.contains(card)) render(); };
    V.on('updater', off);
    V.on('game', off);
    if (!V.state.updater) refresh();
    return card;
  };

  V.on('updater', pill);
  V.on('game', pill);
  window.vex.onEvent((e) => { if (e.type === 'updater') onState(e.state); });
  V.refreshUpdater = refresh;
})();
