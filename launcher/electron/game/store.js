// Small adapter so the game modules (from Vex Client 1.2.0) run inside VEX CLIENT 2.x.
// Game settings (active Microsoft account, Java, window size) live in game-settings.json.
// "Profiles" are VEX instances: VEX passes a lookup/update hook in via configure().
const fs = require('fs');
const path = require('path');

let baseDir = '';
let hooks = { instanceDir: () => null, updateInstance: () => {} };

const DEFAULTS = { activeAccount: '', javaPath: '', ram: 4, width: 1280, height: 720, windowMode: 'windowed' };

function init(dir) { baseDir = dir; fs.mkdirSync(baseDir, { recursive: true }); }
function configure(h) { hooks = { ...hooks, ...h }; }
const getBaseDir = () => baseDir;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const settingsFile = () => path.join(baseDir, 'game-settings.json');
function settings() { return { ...DEFAULTS, ...readJson(settingsFile(), {}) }; }
function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  next.ram = Math.min(32, Math.max(1, Math.round(Number(next.ram) || DEFAULTS.ram)));
  next.width = Math.min(7680, Math.max(640, Math.round(Number(next.width) || DEFAULTS.width)));
  next.height = Math.min(4320, Math.max(480, Math.round(Number(next.height) || DEFAULTS.height)));
  if (!['windowed', 'fullscreen'].includes(next.windowMode)) next.windowMode = 'windowed';
  writeJson(settingsFile(), next);
  return next;
}

// Shared game files (versions, libraries, assets) — downloaded once for every instance.
function gameRoot() { const d = path.join(baseDir, 'minecraft'); fs.mkdirSync(d, { recursive: true }); return d; }
function profileDir(id) {
  const d = hooks.instanceDir(id);
  if (!d) throw new Error('That instance no longer exists.');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function updateProfile(id, patch) { hooks.updateInstance(id, patch); }

module.exports = { init, configure, getBaseDir, readJson, writeJson, settings, saveSettings, gameRoot, profileDir, updateProfile };
