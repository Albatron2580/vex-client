// Starts the real Minecraft process through minecraft-launcher-core.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const versions = require('./versions');
const java = require('./java');

let current = null; // { proc, profileId, state, startedAt }

const state = () => (current ? { state: current.state, profileId: current.profileId } : { state: 'idle' });

const logPath = () => path.join(store.getBaseDir(), 'launcher.log');

function rotateLog() {
  try {
    if (fs.statSync(logPath()).size > 2 * 1024 * 1024) fs.renameSync(logPath(), path.join(store.getBaseDir(), 'launcher.old.log'));
  } catch { /* no log yet */ }
}

function appendLog(line) {
  try { fs.appendFileSync(logPath(), line + '\n'); } catch { /* disk problems should not stop a launch */ }
}

// Game output arrives in bursts; send it to the UI in batches.
function batcher(emit) {
  let buf = [];
  let timer = null;
  const flush = () => { timer = null; if (buf.length) { emit({ type: 'log', lines: buf }); buf = []; } };
  return {
    push(line) { buf.push(line); if (!timer) timer = setTimeout(flush, 150); },
    flush() { if (timer) clearTimeout(timer); flush(); },
  };
}

async function launch({ profile, session, emit, beforeLaunch, onStart, join, perf = {} }) {
  if (current) throw new Error('Minecraft is already starting or running.');
  if (!session) throw new Error('Sign in with a Microsoft account that owns Minecraft: Java Edition first.');
  current = { proc: null, profileId: profile.id, state: 'starting', startedAt: Date.now() };
  const send = (s, extra = {}) => emit({ type: 'game', state: s, profileId: profile.id, ...extra });
  const status = (text) => emit({ type: 'status', text });
  const out = batcher(emit);
  const recent = [];
  const log = (line) => {
    const l = String(line).trimEnd();
    if (!l) return;
    appendLog(l);
    out.push(l);
  };

  send('starting');
  rotateLog();
  appendLog(`\n=== ${new Date().toISOString()} launching "${profile.name}" (${profile.loader} ${profile.version}) ===`);
  try {
    const s = store.settings();
    const root = store.gameRoot();

    status('Checking Java…');
    const meta = await versions.versionMeta(profile.version);
    const j = await java.pick(versions.javaMajor(meta), s.javaPath);
    log(`Using Java ${j.major} (${j.exe})`);

    if (profile.loader !== 'vanilla') status(`Preparing ${profile.loader}…`);
    const custom = await versions.prepareLoader(profile, {
      root,
      javaExe: j.exe,
      log: (l) => { log(l); status(l.length < 90 ? l : 'Installing the mod loader…'); },
      onProgress: (received, total) => emit({ type: 'task', id: 'loader', label: 'Mod loader installer', received, total }),
    });
    emit({ type: 'task', id: 'loader', label: 'Mod loader installer', done: true });

    if (beforeLaunch) await beforeLaunch(status);
    if (onStart) onStart(); // the mods folder is final from here until the game closes

    const gameDir = store.profileDir(profile.id);
    const { Client } = require('minecraft-launcher-core');
    const launcher = new Client();
    launcher.on('debug', (l) => { recent.push(String(l)); if (recent.length > 40) recent.shift(); log(l); });
    launcher.on('data', (l) => log(l));
    launcher.on('progress', (p) => {
      if (!p || !p.total) return;
      emit({ type: 'task', id: 'game', label: `Downloading game files (${p.type || 'files'})`, received: p.task, total: p.total, done: p.task >= p.total });
    });

    status('Downloading and starting Minecraft…');
    const opts = {
      authorization: session,
      root,
      javaPath: j.exe,
      version: { number: profile.version, type: meta.type || 'release', ...(custom ? { custom } : {}) },
      memory: { max: `${perf.ram || s.ram}G`, min: `${Math.min(2, perf.ram || s.ram)}G` },
      ...(perf.jvmArgs && perf.jvmArgs.length ? { customArgs: perf.jvmArgs } : {}),
      window: { width: String(s.width), height: String(s.height), fullscreen: s.windowMode === 'fullscreen' },
      overrides: { gameDirectory: gameDir },
    };
    if (join) {
      // Straight into the server: --quickPlayMultiplayer from 1.20, --server/--port before that.
      const [a, b] = String(profile.version).split('.').map(Number);
      const modern = !/^\d+\.\d+/.test(profile.version) || a > 1 || (a === 1 && b >= 20);
      opts.quickPlay = { type: modern ? 'multiplayer' : 'legacy', identifier: `${join.host}:${join.port}` };
      log(`Joining ${join.host}:${join.port} on start`);
    }
    const proc = await launcher.launch(opts);
    if (!proc) {
      const hint = recent.slice(-3).join(' | ');
      throw new Error(`Minecraft did not start.${hint ? ' ' + hint : ''} Open Screens & logs for details.`);
    }
    current.proc = proc;
    current.state = 'running';
    store.updateProfile(profile.id, { lastPlayed: Date.now() });
    emit({ type: 'task', id: 'game', label: 'Downloading game files', done: true });
    status('Minecraft is running.');
    send('running');

    proc.on('error', (e) => log(`Process error: ${e.message}`));
    proc.on('close', (code) => {
      const ranFor = Date.now() - current.startedAt;
      out.flush();
      current = null;
      appendLog(`=== Minecraft closed with code ${code} ===`);
      send('closed', { code, crashed: code !== 0 && code !== null && ranFor < 90 * 1000 });
    });
  } catch (e) {
    out.flush();
    current = null;
    appendLog(`ERROR: ${e.message}`);
    send('idle');
    throw e;
  }
}

function stop() {
  if (!current || !current.proc) throw new Error('Minecraft is not running.');
  current.proc.kill();
}

module.exports = { launch, stop, state, logPath };
