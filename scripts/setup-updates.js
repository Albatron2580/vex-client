// One-time setup for launcher updates.
// Usage: npm run setup-updates -- <github-user>/<repo>
//   - creates an Ed25519 signing key pair (private key -> update-signing-key.pem, never commit it)
//   - writes the GitHub repository and the PUBLIC key into package.json
// Then add the private key to GitHub: repo Settings -> Secrets and variables -> Actions ->
// New repository secret, name VEX_UPDATE_PRIVATE_KEY, value = the whole .pem file.
const fs = require('fs');
const path = require('path');
const release = require('../lib/release');

const root = path.join(__dirname, '..');
const arg = process.argv[2] || '';
const m = /^([\w.-]+)\/([\w.-]+)$/.exec(arg);
if (!m) {
  console.error('Usage: npm run setup-updates -- <github-user>/<repo>   e.g.  npm run setup-updates -- lyano/vex-client');
  process.exit(1);
}
const [, owner, repo] = m;
const keyFile = path.join(root, 'update-signing-key.pem');
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));

let publicKey = pkg.vexUpdate && pkg.vexUpdate.publicKey;
if (fs.existsSync(keyFile)) {
  console.log('Keeping the existing update-signing-key.pem.');
  const crypto = require('crypto');
  publicKey = crypto.createPublicKey(fs.readFileSync(keyFile, 'utf8')).export({ format: 'der', type: 'spki' }).toString('base64');
} else {
  const k = release.generateKeys();
  fs.writeFileSync(keyFile, k.privateKeyPem, { mode: 0o600 });
  publicKey = k.publicKeyB64;
  console.log('Created update-signing-key.pem (PRIVATE: keep it safe, never commit or share it).');
}

pkg.vexUpdate = { owner, repo, publicKey };
pkg.build.publish = [{ provider: 'github', owner, repo, releaseType: 'release' }];
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log(`package.json now points updates at github.com/${owner}/${repo}.`);
console.log('\nNext: add the private key as a GitHub Actions secret named VEX_UPDATE_PRIVATE_KEY');
console.log('(paste the whole contents of update-signing-key.pem). See RELEASING.md.');
