// Mod changes while Minecraft is running.
//
// Fabric, Forge and NeoForge read the mods folder once, at startup; none of them can load a new
// mod jar into a game that is already running, and Vex Client does not inject code to force it.
// So while a profile's game is running, installs, updates, removals and enable/disable changes are
// queued here (new files are downloaded and verified into a staging folder) and applied the moment
// the game closes, or before the next launch. Resource packs and shader packs are different: the
// game picks them up from its own menus without a restart (see liveSupport()).
//
// The launcher also remembers which jars were in the mods folder when the game started, and reads
// the loader's log to confirm which ones actually loaded, so the UI never calls a mod "loaded"
// unless the game said so.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const modrinth = require('./modrinth');

const pendingFile = (profile) => path.join(store.profileDir(profile.id), 'vex-pending.json');
const stageDir = (profile) => { const d = path.join(store.profileDir(profile.id), '.vex-pending'); fs.mkdirSync(d, { recursive: true }); return d; };
const readQueue = (profile) => { const q = store.readJson(pendingFile(profile), { ops: [] }); if (!Array.isArray(q.ops)) q.ops = []; return q; };
const writeQueue = (profile, q) => store.writeJson(pendingFile(profile), q);

let gameState = () => ({ state: 'idle' });
function init({ state }) { gameState = state; }

// True when this profile's game is starting or running, so its mods folder must not change.
function isLive(profile) {
  const s = gameState();
  return !!profile && s.profileId === profile.id && (s.state === 'running' || s.state === 'starting');
}

// ---------- session tracking ----------
let session = null; // { profileId, loader, files:Set, loadedIds:Set, loadedFiles:Set, listing, confirmed }

function startSession(profile) {
  let files = [];
  try { files = fs.readdirSync(modrinth.modsDir(profile)).filter((f) => /\.jar$/i.test(f)); } catch { /* none */ }
  session = { profileId: profile.id, loader: profile.loader, files: new Set(files), loadedIds: new Set(), loadedFiles: new Set(), listing: false, confirmed: false };
}

function endSession() { session = null; }

// Fed with every line of game output.
//   Fabric:   "Loading 57 mods:" then lines like "\t- sodium 0.6.0" / "   |-- fabric-api-base 0.4.42"
//   Forge / NeoForge: "Found mod file sodium-0.6.0.jar of type MOD ..." and later "ModLauncher ... Loading N mods"
function onGameLine(line) {
  if (!session) return;
  const l = String(line);
  if (/Loading \d+ mods:/.test(l)) { session.listing = true; session.confirmed = true; return; }
  if (session.listing) {
    const m = /^\s*(?:[-|\\]+\s*)+([a-z0-9_.-]+)\s+\S+/i.exec(l);
    if (m) { session.loadedIds.add(m[1].toLowerCase()); return; }
    if (l.trim()) session.listing = false;
  }
  const f = /Found mod file "?([^"\s]+\.jar)"?/i.exec(l);
  if (f) { session.loadedFiles.add(path.basename(f[1])); session.confirmed = true; }
}

// ---------- queue ----------
function opId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function queueAdd(profile, file, meta, replaces) {
  const q = readQueue(profile);
  q.ops = q.ops.filter((o) => !(o.op === 'add' && o.file === file));
  q.ops.push({ id: opId(), op: 'add', file, meta: meta || null, replaces: replaces || '', title: (meta && meta.title) || file, at: Date.now() });
  writeQueue(profile, q);
}

function queueRemove(profile, file, title) {
  const q = readQueue(profile);
  const base = file.replace(/\.disabled$/, '');
  // Removing something that was only queued: just drop it from the queue.
  const pendingAdd = q.ops.find((o) => o.op === 'add' && o.file === base);
  if (pendingAdd) {
    fs.rmSync(path.join(stageDir(profile), base), { force: true });
    q.ops = q.ops.filter((o) => o !== pendingAdd);
  } else {
    q.ops = q.ops.filter((o) => !(o.file === file && o.op === 'toggle'));
    q.ops.push({ id: opId(), op: 'remove', file, title: title || base, at: Date.now() });
  }
  writeQueue(profile, q);
}

function queueToggle(profile, file, title) {
  const q = readQueue(profile);
  const existing = q.ops.find((o) => o.op === 'toggle' && o.file === file);
  if (existing) q.ops = q.ops.filter((o) => o !== existing); // toggling twice cancels out
  else q.ops.push({ id: opId(), op: 'toggle', file, enable: file.endsWith('.disabled'), title: title || file, at: Date.now() });
  writeQueue(profile, q);
}

function cancel(profile, id) {
  const q = readQueue(profile);
  const op = q.ops.find((o) => o.id === id);
  if (!op) return;
  if (op.op === 'add') fs.rmSync(path.join(stageDir(profile), op.file), { force: true });
  q.ops = q.ops.filter((o) => o.id !== id);
  writeQueue(profile, q);
}

const pending = (profile) => readQueue(profile).ops;

// Applies queued changes. Never runs while that profile's game is running.
// Each op is applied on its own; one that fails (file locked, missing) stays queued with its error.
function apply(profile) {
  if (isLive(profile)) return { applied: [], failed: [], skipped: true };
  const q = readQueue(profile);
  if (!q.ops.length) return { applied: [], failed: [] };
  const dir = modrinth.modsDir(profile);
  const staging = stageDir(profile);
  const applied = [];
  const failed = [];
  const rest = [];
  for (const op of q.ops) {
    try {
      if (op.op === 'add') {
        const src = path.join(staging, op.file);
        if (!fs.existsSync(src)) throw new Error('The downloaded file is missing. Install it again.');
        if (op.replaces && op.replaces !== op.file) {
          for (const old of [op.replaces, op.replaces + '.disabled']) fs.rmSync(path.join(dir, old), { force: true });
          modrinth.forgetMod(profile, op.replaces);
        }
        fs.rmSync(path.join(dir, op.file + '.disabled'), { force: true });
        fs.copyFileSync(src, path.join(dir, op.file));
        fs.rmSync(src, { force: true });
        if (op.meta) modrinth.rememberMod(profile, op.file, op.meta);
      } else if (op.op === 'remove') {
        const full = path.join(dir, op.file);
        if (fs.existsSync(full)) modrinth.removeMod(profile, op.file);
        else modrinth.forgetMod(profile, op.file.replace(/\.disabled$/, ''));
      } else if (op.op === 'toggle') {
        const full = path.join(dir, op.file);
        if (fs.existsSync(full)) modrinth.toggleMod(profile, op.file);
      }
      applied.push(op);
    } catch (e) {
      const why = e.code === 'EBUSY' || e.code === 'EPERM' ? 'The file is still in use. Close Minecraft (and any program that has the mods folder open), then press Apply.' : e.message;
      failed.push({ ...op, error: why });
      rest.push({ ...op, error: why });
    }
  }
  writeQueue(profile, { ops: rest });
  return { applied, failed };
}

// ---------- status for the Installed Mods page ----------
// status: loaded | in-session | restart | installed | disabled | pending-install | pending-remove | pending-enable | pending-disable
function status(profile) {
  const mods = modrinth.installedMods(profile);
  const ops = pending(profile);
  const live = isLive(profile);
  const s = session && session.profileId === profile.id ? session : null;
  const rows = mods.map((m) => {
    const base = m.file.replace(/\.disabled$/, '');
    const opRemove = ops.find((o) => o.op === 'remove' && (o.file === m.file || o.file === base));
    const opToggle = ops.find((o) => o.op === 'toggle' && o.file === m.file);
    const opReplace = ops.find((o) => o.op === 'add' && o.replaces === base);
    let st;
    if (opRemove) st = 'pending-remove';
    else if (opToggle) st = opToggle.enable ? 'pending-enable' : 'pending-disable';
    else if (!m.enabled) st = 'disabled';
    else if (live && s) {
      if (!s.files.has(m.file)) st = 'restart';
      else if (s.loadedFiles.has(m.file) || (m.modId && s.loadedIds.has(m.modId.toLowerCase()))) st = 'loaded';
      else st = 'in-session';
    } else st = 'installed';
    return { ...m, status: st, pendingId: (opRemove || opToggle || {}).id || '', updateQueued: opReplace ? (opReplace.meta && opReplace.meta.version) || 'new version' : '', error: (opRemove || opToggle || opReplace || {}).error || '' };
  });
  for (const o of ops.filter((x) => x.op === 'add' && !x.replaces)) {
    rows.push({
      file: o.file, enabled: true, size: 0, title: o.title, version: (o.meta && o.meta.version) || '', icon: (o.meta && o.meta.icon) || '',
      slug: (o.meta && o.meta.slug) || '', source: o.meta ? 'modrinth' : 'manual', loader: profile.loader, issues: [], status: 'pending-install', pendingId: o.id, error: o.error || '',
    });
  }
  rows.sort((a, b) => a.title.localeCompare(b.title));
  return {
    running: live,
    confirmed: !!(s && s.confirmed),
    pending: ops.length,
    support: liveSupport(profile),
    mods: rows,
  };
}

// What can change without restarting Minecraft, for this profile.
function liveSupport(profile) {
  const loaderName = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', vanilla: 'Vanilla' }[profile.loader] || profile.loader;
  return {
    mods: false,
    modsReason: profile.loader === 'vanilla'
      ? 'Vanilla profiles do not load mods.'
      : `${loaderName} loads mods only when Minecraft starts. A mod added while the game is running is installed for the next launch.`,
    resourcePacks: true,
    shaders: profile.loader === 'fabric' || profile.loader === 'neoforge',
  };
}

module.exports = { init, isLive, startSession, endSession, onGameLine, queueAdd, queueRemove, queueToggle, cancel, pending, apply, status, liveSupport, stageDir };
