// Compiles installer/vex-installer.nsi into release/VEX-CLIENT-Setup-<version>.exe.
// Uses makensis from PATH, the standard Windows NSIS folder, or electron-builder's NSIS cache.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
if (!fs.existsSync(path.join(root, "release", "win-unpacked", "VEX CLIENT.exe"))) {
  console.error("release/win-unpacked is missing — run electron-builder --dir first."); process.exit(1);
}

function findMakensis() {
  const found = [];
  const add = (bin) => { if (fs.existsSync(bin)) found.push(bin); };
  if (process.platform === "win32") {
    for (const base of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]) if (base) add(path.join(base, "NSIS", "makensis.exe"));
  }
  // electron-builder downloads NSIS to its cache: …/electron-builder[/Cache]/nsis-3.x/nsis-3.x-<id>/
  const roots = [process.env.ELECTRON_BUILDER_CACHE, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "electron-builder", "Cache"),
    path.join(os.homedir(), ".cache", "electron-builder"), path.join(os.homedir(), "Library", "Caches", "electron-builder")].filter(Boolean);
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const a of fs.readdirSync(r).filter((x) => /^nsis-\d/.test(x))) {
      for (const d of [path.join(r, a), ...fs.readdirSync(path.join(r, a)).map((x) => path.join(r, a, x))]) {
        if (process.platform === "win32") add(path.join(d, "Bin", "makensis.exe"));
        else add(path.join(d, process.platform === "darwin" ? "mac" : "linux", "makensis"));
      }
    }
  }
  found.push("makensis");
  for (const c of found) {
    try { execFileSync(c, ["-VERSION"], { stdio: "pipe", env: nsisEnv(c) }); return c; } catch { /* next */ }
  }
  return null;
}

// A cached (portable) NSIS needs NSISDIR pointing at the folder that holds Include/ and Stubs/.
function nsisEnv(bin) {
  const env = { ...process.env };
  if (bin === "makensis") return env;
  for (const dir of [path.dirname(bin), path.dirname(path.dirname(bin))]) {
    if (fs.existsSync(path.join(dir, "Include", "MUI2.nsh"))) { env.NSISDIR = dir; break; }
  }
  return env;
}

const makensis = findMakensis();
if (!makensis) { console.error("NSIS (makensis) not found. Install it from https://nsis.sourceforge.io or with: winget install NSIS.NSIS"); process.exit(1); }
const env = nsisEnv(makensis);
execFileSync(makensis, ["-V2", `-DVERSION=${version}`, "vex-installer.nsi"], { cwd: path.join(root, "installer"), stdio: "inherit", env });
console.log(`Built release/VEX-CLIENT-Setup-${version}.exe`);
