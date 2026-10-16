// Troubleshooting checks shown on the Help page.
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');
const net = require('./net');
const java = require('./java');
const versions = require('./versions');
const auth = require('./auth');

async function reach(name, url) {
  try {
    const res = await net.request(url, { method: 'HEAD', timeout: 7000, allowStatus: true });
    return { name, ok: res.status < 500, detail: res.status < 500 ? 'Reachable' : `Server error ${res.status}` };
  } catch (e) {
    return { name, ok: false, detail: "Can't connect. Check your internet connection, firewall or VPN." };
  }
}

async function run() {
  const checks = [];
  const s = store.settings();
  const profile = store.selectedProfile();

  // Java for the selected profile
  try {
    let need;
    try {
      need = versions.javaMajor(await versions.versionMeta(profile.version));
    } catch { // offline and not cached: estimate from the version number
      const m = /^1\.(\d+)(?:\.(\d+))?/.exec(profile.version);
      const minor = m ? Number(m[1]) : 99;
      const patch = m ? Number(m[2] || 0) : 0;
      need = minor > 20 || (minor === 20 && patch >= 5) ? 21 : minor >= 17 ? 17 : 8;
    }
    const j = await java.pick(need, s.javaPath);
    checks.push({ name: `Java for ${profile.name}`, ok: true, detail: `Java ${j.major} at ${j.exe}` });
  } catch (e) {
    checks.push({ name: `Java for ${profile ? profile.name : 'profile'}`, ok: false, detail: e.message });
  }

  checks.push(...await Promise.all([
    reach('Mojang version list', net.endpoints.mojangManifest),
    reach('Modrinth', net.endpoints.modrinth + '/'),
    reach('Fabric meta', net.endpoints.fabric + '/versions/game'),
    reach('Minecraft services', net.endpoints.mcServices + '/'),
    reach('Microsoft sign-in', 'https://login.microsoftonline.com/'),
  ]));

  try {
    const root = store.gameRoot();
    const probe = path.join(root, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    const st = fs.statfsSync(root);
    const free = st.bavail * st.bsize;
    const gb = (free / 1024 ** 3).toFixed(1);
    checks.push({ name: 'Game folder', ok: free > 2 * 1024 ** 3, detail: `${root} is writable, ${gb} GB free${free > 2 * 1024 ** 3 ? '' : ' (low: Minecraft needs a few GB)'}` });
  } catch (e) {
    checks.push({ name: 'Game folder', ok: false, detail: `Can't write to the game folder: ${e.message}` });
  }

  checks.push({ name: 'Secure token storage', ok: auth.canEncrypt(), detail: auth.canEncrypt() ? 'Sign-in tokens are encrypted for your Windows user.' : 'Not available: you will have to sign in again every time the launcher starts.' });
  const accounts = auth.list();
  checks.push({ name: 'Microsoft account', ok: accounts.some((a) => a.active && !a.needsLogin), detail: accounts.length ? accounts.map((a) => `${a.name}${a.active ? ' (active)' : ''}${a.needsLogin ? ' needs sign-in' : ''}`).join(', ') : 'No account signed in.' });
  return checks;
}

function report(checks, extra) {
  const lines = [
    'Vex Client diagnostic report',
    `Time: ${new Date().toISOString()}`,
    `System: ${os.type()} ${os.release()} ${os.arch()}, ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB RAM`,
    ...Object.entries(extra || {}).map(([k, v]) => `${k}: ${v}`),
    '',
    ...checks.map((c) => `[${c.ok ? 'OK' : 'PROBLEM'}] ${c.name}: ${c.detail}`),
  ];
  return lines.join('\n');
}

module.exports = { run, report };
