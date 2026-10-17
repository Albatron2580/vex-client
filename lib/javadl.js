// Downloads the Java runtime Minecraft itself uses (Mojang's official runtimes, the same files the
// official launcher installs), so players never have to install Java by hand.
// Files land in <vex>/runtime/<component>/ and every file is checked against Mojang's SHA-1.
const fs = require('fs');
const path = require('path');
const net = require('./net');

net.endpoints.javaRuntimes = net.endpoints.javaRuntimes || 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function platformKey(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return arch === 'ia32' ? 'linux-i386' : 'linux';
}

// Which runtime a Minecraft version wants, e.g. "java-runtime-delta" for 1.21 (Java 21).
function componentFor(meta) {
  if (meta && meta.javaVersion && meta.javaVersion.component) return meta.javaVersion.component;
  const major = (meta && meta.javaVersion && meta.javaVersion.majorVersion) || 8;
  return major >= 25 ? 'java-runtime-epsilon' : major >= 21 ? 'java-runtime-delta' : major >= 17 ? 'java-runtime-gamma' : major >= 16 ? 'java-runtime-alpha' : 'jre-legacy';
}

const EXE = process.platform === 'win32' ? 'java.exe' : 'java';
const dirFor = (root, component) => path.join(root, 'runtime', component);
const javaExe = (dir) => (process.platform === 'darwin' ? path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java') : path.join(dir, 'bin', EXE));

function installed(root, component) {
  const dir = dirFor(root, component);
  return fs.existsSync(path.join(dir, '.vex-complete')) && fs.existsSync(javaExe(dir)) ? javaExe(dir) : null;
}

// Downloads (or repairs) the runtime and returns the path of java(.exe).
async function ensure(root, meta, { onProgress = () => {}, platform, arch } = {}) {
  const component = componentFor(meta);
  const done = installed(root, component);
  if (done) return done;
  const all = await net.getJson(net.endpoints.javaRuntimes);
  const list = (all[platformKey(platform, arch)] || {})[component];
  if (!list || !list.length) throw new Error(`Mojang has no ${component} Java runtime for this computer (${platformKey(platform, arch)}). Install Java ${(meta.javaVersion || {}).majorVersion || ''} from https://adoptium.net instead.`);
  const manifest = await net.getJson(list[0].manifest.url);
  const dir = dirFor(root, component);
  const entries = Object.entries(manifest.files || {});
  const files = entries.filter(([, f]) => f.type === 'file' && f.downloads && f.downloads.raw);
  const total = files.reduce((n, [, f]) => n + (f.downloads.raw.size || 0), 0);
  let received = 0;
  const safe = (rel) => {
    const p = path.resolve(dir, rel);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('Bad path in the Java runtime manifest: ' + rel);
    return p;
  };
  for (const [rel, f] of entries) if (f.type === 'directory') fs.mkdirSync(safe(rel), { recursive: true });
  await net.pool(files, 8, async ([rel, f]) => {
    const dest = safe(rel);
    const raw = f.downloads.raw;
    if (!(fs.existsSync(dest) && fs.statSync(dest).size === raw.size && net.sha1File(dest) === raw.sha1)) {
      await net.download(raw.url, dest, { sha1: raw.sha1 });
    }
    if (f.executable && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    received += raw.size || 0;
    onProgress(received, total);
  });
  if (process.platform !== 'win32') {
    for (const [rel, f] of entries) {
      if (f.type !== 'link') continue;
      const p = safe(rel);
      try { fs.rmSync(p, { force: true }); fs.symlinkSync(f.target, p); } catch { /* links are optional extras */ }
    }
  }
  const exe = javaExe(dir);
  if (!fs.existsSync(exe)) throw new Error('The Java download finished but java was not in it. Try again.');
  fs.writeFileSync(path.join(dir, '.vex-complete'), JSON.stringify({ component, version: list[0].version && list[0].version.name, at: new Date().toISOString() }));
  return exe;
}

module.exports = { ensure, installed, componentFor, platformKey, dirFor };
