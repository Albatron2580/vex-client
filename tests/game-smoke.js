// End-to-end test of starting Minecraft the way the launcher does (run in CI under a virtual screen):
// new Fabric 1.21.11 profile -> Balanced performance preset (real Modrinth downloads) -> Vex mod + UI pack
// -> Mojang Java runtime download -> launch. Passes when the game reaches the title screen with the
// Vex mod and Sodium loaded; saves a screenshot of the title screen.
// Usage: node tests/game-smoke.js <out-dir>   (offline account: no Microsoft sign-in in CI)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const out = path.resolve(process.argv[2] || 'game-smoke');
fs.mkdirSync(out, { recursive: true });
const store = require('../lib/store');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-game-'));
store.init(base);
const perf = require('../lib/perf');
const vexAssets = require('../lib/vexassets');
const launch = require('../lib/launch');
const javadl = require('../lib/javadl');
const versions = require('../lib/versions');

const lines = [];
const seen = { vexMod: false, sodium: false, title: false, error: null };
let reported = false;
const report = (ok, why) => {
  if (reported) return;
  reported = true;
  fs.writeFileSync(path.join(out, 'game.log'), lines.join('\n'));
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok, why, seen }, null, 2));
  console.log((ok ? 'GAME OK: ' : 'GAME FAILED: ') + why);
  try { launch.stop(); } catch { /* already closed */ }
  setTimeout(() => process.exit(ok ? 0 : 1), 3000);
};
setTimeout(() => report(false, 'timed out after 12 minutes'), 12 * 60 * 1000);

(async () => {
  const MC = vexAssets.MOD_MC;
  store.saveSettings({ ram: 3, width: 1280, height: 720, theme: 'vex', vexInGame: true });
  const profile = store.createProfile({ name: 'CI test', version: MC, loader: 'fabric' });
  console.log('profile', profile.id, MC);
  const ctx = { onTask: () => {} };

  const p = await perf.apply(profile.id, { preset: 'balanced' }, ctx);
  console.log('performance preset:', JSON.stringify(p));
  const prep = await vexAssets.prepare(store.getProfile(profile.id), { log: (l) => console.log(l), ctx });
  console.log('vex assets:', JSON.stringify(prep));
  console.log('mods:', fs.readdirSync(path.join(store.profileDir(profile.id), 'mods')).join(', '));

  // Use Mojang's runtime (the same path a PC without Java takes).
  const meta = await versions.versionMeta(MC);
  const exe = await javadl.ensure(store.getBaseDir(), meta);
  console.log('java:', exe);
  store.saveSettings({ javaPath: exe });

  // skip Minecraft's first-run accessibility screen so the screenshot shows the title screen
  const packs = require('../lib/packs');
  if (await packs.ensureOptions(store.getProfile(profile.id))) fs.appendFileSync(path.join(store.profileDir(profile.id), 'options.txt'), 'onboardAccessibility:false\n');

  const session = { access_token: '0', client_token: '0', uuid: '0a1b2c3d4e5f60718293a4b5c6d7e8f9', name: 'VexTester', user_properties: '{}', meta: { type: 'msa', demo: false } };
  const fresh = store.getProfile(profile.id);
  await launch.launch({
    profile: fresh,
    session,
    perf: perf.launchOptions(fresh),
    emit: (evt) => {
      if (evt.type === 'log') {
        for (const l of evt.lines) {
          lines.push(l);
          if (/Vex Client mod loaded/.test(l)) seen.vexMod = true;
          if (/\bsodium\b/i.test(l) && /Loading|loaded|Sodium/i.test(l)) seen.sodium = true;
          if (/Sound engine started|Created: \d+x\d+x\d+ minecraft:textures\/atlas\/gui/.test(l)) {
            if (!seen.title) {
              seen.title = true;
              setTimeout(() => {
                try { execFileSync('import', ['-window', 'root', path.join(out, 'title-screen.png')]); } catch (e) { lines.push('screenshot failed: ' + e.message); }
                report(seen.vexMod, seen.vexMod ? 'reached the title screen with the Vex mod loaded' + (seen.sodium ? ' and Sodium' : '') : 'title screen reached but the Vex mod did not load');
              }, 20000);
            }
          }
          if (/Exception in thread "main"|Mixin apply failed|Incompatible mods found|crashed/i.test(l) && !seen.error) seen.error = l;
        }
      }
      if (evt.type === 'game' && evt.state === 'closed') report(false, `Minecraft closed with code ${evt.code}${seen.error ? ': ' + seen.error : ''}`);
      if (evt.type === 'status') console.log('status:', evt.text);
    },
  });
})().catch((e) => report(false, e.stack || String(e)));
