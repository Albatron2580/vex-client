// Minimal semantic versioning: MAJOR.MINOR.PATCH with an optional -prerelease tag.
function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' };
}

const valid = (v) => !!parse(v);

// -1 if a < b, 0 if equal, 1 if a > b. A prerelease sorts before its release (1.2.0-beta < 1.2.0).
function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// 'major' | 'minor' | 'patch' | null: what kind of step it is from `from` to `to`.
function diff(from, to) {
  const x = parse(from);
  const y = parse(to);
  if (!x || !y || compare(from, to) >= 0) return null;
  if (y.major !== x.major) return 'major';
  if (y.minor !== x.minor) return 'minor';
  return 'patch';
}

function bump(v, kind) {
  const x = parse(v);
  if (!x) throw new Error(`Not a version: ${v}`);
  if (kind === 'major') return `${x.major + 1}.0.0`;
  if (kind === 'minor') return `${x.major}.${x.minor + 1}.0`;
  if (kind === 'patch') return `${x.major}.${x.minor}.${x.patch + 1}`;
  throw new Error('Use major, minor or patch.');
}

module.exports = { parse, valid, compare, diff, bump };
