// Puts the Vex in-game look into profiles before Minecraft starts:
//  - the "Vex Client UI" resource pack (VEX CLIENT title logo, Vex buttons, panorama, splashes) for every profile,
//  - the Vex Client mod (in-game settings on Right Shift, HUD, zoom) for Fabric 1.21.11 profiles, plus Fabric API.
// Both files ship inside the launcher (assets/), so they update together with launcher updates.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const packs = require('./packs');
const modrinth = require('./modrinth');

const ASSETS = path.join(__dirname, '..', 'assets');
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

async function prepare(profile, { log = () => {}, ctx } = {}) {
  if (store.settings().vexInGame === false) return { skipped: true };
  const out = { pack: false, mod: false };
  // resource pack
  const pack = path.join(ASSETS, 'vex-ui-pack.zip');
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
  const mod = path.join(ASSETS, MOD_FILE);
  if (fs.existsSync(mod) && profile.loader === 'fabric' && profile.version === MOD_MC) {
    const dir = modrinth.modsDir(profile);
    if (fs.existsSync(path.join(dir, MOD_FILE + '.disabled'))) return out; // the user turned it off on the Mods page
    if (copyIfChanged(mod, path.join(dir, MOD_FILE))) log('Installed the Vex Client mod');
    const hasApi = modrinth.installedMods(profile).some((m) => m.modId === 'fabric-api' || m.slug === 'fabric-api');
    if (!hasApi) {
      try { await modrinth.installMod(profile, 'fabric-api', ctx); log('Installed Fabric API (needed by the Vex Client mod)'); } catch (e) { log(`Could not install Fabric API: ${e.message}`); }
    }
    out.mod = true;
  }
  return out;
}

module.exports = { prepare, PACK_NAME, MOD_FILE, MOD_MC };
