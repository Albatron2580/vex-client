// Version bookkeeping that keeps updates safe:
//  - backs up settings, profiles and sign-ins before a new version touches them (last 8 kept),
//  - counts start attempts per version and marks a version healthy once its window has loaded,
//  - remembers the last version that worked, so a broken update can be rolled back.
// Everything lives in %APPDATA%\.vex, outside the install folder the updater replaces.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const semver = require('./semver');

const KEEP_BACKUPS = 8;
const FILES = ['settings.json', 'profiles.json', 'accounts.json'];
const stateFile = () => path.join(store.getBaseDir(), 'app-state.json');
const backupsDir = () => path.join(store.getBaseDir(), 'backups');
const read = () => store.readJson(stateFile(), {});
const write = (s) => store.writeJson(stateFile(), s);

function backup(label) {
  const base = store.getBaseDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupsDir(), `${stamp}_${label.replace(/[^\w.-]+/g, '_')}`);
  fs.mkdirSync(dir, { recursive: true });
  let copied = 0;
  for (const f of FILES) {
    const src = path.join(base, f);
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(dir, f)); copied++; }
  }
  // each profile's mod list (the mods and worlds themselves are never touched by an update)
  for (const p of store.listProfiles()) {
    try {
      const m = path.join(store.profileDir(p.id), 'vex-mods.json');
      if (fs.existsSync(m)) { fs.mkdirSync(path.join(dir, 'profiles', p.id), { recursive: true }); fs.copyFileSync(m, path.join(dir, 'profiles', p.id, 'vex-mods.json')); }
    } catch { /* a broken profile entry must not stop the backup */ }
  }
  prune();
  return { dir, copied };
}

function prune() {
  let list = [];
  try { list = fs.readdirSync(backupsDir()).sort(); } catch { return; }
  for (const old of list.slice(0, Math.max(0, list.length - KEEP_BACKUPS))) fs.rmSync(path.join(backupsDir(), old), { recursive: true, force: true });
}

function listBackups() {
  try {
    return fs.readdirSync(backupsDir()).sort().reverse().map((name) => ({ name, path: path.join(backupsDir(), name) }));
  } catch { return []; }
}

// Puts settings, profiles and sign-ins back from a backup (the current files are backed up first).
function restore(name) {
  if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid backup.');
  const dir = path.join(backupsDir(), name);
  if (!fs.existsSync(dir)) throw new Error('That backup no longer exists.');
  backup('before-restore');
  for (const f of FILES) {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(store.getBaseDir(), f));
  }
  return true;
}

// Called once at start, before anything reads settings. Returns what the UI / recovery needs to know.
function onStart(version) {
  const s = read();
  const info = { version, previous: s.lastVersion || '', firstRun: !s.lastVersion, upgraded: false, downgraded: false, failedStarts: 0, lastHealthy: s.lastHealthyVersion || '' };
  if (s.lastVersion && s.lastVersion !== version) {
    try {
      info.upgraded = semver.compare(version, s.lastVersion) > 0;
      info.downgraded = !info.upgraded;
    } catch { /* unparsable old version */ }
    backup(`${s.lastVersion}-to-${version}`);
    s.previousVersion = s.lastVersion;
  }
  s.lastVersion = version;
  s.attempts = s.attempts && typeof s.attempts === 'object' ? s.attempts : {};
  info.failedStarts = s.attempts[version] || 0;
  s.attempts[version] = info.failedStarts + 1;
  info.previous = s.previousVersion || '';
  write(s);
  return info;
}

// The window loaded and the UI booted: this version works.
function markHealthy(version) {
  const s = read();
  s.attempts = { ...(s.attempts || {}), [version]: 0 };
  s.lastHealthyVersion = version;
  write(s);
}

// The newest version known to have started fine that is not this one (rollback target).
function rollbackTarget(version) {
  const s = read();
  const t = s.lastHealthyVersion && s.lastHealthyVersion !== version ? s.lastHealthyVersion : s.previousVersion || '';
  return t && t !== version && semver.valid(t) ? t : '';
}

module.exports = { onStart, markHealthy, rollbackTarget, backup, restore, listBackups, read };
