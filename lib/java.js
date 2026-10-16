// Finds Java installs on this PC and picks one that fits a Minecraft version.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const EXE = process.platform === 'win32' ? 'java.exe' : 'java';

function dirs(base) {
  try { return fs.readdirSync(base).map((n) => path.join(base, n)); } catch { return []; }
}

function candidatePaths() {
  const found = new Set();
  const add = (p) => { if (p && fs.existsSync(p)) found.add(path.normalize(p)); };
  if (process.env.JAVA_HOME) add(path.join(process.env.JAVA_HOME, 'bin', EXE));

  if (process.platform === 'win32') {
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean);
    const vendors = ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft', 'Semeru', 'AdoptOpenJDK', 'Eclipse Foundation'];
    for (const base of pf) for (const v of vendors) for (const d of dirs(path.join(base, v))) add(path.join(d, 'bin', EXE));
    // Runtimes downloaded by the official Minecraft launcher
    const mcRuntimes = [
      path.join(process.env.APPDATA || '', '.minecraft', 'runtime'),
      path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
    ];
    for (const r of mcRuntimes) {
      for (const comp of dirs(r)) for (const arch of dirs(comp)) for (const inner of dirs(arch)) add(path.join(inner, 'bin', EXE));
    }
  } else {
    for (const d of dirs('/usr/lib/jvm')) add(path.join(d, 'bin', EXE));
    for (const p of (process.env.PATH || '').split(path.delimiter)) add(path.join(p, EXE));
  }
  // anything called "java" on PATH
  for (const p of (process.env.PATH || '').split(path.delimiter)) add(path.join(p, EXE));
  return [...found];
}

function parseVersion(text) {
  const m = /version "([^"]+)"/.exec(text) || /openjdk (\d+)/i.exec(text);
  if (!m) return null;
  const v = m[1];
  const parts = v.split(/[._+-]/);
  const major = parts[0] === '1' ? Number(parts[1]) : Number(parts[0]);
  return Number.isFinite(major) ? { major, full: v } : null;
}

function probe(exe) {
  return new Promise((resolve) => {
    execFile(exe, ['-version'], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stderr || ''}\n${stdout || ''}`;
      const v = parseVersion(out);
      if (!v) return resolve(null);
      resolve({ exe, major: v.major, version: v.full, is64: /64-Bit/i.test(out) });
    });
  });
}

let cache = null;

async function detect(force = false) {
  if (cache && !force) return cache;
  const results = (await Promise.all(candidatePaths().map(probe))).filter(Boolean);
  // de-duplicate identical installs found through different paths
  const seen = new Set();
  const unique = results.filter((r) => {
    let key;
    try { key = fs.realpathSync(r.exe).toLowerCase(); } catch { key = r.exe.toLowerCase(); }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cache = unique.sort((a, b) => b.major - a.major);
  return cache;
}

function installHelp(need) {
  const id = `EclipseAdoptium.Temurin.${need}.JRE`;
  return `Minecraft needs Java ${need} or newer, but none was found. Install it from https://adoptium.net (choose Temurin ${need}) or run this in PowerShell: winget install ${id}. Then press "Scan again" in Settings.`;
}

// Choose the install to use: the user's own choice if it is new enough, otherwise the smallest
// detected version that satisfies `need`.
async function pick(need, preferredPath) {
  if (preferredPath) {
    const p = await probe(preferredPath);
    if (!p) throw new Error(`The Java you chose in Settings can't be run: ${preferredPath}. Pick another one or switch to automatic.`);
    if (p.major < need) throw new Error(`Minecraft needs Java ${need} or newer, but the Java you chose in Settings is version ${p.major}. Pick a newer one or switch to automatic.`);
    return p;
  }
  const all = await detect();
  const fit = all.filter((j) => j.major >= need).sort((a, b) => a.major - b.major);
  if (!fit.length) {
    const err = new Error(installHelp(need));
    err.code = 'NO_JAVA';
    throw err;
  }
  return fit[0];
}

module.exports = { detect, probe, pick, parseVersion, installHelp, candidatePaths };
