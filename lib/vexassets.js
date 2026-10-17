// Puts the Vex in-game look into profiles before Minecraft starts:
//  - the "Vex Client UI" resource pack (VEX CLIENT title logo and buttons in the launcher theme's colours) for every profile,
//  - the Vex Client mod (in-game settings on Right Shift, HUD, zoom) for Fabric 1.21.11 profiles, plus Fabric API.
// Both files ship inside the launcher (assets/), so they update together with launcher updates.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const packs = require('./packs');
const modrinth = require('./modrinth');

// where the bundled pack and mod live (tests point this elsewhere)
const paths = { assets: path.join(__dirname, '..', 'assets') };
const PACK_NAME = 'Vex Client UI.zip';
const MOD_FILE = 'vex-client-mod.jar';
const MOD_MC = '1.21.11';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function copyIfChanged(src, dest) {
  if (fs.existsSync(dest) && sha(dest) === sha(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest + '.tmp');
  fs.renameSync(dest + '.tmp', dest);
  return true;
}

const hslHex = (h, sat, l) => {
  sat /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
};
const hueOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (!d) return 220;
  const h = 60 * (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return Math.round((h + 360) % 360);
};
// Same idea as the launcher's biome palette for themes that don't define one (renderer/biome.js).
function landFromAccent(accent) {
  const h = hueOf(accent);
  const H = (s, l) => hslHex(h, s, l);
  return {
    sky: [H(55, 4), H(55, 14), H(60, 34)], glow: H(80, 60), body: { color: H(45, 88) },
    far: H(40, 30), near: H(45, 7), fog: H(55, 32), grass: [H(45, 40), H(55, 34)],
    trees: { type: 'oak', trunk: H(35, 6), leaves: [H(45, 14), H(50, 18), H(40, 11)] },
  };
}

// The active launcher theme, for Minecraft: menu background colours for the mod (config/vex-theme.json)
// and which coloured UI pack (logo + buttons) to install.
function activeTheme() {
  const T = require('../renderer/themes');
  const s = store.settings();
  const t = T.get(T.effective(s, new Date()).id);
  const custom = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '';
  return { t, accent: custom || t.accent };
}

function writeTheme(profile) {
  try {
    const { t, accent } = activeTheme();
    const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c);
    const shade = (hex, k) => '#' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))).map((v) => v.toString(16).padStart(2, '0')).join('');
    const land = t.land || landFromAccent(accent);
    const data = {
      theme: t.id,
      accent,
      leaves: (t.leafColors || [accent, shade(accent, 0.3), shade(accent, -0.3), shade(accent, 0.55)]).filter(isHex),
      land: {
        sky: land.sky.filter(isHex), far: land.far, near: land.near, fog: land.fog, grass: land.grass,
        snow: land.snow || undefined, moon: (land.body && land.body.color) || '#e4ecff', glow: land.glow,
        trees: land.trees ? { type: land.trees.type, trunk: land.trees.trunk, leaves: land.trees.leaves } : undefined,
      },
    };
    if (data.land.sky.length < 3) delete data.land;
    store.writeJson(path.join(store.profileDir(profile.id), 'config', 'vex-theme.json'), data);
  } catch { /* the mod falls back to Vex blue */ }
}

async function prepare(profile, { log = () => {}, ctx } = {}) {
  if (store.settings().vexInGame === false) return { skipped: true };
  const out = { pack: false, mod: false };
  writeTheme(profile);
  // First launch of a new profile: create options.txt now so the pack (and performance settings) are on
  // from the very first start instead of the second.
  try {
    if (await packs.ensureOptions(profile)) {
      const fresh = store.getProfile(profile.id);
      if (fresh && fresh.perf && fresh.perf.pendingVideo) require('./perf').launchOptions(fresh);
    }
  } catch (e) { log(`Could not prepare options.txt yet: ${e.message}`); }
  // resource pack
  // the UI pack coloured for the active theme (assets/ui-packs/<theme>.zip)
  let pack = path.join(paths.assets, 'ui-packs', `${activeTheme().t.id}.zip`);
  if (!fs.existsSync(pack)) pack = path.join(paths.assets, 'ui-packs', 'vex.zip');
  if (fs.existsSync(pack)) {
    const dest = path.join(packs.dirFor(profile, 'resourcepack'), PACK_NAME);
    if (copyIfChanged(pack, dest)) log('Installed the Vex Client UI resource pack');
    try {
      const list = packs.listResourcePacks(profile).packs;
      const me = list.find((p) => p.name === PACK_NAME);
      if (me && !me.enabled) packs.setPackEnabled(profile, PACK_NAME, true);
      out.pack = true;
    } catch (e) { log(`Vex UI pack is installed; turn it on in Options → Resource Packs (${e.message})`); }
  }
  // mod (Fabric, the Minecraft version it was built for)
  const mod = path.join(paths.assets, MOD_FILE);
  if (fs.existsSync(mod) && profile.loader === 'fabric' && profile.version === MOD_MC) {
    const dir = modrinth.modsDir(profile);
    if (fs.existsSync(path.join(dir, MOD_FILE + '.disabled'))) return out; // the user turned it off on the Mods page
    // Exactly one copy of the Vex mod: the newest of the bundled one and any copy dropped in by hand
    // (two copies would stop the game from starting; an older copy would show an old menu).
    const versions = require('./versions');
    const verOf = (f) => { try { return modrinth.inspectJar(f).version || '0'; } catch { return '0'; } };
    let best = mod;
    let bestVer = verOf(mod);
    const others = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.jar$/i.test(n) && n !== MOD_FILE).filter((n) => {
      try { return modrinth.inspectJar(path.join(dir, n)).id === 'vexclient'; } catch { return false; }
    }) : [];
    for (const n of others) {
      const v = verOf(path.join(dir, n));
      if (versions.cmpVersions(v, bestVer) > 0) { best = path.join(dir, n); bestVer = v; }
    }
    const dest = path.join(dir, MOD_FILE);
    if (best === mod && fs.existsSync(dest) && versions.cmpVersions(verOf(dest), bestVer) > 0) { best = dest; bestVer = verOf(dest); }
    if (best === dest) { /* the copy already in the profile is the newest: keep it */ }
    else if (best !== mod) { copyIfChanged(best, dest); log(`Using your newer Vex Client mod ${bestVer}`); }
    else if (copyIfChanged(mod, path.join(dir, MOD_FILE))) log(`Installed the Vex Client mod ${bestVer}`);
    for (const n of others) { try { fs.rmSync(path.join(dir, n)); } catch { /* in use: removed next time */ } }
    const hasApi = modrinth.installedMods(profile).some((m) => m.modId === 'fabric-api' || m.slug === 'fabric-api');
    if (!hasApi) {
      try { await modrinth.installMod(profile, 'fabric-api', ctx); log('Installed Fabric API (needed by the Vex Client mod)'); } catch (e) { log(`Could not install Fabric API: ${e.message}`); }
    }
    out.mod = true;
  }
  return out;
}

module.exports = { prepare, paths, PACK_NAME, MOD_FILE, MOD_MC };
