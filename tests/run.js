// Offline tests: the launcher's logic against small local fake servers (no real Mojang/Modrinth/Microsoft).
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');
const lib = (n) => require(path.join(root, 'lib', n));

// ---------- helpers ----------
function crc32(buf) {
  let c, crc = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
// Minimal ZIP writer. entries: {name: Buffer|string}; deflate if opts.deflate
function makeZip(entries, { deflate = false } = {}) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const comp = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameB = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(crc32(raw), 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26);
    parts.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(crc32(raw), 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
function png(w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 4)]);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vex-test-'));

let pass = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}

(async () => {
  // ---------- fake server ----------
  const files = {}; // url path -> Buffer
  const modJar = (id, extra = {}) => makeZip({ 'fabric.mod.json': JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', depends: { minecraft: '~1.21', fabricloader: '*' }, ...extra }) });
  const apiJar = modJar('fabric-api');
  const modAJar = modJar('moda', { depends: { minecraft: '~1.21', 'fabric-api': '*' } });
  const modAJar2 = modJar('moda', { version: '2.0.0', depends: { minecraft: '~1.21', 'fabric-api': '*' } });
  files['/cdn/fabric-api.jar'] = apiJar; files['/cdn/moda-1.jar'] = modAJar; files['/cdn/moda-2.jar'] = modAJar2;
  const ver = (id, project, ver, file, buf, deps = []) => ({ id, project_id: project, version_number: ver, version_type: 'release', dependencies: deps, files: [{ primary: true, filename: file, url: `${base}/cdn/${file}`, size: buf.length, hashes: { sha1: sha1(buf) } }] });
  let base = '';
  let versionsA;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, base || 'http://127.0.0.1');
    const send = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (files[u.pathname]) return res.end(files[u.pathname]);
    if (u.pathname === '/v2/search') return send({ total_hits: 1, offset: 0, hits: [{ project_id: 'A', slug: 'moda', title: 'Mod A', description: 'd', author: 'x', downloads: 5, icon_url: '', categories: ['fabric', 'utility'], display_categories: ['utility'] }] });
    if (u.pathname === '/v2/tag/category') return send([{ name: 'utility', project_type: 'mod' }, { name: 'cursed', project_type: 'resourcepack' }]);
    if (u.pathname === '/v2/project/A/version') return send(versionsA);
    if (u.pathname === '/v2/project/FAPI/version') return send([ver('vf', 'FAPI', '0.1', 'fabric-api.jar', apiJar)]);
    if (u.pathname === '/v2/project/A') return send({ id: 'A', slug: 'moda', title: 'Mod A', icon_url: '' });
    if (u.pathname === '/v2/project/FAPI') return send({ id: 'FAPI', slug: 'fabric-api', title: 'Fabric API', icon_url: '' });
    if (u.pathname === '/v2/version/v2') return send(ver('v2', 'A', '2.0.0', 'moda-2.jar', modAJar2));
    if (u.pathname === '/v2/version_files/update' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        const { hashes } = JSON.parse(b); const out = {};
        for (const h of hashes) if (h === sha1(modAJar)) out[h] = ver('v2', 'A', '2.0.0', 'moda-2.jar', modAJar2); else if (h === sha1(apiJar)) out[h] = ver('vf', 'FAPI', '0.1', 'fabric-api.jar', apiJar);
        send(out);
      });
      return;
    }
    res.statusCode = 404; res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  versionsA = [ver('v1', 'A', '1.0.0', 'moda-1.jar', modAJar, [{ project_id: 'FAPI', dependency_type: 'required' }, { project_id: 'X', dependency_type: 'optional' }])];
  const net = lib('net');
  net.endpoints.modrinth = base + '/v2';

  const store = lib('store');
  const dir = tmp();
  store.init(dir);

  // ---------- zip ----------
  console.log('zip');
  await test('reads stored and deflated entries, extracts, blocks zip-slip', () => {
    const { Zip } = lib('zip');
    const f = path.join(dir, 't.zip');
    fs.writeFileSync(f, makeZip({ 'a.txt': 'hello', 'dir/b.json': '{"x":1}' }, { deflate: true }));
    const z = new Zip(f);
    assert.strictEqual(z.readText('a.txt'), 'hello');
    assert.deepStrictEqual(z.readJson('dir/b.json'), { x: 1 });
    const out = path.join(dir, 'ex'); z.extract('dir/', out);
    assert.ok(fs.existsSync(path.join(out, 'b.json')) || fs.existsSync(path.join(out, 'dir', 'b.json')));
    z.close();
    const evil = path.join(dir, 'evil.zip');
    fs.writeFileSync(evil, makeZip({ 'overrides/../../evil.txt': 'x' }));
    const z2 = new Zip(evil);
    assert.throws(() => z2.extract('overrides/', path.join(dir, 'safe')));
    z2.close();
    assert.ok(!fs.existsSync(path.join(dir, 'evil.txt')));
  });

  // ---------- store ----------
  console.log('store');
  await test('default profile, create/duplicate/delete, settings validation', () => {
    assert.strictEqual(store.listProfiles().length, 1);
    const p = store.createProfile({ name: 'Test', version: '1.20.1', loader: 'fabric' });
    const d = store.duplicateProfile(p.id);
    assert.notStrictEqual(d.id, p.id);
    store.deleteProfile(d.id);
    assert.ok(!store.listProfiles().some((x) => x.id === d.id));
    store.saveSettings({ ram: 6, theme: 'violet' });
    assert.strictEqual(store.settings().ram, 6);
    store.saveSettings({ theme: 'nope', ram: -3, accent: 'red' });
    assert.strictEqual(store.settings().theme, 'violet');   // invalid values are ignored or clamped
    assert.strictEqual(store.settings().ram, 1);
    assert.notStrictEqual(store.settings().accent, 'red');
    store.deleteProfile(p.id);
  });

  // ---------- Modrinth ----------
  console.log('modrinth');
  const modrinth = lib('modrinth');
  const prof = store.createProfile({ name: 'Mods', version: '1.21.1', loader: 'fabric' });
  await test('search + categories use the API', async () => {
    const r = await modrinth.search({ query: 'a', version: '1.21.1', loader: 'fabric' });
    assert.strictEqual(r.hits[0].title, 'Mod A');
    assert.deepStrictEqual(r.hits[0].loaders, ['fabric']);
    assert.deepStrictEqual(await modrinth.categories('mod'), ['utility']);
  });
  await test('installMod pulls required dependency only', async () => {
    const tasks = [];
    const r = await modrinth.installMod(prof, 'A', { onTask: (t) => tasks.push(t) });
    assert.deepStrictEqual(r.installed.map((i) => i.file).sort(), ['fabric-api.jar', 'moda-1.jar']);
    assert.ok(tasks.some((t) => t.done));
    const list = modrinth.installedMods(prof);
    assert.strictEqual(list.length, 2);
  });
  await test('installed mods are inspected; missing dependency reported', () => {
    const mods = modrinth.modsDir(prof);
    fs.rmSync(path.join(mods, 'fabric-api.jar'));
    const list = modrinth.installedMods(prof);
    const a = list.find((m) => m.file === 'moda-1.jar');
    assert.ok(a.issues && a.issues.length, 'expected an issue for the missing dependency');
    fs.writeFileSync(path.join(mods, 'fabric-api.jar'), apiJar);
  });
  await test('checkUpdates finds new version and updateAll replaces file', async () => {
    const ups = await modrinth.checkUpdates(prof);
    assert.ok(ups.some((u) => u.file === 'moda-1.jar' && u.to === '2.0.0'));
    await modrinth.updateAll(prof, {});
    const mods = modrinth.modsDir(prof);
    assert.ok(fs.existsSync(path.join(mods, 'moda-2.jar')));
    assert.ok(!fs.existsSync(path.join(mods, 'moda-1.jar')));
  });
  await test('toggle and remove mod', () => {
    modrinth.toggleMod(prof, 'moda-2.jar');
    assert.ok(fs.existsSync(path.join(modrinth.modsDir(prof), 'moda-2.jar.disabled')));
    modrinth.toggleMod(prof, 'moda-2.jar.disabled');
    modrinth.removeMod(prof, 'moda-2.jar');
    assert.ok(!fs.existsSync(path.join(modrinth.modsDir(prof), 'moda-2.jar')));
    assert.throws(() => modrinth.removeMod(prof, '../../x.jar'));
  });
  await test('satisfiesMc ranges', () => {
    const s = modrinth.satisfiesMc;
    assert.ok(s('~1.21', '1.21.4'));
    assert.ok(!s('~1.21', '1.20.1'));
    assert.ok(s('>=1.20 <1.21', '1.20.4'));
    assert.ok(!s('>=1.20 <1.21', '1.21'));
    assert.ok(s('*', '1.8.9'));
    assert.ok(s('1.21.1', '1.21.1'));
  });

  console.log('mods while the game runs');
  const livemods = lib('livemods');
  let fakeGame = { state: 'idle' };
  livemods.init({ state: () => fakeGame });
  const lp = store.createProfile({ name: 'Live', version: '1.21.1', loader: 'fabric' });
  await test('install while running is staged and queued, not written to mods/', async () => {
    fakeGame = { state: 'running', profileId: lp.id };
    livemods.startSession(lp);
    const stage = { dir: livemods.stageDir(lp), add: (n, m, r) => livemods.queueAdd(lp, n, m, r) };
    const r = await modrinth.installMod(lp, 'A', {}, { stage, pending: livemods.pending(lp) });
    assert.ok(r.queued);
    assert.deepStrictEqual(fs.readdirSync(modrinth.modsDir(lp)), []);
    const st = livemods.status(lp);
    assert.ok(st.running);
    assert.deepStrictEqual(st.mods.map((m) => m.status), ['pending-install', 'pending-install']);
    // the same install again does not queue duplicates
    const again = await modrinth.installMod(lp, 'A', {}, { stage, pending: livemods.pending(lp) });
    assert.strictEqual(again.installed.length, 0);
    assert.strictEqual(livemods.pending(lp).length, 2);
    // apply is refused while running
    assert.ok(livemods.apply(lp).skipped);
  });
  await test('queued changes apply when the game closes; statuses follow the log', async () => {
    fakeGame = { state: 'idle' };
    livemods.endSession();
    const r = livemods.apply(lp);
    assert.strictEqual(r.applied.length, 2);
    assert.deepStrictEqual(fs.readdirSync(modrinth.modsDir(lp)).sort(), ['fabric-api.jar', 'moda-1.jar']);
    assert.strictEqual(livemods.pending(lp).length, 0);
    assert.ok(modrinth.installedMods(lp).every((m) => m.source === 'modrinth'));
    // next session: Fabric's "Loading N mods" list confirms what really loaded
    fakeGame = { state: 'running', profileId: lp.id };
    livemods.startSession(lp);
    let st = livemods.status(lp);
    assert.ok(st.mods.every((m) => m.status === 'in-session'));
    ['[main/INFO]: Loading 3 mods:', '\t- fabric-api 1.0.0', '\t- moda 1.0.0', '\t- minecraft 1.21.1', '[main/INFO]: done'].forEach(livemods.onGameLine);
    st = livemods.status(lp);
    assert.ok(st.mods.every((m) => m.status === 'loaded'), JSON.stringify(st.mods.map((m) => m.status)));
    // toggle + remove while running are queued; toggling twice cancels
    livemods.queueToggle(lp, 'moda-1.jar');
    assert.strictEqual(livemods.status(lp).mods.find((m) => m.file === 'moda-1.jar').status, 'pending-disable');
    livemods.queueToggle(lp, 'moda-1.jar');
    assert.strictEqual(livemods.pending(lp).length, 0);
    livemods.queueRemove(lp, 'fabric-api.jar');
    assert.ok(fs.existsSync(path.join(modrinth.modsDir(lp), 'fabric-api.jar')));
    fakeGame = { state: 'idle' };
    livemods.endSession();
    livemods.apply(lp);
    assert.ok(!fs.existsSync(path.join(modrinth.modsDir(lp), 'fabric-api.jar')));
  });
  await test('duplicate mod ids are reported as a conflict', () => {
    fs.writeFileSync(path.join(modrinth.modsDir(lp), 'moda-copy.jar'), modAJar);
    const rows = modrinth.installedMods(lp);
    assert.ok(rows.find((m) => m.file === 'moda-copy.jar').issues.some((i) => /Conflict/.test(i)));
    fs.rmSync(path.join(modrinth.modsDir(lp), 'moda-copy.jar'));
  });
  await test('vanilla profiles refuse mod installs with an explanation', async () => {
    const v = store.createProfile({ name: 'Van', version: '1.21.1', loader: 'vanilla' });
    await assert.rejects(modrinth.installMod(v, 'A', {}), /Vanilla/);
  });

  console.log('themes');
  const T = require(path.join(root, 'renderer', 'themes.js'));
  await test('seasonal dates use the local calendar, inclusive', () => {
    const at = (y, m, d) => (T.seasonFor(new Date(y, m - 1, d)) || {}).theme || null;
    assert.strictEqual(at(2026, 9, 30), null);
    assert.strictEqual(at(2026, 10, 1), 'halloween');
    assert.strictEqual(at(2026, 10, 31), 'halloween');
    assert.strictEqual(at(2026, 11, 1), null);
    assert.strictEqual(at(2026, 12, 1), 'christmas');
    assert.strictEqual(at(2026, 12, 26), 'christmas');
    assert.strictEqual(at(2026, 12, 27), 'newyear');
    assert.strictEqual(at(2027, 1, 3), 'newyear');
    assert.strictEqual(at(2027, 1, 4), null);
    assert.strictEqual(T.seasonFor(new Date(2027, 0, 2)).key, 'newyear-2026');
    const nat = (y, m, d) => (T.seasonFor(new Date(y, m - 1, d), { nature: true }) || {}).theme || null;
    assert.strictEqual(nat(2026, 2, 28), null);
    assert.strictEqual(nat(2026, 3, 1), 'spring');
    assert.strictEqual(nat(2026, 5, 31), 'spring');
    assert.strictEqual(nat(2026, 6, 1), 'summer');
    assert.strictEqual(nat(2026, 8, 31), 'summer');
    assert.strictEqual(nat(2026, 9, 1), 'autumn');
    assert.strictEqual(nat(2026, 10, 15), 'halloween'); // holidays win
    assert.strictEqual(nat(2026, 11, 20), 'autumn');
    assert.strictEqual(nat(2026, 12, 5), 'christmas');
    assert.strictEqual((T.seasonFor(new Date(2026, 6, 1), { holidays: false, nature: true }) || {}).theme, 'summer');
    assert.strictEqual(T.seasonFor(new Date(2026, 9, 15), { holidays: false }), null);
  });
  await test('nature seasons only switch when turned on, and can be opted out', () => {
    const jul = new Date(2026, 6, 10);
    assert.strictEqual(T.effective({ theme: 'vex', seasonalThemes: true }, jul).id, 'vex');
    let s = { theme: 'vex', seasonalThemes: true, natureSeasons: true, seasonOptOut: '' };
    assert.deepStrictEqual([T.effective(s, jul).id, T.effective(s, jul).auto], ['summer', true]);
    s = { ...s, ...T.choosePatch(s, 'violet', jul) };
    assert.strictEqual(s.seasonOptOut, 'summer-2026');
    assert.strictEqual(T.effective(s, jul).id, 'violet');
    assert.strictEqual(T.effective(s, new Date(2026, 9, 2)).id, 'halloween');
    assert.strictEqual(T.effective({ theme: 'vex', seasonalThemes: false, natureSeasons: true }, new Date(2026, 9, 2)).id, 'autumn');
  });
  await test('automatic switching, manual choice, opt-out and restore', () => {
    const oct = new Date(2026, 9, 16);
    const nov = new Date(2026, 10, 2);
    let s = { theme: 'violet', seasonalThemes: true, seasonOptOut: '' };
    assert.deepStrictEqual([T.effective(s, oct).id, T.effective(s, oct).auto], ['halloween', true]);
    assert.strictEqual(T.effective(s, nov).id, 'violet'); // preferred theme returns after the season
    s = { ...s, ...T.choosePatch(s, 'christmas', oct) };  // manual pick during Halloween
    assert.strictEqual(T.effective(s, oct).id, 'christmas');
    assert.strictEqual(T.effective(s, new Date(2027, 9, 5)).id, 'halloween'); // opt-out is for this season only
    s = { ...s, ...T.choosePatch(s, 'halloween', oct) };
    assert.strictEqual(s.seasonOptOut, '');
    const off = { theme: 'navy', seasonalThemes: false };
    assert.strictEqual(T.effective(off, oct).id, 'navy'); // never overridden when automatic switching is off
    assert.strictEqual(T.effective({ theme: 'bogus' }, nov).id, T.DEFAULT_THEME);
  });
  await test('settings keep theme keys valid and migrate the old accent', () => {
    store.saveSettings({ theme: 'halloween', seasonalThemes: false, themeEffects: 'false', seasonOptOut: 'halloween-2026' });
    const s = store.settings();
    assert.strictEqual(s.theme, 'halloween');
    assert.strictEqual(s.seasonalThemes, false);
    assert.strictEqual(s.themeEffects, false);
    assert.strictEqual(s.seasonOptOut, 'halloween-2026');
    store.saveSettings({ seasonOptOut: '../../x', accent: '' });
    assert.strictEqual(store.settings().seasonOptOut, 'halloween-2026');
    assert.strictEqual(store.settings().accent, '');
    const f = path.join(store.getBaseDir(), 'settings.json');
    const raw = JSON.parse(fs.readFileSync(f, 'utf8')); delete raw.themesV2; raw.accent = '#3d7bff'; fs.writeFileSync(f, JSON.stringify(raw));
    assert.strictEqual(store.settings().accent, '');
  });

  console.log('mrpack');
  const mrpack = (idx, extra = {}) => { const f = path.join(dir, `p${Math.random()}.mrpack`); fs.writeFileSync(f, makeZip({ 'modrinth.index.json': JSON.stringify(idx), ...extra })); return f; };
  const goodIdx = () => ({ formatVersion: 1, game: 'minecraft', name: 'My Pack', dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' }, files: [{ path: 'mods/fabric-api.jar', hashes: { sha1: sha1(apiJar) }, downloads: [`${base}/cdn/fabric-api.jar`], fileSize: apiJar.length }] });
  await test('installs a valid pack with overrides', async () => {
    const before = store.listProfiles().length;
    const p = await modrinth.installMrpack(mrpack(goodIdx(), { 'overrides/config/x.txt': 'hi' }), {});
    assert.strictEqual(p.loader, 'fabric'); assert.strictEqual(p.version, '1.21.1');
    const d = store.profileDir(p.id);
    assert.ok(fs.existsSync(path.join(d, 'mods', 'fabric-api.jar')));
    assert.strictEqual(fs.readFileSync(path.join(d, 'config', 'x.txt'), 'utf8'), 'hi');
    assert.strictEqual(store.listProfiles().length, before + 1);
  });
  await test('rejects bad checksum and rolls back the profile', async () => {
    const before = store.listProfiles().length;
    const idx = goodIdx(); idx.files[0].hashes.sha1 = '0'.repeat(40);
    await assert.rejects(modrinth.installMrpack(mrpack(idx), {}));
    assert.strictEqual(store.listProfiles().length, before);
  });
  await test('rejects path traversal and disallowed hosts, and non-minecraft/quilt packs', async () => {
    const t = goodIdx(); t.files[0].path = '../../evil.jar';
    await assert.rejects(modrinth.installMrpack(mrpack(t), {}), /Unsafe/);
    // Allowed-host check is relaxed only for 127.0.0.1 test servers; use a non-local host.
    const h = goodIdx(); h.files[0].downloads = ['https://evil.example.com/x.jar'];
    await assert.rejects(modrinth.installMrpack(mrpack(h), {}), /not an allowed source/);
    const g = goodIdx(); g.game = 'other';
    await assert.rejects(modrinth.installMrpack(mrpack(g), {}), /not Minecraft|other/);
    const q = goodIdx(); delete q.dependencies['fabric-loader']; q.dependencies['quilt-loader'] = '1';
    await assert.rejects(modrinth.installMrpack(mrpack(q), {}), /Quilt/);
    await assert.rejects(modrinth.installMrpack(path.join(dir, 't.zip'), {}), /modrinth.index.json/);
  });
  await test('skips client-unsupported files', async () => {
    const idx = goodIdx(); idx.files.push({ path: 'mods/server-only.jar', env: { client: 'unsupported' }, hashes: { sha1: '0'.repeat(40) }, downloads: ['https://evil.example.com/s.jar'], fileSize: 1 });
    const p = await modrinth.installMrpack(mrpack(idx), {});
    assert.ok(!fs.existsSync(path.join(store.profileDir(p.id), 'mods', 'server-only.jar')));
  });

  // ---------- resource packs and shaders ----------
  console.log('packs');
  const packs = lib('packs');
  const pp = store.createProfile({ name: 'Packs', version: '1.21.1', loader: 'fabric' });
  await test('import, enable, order, disable, remove resource pack', () => {
    const mk = (n, fmt) => { const f = path.join(dir, n); fs.writeFileSync(f, makeZip({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: fmt, description: 'Desc ' + n } }), 'pack.png': png(16, 16) })); return f; };
    packs.importPack(pp, 'resourcepack', mk('One.zip', 34));
    packs.importPack(pp, 'resourcepack', mk('Two.zip', 1));
    let list = packs.listResourcePacks(pp).packs;
    assert.strictEqual(list.length, 2);
    const two = list.find((p) => p.name === 'Two.zip');
    assert.ok(two.compat && two.compat.status !== 'ok', 'old pack format should be flagged: ' + JSON.stringify(two.compat));
    assert.throws(() => packs.setPackEnabled(pp, 'One.zip', true), /Start this profile once/);
    fs.writeFileSync(path.join(store.profileDir(pp.id), 'options.txt'), 'version:3955\nresourcePacks:[\"vanilla\"]\nlang:en_us\n');
    packs.setPackEnabled(pp, 'One.zip', true); packs.setPackEnabled(pp, 'Two.zip', true);
    const opts = fs.readFileSync(path.join(store.profileDir(pp.id), 'options.txt'), 'utf8');
    assert.ok(/resourcePacks:\[.*file\/One\.zip.*file\/Two\.zip.*\]/.test(opts), opts);
    packs.movePack(pp, 'Two.zip', 'down');
    packs.setPackEnabled(pp, 'One.zip', false);
    packs.removePack(pp, 'resourcepack', 'Two.zip');
    assert.strictEqual(packs.listResourcePacks(pp).packs.length, 1);
    assert.throws(() => packs.removePack(pp, 'resourcepack', '../x.zip'));
  });
  await test('rejects zips that are not packs', () => {
    const f = path.join(dir, 'bad.zip'); fs.writeFileSync(f, makeZip({ 'readme.txt': 'x' }));
    assert.throws(() => packs.importPack(pp, 'resourcepack', f));
  });
  await test('shader selection writes Iris config', () => {
    const f = path.join(dir, 'Shade.zip'); fs.writeFileSync(f, makeZip({ 'shaders/final.fsh': 'void main(){}' }));
    packs.importPack(pp, 'shader', f);
    packs.setShader(pp, 'Shade.zip');
    const cfg = fs.readFileSync(path.join(store.profileDir(pp.id), 'config', 'iris.properties'), 'utf8');
    assert.ok(/shaderPack=Shade\.zip/.test(cfg) && /enableShaders=true/.test(cfg), cfg);
    packs.setShader(pp, '');
    assert.ok(/enableShaders=false/.test(fs.readFileSync(path.join(store.profileDir(pp.id), 'config', 'iris.properties'), 'utf8')));
  });

  // ---------- capes ----------
  console.log('capes');
  const media = lib('media');
  await test('cape validation, import, select, remove', () => {
    const ok = path.join(dir, 'Mine.png'); fs.writeFileSync(ok, png(64, 32));
    const bad = path.join(dir, 'Bad.png'); fs.writeFileSync(bad, png(50, 50));
    const txt = path.join(dir, 'x.txt'); fs.writeFileSync(txt, 'x');
    assert.deepStrictEqual(media.importCapes([ok]), ['Mine.png']);
    assert.throws(() => media.importCapes([bad]));
    assert.throws(() => media.importCapes([txt]));
    media.selectCape('Mine.png');
    assert.ok(media.listCapes()[0].active);
    media.removeCape('Mine.png');
    assert.strictEqual(media.listCapes().length, 0);
    assert.throws(() => media.removeCape('../x.png'));
  });

  // ---------- auth ----------
  console.log('auth');
  const auth = lib('auth');
  await test('stores refresh tokens encrypted, never plain, and signs out', async () => {
    const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('ENC:' + Buffer.from(s).toString('hex')), decryptString: (b) => Buffer.from(b.toString().slice(4), 'hex').toString() };
    auth.init({ safeStorage: fakeSafe });
    assert.strictEqual(auth.status().secureStorage, true);
    assert.deepStrictEqual(auth.list(), []);
    assert.ok(/not own|owns|Xbox|cancel/i.test(auth.friendly({ message: 'error.auth.minecraft.entitlements' }) + auth.friendly({ message: 'cancelled' }) + 'owns'));
    assert.ok(/own Minecraft/.test(auth.friendly({ message: 'error.auth.minecraft.entitlements' })));
  });

  // ---------- versions / java ----------
  console.log('java');
  await test('java version parsing', () => {
    const j = lib('java');
    assert.strictEqual(j.parseVersion('openjdk version "17.0.9" 2023-10-17').major, 17);
    assert.strictEqual(j.parseVersion('java version "1.8.0_392"').major, 8);
    assert.ok(/winget/.test(j.installHelp(21)));
  });

  // ---------- launcher updates ----------
  console.log('updates');
  const semver = lib('semver');
  const release = lib('release');
  const appstate = lib('appstate');
  const updaterLib = lib('updater');
  await test('semantic versions compare, diff and bump', () => {
    assert.strictEqual(semver.compare('1.10.0', '1.9.9'), 1);
    assert.strictEqual(semver.compare('1.2.0-beta.1', '1.2.0'), -1);
    assert.strictEqual(semver.diff('1.1.0', '1.1.1'), 'patch');
    assert.strictEqual(semver.diff('1.1.1', '1.2.0'), 'minor');
    assert.strictEqual(semver.diff('1.2.0', '2.0.0'), 'major');
    assert.strictEqual(semver.diff('1.2.0', '1.2.0'), null);
    assert.strictEqual(semver.bump('1.1.1', 'minor'), '1.2.0');
  });

  // fake GitHub release server + fake electron-updater
  const keys = release.generateKeys();
  const otherKeys = release.generateKeys();
  const installer = crypto.randomBytes(300000);
  const sha512 = (b) => crypto.createHash('sha512').update(b).digest('base64');
  const rel = {}; // path -> Buffer
  const publish = (version, extra = {}, signWith = keys.privateKeyPem, inst = installer) => {
    const m = release.validate({ schema: 1, version, type: 'minor', critical: false, releaseDate: '2026-10-16', notes: '## New\n- Something', files: [{ name: `Vex-Client-Setup-${version}.exe`, sha512: sha512(inst), size: inst.length }], ...extra });
    const bytes = Buffer.from(JSON.stringify(m));
    for (const dir of ['/rel/latest/download', `/rel/download/v${version}`]) {
      rel[`${dir}/vex-release.json`] = bytes;
      rel[`${dir}/vex-release.json.sig`] = Buffer.from(release.sign(bytes, signWith));
    }
    return m;
  };
  const relServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify([{ tag_name: 'v1.2.0', body: '- notes', published_at: '2026-10-16' }])); }
    if (rel[u.pathname]) return res.end(rel[u.pathname]);
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => relServer.listen(0, '127.0.0.1', r));
  const relBase = `http://127.0.0.1:${relServer.address().port}`;
  const updDir = tmp();
  function fakeAutoUpdater(opts = {}) {
    const ev = new (require('events'))();
    const au = Object.assign(ev, {
      calls: [], served: opts.served || '1.2.0', payload: opts.payload || installer, failDownload: opts.failDownload || 0,
      async checkForUpdates() { return { updateInfo: { version: au.served } }; },
      async downloadUpdate() {
        if (au.failDownload > 0) { au.failDownload--; throw new Error('net::ERR_CONNECTION_RESET'); }
        au.emit('download-progress', { percent: 50, transferred: 1, total: 2, bytesPerSecond: 1 });
        const f = path.join(updDir, `Vex-Client-Setup-${au.served}.exe`);
        fs.writeFileSync(f, au.payload);
        au.calls.push('download');
        return [f];
      },
      quitAndInstall(silent, run) { au.calls.push(`install:${silent}:${run}`); },
      setFeedURL(o) { au.calls.push(`feed:${o.provider}`); },
    });
    return au;
  }
  let gameOn = false;
  let saved = {};
  const makeUpdater = (au, over = {}) => updaterLib.create({
    version: '1.1.0',
    config: { owner: 'me', repo: 'vex-client', publicKey: keys.publicKeyB64, baseUrl: `${relBase}/rel`, apiUrl: `${relBase}/api`, allowHttpForTests: true, ...(over.config || {}) },
    packaged: over.packaged !== undefined ? over.packaged : true,
    getSettings: () => ({ autoDownloadUpdates: true, ...saved }),
    saveSettings: (p) => Object.assign(saved, p),
    gameRunning: () => gameOn,
    emit: () => {},
    loadAutoUpdater: () => ({ autoUpdater: au }),
  });

  await test('updater: not set up, already latest, and no release yet', async () => {
    const u0 = makeUpdater(fakeAutoUpdater(), { config: { owner: 'YOUR_GITHUB_USERNAME' } });
    assert.strictEqual((await u0.check({ manual: true })).status, 'error');
    const u1 = makeUpdater(fakeAutoUpdater());
    assert.strictEqual((await u1.check({ manual: true })).error, 'No published release was found yet.');
    publish('1.1.0');
    const r = await u1.check({ manual: true });
    assert.strictEqual(r.status, 'up-to-date');
  });
  await test('updater: newer release downloads, is verified, waits for Minecraft, then installs', async () => {
    publish('1.2.0');
    const au = fakeAutoUpdater();
    const u = makeUpdater(au);
    const [a, b] = [u.check({}), u.check({})];
    assert.strictEqual(a, b, 'a second check while one runs must reuse it');
    const r = await a;
    assert.strictEqual(r.status, 'ready', r.error);
    assert.strictEqual(r.kind, 'minor');
    assert.deepStrictEqual(au.calls, ['download']);
    gameOn = true;
    assert.throws(() => u.install(), /Minecraft is running/);
    assert.strictEqual(u.onQuit(), false, 'never installs on quit while a game runs');
    gameOn = false;
    u.install();
    assert.ok(au.calls.includes('install:true:true'));
    // checking again does not download the same update twice
    await u.check({ manual: true });
    assert.strictEqual(au.calls.filter((c) => c === 'download').length, 1);
  });
  await test('updater: forged signature and wrong key are rejected before any download', async () => {
    publish('1.3.0', {}, otherKeys.privateKeyPem);
    const au = fakeAutoUpdater({ served: '1.3.0' });
    const r = await makeUpdater(au).check({ manual: true });
    assert.strictEqual(r.status, 'error');
    assert.ok(/signature/.test(r.error), r.error);
    assert.deepStrictEqual(au.calls, []);
    // tampered manifest bytes with the original signature
    publish('1.3.0');
    rel['/rel/latest/download/vex-release.json'] = Buffer.from(rel['/rel/latest/download/vex-release.json'].toString().replace('1.3.0', '1.3.1'));
    assert.ok(/signature/.test((await makeUpdater(fakeAutoUpdater()).check({ manual: true })).error));
  });
  await test('updater: a download that does not match the signed checksum is deleted, not installed', async () => {
    publish('1.3.0');
    const au = fakeAutoUpdater({ served: '1.3.0', payload: Buffer.from('evil') });
    const u = makeUpdater(au);
    const r = await u.check({ manual: true });
    assert.strictEqual(r.status, 'error');
    assert.ok(/does not match/.test(r.error), r.error);
    assert.ok(!fs.existsSync(path.join(updDir, 'Vex-Client-Setup-1.3.0.exe')));
    assert.throws(() => u.install(), /No verified update/);
    // latest.yml pointing at a different version than the signed manifest
    const r2 = await makeUpdater(fakeAutoUpdater({ served: '9.9.9' })).check({ manual: true });
    assert.ok(/don't match/.test(r2.error), r2.error);
  });
  await test('updater: interrupted download reports an error and the next check recovers', async () => {
    publish('1.3.0');
    const au = fakeAutoUpdater({ served: '1.3.0', failDownload: 1 });
    const u = makeUpdater(au);
    const r = await u.check({ manual: true });
    assert.strictEqual(r.status, 'error');
    assert.ok(/RESET/.test(r.error));
    assert.strictEqual((await u.check({ manual: true })).status, 'ready');
  });
  await test('updater: optional updates can be skipped, critical ones cannot', async () => {
    saved = {};
    publish('1.3.0');
    const u = makeUpdater(fakeAutoUpdater({ served: '1.3.0' }));
    saved.autoDownloadUpdates = false;
    let r = await u.check({});
    assert.strictEqual(r.status, 'available');
    u.skip();
    assert.strictEqual(saved.skippedUpdate, '1.3.0');
    assert.strictEqual((await makeUpdater(fakeAutoUpdater({ served: '1.3.0' })).check({})).status, 'skipped');
    publish('1.3.0', { minimumVersion: '1.2.0' }); // 1.1.0 < minimum -> critical
    const uc = makeUpdater(fakeAutoUpdater({ served: '1.3.0' }));
    r = await uc.check({});
    assert.ok(r.critical);
    assert.strictEqual(r.status, 'ready', 'critical updates download even with auto-download off');
    assert.throws(() => uc.skip(), /critical/);
    assert.ok(r.history.length >= 1, 'changelog loaded');
    saved = {};
  });
  await test('updater: source builds can check but never install', async () => {
    publish('1.3.0');
    const u = makeUpdater(fakeAutoUpdater({ served: '1.3.0' }), { packaged: false });
    const r = await u.check({ manual: true });
    assert.strictEqual(r.status, 'available');
    assert.strictEqual(r.supported, false);
    assert.throws(() => u.download(), /source/);
  });
  await test('updater: rollback reinstalls a verified older release', async () => {
    publish('1.0.5');
    const au = fakeAutoUpdater({ served: '1.0.5' });
    const r = await makeUpdater(au).rollback('1.0.5');
    assert.strictEqual(r.status, 'ready');
    assert.ok(au.calls.includes('feed:generic') && au.calls.includes('feed:github'));
  });
  relServer.close();

  await test('app state: backups on version change, failed starts, healthy mark, restore', () => {
    const before = store.settings().ram;
    let info = appstate.onStart('1.1.0');
    appstate.markHealthy('1.1.0');
    info = appstate.onStart('1.2.0');
    assert.ok(info.upgraded && info.previous === '1.1.0');
    const backups = appstate.listBackups();
    assert.ok(backups.some((b) => /1\.1\.0-to-1\.2\.0/.test(b.name)));
    assert.ok(fs.existsSync(path.join(backups[0].path, 'settings.json')));
    info = appstate.onStart('1.2.0'); // never reported healthy
    assert.strictEqual(info.failedStarts, 1);
    info = appstate.onStart('1.2.0');
    assert.strictEqual(info.failedStarts, 2);
    assert.strictEqual(appstate.rollbackTarget('1.2.0'), '1.1.0');
    store.saveSettings({ ram: 9 });
    appstate.restore(backups.find((b) => /1\.1\.0-to-1\.2\.0/.test(b.name)).name);
    assert.strictEqual(store.settings().ram, before);
    appstate.markHealthy('1.2.0');
    assert.strictEqual(appstate.onStart('1.2.0').failedStarts, 0);
    assert.throws(() => appstate.restore('../x'));
  });
  await test('CI: make-manifest signs exactly what electron-builder produced', () => {
    const work = tmp();
    fs.mkdirSync(path.join(work, 'scripts')); fs.mkdirSync(path.join(work, 'lib')); fs.mkdirSync(path.join(work, 'dist'));
    for (const f of ['release.js', 'semver.js']) fs.copyFileSync(path.join(root, 'lib', f), path.join(work, 'lib', f));
    fs.copyFileSync(path.join(root, 'scripts', 'make-manifest.js'), path.join(work, 'scripts', 'make-manifest.js'));
    fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ version: '1.4.0', vexUpdate: { publicKey: keys.publicKeyB64 } }));
    fs.writeFileSync(path.join(work, 'CHANGELOG.md'), '## Unreleased\n\n## 1.4.0 - 2026-10-20 [critical]\n\n- Fixes a security bug\n\n## 1.3.0\n- old\n');
    const exe = crypto.randomBytes(1000);
    fs.writeFileSync(path.join(work, 'dist', 'Vex-Client-Setup-1.4.0.exe'), exe);
    fs.writeFileSync(path.join(work, 'dist', 'latest.yml'), `version: 1.4.0\nfiles:\n  - url: Vex-Client-Setup-1.4.0.exe\n    sha512: ${sha512(exe)}\n    size: ${exe.length}\npath: Vex-Client-Setup-1.4.0.exe\nsha512: ${sha512(exe)}\nreleaseDate: '2026-10-20T10:00:00.000Z'\n`);
    require('child_process').execFileSync(process.execPath, [path.join(work, 'scripts', 'make-manifest.js'), path.join(work, 'dist')], { env: { ...process.env, VEX_UPDATE_PRIVATE_KEY: keys.privateKeyPem }, stdio: 'pipe' });
    const bytes = fs.readFileSync(path.join(work, 'dist', 'vex-release.json'));
    const m = release.verify(bytes, fs.readFileSync(path.join(work, 'dist', 'vex-release.json.sig'), 'utf8'), keys.publicKeyB64);
    assert.strictEqual(m.version, '1.4.0');
    assert.ok(m.critical);
    assert.strictEqual(m.files[0].sha512, sha512(exe));
    assert.ok(/security bug/.test(m.notes));
    // the wrong key in CI is caught before anything is published
    assert.throws(() => require('child_process').execFileSync(process.execPath, [path.join(work, 'scripts', 'make-manifest.js'), path.join(work, 'dist')], { env: { ...process.env, VEX_UPDATE_PRIVATE_KEY: otherKeys.privateKeyPem }, stdio: 'pipe' }));
  });

  // ---------- import from other launchers ----------
  console.log('import');
  const importer = lib('importer');
  await test('version ids from the official launcher are understood', () => {
    assert.deepStrictEqual(importer.fromVersionId('fabric-loader-0.16.9-1.21.1'), { loader: 'fabric', loaderVersion: '0.16.9', version: '1.21.1' });
    assert.deepStrictEqual(importer.fromVersionId('1.20.1-forge-47.3.0'), { loader: 'forge', loaderVersion: '47.3.0', version: '1.20.1' });
    assert.strictEqual(importer.fromVersionId('neoforge-21.1.77').version, '1.21.1');
    assert.strictEqual(importer.fromVersionId('1.21.11').loader, 'vanilla');
  });
  await test('finds Minecraft Launcher, Modrinth App and NoRisk instances and imports one safely', async () => {
    const root = tmp();
    const mk = (dir, files) => { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); } };
    const mc = path.join(root, '.minecraft');
    mk(mc, {
      'launcher_profiles.json': JSON.stringify({ profiles: { a: { name: 'Fabric', lastVersionId: 'fabric-loader-0.16.9-1.21.1', lastUsed: '2026-10-01T00:00:00Z' } } }),
      'options.txt': 'version:3955\nrenderDistance:12\n', 'servers.dat': 'x', 'mods/moda.jar': modAJar, 'mods/readme.txt': 'not a mod',
      'resourcepacks/p.zip': 'zip', 'config/moda.json': '{}', 'saves/World/level.dat': 'lvl',
    });
    const mr = path.join(root, 'ModrinthApp', 'profiles');
    mk(path.join(mr, 'PvP Pack'), { 'profile.json': JSON.stringify({ metadata: { name: 'PvP Pack', game_version: '1.21.4', loader: 'fabric' } }), 'mods/moda.jar': modAJar });
    mk(path.join(mr, 'NoMeta'), { 'options.txt': 'version:1\n', 'logs/latest.log': '[main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.17.2\n' });
    const nr = path.join(root, 'norisk');
    mk(path.join(nr, 'profiles', 'NoRisk 1.21'), { 'options.txt': 'version:1\n', 'mods/moda.jar': modAJar });
    const r = importer.scan({ minecraft: mc, modrinth: mr, norisk: nr });
    const [off, mrg, nrg] = r.groups;
    assert.strictEqual(off.items[0].version, '1.21.1');
    assert.strictEqual(off.items[0].loader, 'fabric');
    assert.ok(off.items[0].parts.mods && off.items[0].parts.saves && off.items[0].parts.servers);
    assert.deepStrictEqual(mrg.items.map((i) => [i.name, i.version, i.loader]).sort(), [['NoMeta', '1.21.11', 'fabric'], ['PvP Pack', '1.21.4', 'fabric']]);
    assert.strictEqual(nrg.items.length, 1);
    assert.strictEqual(nrg.items[0].version, '1.21', 'guessed from the mods (~1.21)');
    const before = fs.readdirSync(path.join(mc, 'mods')).length;
    const res = await importer.importInstance({ ...off.items[0], name: 'From launcher', parts: { mods: true, options: true, servers: true, config: true, saves: false } }, {});
    const d = store.profileDir(res.profile.id);
    assert.ok(fs.existsSync(path.join(d, 'mods', 'moda.jar')));
    assert.ok(!fs.existsSync(path.join(d, 'mods', 'readme.txt')));
    assert.ok(fs.existsSync(path.join(d, 'options.txt')) && fs.existsSync(path.join(d, 'servers.dat')) && fs.existsSync(path.join(d, 'config', 'moda.json')));
    assert.ok(!fs.existsSync(path.join(d, 'saves')), 'worlds only when asked');
    assert.strictEqual(fs.readdirSync(path.join(mc, 'mods')).length, before, 'source untouched');
    assert.strictEqual(res.profile.loader, 'fabric');
    importer.undoImport(res.profile.id);
    assert.ok(!store.listProfiles().some((p) => p.id === res.profile.id));
    assert.throws(() => importer.undoImport(store.listProfiles()[0].id), /not created by an import/);
  });

  // ---------- performance presets ----------
  console.log('performance');
  const perfLib = lib('perf');
  await test('presets write video settings with a backup, and set memory + JVM flags for launch', async () => {
    const p = store.createProfile({ name: 'Perf', version: '1.21.1', loader: 'vanilla' });
    const opts = path.join(store.profileDir(p.id), 'options.txt');
    let r = await perfLib.apply(p.id, { preset: 'potato' }, {});
    assert.strictEqual(r.video, false, 'no options.txt yet: applied at next launch');
    fs.writeFileSync(opts, 'version:3955\nrenderDistance:12\ngraphicsMode:1\nlang:en_us\n');
    const lo = perfLib.launchOptions(store.getProfile(p.id));
    assert.strictEqual(lo.ram, 3);
    assert.ok(lo.jvmArgs.includes('-XX:+UseG1GC'));
    const txt = fs.readFileSync(opts, 'utf8');
    assert.ok(/renderDistance:6/.test(txt) && /graphicsMode:0/.test(txt) && /lang:en_us/.test(txt), txt);
    r = await perfLib.apply(p.id, { preset: 'custom', ram: 999, jvmFlags: false, video: { renderDistance: 64, particles: 7 } }, {});
    const pp = store.getProfile(p.id).perf;
    assert.strictEqual(pp.ram, 64);
    assert.strictEqual(pp.video.renderDistance, 32);
    assert.strictEqual(pp.video.particles, 2);
    assert.deepStrictEqual(perfLib.launchOptions(store.getProfile(p.id)).jvmArgs, []);
    assert.ok(fs.existsSync(opts + '.vexbak'));
    assert.ok(r.notes.some((n) => /Vanilla/.test(n)));
  });

  await test('first launch adds missing FPS mods once; no preset still gets the tuned Java flags', async () => {
    const p = store.createProfile({ name: 'Auto perf', version: '1.21.1', loader: 'fabric' });
    assert.ok(perfLib.launchOptions(store.getProfile(p.id)).jvmArgs.includes('-XX:+UseG1GC'));
    const calls = [];
    const orig = modrinth.installMod;
    modrinth.installMod = async (prof, slug) => { calls.push(slug); if (slug === 'immediatelyfast') throw new Error('No version of ImmediatelyFast is compatible'); return { installed: [{ slug }] }; };
    try {
      const added = await perfLib.ensureModsOnce(store.getProfile(p.id), {});
      assert.deepStrictEqual(added, ['Sodium', 'Lithium', 'FerriteCore', 'EntityCulling']);
      assert.ok(store.getProfile(p.id).perfModsDone);
      calls.length = 0;
      assert.deepStrictEqual(await perfLib.ensureModsOnce(store.getProfile(p.id), {}), []);
      assert.strictEqual(calls.length, 0, 'never again for this profile');
      const v = store.createProfile({ name: 'Vanilla', version: '1.21.1', loader: 'vanilla' });
      assert.deepStrictEqual(await perfLib.ensureModsOnce(store.getProfile(v.id), {}), []);
      assert.strictEqual(calls.length, 0);
    } finally { modrinth.installMod = orig; }
  });

  // ---------- server status ping ----------
  console.log('server');
  const mcs = lib('server');
  await test('server list ping: MOTD, players, icon and latency from a fake Minecraft server', async () => {
    const statusJson = JSON.stringify({ version: { name: '§61.21.x', protocol: 767 }, players: { online: 67, max: 1000 }, favicon: 'data:image/png;base64,AAAA',
      description: { text: '', extra: [{ text: 'VEX VANILLA', color: 'gold', bold: true }, { text: '\n§eNEW SEASON §aJOIN NOW' }] } });
    const srv = require('net').createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          const len = mcs.readVarint(buf, 0);
          if (!len || buf.length < len.size + len.value) return;
          const body = buf.subarray(len.size, len.size + len.value);
          buf = buf.subarray(len.size + len.value);
          const id = mcs.readVarint(body, 0).value;
          const send = (pid, payload) => { const d2 = Buffer.concat([mcs.varint(pid), payload]); sock.write(Buffer.concat([mcs.varint(d2.length), d2])); };
          if (id === 0 && body.length === 1) { const j = Buffer.from(statusJson); send(0, Buffer.concat([mcs.varint(j.length), j])); }
          else if (id === 1) send(1, body.subarray(1));
        }
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const st = await mcs.ping('127.0.0.1', srv.address().port);
    srv.close();
    assert.strictEqual(st.online, true);
    assert.deepStrictEqual(st.players, { online: 67, max: 1000 });
    assert.strictEqual(st.version, '1.21.x');
    assert.strictEqual(st.icon, 'data:image/png;base64,AAAA');
    assert.ok(st.motd.some((p) => p.text === 'VEX VANILLA' && p.color === 'gold' && p.bold));
    assert.ok(st.motd.some((p) => p.text === 'JOIN NOW' && p.color === 'green'));
    await assert.rejects(mcs.ping('127.0.0.1', 1, { timeout: 2000 }), /offline|reach/);
  });

  // ---------- admin panel ----------
  console.log('admin');
  const adminLib = lib('admin');
  const ghCalls = [];
  const gh = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      ghCalls.push({ m: req.method, u: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null });
      const send = (code, o) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(o === null ? '' : JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer github_pat_GOODTOKEN1234567890abcdef') return send(401, { message: 'Bad credentials' });
      if (req.url === '/user') return send(200, { login: 'hackerbest', avatar_url: '' });
      if (req.url === '/repos/me/vex-client') return send(200, { full_name: 'me/vex-client', default_branch: 'main', permissions: { push: true } });
      if (req.url.startsWith('/repos/me/vex-client/actions/workflows/release.yml/dispatches')) return send(204, null);
      if (req.url.startsWith('/repos/me/vex-client/releases/latest')) return send(200, { tag_name: 'v1.1.0' });
      if (req.url.startsWith('/repos/me/vex-client/releases?')) return send(200, [{ id: 2, tag_name: 'v1.1.0', name: 'Vex Client 1.1.0', published_at: 'x', assets: [{ name: 'Vex-Client-Setup-1.1.0.exe', download_count: 7 }, { name: 'vex-release.json.sig' }] }, { id: 1, tag_name: 'v1.0.0', name: 'Vex Client 1.0.0 (critical)', assets: [{ name: 'Vex-Client-Setup-1.0.0.exe', download_count: 3 }] }]);
      if (req.url.startsWith('/repos/me/vex-client/actions/workflows/release.yml/runs')) return send(200, { workflow_runs: [] });
      if (req.method === 'PATCH') return send(200, {});
      send(404, { message: 'Not Found' });
    });
  });
  await new Promise((r) => gh.listen(0, '127.0.0.1', r));
  let sessionName = 'hackerbest11';
  const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from('ENC' + t), decryptString: (b) => b.toString().slice(3) };
  const mkAdmin = () => adminLib.create({
    auth: { session: async (uuid) => ({ name: sessionName, uuid }) }, safeStorage: fakeSafe, version: '1.1.0',
    config: { owner: 'me', repo: 'vex-client', apiBase: `http://127.0.0.1:${gh.address().port}` }, admins: ['HAckerbest11', 'RaxMc', 'UNCdel'],
  });
  await test('admin: only the listed accounts, checked against the Minecraft session name', async () => {
    store.saveSettings({ activeAccount: 'abc' });
    const a = mkAdmin();
    assert.ok(a.listed('RAXMC') && a.listed('uncdel') && !a.listed('Steve'));
    const st = await a.status();
    assert.strictEqual(st.name, 'hackerbest11');
    assert.strictEqual(st.github, null);
    sessionName = 'Steve';
    await assert.rejects(mkAdmin().status(), /admin access/);
    sessionName = 'HAckerbest11';
  });
  await test('admin: token is validated, stored encrypted, never returned; actions need it', async () => {
    const a = mkAdmin();
    await assert.rejects(a.overview(), /Connect GitHub/);
    await assert.rejects(a.connect('hello'), /does not look like/);
    await assert.rejects(a.connect('github_pat_WRONGTOKEN1234567890abcdef'), /refused/);
    const st = await a.connect('github_pat_GOODTOKEN1234567890abcdef');
    assert.strictEqual(st.github.login, 'hackerbest');
    assert.ok(!JSON.stringify(st).includes('GOODTOKEN'));
    const raw = fs.readFileSync(path.join(store.getBaseDir(), 'admin.json'), 'utf8');
    assert.ok(!raw.includes('github_pat_GOODTOKEN'), 'token must not be stored in plain text');
    const ov = await a.overview();
    assert.strictEqual(ov.latest, '1.1.0');
    assert.strictEqual(ov.totalDownloads, 10);
    assert.ok(ov.releases.find((r) => r.version === '1.0.0').critical);
  });
  await test('admin: publish validates input and starts the release workflow', async () => {
    const a = mkAdmin();
    await assert.rejects(a.publish({ bump: 'huge', notes: 'x' }), /patch, minor or major/);
    await assert.rejects(a.publish({ bump: 'patch', notes: '' }), /Write what changed/);
    await assert.rejects(a.publish({ bump: 'patch', notes: 'Fixes', minimum: 'abc' }), /Minimum/);
    await a.publish({ bump: 'minor', critical: true, minimum: '1.0.0', notes: '### Fixed\n- stuff' });
    const d = ghCalls.find((c) => /dispatches/.test(c.u));
    assert.deepStrictEqual(d.body, { ref: 'main', inputs: { bump: 'minor', critical: 'true', minimum: '1.0.0', notes: '### Fixed\n- stuff' } });
    const r = await a.rollout(2, 'pause');
    assert.strictEqual(r.fallback, 'v1.0.0');
    assert.ok(ghCalls.some((c) => c.m === 'PATCH' && c.u.endsWith('/releases/2') && c.body.prerelease === true));
    await a.disconnect();
    await assert.rejects(a.overview(), /Connect GitHub/);
  });
  gh.close();

  // ---------- Vex mod in profiles ----------
  await test('Vex mod: one copy only, the newest wins, never downgraded', async () => {
    const va = lib('vexassets');
    const assets = tmp();
    const vexJar = (v) => makeZip({ 'fabric.mod.json': JSON.stringify({ schemaVersion: 1, id: 'vexclient', version: v }) });
    fs.writeFileSync(path.join(assets, 'vex-client-mod.jar'), vexJar('1.3.0'));
    const oldAssets = va.paths.assets; va.paths.assets = assets;
    try {
      const p = store.createProfile({ name: 'Vex mod', version: va.MOD_MC, loader: 'fabric' });
      const mods = path.join(store.profileDir(p.id), 'mods');
      fs.mkdirSync(mods, { recursive: true });
      fs.writeFileSync(path.join(mods, 'fabric-api.jar'), apiJar);
      fs.writeFileSync(path.join(mods, 'vex-client-mod-1.2.0.jar'), vexJar('1.2.0')); // an old copy dropped in by hand
      await va.prepare(store.getProfile(p.id), {});
      const ver = () => lib('modrinth').inspectJar(path.join(mods, 'vex-client-mod.jar')).version;
      assert.deepStrictEqual(fs.readdirSync(mods).filter((n) => /vex/.test(n)), ['vex-client-mod.jar']);
      assert.strictEqual(ver(), '1.3.0');
      fs.writeFileSync(path.join(mods, 'vex-client-mod-1.4.0.jar'), vexJar('1.4.0')); // a newer one dropped in by hand
      await va.prepare(store.getProfile(p.id), {});
      assert.deepStrictEqual(fs.readdirSync(mods).filter((n) => /vex/.test(n)), ['vex-client-mod.jar']);
      assert.strictEqual(ver(), '1.4.0');
      await va.prepare(store.getProfile(p.id), {}); // the older bundled 1.3.0 must not replace it
      assert.strictEqual(ver(), '1.4.0');
    } finally { va.paths.assets = oldAssets; }
  });

  // ---------- java download ----------
  console.log('java');
  await test('downloads Mojang\'s Java runtime once, verifies every file, blocks path tricks', async () => {
    const javadl = lib('javadl');
    const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
    const bin = Buffer.from('#!/bin/sh\necho fake java\n');
    const lib1 = Buffer.from('library');
    const key = javadl.platformKey();
    files['/rt/bin-java'] = bin; files['/rt/lib1'] = lib1;
    const manifest = { files: {
      bin: { type: 'directory' },
      ['bin/' + exeName]: { type: 'file', executable: true, downloads: { raw: { url: `${base}/rt/bin-java`, sha1: sha1(bin), size: bin.length } } },
      'lib/modules': { type: 'file', downloads: { raw: { url: `${base}/rt/lib1`, sha1: sha1(lib1), size: lib1.length } } },
    } };
    files['/rt/manifest.json'] = Buffer.from(JSON.stringify(manifest));
    files['/rt/all.json'] = Buffer.from(JSON.stringify({ [key]: { 'java-runtime-delta': [{ manifest: { url: `${base}/rt/manifest.json` }, version: { name: '21.0.7' } }] } }));
    net.endpoints.javaRuntimes = `${base}/rt/all.json`;
    const root = tmp();
    const meta = { javaVersion: { component: 'java-runtime-delta', majorVersion: 21 } };
    let progress = 0;
    const exe = await javadl.ensure(root, meta, { onProgress: (r) => { progress = r; } });
    assert.ok(exe.endsWith(exeName) && fs.existsSync(exe));
    assert.strictEqual(fs.readFileSync(path.join(root, 'runtime', 'java-runtime-delta', 'lib', 'modules'), 'utf8'), 'library');
    assert.strictEqual(progress, bin.length + lib1.length);
    delete files['/rt/all.json']; // second call must not hit the network
    assert.strictEqual(await javadl.ensure(root, meta), exe);
    assert.strictEqual(javadl.componentFor({ javaVersion: { majorVersion: 17 } }), 'java-runtime-gamma');
    // a corrupted file is refused
    files['/rt/all.json'] = Buffer.from(JSON.stringify({ [key]: { 'java-runtime-gamma': [{ manifest: { url: `${base}/rt/bad.json` } }] } }));
    files['/rt/bad.json'] = Buffer.from(JSON.stringify({ files: { ['bin/' + exeName]: { type: 'file', downloads: { raw: { url: `${base}/rt/lib1`, sha1: sha1(bin), size: 3 } } } } }));
    await assert.rejects(javadl.ensure(tmp(), { javaVersion: { component: 'java-runtime-gamma' } }), /corrupted/);
    files['/rt/bad.json'] = Buffer.from(JSON.stringify({ files: { '../../evil': { type: 'file', downloads: { raw: { url: `${base}/rt/lib1`, sha1: sha1(lib1), size: lib1.length } } } } }));
    await assert.rejects(javadl.ensure(tmp(), { javaVersion: { component: 'java-runtime-gamma' } }), /Bad path/);
  });

  server.close();
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
