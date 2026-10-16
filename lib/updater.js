// Launcher self-update.
//
// How it works (Windows, installed build):
//   1. Download vex-release.json + .sig from the latest GitHub release and verify the Ed25519
//      signature with the public key built into this app (package.json -> vexUpdate.publicKey).
//   2. If the signed version is newer: electron-updater (the updater electron-builder ships for
//      NSIS installers) downloads the installer in the background, resumes/reuses cached
//      downloads, and checks it against the SHA-512 in latest.yml.
//   3. We hash the downloaded installer again ourselves and compare it with the SHA-512 in the
//      *signed* manifest. Only then is the update marked ready.
//   4. It installs when the user presses "Restart to update", or when the launcher is closed while
//      Minecraft isn't running. A running game is never interrupted.
// Running from source (npm start / Start Vex Client.bat) can still check for updates and show
// notes, but cannot install them: there is no installed app to replace.
const fs = require('fs');
const crypto = require('crypto');
const semver = require('./semver');
const release = require('./release');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const RETRY_MS = [60 * 1000, 5 * 60 * 1000, 20 * 60 * 1000];

function create(deps) {
  // deps: { version, config:{owner,repo,publicKey}, packaged, getSettings, saveSettings, gameRunning, emit,
  //         loadAutoUpdater?, fetch?, log? }
  const cfg = deps.config || {};
  const configured = !!(cfg.owner && cfg.repo && !/YOUR_|REPLACE/i.test(`${cfg.owner}${cfg.repo}`) && release.publicKeyFrom(cfg.publicKey));
  const base = cfg.baseUrl || `https://github.com/${cfg.owner}/${cfg.repo}/releases`;
  const doFetch = deps.fetch || ((u, o) => fetch(u, o));
  const log = deps.log || (() => {});

  const st = {
    supported: !!deps.packaged,
    configured,
    current: deps.version,
    status: 'idle', // idle | checking | up-to-date | available | downloading | verifying | ready | error | skipped
    latest: null, // verified manifest
    kind: '', // major | minor | patch
    critical: false,
    progress: null, // { percent, transferred, total, bytesPerSecond }
    error: '',
    lastCheck: 0,
    history: [], // release notes of recent releases
    rollback: '',
    installOnQuit: false,
  };
  let au = null;
  let busy = null; // the running check/download, so two never overlap
  let retries = 0;
  let timer = null;
  let readyFile = '';

  const send = () => deps.emit && deps.emit({ type: 'updater', state: snapshot() });
  const set = (patch) => { Object.assign(st, patch); send(); };
  const snapshot = () => ({ ...st });

  function updaterInstance() {
    if (au) return au;
    if (!deps.packaged) return null;
    const mod = deps.loadAutoUpdater ? deps.loadAutoUpdater() : require('electron-updater');
    au = mod.autoUpdater;
    au.autoDownload = false; // we download only after the signed manifest says so
    au.autoInstallOnAppQuit = false; // and install only after our own verification
    au.allowDowngrade = false;
    au.allowPrerelease = false;
    au.logger = { info: log, warn: log, error: log, debug: () => {} };
    au.on('error', (e) => log(`electron-updater: ${e && e.message}`)); // errors also reach us through the rejected promises
    au.on('download-progress', (p) => set({ status: 'downloading', progress: { percent: Math.round(p.percent || 0), transferred: p.transferred || 0, total: p.total || 0, bytesPerSecond: p.bytesPerSecond || 0 } }));
    return au;
  }

  async function getBytes(url) {
    if (!/^https:\/\//.test(url) && !(cfg.allowHttpForTests && /^http:\/\/127\.0\.0\.1[:/]/.test(url))) throw new Error('Updates are only downloaded over HTTPS.');
    let res;
    try {
      res = await doFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': `VexClient/${deps.version}` } });
    } catch (e) {
      const err = new Error("Can't reach the update server. Check your internet connection.");
      err.offline = true;
      throw err;
    }
    if (res.status === 404) { const e = new Error('No published release was found yet.'); e.status = 404; throw e; }
    if (!res.ok) throw new Error(`The update server answered ${res.status}.`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Signed manifest of the latest release (or of a specific version for rollback).
  async function fetchManifest(version) {
    const dir = version ? `${base}/download/v${version}` : `${base}/latest/download`;
    const [bytes, sig] = await Promise.all([getBytes(`${dir}/vex-release.json`), getBytes(`${dir}/vex-release.json.sig`)]);
    return release.verify(bytes, sig.toString('utf8'), cfg.publicKey);
  }

  async function loadHistory() {
    if (!cfg.owner) return;
    try {
      const api = cfg.apiUrl || `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases?per_page=10`;
      const list = JSON.parse((await getBytes(api)).toString('utf8'));
      st.history = (Array.isArray(list) ? list : []).filter((r) => !r.draft && !r.prerelease && semver.valid(r.tag_name)).map((r) => ({
        version: r.tag_name.replace(/^v/, ''), date: r.published_at || '', notes: String(r.body || '').slice(0, 6000),
      }));
    } catch { /* the changelog is a nice-to-have */ }
  }

  function sha512b64(file) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha512');
      fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('base64')));
    });
  }

  async function downloadAndVerify(m) {
    const u = updaterInstance();
    if (!u) return; // source build: notify only
    set({ status: 'downloading', progress: { percent: 0, transferred: 0, total: m.files[0].size, bytesPerSecond: 0 }, error: '' });
    const check = await u.checkForUpdates();
    const info = check && check.updateInfo;
    if (!info || info.version !== m.version) throw new Error(`The release files don't match the signed release (${info ? info.version : 'none'} vs ${m.version}). Nothing was installed.`);
    const files = await u.downloadUpdate(); // resumes / reuses a finished download of the same file
    const file = Array.isArray(files) ? files.find((f) => /\.exe$/i.test(f)) : '';
    if (!file || !fs.existsSync(file)) throw new Error('The update download did not produce an installer.');
    set({ status: 'verifying' });
    const got = await sha512b64(file);
    if (!m.files.some((f) => f.sha512 === got)) {
      try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
      throw new Error('The downloaded installer does not match the signed release, so it was deleted and not installed.');
    }
    readyFile = file;
    set({ status: 'ready', progress: null, installOnQuit: true });
  }

  // Manual or automatic check. Returns the state.
  function check({ manual = false, download } = {}) {
    if (busy) return busy;
    busy = (async () => {
      if (!configured) {
        set({ status: 'error', error: 'Updates are not set up in this build yet (no GitHub repository or signing key in package.json).' });
        return snapshot();
      }
      if (st.status === 'ready') return snapshot();
      set({ status: 'checking', error: '' });
      try {
        const m = await fetchManifest();
        st.lastCheck = Date.now();
        st.rollback = '';
        if (semver.compare(m.version, deps.version) <= 0) {
          set({ status: 'up-to-date', latest: m, kind: '', critical: false });
          retries = 0;
          return snapshot();
        }
        const critical = m.critical || (m.minimumVersion && semver.compare(deps.version, m.minimumVersion) < 0);
        const kind = semver.diff(deps.version, m.version) || m.type;
        const settings = deps.getSettings();
        set({ latest: m, kind, critical: !!critical });
        if (!critical && !manual && settings.skippedUpdate === m.version) { set({ status: 'skipped' }); return snapshot(); }
        const wantDownload = download !== undefined ? download : critical || settings.autoDownloadUpdates !== false;
        set({ status: 'available' });
        if (wantDownload && st.supported) await downloadAndVerify(m);
        retries = 0;
      } catch (e) {
        st.lastCheck = Date.now();
        set({ status: 'error', progress: null, error: e.message || String(e) });
        log(`update failed: ${e.stack || e}`);
        if (!manual && e.status !== 404 && retries < RETRY_MS.length) { // interrupted / offline: try again later
          const wait = RETRY_MS[retries++];
          setTimeout(() => check({}).catch(() => {}), wait).unref?.();
        }
      }
      await loadHistory();
      send();
      return snapshot();
    })().finally(() => { busy = null; });
    return busy;
  }

  function download() {
    if (!st.latest || semver.compare(st.latest.version, deps.version) <= 0) throw new Error('There is no newer version to download.');
    if (!st.supported) throw new Error('This copy runs from source, so it cannot install updates. Install Vex Client with its setup program to get automatic updates.');
    if (busy) return busy;
    busy = downloadAndVerify(st.latest).catch((e) => set({ status: 'error', progress: null, error: e.message })).then(snapshot).finally(() => { busy = null; });
    return busy;
  }

  // Restart now. Refused while Minecraft runs: the update waits instead.
  function install({ force = false } = {}) {
    if (st.status !== 'ready' || !readyFile) throw new Error('No verified update is ready to install.');
    if (deps.gameRunning() && !force) throw new Error('Minecraft is running. The update installs after you close the game and press Restart, or when you close Vex Client.');
    st.installOnQuit = false;
    updaterInstance().quitAndInstall(true, true); // silent NSIS install, then start the new version
  }

  // Called when the launcher is closing: install a verified update unless a game is running.
  function onQuit() {
    if (st.status === 'ready' && readyFile && st.installOnQuit && !deps.gameRunning()) {
      st.installOnQuit = false;
      try { updaterInstance().quitAndInstall(true, false); return true; } catch (e) { log(`install on quit failed: ${e.message}`); }
    }
    return false;
  }

  function skip() {
    if (!st.latest) return snapshot();
    if (st.critical) throw new Error('This is a critical update and cannot be skipped.');
    deps.saveSettings({ skippedUpdate: st.latest.version });
    set({ status: 'skipped' });
    return snapshot();
  }

  // Reinstall an older, known-good version (after a broken update). Verified the same way.
  async function rollback(version) {
    if (!st.supported) throw new Error('Rollback needs the installed version of Vex Client.');
    if (!semver.valid(version)) throw new Error('Unknown version.');
    const m = await fetchManifest(version);
    if (m.version !== version) throw new Error('The rollback release does not match.');
    const u = updaterInstance();
    u.allowDowngrade = true;
    u.setFeedURL({ provider: 'generic', url: `${base}/download/v${version}` });
    set({ latest: m, kind: 'rollback', critical: false, rollback: version });
    try {
      await downloadAndVerify(m);
    } finally {
      u.allowDowngrade = false;
      u.setFeedURL({ provider: 'github', owner: cfg.owner, repo: cfg.repo });
    }
    return snapshot();
  }

  function start() {
    const s = deps.getSettings();
    if (!configured) { set({ status: 'idle', error: '' }); return; }
    if (s.autoCheckUpdates !== false) setTimeout(() => check({}).catch(() => {}), 8000); // after the UI has loaded
    reschedule();
  }

  function reschedule() {
    clearInterval(timer);
    timer = setInterval(() => { if (deps.getSettings().autoCheckUpdates !== false) check({}).catch(() => {}); }, CHECK_EVERY_MS);
    if (timer.unref) timer.unref();
  }

  return { state: snapshot, check, download, install, onQuit, skip, rollback, start, fetchManifest, _set: set };
}

module.exports = { create };
