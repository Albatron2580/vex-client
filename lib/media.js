// Local capes (imported PNG files), screenshots and logs.
const fs = require('fs');
const path = require('path');
const store = require('./store');

// ---------- local capes ----------
const capesDir = () => { const d = path.join(store.getBaseDir(), 'capes'); fs.mkdirSync(d, { recursive: true }); return d; };

function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig) || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Returns the cape layout name, or throws a readable error.
function capeLayout(buf) {
  const s = pngSize(buf);
  if (!s) throw new Error('This is not a valid PNG image.');
  const { width: w, height: h } = s;
  if (w > 4096 || h > 4096) throw new Error('This image is too large (4096 pixels is the limit).');
  if (w % 64 === 0 && h * 2 === w) return { layout: 'minecraft', width: w, height: h };
  if (w % 22 === 0 && h * 22 === w * 17) return { layout: 'optifine', width: w, height: h };
  if (w % 46 === 0 && h * 46 === w * 22) return { layout: 'optifine-hd', width: w, height: h };
  throw new Error(`A cape image must be 64×32 (or a multiple like 128×64), 22×17 or 46×22 pixels. This one is ${w}×${h}.`);
}

function listCapes() {
  const dir = capesDir();
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((name) => {
    const buf = fs.readFileSync(path.join(dir, name));
    let info = { layout: 'unknown', width: 0, height: 0 };
    try { info = capeLayout(buf); } catch { /* keep unknown */ }
    return { name, size: buf.length, ...info, dataUrl: 'data:image/png;base64,' + buf.toString('base64'), active: store.settings().activeCape === name };
  });
}

function cleanFileName(name) {
  const stem = path.basename(name, path.extname(name)).replace(/[^\w .\-()]/g, '_').slice(0, 50) || 'cape';
  return stem + '.png';
}

function importCapes(paths) {
  const dir = capesDir();
  const added = [];
  for (const p of paths) {
    const stat = fs.statSync(p);
    if (!/\.png$/i.test(p)) throw new Error(`${path.basename(p)} is not a PNG file.`);
    if (stat.size > 5 * 1024 * 1024) throw new Error(`${path.basename(p)} is larger than 5 MB.`);
    const buf = fs.readFileSync(p);
    capeLayout(buf);
    let name = cleanFileName(p);
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = cleanFileName(p).replace(/\.png$/, ` (${i}).png`);
    fs.writeFileSync(path.join(dir, name), buf);
    added.push(name);
  }
  return added;
}

function capeFile(name) {
  if (path.basename(name) !== name || !/\.png$/i.test(name)) throw new Error('Invalid cape name.');
  const f = path.join(capesDir(), name);
  if (!fs.existsSync(f)) throw new Error('That cape no longer exists.');
  return f;
}

function removeCape(name) {
  fs.rmSync(capeFile(name), { force: true });
  if (store.settings().activeCape === name) store.saveSettings({ activeCape: '' });
}

function selectCape(name) {
  if (name) capeFile(name);
  store.saveSettings({ activeCape: name || '' });
}

// ---------- screenshots ----------
const shotsDir = (profile) => { const d = path.join(store.profileDir(profile.id), 'screenshots'); fs.mkdirSync(d, { recursive: true }); return d; };

function listScreenshots(profile) {
  const dir = shotsDir(profile);
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, time: st.mtimeMs, path: path.join(dir, name) };
  }).sort((a, b) => b.time - a.time);
}

function deleteScreenshot(profile, name) {
  if (path.basename(name) !== name || !/\.(png|jpe?g)$/i.test(name)) throw new Error('Invalid screenshot name.');
  fs.rmSync(path.join(shotsDir(profile), name), { force: true });
}

// ---------- logs ----------
function listLogs(profile, launcherLog) {
  const pd = store.profileDir(profile.id);
  const out = [];
  if (fs.existsSync(path.join(pd, 'logs', 'latest.log'))) out.push({ id: 'latest', label: 'Game log (latest.log)' });
  if (fs.existsSync(launcherLog)) out.push({ id: 'launcher', label: 'Launcher log' });
  const crashDir = path.join(pd, 'crash-reports');
  if (fs.existsSync(crashDir)) {
    fs.readdirSync(crashDir).filter((f) => /\.txt$/i.test(f)).map((f) => ({ f, t: fs.statSync(path.join(crashDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t).slice(0, 10).forEach(({ f }) => out.push({ id: 'crash:' + f, label: 'Crash report: ' + f }));
  }
  return out;
}

function readLog(profile, id, launcherLog) {
  const pd = store.profileDir(profile.id);
  let file;
  if (id === 'latest') file = path.join(pd, 'logs', 'latest.log');
  else if (id === 'launcher') file = launcherLog;
  else if (id.startsWith('crash:')) {
    const n = id.slice(6);
    if (path.basename(n) !== n || !/\.txt$/i.test(n)) throw new Error('Invalid log.');
    file = path.join(pd, 'crash-reports', n);
  } else throw new Error('Unknown log.');
  if (!fs.existsSync(file)) return '';
  const size = fs.statSync(file).size;
  const max = 300 * 1024;
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, max);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return (size > max ? '… (showing the last 300 KB)\n' : '') + buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}

module.exports = {
  listCapes, importCapes, removeCape, selectCape, capeLayout, capesDir,
  listScreenshots, deleteScreenshot, shotsDir, listLogs, readLog,
};
