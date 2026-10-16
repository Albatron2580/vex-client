// Screenshots and logs for the selected profile.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  function screenshotsView() {
    const box = h('div');
    let shown = 60;

    async function load() {
      await V.load(box, async () => {
        const shots = await V.call('media:screenshots');
        const grid = h('div', { class: 'grid shots' });
        for (const s of shots.slice(0, shown)) {
          grid.append(h('figure', { class: 'shot' },
            h('button', { class: 'shot-btn', 'aria-label': `Open ${s.name}`, onClick: () => open(s) }, h('img', { src: s.url, alt: s.name, loading: 'lazy', decoding: 'async' })),
            h('figcaption', null, h('span', null, new Date(s.time).toLocaleString()))));
        }
        return h('div', null,
          h('div', { class: 'toolbar' },
            h('span', { class: 'dim' }, `${shots.length} screenshot${shots.length === 1 ? '' : 's'}`),
            h('span', { class: 'grow' }),
            h('button', { class: 'btn sm', onClick: load }, V.icon('refresh'), 'Refresh'),
            h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'screenshots').catch(V.error) }, V.icon('folder'), 'Open folder')),
          shots.length ? grid : V.empty('No screenshots yet', 'Press F2 in the game to take one. It shows up here.'),
          shots.length > shown ? h('div', { class: 'more' }, h('button', { class: 'btn', onClick: () => { shown += 60; load(); } }, `Show more (${shots.length - shown} left)`)) : null);
      });
    }

    function open(s) {
      V.modal({
        title: s.name,
        wide: true,
        body: h('img', { class: 'shot-big', src: s.url, alt: s.name }),
        actions: [
          { label: 'Close' },
          {
            label: 'Delete', kind: 'danger',
            onClick: async () => {
              await V.call('media:deleteShot', s.name);
              V.toast('Screenshot deleted', 'ok');
              load();
            },
          },
        ],
      });
    }
    load();
    return box;
  }

  function logsView() {
    const box = h('div');
    let current = '';
    let text = '';
    const view = h('pre', { class: 'logview', tabindex: '0', 'aria-label': 'Log contents' });
    const onlyProblems = h('input', { type: 'checkbox', onChange: paint });

    function paint() {
      const lines = text.split('\n');
      const shown = onlyProblems.checked ? lines.filter((l) => /warn|error|exception|fatal|caused by/i.test(l)) : lines;
      view.textContent = shown.join('\n') || (text ? 'No warnings or errors in this log.' : 'This log is empty.');
      view.scrollTop = view.scrollHeight;
    }

    async function read() {
      try { text = await V.call('media:readLog', current); } catch (e) { text = ''; V.error(e); }
      paint();
    }

    async function load() {
      await V.load(box, async () => {
        const logs = await V.call('media:logs');
        if (!logs.length) return V.empty('No logs yet', 'Start Minecraft once and its logs will appear here.');
        if (!logs.some((l) => l.id === current)) current = logs[0].id;
        const sel = V.select(logs.map((l) => ({ value: l.id, label: l.label })), current, (v) => { current = v; read(); }, { 'aria-label': 'Log file' });
        setTimeout(read);
        return h('div', null,
          h('div', { class: 'toolbar' }, sel,
            h('label', { class: 'check' }, onlyProblems, h('span', null, 'Only warnings and errors')),
            h('span', { class: 'grow' }),
            h('button', { class: 'btn sm', onClick: read }, V.icon('refresh'), 'Refresh'),
            h('button', { class: 'btn sm', onClick: () => V.call('app:copy', text).then(() => V.toast('Log copied', 'ok')).catch(V.error) }, V.icon('copy'), 'Copy'),
            h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'logs').catch(V.error) }, V.icon('folder'), 'Open folder')),
          view);
      });
    }
    load();
    return box;
  }

  V.register({
    id: 'media',
    title: 'Screens & logs',
    icon: 'camera',
    group: 'main',

    build(el) { this.host = h('div'); el.append(this.host); },

    async show() {
      await V.refreshProfiles();
      const p = V.profile();
      this.host.replaceChildren(
        V.pageHeader('Screenshots and logs', p ? `From profile "${p.name}".` : ''),
        V.tabs([
          { id: 'shots', label: 'Screenshots', render: screenshotsView },
          { id: 'logs', label: 'Logs', render: logsView },
        ]));
    },
  });
})();
