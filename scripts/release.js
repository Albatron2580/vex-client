// Prepares a release: bumps the version, dates the changelog entry, commits and tags.
// Usage: npm run release -- patch|minor|major [--critical] [--minimum 1.2.0]
//   patch  bug and security fixes            1.1.0 -> 1.1.1
//   minor  new features, themes, UI changes  1.1.1 -> 1.2.0
//   major  big redesigns / breaking changes  1.2.0 -> 2.0.0
//   --critical       users are told it's important; it downloads even with auto-download off
//   --minimum X.Y.Z  every version below X.Y.Z is treated as needing this update (critical)
// Write your notes under "## Unreleased" in CHANGELOG.md first. Then `git push --follow-tags`
// starts the GitHub Actions build that publishes it to everyone.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('../lib/semver');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const kind = args[0];
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: npm run release -- patch|minor|major [--critical] [--minimum X.Y.Z]');
  process.exit(1);
}
const critical = args.includes('--critical');
const mi = args.indexOf('--minimum');
const minimum = mi >= 0 ? args[mi + 1] : '';
if (minimum && !semver.valid(minimum)) { console.error(`--minimum needs a version like 1.2.0, got "${minimum}"`); process.exit(1); }

const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const next = semver.bump(pkg.version, kind);

const clFile = path.join(root, 'CHANGELOG.md');
let cl = fs.readFileSync(clFile, 'utf8');
// --notes-env VAR: take the notes from an environment variable (the admin panel passes them this way)
const ne = args.indexOf('--notes-env');
if (ne >= 0) {
  const text = String(process.env[args[ne + 1]] || '').replace(/\r/g, '').trim();
  if (!text) { console.error('No release notes given.'); process.exit(1); }
  if (/^##\s/m.test(text)) { console.error('Release notes cannot contain "## " headings (use ### instead).'); process.exit(1); }
  cl = cl.replace(/^##\s+Unreleased\s*$/m, `## Unreleased\n\n${text}\n`);
}
const um = /^##\s+Unreleased\s*$/m.exec(cl);
if (!um) { console.error('CHANGELOG.md needs a "## Unreleased" section with your notes.'); process.exit(1); }
const after = cl.slice(um.index + um[0].length);
const nextHead = after.search(/^##\s/m);
const notes = (nextHead < 0 ? after : after.slice(0, nextHead)).trim();
if (!notes) { console.error('Write what changed under "## Unreleased" in CHANGELOG.md first.'); process.exit(1); }

const date = new Date().toISOString().slice(0, 10);
const tags = `${critical ? ' [critical]' : ''}${minimum ? ` [minimum ${minimum}]` : ''}`;
const updated = cl.slice(0, um.index) + `## Unreleased\n\n## ${next} - ${date}${tags}\n\n${notes}\n\n` + (nextHead < 0 ? '' : after.slice(nextHead));
fs.writeFileSync(clFile, updated);
pkg.version = next;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version ${next} (${kind}${critical ? ', critical' : ''}).`);

try {
  execSync('git add package.json CHANGELOG.md', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -m "Release v${next}"`, { cwd: root, stdio: 'inherit' });
  execSync(`git tag v${next}`, { cwd: root, stdio: 'inherit' });
  console.log(`\nTagged v${next}. Publish it with:\n  git push --follow-tags`);
} catch {
  console.log(`\nCould not commit/tag automatically. Do it yourself:\n  git commit -am "Release v${next}" && git tag v${next} && git push --follow-tags`);
}
