// Runs in CI after electron-builder: writes dist/vex-release.json and signs it.
// Needs the private key in the VEX_UPDATE_PRIVATE_KEY environment variable (a GitHub secret).
// Usage: node scripts/make-manifest.js [distDir]
const fs = require('fs');
const path = require('path');
const release = require('../lib/release');
const semver = require('../lib/semver');

const root = path.join(__dirname, '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// latest.yml is simple YAML written by electron-builder; read just what we need.
function readLatestYml(text) {
  const out = { files: [] };
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const item = /^\s*-\s+url:\s*(.+)$/.exec(raw);
    if (item) { cur = { url: item[1].trim().replace(/^['"]|['"]$/g, '') }; out.files.push(cur); continue; }
    const kv = /^(\s*)(\w+):\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const val = kv[3].trim().replace(/^['"]|['"]$/g, '');
    if (kv[1].length && cur) cur[kv[2]] = val;
    else { cur = null; if (kv[2] !== 'files') out[kv[2]] = val; }
  }
  return out;
}

const key = process.env.VEX_UPDATE_PRIVATE_KEY;
if (!key) { console.error('VEX_UPDATE_PRIVATE_KEY is not set. Add it as a GitHub Actions secret (see RELEASING.md).'); process.exit(1); }

const yml = readLatestYml(fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8'));
if (yml.version !== pkg.version) { console.error(`latest.yml is for ${yml.version} but package.json says ${pkg.version}.`); process.exit(1); }
const files = yml.files.filter((f) => /\.exe$/i.test(f.url)).map((f) => {
  const full = path.join(dist, f.url);
  const size = fs.statSync(full).size;
  if (String(size) !== String(f.size)) throw new Error(`Size mismatch for ${f.url}`);
  return { name: f.url, sha512: f.sha512, size };
});

let entry = null;
try { entry = release.changelogEntry(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), pkg.version); } catch { /* no changelog */ }
const prev = (() => { try { return require('child_process').execSync('git describe --tags --abbrev=0 HEAD^', { cwd: root }).toString().trim().replace(/^v/, ''); } catch { return ''; } })();
const type = (prev && semver.valid(prev) && semver.diff(prev, pkg.version)) || 'patch';

const manifest = release.validate({
  schema: 1,
  version: pkg.version,
  type,
  critical: !!(entry && entry.critical),
  minimumVersion: (entry && entry.minimumVersion) || '',
  releaseDate: yml.releaseDate || new Date().toISOString(),
  notes: (entry && entry.notes) || '',
  files,
});
const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
const sig = release.sign(bytes, key);
// make sure the key in CI matches the public key users have
release.verify(bytes, sig, pkg.vexUpdate.publicKey);
fs.writeFileSync(path.join(dist, 'vex-release.json'), bytes);
fs.writeFileSync(path.join(dist, 'vex-release.json.sig'), sig + '\n');
console.log(`Signed vex-release.json for ${manifest.version} (${manifest.type}${manifest.critical ? ', critical' : ''}).`);

// release notes for the GitHub release page
fs.writeFileSync(path.join(dist, 'release-notes.md'), manifest.notes || `Vex Client ${manifest.version}`);
