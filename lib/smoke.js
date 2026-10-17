// Smoke test of the real app (run in CI: VEX_SMOKE=<out dir> electron .).
// Opens every page in the real Electron window with the real main process, collects every renderer
// error, console error and failed IPC call, takes a screenshot of each page and exits 0 (clean) or 1.
const fs = require('fs');
const path = require('path');

function run(app, win, out) {
  fs.mkdirSync(out, { recursive: true });
  const problems = [];
  const log = [];
  win.webContents.on('console-message', (e, lvl, msg, ln, src) => {
    // Electron 35+ puts the details on the event object; older versions pass them as arguments.
    const level = typeof e.level === 'string' ? e.level : ['verbose', 'info', 'warning', 'error'][lvl] || String(lvl);
    const message = e.message ?? msg;
    const text = `${message} (${path.basename(e.sourceId || src || '')}:${e.lineNumber ?? ln})`;
    log.push(`[${level}] ${text}`);
    // Font downloads and network lookups can fail on a CI machine; that is not a bug.
    if (level === 'error' && !/fonts\.g|ERR_INTERNET|ERR_NAME|net::/.test(message)) problems.push('console: ' + text);
  });
  win.webContents.on('render-process-gone', (_e, d) => problems.push('renderer crashed: ' + d.reason));
  win.webContents.on('preload-error', (_e, p, err) => problems.push('preload: ' + err.message));

  const js = (code) => win.webContents.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const finish = (code) => {
    fs.writeFileSync(path.join(out, 'console.log'), log.join('\n'));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: code === 0, problems }, null, 2));
    console.log(problems.length ? 'SMOKE PROBLEMS:\n' + problems.join('\n') : 'SMOKE OK');
    app.exit(code);
  };
  setTimeout(() => { problems.push('timed out'); finish(1); }, 120000);

  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(1500);
      // route page errors (normally shown as a toast) into the report too
      await js(`window.__smoke = []; (() => { const e = V.error; V.error = (x) => { window.__smoke.push(String(x && x.stack || x)); return e(x); }; })(); true`);
      const pages = await js(`V.pages.filter((p) => !p.visible || p.visible()).map((p) => p.id)`);
      for (const [w, hgt] of [[1200, 760], [940, 600]]) {
        win.setContentSize(w, hgt);
        await wait(300);
        for (const id of pages) {
          try { await js(`V.go(${JSON.stringify(id)}); true`); } catch (e) { problems.push(`page ${id}: opening it threw (see console)`); }
          await wait(900);
          const overflow = await js('document.documentElement.scrollWidth > innerWidth + 1');
          if (overflow) problems.push(`page ${id} scrolls sideways at ${w}px`);
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(out, `${id}-${w}.png`), img.toPNG());
        }
      }
      // FPS of the animated background (requestAnimationFrame rate over 2 s)
      await js(`V.go('home'); true`);
      const fps = await js(`new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); })`);
      log.push('frames per second while idle on Home: ' + fps);
      const errs = await js('window.__smoke');
      for (const e of errs) problems.push('page error: ' + e);
      finish(problems.length ? 1 : 0);
    } catch (e) {
      problems.push('smoke script: ' + (e.stack || e));
      finish(1);
    }
  });
}

module.exports = { run };
