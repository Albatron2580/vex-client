// Import instances from other launchers into new Vex profiles.
//
// Sources: the official Minecraft Launcher (.minecraft + launcher_profiles.json), Modrinth App,
// NoRisk Client, plus "any folder" (Prism, CurseForge, MultiMC...). The source is only read, never
// changed. Each import creates a NEW profile, so nothing in Vex is overwritten; undo deletes that
// profile again. Microsoft sign-ins can't be imported: other launchers encrypt them for themselves.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const modrinth = require('./modrinth');

const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt', 'vanilla'];
// What can be copied, and the default choice.
const PARTS = {
  mods: { label: 'Mods', default: true, dir: 'mods' },
  resourcepacks: { label: 'Resource packs', default: true, dir: 'resourcepacks' },
  shaderpacks: { label: 'Shader packs', default: true, dir: 'shaderpacks' },
  config: { label: 'Mod settings (config)', default: true, dir: 'config' },
  options: { label: 'Game settings & keybinds', default: true, files: ['options.txt', 'optionsof.txt', 'optionsshaders.txt'] },
  servers: { label: 'Server list', default: true, files: ['servers.dat'] },
  saves: { label: 'Worlds', default: false, dir: 'saves' },
  screenshots: { label: 'Screenshots', default: false, dir: 'screenshots' },
};

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function dirSize(p, cap = 5000) {
  let total = 0;
  let count = 0;
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++count > cap) return;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { try { total += fs.statSync(f).size; } catch { /* skip */ } }
    }
  };
  if (isDir(p)) walk(p);
  return total;
}

const jars = (dir) => { try { return fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)); } catch { return []; } };

// ---------- working out version + loader ----------
function fromVersionId(id) {
  const s = String(id || '');
  let m;
  if ((m = /^fabric-loader-([\d.]+)-(.+)$/.exec(s))) return { loader: 'fabric', loaderVersion: m[1], version: m[2] };
  if ((m = /^quilt-loader-([\d.]+)-(.+)$/.exec(s))) return { loader: 'quilt', loaderVersion: m[1], version: m[2] };
  if ((m = /^neoforge-([\d.]+(?:-beta)?)$/.exec(s))) {
    const p = m[1].split('.');
    return { loader: 'neoforge', loaderVersion: m[1], version: p[1] === '0' ? `1.${p[0]}` : `1.${p[0]}.${p[1]}` };
  }
  if ((m = /^([\d.]+)-forge-?([\d.]+)/.exec(s))) return { loader: 'forge', loaderVersion: m[2], version: m[1] };
  if (/^\d+\.\d+(\.\d+)?$/.test(s)) return { loader: 'vanilla', loaderVersion: '', version: s };
  return null;
}

function fromLog(dir) {
  const f = path.join(dir, 'logs', 'latest.log');
  let txt = '';
  try { const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(64 * 1024); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); txt = b.subarray(0, n).toString('utf8'); } catch { return null; }
  let m;
  if ((m = /Loading Minecraft ([\w.-]+) with Fabric Loader ([\w.+-]+)/.exec(txt))) return { loader: 'fabric', version: m[1], loaderVersion: m[2] };
  if ((m = /Loading Minecraft ([\w.-]+) with Quilt Loader ([\w.+-]+)/.exec(txt))) return { loader: 'quilt', version: m[1], loaderVersion: m[2] };
  if ((m = /neoforge[^\n]*?--fml\.mcVersion,? ?([\d.]+)/i.exec(txt)) || (/NeoForge/.test(txt) && (m = /--fml\.mcVersion,? ?([\d.]+)/.exec(txt)))) return { loader: 'neoforge', version: m[1], loaderVersion: '' };
  if ((m = /--fml\.mcVersion,? ?([\d.]+)/.exec(txt))) return { loader: 'forge', version: m[1], loaderVersion: (/--fml\.forgeVersion,? ?([\d.]+)/.exec(txt) || [])[1] || '' };
  if ((m = /Minecraft Version: ([\d.]+)/.exec(txt))) return { loader: 'vanilla', version: m[1], loaderVersion: '' };
  return null;
}

// From the mods themselves: most common loader + the Minecraft version most mods ask for.
function fromMods(dir) {
  const files = jars(path.join(dir, 'mods')).slice(0, 80);
  if (!files.length) return null;
  const loaders = {};
  const versions = {};
  for (const f of files) {
    const j = modrinth.inspectJar(path.join(dir, 'mods', f));
    if (j.loader !== 'unknown') loaders[j.loader] = (loaders[j.loader] || 0) + 1;
    const req = j.depends && j.depends.minecraft;
    const r = Array.isArray(req) ? req[0] : req;
    const m = r && /(\d+\.\d+(?:\.\d+)?)/.exec(String(r));
    if (m && !/[<>~^*x]/.test(String(r).replace(/^[~=]/, ''))) versions[m[1]] = (versions[m[1]] || 0) + 1;
    else if (m) versions[m[1]] = (versions[m[1]] || 0) + 0.5;
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  const l = top(loaders);
  const v = top(versions);
  if (!l && !v) return null;
  return { loader: l ? l[0] : 'fabric', version: v ? v[0] : '', loaderVersion: '', guessed: true };
}

function describe(dir, base) {
  const info = { ...base, path: dir, parts: {} };
  for (const [k, p] of Object.entries(PARTS)) {
    if (p.dir) {
      const d = path.join(dir, p.dir);
      if (isDir(d)) {
        let n = 0;
        try { n = fs.readdirSync(d).filter((f) => !f.startsWith('.')).length; } catch { /* */ }
        if (n) info.parts[k] = { count: n, size: k === 'saves' || k === 'screenshots' ? dirSize(d) : 0 };
      }
    } else if (p.files.some((f) => exists(path.join(dir, f)))) info.parts[k] = { count: 1, size: 0 };
  }
  info.modCount = jars(path.join(dir, 'mods')).length;
  if (!info.version) {
    const g = fromLog(dir) || fromMods(dir);
    if (g) Object.assign(info, { version: info.version || g.version, loader: info.loader || g.loader, loaderVersion: info.loaderVersion || g.loaderVersion, guessed: !!g.guessed || !fromLog(dir) });
  }
  if (!info.loader) info.loader = info.modCount ? 'fabric' : 'vanilla';
  return info;
}

const looksLikeInstance = (d) => exists(path.join(d, 'options.txt')) || jars(path.join(d, 'mods')).length > 0;

// Finds instance folders up to `depth` levels below root.
function findInstances(root, depth = 3) {
  const out = [];
  const walk = (d, lvl) => {
    if (out.length > 60) return;
    if (looksLikeInstance(d)) { out.push(d); return; }
    if (lvl >= depth) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory() || /^(node_modules|cache|caches|libraries|assets|versions|runtime|logs|meta|java|jre|natives|\.git)$/i.test(e.name)) continue;
      walk(path.join(d, e.name), lvl + 1);
    }
  };
  if (isDir(root)) walk(root, 0);
  return out;
}

// ---------- sources ----------
function home() {
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const local = process.env.LOCALAPPDATA || appData;
  return { appData, local };
}

function officialLauncher(roots) {
  const mc = roots.minecraft || path.join(home().appData, process.platform === 'win32' ? '.minecraft' : process.platform === 'darwin' ? 'minecraft' : '.minecraft');
  if (!isDir(mc)) return [];
  const found = [];
  const seen = new Set();
  let lp = {};
  try { lp = JSON.parse(fs.readFileSync(path.join(mc, 'launcher_profiles.json'), 'utf8')).profiles || {}; } catch { /* */ }
  // newest-used first
  const profiles = Object.values(lp).filter((p) => p && p.lastVersionId).sort((a, b) => String(b.lastUsed || '').localeCompare(String(a.lastUsed || '')));
  for (const p of profiles) {
    const dir = p.gameDir && path.isAbsolute(p.gameDir) ? p.gameDir : mc;
    let vid = p.lastVersionId;
    if (vid === 'latest-release' || vid === 'latest-snapshot') vid = '';
    const v = vid ? fromVersionId(vid) : null;
    const key = `${dir}|${vid}`;
    if (seen.has(key) || !isDir(dir)) continue;
    seen.add(key);
    found.push(describe(dir, { source: 'minecraft', sourceLabel: 'Minecraft Launcher', name: p.name || (v ? `${v.loader} ${v.version}` : 'Minecraft'), ...(v || {}) }));
    if (found.length >= 8) break;
  }
  if (!found.length && looksLikeInstance(mc)) found.push(describe(mc, { source: 'minecraft', sourceLabel: 'Minecraft Launcher', name: '.minecraft' }));
  return found;
}

function modrinthApp(roots) {
  const { appData } = home();
  const bases = roots.modrinth ? [roots.modrinth] : [path.join(appData, 'ModrinthApp', 'profiles'), path.join(appData, 'com.modrinth.theseus', 'profiles')];
  const out = [];
  for (const b of bases) {
    if (!isDir(b)) continue;
    for (const name of fs.readdirSync(b)) {
      const dir = path.join(b, name);
      if (!isDir(dir)) continue;
      const base = { source: 'modrinth', sourceLabel: 'Modrinth App', name };
      // older Modrinth App versions keep metadata in profile.json
      try {
        const pj = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8'));
        const m = pj.metadata || pj;
        if (m.game_version) base.version = m.game_version;
        if (m.loader) base.loader = String(m.loader).toLowerCase();
        if (m.loader_version && m.loader_version.id) base.loaderVersion = String(m.loader_version.id).replace(/^.*?-/, '');
        if (m.name) base.name = m.name;
      } catch { /* newer versions: guessed from the log and the mods */ }
      if (looksLikeInstance(dir) || base.version) out.push(describe(dir, base));
    }
  }
  return out;
}

function noRisk(roots) {
  const { appData, local } = home();
  const bases = roots.norisk ? [roots.norisk] : [
    path.join(appData, 'norisk'), path.join(appData, 'NoRiskClient'), path.join(appData, 'noriskclient'),
    path.join(appData, '.norisk'), path.join(local, 'norisk'), path.join(os.homedir(), '.norisk'),
  ];
  const out = [];
  const seen = new Set();
  for (const b of bases) {
    for (const dir of findInstances(b, 4)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      out.push(describe(dir, { source: 'norisk', sourceLabel: 'NoRisk Client', name: path.basename(dir) }));
    }
  }
  return out;
}

function scan(roots = {}) {
  const groups = [
    { id: 'minecraft', label: 'Minecraft Launcher', items: officialLauncher(roots) },
    { id: 'modrinth', label: 'Modrinth App', items: modrinthApp(roots) },
    { id: 'norisk', label: 'NoRisk Client', items: noRisk(roots) },
  ];
  return { groups, parts: Object.fromEntries(Object.entries(PARTS).map(([k, p]) => [k, { label: p.label, default: p.default }])) };
}

function scanFolder(dir) {
  const found = findInstances(dir, 3).map((d) => describe(d, { source: 'folder', sourceLabel: 'Folder', name: path.basename(d) }));
  if (!found.length) throw new Error('No Minecraft instance found in that folder (looked for options.txt or a mods folder).');
  return found;
}

// ---------- copying ----------
function copyTree(src, dst, stats, skip) {
  let ents = [];
  try { ents = fs.readdirSync(src, { withFileTypes: true }); } catch { return; }
  fs.mkdirSync(dst, { recursive: true });
  for (const e of ents) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (skip && skip(e.name)) continue;
    if (e.isSymbolicLink()) continue; // never follow links out of the instance
    if (e.isDirectory()) copyTree(s, d, stats, null);
    else {
      try { fs.copyFileSync(s, d, fs.constants.COPYFILE_EXCL); stats.files++; stats.bytes += fs.statSync(d).size; } catch (err) { if (err.code !== 'EEXIST') stats.errors.push(`${e.name}: ${err.code || err.message}`); }
    }
  }
}

// opts: { path, name, version, loader, loaderVersion, parts: { mods: true, ... }, source }
async function importInstance(opts, ctx = {}) {
  const src = path.resolve(String(opts.path || ''));
  if (!isDir(src) || !looksLikeInstance(src)) throw new Error('That folder is not a Minecraft instance.');
  if (!opts.version) throw new Error('Choose the Minecraft version for this profile.');
  let loader = LOADERS.includes(opts.loader) ? opts.loader : 'vanilla';
  const notes = [];
  if (loader === 'quilt') { loader = 'fabric'; notes.push('Quilt is not supported, so the profile uses Fabric. Most Quilt mods are Fabric mods and still work; Quilt-only mods may not.'); }
  const profile = store.createProfile({ name: opts.name || `Imported ${opts.version}`, version: opts.version, loader, loaderVersion: opts.loaderVersion || '' });
  const dst = store.profileDir(profile.id);
  const stats = { files: 0, bytes: 0, errors: [] };
  const wanted = opts.parts || Object.fromEntries(Object.entries(PARTS).map(([k, p]) => [k, p.default]));
  const progress = (label) => ctx.onTask && ctx.onTask({ id: 'import', label, received: 0, total: 0, done: false });
  try {
    for (const [k, p] of Object.entries(PARTS)) {
      if (!wanted[k]) continue;
      progress(`Importing ${p.label.toLowerCase()}…`);
      if (p.dir) copyTree(path.join(src, p.dir), path.join(dst, p.dir), stats, k === 'mods' ? (n) => !/\.jar(\.disabled)?$/i.test(n) && !isDir(path.join(src, 'mods', n)) : null);
      else for (const f of p.files) if (exists(path.join(src, f))) { try { fs.copyFileSync(path.join(src, f), path.join(dst, f)); stats.files++; } catch (e) { stats.errors.push(`${f}: ${e.code || e.message}`); } }
    }
    // Recognise Modrinth mods by their hash so update checks work for them too (best effort, needs internet).
    if (wanted.mods && loader !== 'vanilla') {
      progress('Recognising mods on Modrinth…');
      try { notes.push(...(await modrinth.identifyInstalled(profile))); } catch { notes.push('Mods could not be matched with Modrinth (offline?). They work, but update checks only cover mods installed from Vex.'); }
    }
    store.writeJson(path.join(dst, 'vex-import.json'), { from: src, source: opts.source || 'folder', at: Date.now(), files: stats.files, bytes: stats.bytes, errors: stats.errors.slice(0, 50) });
  } catch (e) {
    try { store.deleteProfile(profile.id, { force: true }); } catch { /* */ }
    throw e;
  } finally {
    ctx.onTask && ctx.onTask({ id: 'import', label: 'Import', done: true });
  }
  if (stats.errors.length) notes.push(`${stats.errors.length} file(s) could not be copied (in use or protected): ${stats.errors.slice(0, 3).join(', ')}${stats.errors.length > 3 ? '…' : ''}`);
  return { profile, files: stats.files, bytes: stats.bytes, notes };
}

// Undo: remove a profile that was created by an import (the source was never touched).
function undoImport(profileId) {
  const dir = store.profileDir(profileId);
  if (!exists(path.join(dir, 'vex-import.json'))) throw new Error('This profile was not created by an import.');
  store.deleteProfile(profileId, { force: true });
  return true;
}

module.exports = { scan, scanFolder, importInstance, undoImport, fromVersionId, fromLog, fromMods, findInstances, PARTS };
