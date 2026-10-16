// Persistent launcher data: settings, profiles, and the folders everything lives in.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = {
  gameRoot: '',            // '' means the launcher data folder itself
  selectedProfile: '',
  activeAccount: '',
  ram: 4,
  javaPath: '',            // '' means pick automatically
  theme: 'vex',            // the user's own choice; seasons may show another theme on top (see renderer/themes.js)
  accent: '',              // '' = use the theme's own accent colour
  seasonalThemes: true,    // switch to Halloween / Christmas / New Year automatically
  seasonOptOut: '',        // season key the user opted out of by picking another theme during it
  themeEffects: true,      // falling leaves, snow, fireworks and other light animations
  themeBackground: 'landscape', // landscape = pixel-art biome in the theme colours | picture = the theme's image
  autoCheckUpdates: true,  // check for launcher updates at start and every few hours
  autoDownloadUpdates: true,
  skippedUpdate: '',       // optional update version the user chose to skip
  themesV2: true,
  width: 1280,
  height: 720,
  windowMode: 'windowed',  // windowed | fullscreen
  modUpdates: 'notify',    // off | notify | auto
  activeCape: '',          // file name of the local cape chosen in Cosmetics
};
const THEMES = require('../renderer/themes').ids;
const BOOLEANS = ['seasonalThemes', 'themeEffects', 'autoCheckUpdates', 'autoDownloadUpdates'];

let baseDir = '';

function init(dir) {
  baseDir = dir;
  fs.mkdirSync(baseDir, { recursive: true });
  ensureDefaultProfile();
}

const getBaseDir = () => baseDir;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Write via a temp file so a crash mid-write cannot corrupt the real one.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const settingsFile = () => path.join(baseDir, 'settings.json');
const profilesFile = () => path.join(baseDir, 'profiles.json');

function settings() {
  const raw = readJson(settingsFile(), {});
  // Before themes had their own colours the accent defaulted to #3d7bff; treat that as "theme colour".
  if (!raw.themesV2 && raw.accent === '#3d7bff') raw.accent = '';
  return { ...DEFAULTS, ...raw, themesV2: true };
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function saveSettings(patch) {
  const cur = settings();
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    if (BOOLEANS.includes(k)) { next[k] = v === true || v === 'true'; continue; }
    switch (k) {
      case 'ram': next.ram = clampInt(v, 1, 64, cur.ram); break;
      case 'width': next.width = clampInt(v, 320, 7680, cur.width); break;
      case 'height': next.height = clampInt(v, 240, 4320, cur.height); break;
      case 'theme': next.theme = THEMES.includes(v) ? v : cur.theme; break;
      case 'accent': next.accent = v === '' ? '' : /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : cur.accent; break;
      case 'seasonOptOut': next.seasonOptOut = /^(|[a-z]+-\d{4})$/.test(String(v)) ? String(v) : cur.seasonOptOut; break;
      case 'themesV2': break;
      case 'themeBackground': next.themeBackground = v === 'picture' ? 'picture' : 'landscape'; break;
      case 'windowMode': next.windowMode = v === 'fullscreen' ? 'fullscreen' : 'windowed'; break;
      case 'modUpdates': next.modUpdates = ['off', 'notify', 'auto'].includes(v) ? v : cur.modUpdates; break;
      default: next[k] = typeof v === 'string' ? v : String(v ?? '');
    }
  }
  writeJson(settingsFile(), next);
  return next;
}

// Folder for shared game data (libraries, assets, versions) and the profiles directory.
function gameRoot() {
  const r = settings().gameRoot;
  const root = r && path.isAbsolute(r) ? r : baseDir;
  fs.mkdirSync(root, { recursive: true });
  return root;
}

const profilesDir = () => path.join(gameRoot(), 'profiles');

// ---------- profiles ----------
const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge'];

function cleanName(name, fallback = 'New profile') {
  const n = String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  return n || fallback;
}

function listProfiles() {
  const list = readJson(profilesFile(), []);
  return Array.isArray(list) ? list : [];
}

function saveProfiles(list) { writeJson(profilesFile(), list); }

function getProfile(id) {
  const p = listProfiles().find((x) => x.id === id);
  if (!p) throw new Error('That profile no longer exists.');
  return p;
}

function profileDir(id) {
  if (!/^p-[0-9a-f]{8}$/.test(String(id))) throw new Error('Invalid profile.');
  const d = path.join(profilesDir(), id);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function newId() { return 'p-' + crypto.randomBytes(4).toString('hex'); }

function createProfile({ name, version, loader = 'vanilla', loaderVersion = '' }) {
  if (!version) throw new Error('Pick a Minecraft version.');
  if (!LOADERS.includes(loader)) throw new Error('Unknown mod loader.');
  const list = listProfiles();
  const p = {
    id: newId(),
    name: cleanName(name, `Minecraft ${version}`),
    version: String(version),
    loader,
    loaderVersion: loader === 'vanilla' ? '' : String(loaderVersion || ''),
    created: Date.now(),
    lastPlayed: 0,
  };
  list.push(p);
  saveProfiles(list);
  profileDir(p.id);
  if (!settings().selectedProfile) saveSettings({ selectedProfile: p.id });
  return p;
}

function updateProfile(id, patch) {
  const list = listProfiles();
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('That profile no longer exists.');
  if ('name' in patch) p.name = cleanName(patch.name, p.name);
  if ('version' in patch && patch.version) p.version = String(patch.version);
  if ('loader' in patch) {
    if (!LOADERS.includes(patch.loader)) throw new Error('Unknown mod loader.');
    p.loader = patch.loader;
  }
  if ('loaderVersion' in patch) p.loaderVersion = p.loader === 'vanilla' ? '' : String(patch.loaderVersion || '');
  if (p.loader === 'vanilla') p.loaderVersion = '';
  if ('lastPlayed' in patch) p.lastPlayed = Number(patch.lastPlayed) || 0;
  saveProfiles(list);
  return p;
}

function duplicateProfile(id) {
  const src = getProfile(id);
  const copy = { ...src, id: newId(), name: cleanName(`${src.name} copy`), created: Date.now(), lastPlayed: 0 };
  const from = profileDir(src.id);
  const to = path.join(profilesDir(), copy.id);
  fs.cpSync(from, to, { recursive: true });
  const list = listProfiles();
  list.push(copy);
  saveProfiles(list);
  return copy;
}

function deleteProfile(id, opts = {}) {
  const list = listProfiles();
  if (!opts.force && list.length <= 1) throw new Error('You need at least one profile. Create another one first.');
  if (!list.some((x) => x.id === id)) throw new Error('That profile no longer exists.');
  const dir = path.join(profilesDir(), id);
  const base = path.resolve(profilesDir());
  const target = path.resolve(dir);
  if (!/^p-[0-9a-f]{8}$/.test(id) || !target.startsWith(base + path.sep)) throw new Error('Refusing to delete outside the profiles folder.');
  fs.rmSync(target, { recursive: true, force: true });
  const rest = list.filter((x) => x.id !== id);
  saveProfiles(rest);
  if (settings().selectedProfile === id) saveSettings({ selectedProfile: rest[0] ? rest[0].id : '' });
  return rest;
}

function selectedProfile() {
  const list = listProfiles();
  const id = settings().selectedProfile;
  return list.find((p) => p.id === id) || list[0] || null;
}

function ensureDefaultProfile() {
  if (listProfiles().length) return;
  createProfile({ name: 'Default', version: '1.21.11', loader: 'fabric' });
}

module.exports = {
  init, getBaseDir, readJson, writeJson, settings, saveSettings, gameRoot, profilesDir,
  listProfiles, getProfile, profileDir, createProfile, updateProfile, duplicateProfile, deleteProfile,
  selectedProfile, DEFAULTS, THEMES, LOADERS,
};
