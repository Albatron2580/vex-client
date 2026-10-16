// The signed release manifest ("vex-release.json") shared by the launcher and the release scripts.
//
// Every GitHub release carries three files next to the installer:
//   latest.yml             made by electron-builder; electron-updater reads it
//   vex-release.json       version, type, critical flag, notes and the installer's SHA-512
//   vex-release.json.sig   Ed25519 signature of vex-release.json, made in CI with your private key
//
// The launcher only installs an update when the signature matches the public key built into it
// AND the downloaded installer's SHA-512 matches the manifest. Someone who could change files on
// the release (or in transit) still cannot get the launcher to run their installer without the key.
const crypto = require('crypto');
const semver = require('./semver');

const TYPES = ['major', 'minor', 'patch'];

function validate(m) {
  if (!m || typeof m !== 'object') throw new Error('The release manifest is empty.');
  if (m.schema !== 1) throw new Error(`Unsupported release manifest version ${m.schema}.`);
  if (!semver.valid(m.version)) throw new Error(`The release manifest has an invalid version "${m.version}".`);
  if (m.minimumVersion && !semver.valid(m.minimumVersion)) throw new Error('The release manifest has an invalid minimumVersion.');
  if (!TYPES.includes(m.type)) throw new Error('The release manifest has no valid update type.');
  if (!Array.isArray(m.files) || !m.files.length) throw new Error('The release manifest lists no files.');
  for (const f of m.files) {
    if (!f || typeof f.name !== 'string' || !/^[\w .()+-]+\.exe$/i.test(f.name)) throw new Error('The release manifest lists an unexpected file.');
    if (typeof f.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(f.sha512)) throw new Error('The release manifest has an invalid checksum.');
    if (!Number.isInteger(f.size) || f.size <= 0) throw new Error('The release manifest has an invalid file size.');
  }
  return {
    schema: 1,
    version: m.version,
    type: m.type,
    critical: m.critical === true,
    minimumVersion: m.minimumVersion || '',
    releaseDate: String(m.releaseDate || ''),
    notes: String(m.notes || '').slice(0, 20000),
    files: m.files.map((f) => ({ name: f.name, sha512: f.sha512, size: f.size })),
  };
}

function publicKeyFrom(b64) {
  if (!b64 || /REPLACE|YOUR_/i.test(b64)) return null;
  return crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
}

// bytes: Buffer of vex-release.json exactly as downloaded; sigB64: contents of vex-release.json.sig
function verify(bytes, sigB64, publicKeyB64) {
  const key = publicKeyFrom(publicKeyB64);
  if (!key) throw new Error('This build has no update signing key, so it cannot verify updates.');
  let sig;
  try { sig = Buffer.from(String(sigB64).trim(), 'base64'); } catch { sig = Buffer.alloc(0); }
  if (sig.length !== 64 || !crypto.verify(null, bytes, key, sig)) {
    throw new Error('The update failed its signature check, so it was not installed. Your launcher is unchanged.');
  }
  let json;
  try { json = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The release manifest is not valid JSON.'); }
  return validate(json);
}

function sign(bytes, privateKeyPem) {
  return crypto.sign(null, bytes, crypto.createPrivateKey(privateKeyPem)).toString('base64');
}

function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyB64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  };
}

// Release notes are written in CHANGELOG.md:
//   ## 1.2.0 - 2026-10-20
//   ## 1.2.1 - 2026-10-22 [critical]
//   ## 1.3.0 - 2026-11-01 [minimum 1.2.1]
function changelogEntry(markdown, version) {
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}(\\s|$)`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const head = lines[start];
  const min = /\[minimum\s+v?([0-9.]+)\]/i.exec(head);
  return {
    critical: /\[critical\]/i.test(head),
    minimumVersion: min ? min[1] : '',
    date: (/(\d{4}-\d{2}-\d{2})/.exec(head) || [])[1] || '',
    notes: lines.slice(start + 1, end).join('\n').trim(),
  };
}

module.exports = { validate, verify, sign, generateKeys, changelogEntry, publicKeyFrom };
