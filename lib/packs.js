// Resource packs and shader packs inside a profile folder.
// Resource packs are enabled through options.txt (the same file Minecraft uses).
// Shader packs are selected through Iris' config file.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const modrinth = require('./modrinth');
const { withZip } = require('./zip');

const dirFor = (profile, kind) => {
  const d = path.join(store.profileDir(profile.id), kind === 'shader' ? 'shaderpacks' : 'resourcepacks');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

// ---------- options.txt ----------
const optionsFile = (profile) => path.join(store.profileDir(profile.id), 'options.txt');

function readLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, a) => !(l === '' && i === a.length - 1)); } catch { return null; }
}
function getKey(lines, key, sep) {
  const l = (lines || []).find((x) => x.startsWith(key + sep));
  return l ? l.slice(key.length + sep.length) : null;
}
function setKey(lines, key, sep, value) {
  const i = lines.findIndex((x) => x.startsWith(key + sep));
  const line = `${key}${sep}${value}`;
  if (i >= 0) lines[i] = line; else lines.push(line);
}

const usesFilePrefix = (profile) => {
  const m = /^1\.(\d+)/.exec(profile.version);
  return !m || Number(m[1]) >= 13; // before 1.13 Minecraft stored bare file names
};

// Pack format Minecraft expects for this version. Exact when the game jar is downloaded.
const FORMAT_TABLE = [['1.6.1', 1], ['1.9', 2], ['1.11', 3], ['1.13', 4], ['1.15', 5], ['1.16.2', 6], ['1.17', 7], ['1.18', 8], ['1.19', 9], ['1.19.3', 12], ['1.19.4', 13], ['1.20', 15], ['1.20.2', 18], ['1.20.3', 22], ['1.20.5', 32], ['1.21', 34], ['1.21.2', 42], ['1.21.4', 46], ['1.21.5', 55]];

function cmpMc(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

function gameVersionInfo(profile) {
  const jar = path.join(store.gameRoot(), 'versions', profile.version, `${profile.version}.jar`);
  if (!fs.existsSync(jar)) return null;
  try { return withZip(jar, (z) => (z.has('version.json') ? z.readJson('version.json') : null)); } catch { return null; }
}

function packFormatFor(profile) {
  const vj = gameVersionInfo(profile);
  if (vj && vj.pack_version != null) {
    const pv = vj.pack_version;
    const n = typeof pv === 'number' ? pv : (pv.resource ?? pv.resource_major);
    if (Number.isFinite(n)) return n;
  }
  if (/^\d+(\.\d+)*$/.test(profile.version)) {
    let fmt = null;
    for (const [v, f] of FORMAT_TABLE) if (cmpMc(profile.version, v) >= 0) fmt = f;
    return fmt;
  }
  return null;
}

const num = (v) => (Array.isArray(v) ? v[0] : v);

function compat(mcmeta, fmt) {
  if (!mcmeta || !mcmeta.pack) return { status: 'unknown', message: 'No pack.mcmeta found.' };
  const p = mcmeta.pack;
  let lo = p.pack_format;
  let hi = p.pack_format;
  const sf = p.supported_formats;
  if (Array.isArray(sf)) { lo = sf[0]; hi = sf[1]; }
  else if (sf && typeof sf === 'object') { lo = sf.min_inclusive; hi = sf.max_inclusive; }
  else if (typeof sf === 'number') { lo = hi = sf; }
  if (p.min_format != null) lo = num(p.min_format);
  if (p.max_format != null) hi = num(p.max_format);
  if (lo == null || hi == null) return { status: 'unknown', message: 'The pack does not state which version it is for.' };
  if (fmt == null) return { status: 'unknown', message: `Pack format ${lo}${hi !== lo ? '–' + hi : ''}. The format for this Minecraft version is unknown until it has been downloaded once.` };
  if (fmt < lo) return { status: 'new', message: `Made for a newer Minecraft (pack format ${lo}); this version uses ${fmt}. It may not load correctly.` };
  if (fmt > hi) return { status: 'old', message: `Made for an older Minecraft (pack format ${hi}); this version uses ${fmt}. It may still work, but some textures can be missing.` };
  return { status: 'ok', message: 'Compatible with this Minecraft version.' };
}

function flatText(d) {
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(flatText).join('');
  if (d && typeof d === 'object') return (d.text || '') + (d.extra ? flatText(d.extra) : '') + (d.translate && !d.text ? d.translate : '');
  return '';
}
const clean = (s) => String(s || '').replace(/§./g, '').replace(/\s+/g, ' ').trim();

function dirSize(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    total += e.isDirectory() ? dirSize(f) : fs.statSync(f).size;
  }
  return total;
}

function describePack(full, isDir) {
  const out = { mcmeta: null, icon: '', hasShaders: false, size: 0, broken: false };
  try {
    if (isDir) {
      const meta = path.join(full, 'pack.mcmeta');
      if (fs.existsSync(meta)) out.mcmeta = JSON.parse(fs.readFileSync(meta, 'utf8').replace(/^﻿/, ''));
      const icon = path.join(full, 'pack.png');
      if (fs.existsSync(icon) && fs.statSync(icon).size < 300 * 1024) out.icon = 'data:image/png;base64,' + fs.readFileSync(icon).toString('base64');
      out.hasShaders = fs.existsSync(path.join(full, 'shaders'));
      out.size = dirSize(full);
    } else {
      out.size = fs.statSync(full).size;
      withZip(full, (z) => {
        if (z.has('pack.mcmeta')) { try { out.mcmeta = z.readJson('pack.mcmeta'); } catch { /* bad json */ } }
        if (z.has('pack.png') && z.entries.get('pack.png').usize < 300 * 1024) out.icon = 'data:image/png;base64,' + z.read('pack.png').toString('base64');
        out.hasShaders = z.names().some((n) => n.startsWith('shaders/'));
      });
    }
  } catch { out.broken = true; }
  return out;
}

function entries(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || /\.zip$/i.test(e.name)))
    .map((e) => ({ name: e.name, isDir: e.isDirectory(), full: path.join(dir, e.name) }));
}

// ---------- resource packs ----------
function enabledList(profile) {
  const lines = readLines(optionsFile(profile));
  const raw = getKey(lines, 'resourcePacks', ':');
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function listResourcePacks(profile) {
  const fmt = packFormatFor(profile);
  const prefix = usesFilePrefix(profile) ? 'file/' : '';
  const enabled = enabledList(profile);
  const packs = entries(dirFor(profile, 'resourcepack')).map((e) => {
    const d = describePack(e.full, e.isDir);
    const idx = enabled.indexOf(prefix + e.name);
    return {
      name: e.name,
      type: e.isDir ? 'folder' : 'zip',
      size: d.size,
      icon: d.icon,
      description: clean(flatText(d.mcmeta && d.mcmeta.pack && d.mcmeta.pack.description)),
      compat: d.broken ? { status: 'unknown', message: 'This file could not be read.' } : compat(d.mcmeta, fmt),
      enabled: idx >= 0,
      priority: idx >= 0 ? enabled.length - idx : 0, // 1 = applied last, wins over the others
    };
  });
  return { packs, packFormat: fmt };
}

function saveEnabled(profile, arr) {
  let lines = readLines(optionsFile(profile));
  if (!lines) {
    const vj = gameVersionInfo(profile);
    if (!vj || !vj.world_version) throw new Error('Start this profile once so Minecraft can create its settings, then enable packs here.');
    lines = [`version:${vj.world_version}`];
  }
  setKey(lines, 'resourcePacks', ':', JSON.stringify(arr));
  fs.writeFileSync(optionsFile(profile), lines.join('\n') + '\n');
}

function checkedName(profile, kind, name) {
  if (!name || path.basename(name) !== name || name.startsWith('.')) throw new Error('Invalid pack name.');
  const dir = path.resolve(dirFor(profile, kind));
  const full = path.resolve(dir, name);
  if (!full.startsWith(dir + path.sep) || !fs.existsSync(full)) throw new Error('That pack no longer exists.');
  return full;
}

function setPackEnabled(profile, name, on) {
  checkedName(profile, 'resourcepack', name);
  const entry = (usesFilePrefix(profile) ? 'file/' : '') + name;
  const arr = enabledList(profile).filter((x) => x !== entry);
  if (on) arr.push(entry); // last = highest priority
  saveEnabled(profile, arr);
}

// direction 'up' = higher priority (later in options.txt)
function movePack(profile, name, direction) {
  const entry = (usesFilePrefix(profile) ? 'file/' : '') + name;
  const arr = enabledList(profile);
  const i = arr.indexOf(entry);
  if (i < 0) throw new Error('Enable the pack first, then change its priority.');
  const j = direction === 'up' ? i + 1 : i - 1;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  saveEnabled(profile, arr);
}

// ---------- shader packs ----------
const irisFile = (profile) => path.join(store.profileDir(profile.id), 'config', 'iris.properties');

function shaderStatus(profile) {
  const mods = modrinth.installedMods(profile).filter((m) => m.enabled);
  const has = (slug) => mods.some((m) => m.slug === slug || m.title.toLowerCase() === slug);
  const lines = readLines(irisFile(profile));
  const sel = getKey(lines, 'shaderPack', '=');
  const on = getKey(lines, 'enableShaders', '=');
  return {
    loaderOk: profile.loader === 'fabric' || profile.loader === 'neoforge',
    iris: has('iris'),
    sodium: has('sodium'),
    selected: sel || '',
    enabled: on === 'true',
  };
}

function listShaderPacks(profile) {
  const st = shaderStatus(profile);
  const packs = entries(dirFor(profile, 'shader')).map((e) => {
    const d = describePack(e.full, e.isDir);
    return {
      name: e.name,
      type: e.isDir ? 'folder' : 'zip',
      size: d.size,
      icon: d.icon,
      description: d.broken ? 'This file could not be read.' : d.hasShaders ? 'Shader pack' : 'No "shaders" folder found. This may not be a shader pack.',
      compat: d.hasShaders ? { status: 'ok', message: 'Looks like a valid shader pack.' } : { status: 'unknown', message: 'No "shaders" folder at the top level.' },
      enabled: st.enabled && st.selected === e.name,
      priority: 0,
    };
  });
  return { packs, status: st };
}

function setShader(profile, name) {
  if (name) checkedName(profile, 'shader', name);
  const f = irisFile(profile);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const lines = readLines(f) || [];
  setKey(lines, 'shaderPack', '=', name || '');
  setKey(lines, 'enableShaders', '=', name ? 'true' : 'false');
  fs.writeFileSync(f, lines.join('\n') + '\n');
}

// ---------- shared: import / remove ----------
function validate(kind, z) {
  if (kind === 'shader') {
    if (!z.names().some((n) => n.startsWith('shaders/'))) throw new Error('This ZIP has no "shaders" folder at the top level, so it is not a shader pack.');
  } else if (!z.has('pack.mcmeta')) {
    const nested = z.names().find((n) => /^[^/]+\/pack\.mcmeta$/.test(n));
    throw new Error(nested ? 'This ZIP has an extra folder around the pack. Extract it and zip the inner contents so pack.mcmeta is at the top.' : 'This ZIP has no pack.mcmeta, so it is not a resource pack.');
  }
}

function uniqueName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  for (let i = 2; i < 100; i++) {
    const n = `${stem} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, n))) return n;
  }
  throw new Error('Too many copies of this pack already exist.');
}

function importPack(profile, kind, src) {
  const dir = dirFor(profile, kind);
  const st = fs.statSync(src);
  const base = path.basename(src);
  if (st.isDirectory()) {
    const ok = kind === 'shader' ? fs.existsSync(path.join(src, 'shaders')) : fs.existsSync(path.join(src, 'pack.mcmeta'));
    if (!ok) throw new Error(kind === 'shader' ? 'This folder has no "shaders" folder inside.' : 'This folder has no pack.mcmeta, so it is not a resource pack.');
    const name = uniqueName(dir, base);
    fs.cpSync(src, path.join(dir, name), { recursive: true });
    return name;
  }
  if (!/\.zip$/i.test(base)) throw new Error('Packs must be .zip files (or folders).');
  withZip(src, (z) => validate(kind, z));
  const name = uniqueName(dir, base);
  fs.copyFileSync(src, path.join(dir, name));
  return name;
}

function removePack(profile, kind, name) {
  const full = checkedName(profile, kind, name);
  if (kind === 'resourcepack') {
    const entry = (usesFilePrefix(profile) ? 'file/' : '') + name;
    if (enabledList(profile).includes(entry)) setPackEnabled(profile, name, false);
  } else {
    const st = shaderStatus(profile);
    if (st.selected === name) setShader(profile, null);
  }
  fs.rmSync(full, { recursive: true, force: true });
}

module.exports = {
  listResourcePacks, setPackEnabled, movePack, listShaderPacks, setShader, shaderStatus,
  importPack, removePack, packFormatFor, compat, dirFor,
};
