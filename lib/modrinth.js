// Modrinth API: search, install (with required dependencies), update, remove, and .mrpack modpacks.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const net = require('./net');
const { Zip, withZip } = require('./zip');

const api = () => net.endpoints.modrinth;
const enc = encodeURIComponent;
const jsonParam = (v) => enc(JSON.stringify(v));
const LOADER_NAMES = ['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift'];
const DOWNLOAD_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];

// ---------- search ----------
async function categories(type = 'mod') {
  const all = await net.getJson(`${api()}/tag/category`, { timeout: 15000 });
  return all.filter((c) => c.project_type === type).map((c) => c.name);
}

async function search({ type = 'mod', query = '', version = '', loader = '', category = '', sort = 'relevance', offset = 0, limit = 20 } = {}) {
  const facets = [[`project_type:${type}`]];
  if (version) facets.push([`versions:${version}`]);
  if (loader && (type === 'mod' || type === 'modpack')) facets.push([`categories:${loader}`]);
  if (category) facets.push([`categories:${category}`]);
  const idx = ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(sort) ? sort : 'relevance';
  const url = `${api()}/search?query=${enc(query)}&facets=${jsonParam(facets)}&index=${idx}&offset=${Math.max(0, offset | 0)}&limit=${Math.min(50, Math.max(1, limit | 0 || 20))}`;
  const r = await net.getJson(url, { timeout: 20000 });
  return {
    total: r.total_hits || 0,
    offset: r.offset || 0,
    hits: (r.hits || []).map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      icon: h.icon_url || '',
      categories: (h.display_categories || h.categories || []).filter((c) => !LOADER_NAMES.includes(c)),
      loaders: (h.categories || []).filter((c) => LOADER_NAMES.includes(c)),
      versions: h.versions || [],
      updated: h.date_modified,
      type: h.project_type,
    })),
  };
}

async function projectVersions(project, { version = '', loader = '', type = 'mod' } = {}) {
  const q = [];
  if (version) q.push(`game_versions=${jsonParam([version])}`);
  if (loader && (type === 'mod' || type === 'modpack')) q.push(`loaders=${jsonParam([loader])}`);
  return net.getJson(`${api()}/project/${enc(project)}/version${q.length ? '?' + q.join('&') : ''}`, { timeout: 20000 });
}

function pickVersion(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((v) => v.version_type === 'release') || list.find((v) => v.version_type === 'beta') || list[0];
}

const primaryFile = (ver) => (ver.files || []).find((f) => f.primary) || (ver.files || [])[0];

function safeName(name, exts) {
  const base = path.basename(String(name || ''));
  if (!base || base !== name || base.startsWith('.')) throw new Error(`Refusing unsafe file name: ${name}`);
  if (exts && !exts.some((e) => base.toLowerCase().endsWith(e))) throw new Error(`Unexpected file type: ${base}`);
  return base;
}

const task = (ctx, id, label, received, total, done) => ctx && ctx.onTask && ctx.onTask({ id, label, received, total, done: !!done });

async function fetchFile(ctx, file, dest) {
  const id = 'dl:' + path.basename(dest);
  const label = `Downloading ${path.basename(dest)}`;
  try {
    await net.download(file.url, dest, {
      sha1: file.hashes && file.hashes.sha1,
      size: file.size,
      onProgress: (r, t) => task(ctx, id, label, r, t, false),
    });
  } finally {
    task(ctx, id, label, 1, 1, true);
  }
}

// ---------- per-profile mod records ----------
const modsDir = (profile) => { const d = path.join(store.profileDir(profile.id), 'mods'); fs.mkdirSync(d, { recursive: true }); return d; };
const manifestFile = (profile) => path.join(store.profileDir(profile.id), 'vex-mods.json');
const readManifest = (profile) => { const m = store.readJson(manifestFile(profile), { mods: {} }); if (!m.mods) m.mods = {}; return m; };
const writeManifest = (profile, m) => store.writeJson(manifestFile(profile), m);
function rememberMod(profile, file, meta) { const m = readManifest(profile); m.mods[file] = meta; writeManifest(profile, m); }
function forgetMod(profile, base) { const m = readManifest(profile); delete m.mods[base]; writeManifest(profile, m); }
const pendingProjects = (opts) => new Set(((opts && opts.pending) || []).filter((o) => o.op === 'add' && o.meta).map((o) => o.meta.projectId));

// Turns low-level failures into something a player can act on.
function friendly(e, what) {
  const msg = (e && e.message) || String(e);
  if (e && (e.code === 'EBUSY' || e.code === 'EPERM')) return new Error(`${what}: a file is in use. Close Minecraft and try again.`);
  if (e && e.code === 'ENOSPC') return new Error(`${what}: the disk is full.`);
  if (e && e.offline) return new Error(`${what}: Modrinth can't be reached. Check your internet connection.`);
  if (e && e.status === 404) return new Error(`${what}: Modrinth doesn't have that project or version any more.`);
  if (e && e.status === 429) return new Error(`${what}: Modrinth is rate-limiting requests. Wait a minute and try again.`);
  return new Error(msg.startsWith(what) ? msg : `${what}: ${msg}`);
}

// opts.stage = { dir, add(fileName, meta) } downloads into a staging folder instead of the mods folder
// (used while the game is running); opts.pending = queued operations, so nothing is queued twice.
async function installMod(profile, project, ctx, opts = {}) {
  if (profile.loader === 'vanilla') throw new Error('This profile is Vanilla, so it cannot load mods. Edit the profile and choose Fabric, Forge or NeoForge.');
  try { return await installModInner(profile, project, ctx, opts); } catch (e) { throw friendly(e, 'Install failed'); }
}

async function installModInner(profile, project, ctx, opts) {
  const dir = opts.stage ? opts.stage.dir : modsDir(profile);
  const m = readManifest(profile);
  const have = new Set([...Object.values(m.mods).map((x) => x.projectId), ...pendingProjects(opts)]);
  const installed = [];
  const skipped = [];
  const seen = new Set();
  const queue = [{ project, depth: 0 }];
  while (queue.length) {
    const item = queue.shift();
    let ver;
    if (item.versionId) {
      ver = await net.getJson(`${api()}/version/${enc(item.versionId)}`, { timeout: 15000 });
    } else if (item.project) {
      ver = pickVersion(await projectVersions(item.project, { version: profile.version, loader: profile.loader }));
      if (!ver) {
        const what = item.depth ? `A required dependency (${item.project})` : `This mod`;
        throw new Error(`${what} has no build for Minecraft ${profile.version} on ${profile.loader}.`);
      }
    } else continue;
    if (seen.has(ver.project_id)) continue;
    seen.add(ver.project_id);
    const info = await net.getJson(`${api()}/project/${enc(ver.project_id)}`, { timeout: 15000 });
    if (have.has(ver.project_id)) { skipped.push(info.title); continue; }
    const file = primaryFile(ver);
    if (!file) throw new Error(`${info.title} has no downloadable file.`);
    const name = safeName(file.filename, ['.jar']);
    if (!(ver.loaders || [profile.loader]).includes(profile.loader)) throw new Error(`${info.title} ${ver.version_number} is not made for ${profile.loader}.`);
    await fetchFile(ctx, file, path.join(dir, name));
    const meta = { projectId: ver.project_id, versionId: ver.id, slug: info.slug, title: info.title, version: ver.version_number, sha1: file.hashes && file.hashes.sha1, icon: info.icon_url || '' };
    if (opts.stage) opts.stage.add(name, meta);
    else { m.mods[name] = meta; writeManifest(profile, m); }
    installed.push({ title: info.title, file: name });
    for (const d of ver.dependencies || []) {
      if (d.dependency_type === 'required') queue.push({ project: d.project_id, versionId: d.version_id || '', depth: item.depth + 1 });
    }
  }
  return { installed, skipped, queued: !!opts.stage };
}

// ---------- looking inside mod jars ----------
function satisfiesMc(range, mc) {
  if (!/^\d+(\.\d+)*$/.test(mc)) return true; // snapshots and pre-releases: can't judge
  const v = mc.split('.').map(Number);
  const parse = (s) => s.split('.').map((x) => (x === 'x' || x === '*' ? 'x' : parseInt(x, 10)));
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  const one = (r) => String(r).trim().split(/\s+/).every((part) => {
    if (!part || part === '*') return true;
    const [, op = '=', ver] = /^(>=|<=|>|<|=|~|\^)?(.*)$/.exec(part);
    if (!ver) return true;
    const pv = parse(ver);
    if (pv.some((n) => Number.isNaN(n))) return true;
    const xi = pv.indexOf('x');
    if (xi >= 0) return pv.slice(0, xi).every((n, i) => v[i] === n);
    switch (op) {
      case '>=': return cmp(v, pv) >= 0;
      case '<=': return cmp(v, pv) <= 0;
      case '>': return cmp(v, pv) > 0;
      case '<': return cmp(v, pv) < 0;
      case '~': return v.slice(0, pv.length >= 2 ? 2 : 1).every((n, i) => n === pv[i]) && cmp(v, pv) >= 0;
      case '^': return v[0] === pv[0] && cmp(v, pv) >= 0;
      default: return cmp(v, pv) === 0;
    }
  });
  return (Array.isArray(range) ? range : [range]).some(one);
}

function inspectJar(file) {
  const info = { loader: 'unknown', id: '', name: '', version: '', depends: {}, provides: [], breaks: {}, required: [] };
  try {
    withZip(file, (z) => {
      if (z.has('fabric.mod.json')) {
        const j = z.readJson('fabric.mod.json');
        Object.assign(info, { loader: 'fabric', id: j.id || '', name: j.name || j.id || '', version: String(j.version || ''), depends: j.depends || {}, provides: j.provides || [], breaks: j.breaks || {} });
      } else if (z.has('quilt.mod.json')) {
        const j = z.readJson('quilt.mod.json');
        const q = j.quilt_loader || {};
        Object.assign(info, { loader: 'quilt', id: q.id || '', name: (q.metadata && q.metadata.name) || q.id || '', version: String(q.version || '') });
      } else if (z.has('META-INF/neoforge.mods.toml') || z.has('META-INF/mods.toml')) {
        const neo = z.has('META-INF/neoforge.mods.toml');
        const t = z.readText(neo ? 'META-INF/neoforge.mods.toml' : 'META-INF/mods.toml');
        const get = (re) => { const m = re.exec(t); return m ? m[1] : ''; };
        Object.assign(info, { loader: neo ? 'neoforge' : 'forge', id: get(/modId\s*=\s*"([^"]+)"/), name: get(/displayName\s*=\s*"([^"]+)"/), version: get(/^\s*version\s*=\s*"([^"]+)"/m) });
        info.name = info.name || info.id;
        // [[dependencies.<id>]] blocks: modId + mandatory=true (Forge) or type="required" (NeoForge)
        for (const block of t.split(/\[\[dependencies\.[^\]]+\]\]/).slice(1)) {
          const dep = /modId\s*=\s*"([^"]+)"/.exec(block);
          const mand = /mandatory\s*=\s*true/.test(block) || /type\s*=\s*"required"/i.test(block);
          if (dep && mand) info.required.push(dep[1]);
        }
      } else if (z.has('mcmod.info')) {
        info.loader = 'forge';
      }
    });
  } catch { info.broken = true; }
  return info;
}

function installedMods(profile) {
  const dir = modsDir(profile);
  const m = readManifest(profile);
  const files = fs.readdirSync(dir).filter((f) => /\.jar(\.disabled)?$/i.test(f));
  const rows = files.map((f) => {
    const enabled = !f.endsWith('.disabled');
    const base = enabled ? f : f.slice(0, -'.disabled'.length);
    const meta = m.mods[base] || null;
    const full = path.join(dir, f);
    const jar = inspectJar(full);
    return { file: f, base, enabled, size: fs.statSync(full).size, meta, jar, issues: [] };
  });
  // dependency pool from enabled Fabric mods
  const provided = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader']);
  let hasFabricApi = false;
  for (const r of rows) {
    if (!r.enabled || r.jar.loader !== 'fabric') continue;
    provided.add(r.jar.id);
    (r.jar.provides || []).forEach((p) => provided.add(p));
    if (r.jar.id === 'fabric-api') hasFabricApi = true;
  }
  // Forge/NeoForge pool, and duplicate mod ids
  const forgeIds = new Set(['minecraft', 'forge', 'neoforge', 'fml', 'javafml', 'lowcodefml']);
  const seenIds = new Map();
  for (const r of rows) {
    if (!r.enabled || !r.jar.id) continue;
    if (r.jar.loader === 'forge' || r.jar.loader === 'neoforge') forgeIds.add(r.jar.id);
    if (seenIds.has(r.jar.id)) {
      const other = seenIds.get(r.jar.id);
      r.issues.push(`Conflict: ${other.file} is another copy of this mod. Remove one of them.`);
      other.issues.push(`Conflict: ${r.file} is another copy of this mod. Remove one of them.`);
    } else seenIds.set(r.jar.id, r);
  }
  for (const r of rows) {
    const j = r.jar;
    if (j.broken) r.issues.push('This file is not a readable jar.');
    if (r.enabled && (j.loader === 'forge' || j.loader === 'neoforge') && j.loader === profile.loader) {
      for (const dep of j.required) if (!forgeIds.has(dep)) r.issues.push(`Needs "${dep}", which is not installed.`);
    }
    if (r.enabled && j.loader === 'fabric') {
      for (const bad of Object.keys(j.breaks || {})) if (provided.has(bad)) r.issues.push(`Conflict: not compatible with "${bad}", which is installed.`);
    }
    if (profile.loader !== 'vanilla' && j.loader !== 'unknown' && j.loader !== profile.loader && !j.broken) {
      r.issues.push(`This is a ${j.loader} mod, but the profile uses ${profile.loader}.`);
    }
    if (profile.loader === 'vanilla' && !j.broken) r.issues.push('Vanilla profiles do not load mods. Switch the profile to a mod loader.');
    if (r.enabled && j.loader === 'fabric' && profile.loader === 'fabric') {
      const mcReq = j.depends.minecraft;
      if (mcReq && !satisfiesMc(mcReq, profile.version)) r.issues.push(`Built for Minecraft ${Array.isArray(mcReq) ? mcReq.join(' or ') : mcReq}, not ${profile.version}.`);
      for (const dep of Object.keys(j.depends)) {
        if (provided.has(dep)) continue;
        if (hasFabricApi && dep.startsWith('fabric-')) continue;
        r.issues.push(`Needs "${dep}", which is not installed.`);
      }
    }
  }
  return rows.map((r) => ({
    file: r.file,
    enabled: r.enabled,
    size: r.size,
    title: (r.meta && r.meta.title) || r.jar.name || r.base,
    version: (r.meta && r.meta.version) || r.jar.version || '',
    icon: (r.meta && r.meta.icon) || '',
    slug: (r.meta && r.meta.slug) || '',
    source: r.meta ? 'modrinth' : 'manual',
    loader: r.jar.loader,
    modId: r.jar.id || '',
    issues: r.issues,
  })).sort((a, b) => a.title.localeCompare(b.title));
}

function checkedModFile(profile, file) {
  if (!/\.jar(\.disabled)?$/i.test(file) || path.basename(file) !== file) throw new Error('That is not a mod file.');
  const full = path.join(modsDir(profile), file);
  if (!fs.existsSync(full)) throw new Error('That mod file no longer exists.');
  return full;
}

function removeMod(profile, file) {
  fs.rmSync(checkedModFile(profile, file), { force: true });
  const base = file.replace(/\.disabled$/, '');
  const m = readManifest(profile);
  delete m.mods[base];
  writeManifest(profile, m);
}

function toggleMod(profile, file) {
  const full = checkedModFile(profile, file);
  const enabled = !file.endsWith('.disabled');
  const next = enabled ? file + '.disabled' : file.slice(0, -'.disabled'.length);
  fs.renameSync(full, path.join(modsDir(profile), next));
  return next;
}

function addLocalMods(profile, paths) {
  const dir = profile.stageDir || modsDir(profile);
  const added = [];
  for (const p of paths) {
    const name = path.basename(p);
    if (!/\.jar$/i.test(name)) throw new Error(`${name} is not a .jar file.`);
    withZip(p, () => {}); // must be a real zip
    fs.copyFileSync(p, path.join(dir, name));
    added.push(name);
  }
  return added;
}

// ---------- recognise mods that came from elsewhere (imports, manual copies) ----------
// Looks every jar without a Modrinth record up by its SHA-1, so update checks and icons work for it.
async function identifyInstalled(profile) {
  const dir = modsDir(profile);
  const m = readManifest(profile);
  const byHash = {};
  for (const f of fs.readdirSync(dir).filter((x) => /\.jar$/i.test(x) && !m.mods[x])) byHash[net.sha1File(path.join(dir, f))] = f;
  const hashes = Object.keys(byHash);
  if (!hashes.length) return [];
  const found = await net.postJson(`${api()}/version_files`, { hashes, algorithm: 'sha1' }, { timeout: 25000 });
  const ids = [...new Set(Object.values(found || {}).map((v) => v.project_id))];
  const projects = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const list = await net.getJson(`${api()}/projects?ids=${jsonParam(chunk)}`, { timeout: 25000 });
    for (const p of list || []) projects[p.id] = p;
  }
  let n = 0;
  for (const [hash, ver] of Object.entries(found || {})) {
    const file = byHash[hash];
    const info = projects[ver.project_id] || {};
    m.mods[file] = { projectId: ver.project_id, versionId: ver.id, slug: info.slug || '', title: info.title || file, version: ver.version_number, sha1: hash, icon: info.icon_url || '' };
    n++;
  }
  writeManifest(profile, m);
  return [`${n} of ${hashes.length} mods were recognised on Modrinth (update checks work for those).`];
}

// ---------- updates ----------
async function checkUpdates(profile) {
  if (profile.loader === 'vanilla') return [];
  const m = readManifest(profile);
  const dir = modsDir(profile);
  const byHash = {};
  for (const [base, entry] of Object.entries(m.mods)) {
    const full = path.join(dir, base);
    if (fs.existsSync(full)) byHash[net.sha1File(full)] = { base, entry };
  }
  const hashes = Object.keys(byHash);
  if (!hashes.length) return [];
  const res = await net.postJson(`${api()}/version_files/update`, {
    hashes, algorithm: 'sha1', loaders: [profile.loader], game_versions: [profile.version],
  }, { timeout: 25000 });
  const updates = [];
  for (const [hash, ver] of Object.entries(res || {})) {
    const cur = byHash[hash];
    if (!cur || !ver || (ver.files || []).some((f) => f.hashes && f.hashes.sha1 === hash)) continue; // up to date
    updates.push({ file: cur.base, title: cur.entry.title || cur.base, from: cur.entry.version || '', to: ver.version_number, versionId: ver.id, projectId: ver.project_id });
  }
  return updates;
}

async function updateMod(profile, update, ctx, opts = {}) {
  const ver = await net.getJson(`${api()}/version/${enc(update.versionId)}`, { timeout: 15000 });
  const file = primaryFile(ver);
  const name = safeName(file.filename, ['.jar']);
  const m = readManifest(profile);
  const old = m.mods[update.file] || {};
  if (opts.stage) {
    await fetchFile(ctx, file, path.join(opts.stage.dir, name));
    opts.stage.add(name, { ...old, versionId: ver.id, version: ver.version_number, sha1: file.hashes && file.hashes.sha1 }, update.file);
    return name;
  }
  const dir = modsDir(profile);
  await fetchFile(ctx, file, path.join(dir, name));
  if (update.file !== name) fs.rmSync(path.join(dir, update.file), { force: true });
  delete m.mods[update.file];
  m.mods[name] = { ...old, versionId: ver.id, version: ver.version_number, sha1: file.hashes && file.hashes.sha1 };
  writeManifest(profile, m);
  return name;
}

async function updateAll(profile, ctx, opts = {}) {
  const list = await checkUpdates(profile);
  const done = [];
  for (const u of list) done.push({ title: u.title, file: await updateMod(profile, u, ctx, opts) });
  return done;
}

// ---------- resource packs and shaders from Modrinth ----------
async function installPack(profile, kind, project, ctx) {
  const ver = pickVersion(await projectVersions(project, { version: profile.version, type: kind }));
  if (!ver) throw new Error(`This ${kind === 'shader' ? 'shader pack' : 'resource pack'} has no build for Minecraft ${profile.version}.`);
  const file = primaryFile(ver);
  const name = safeName(file.filename, ['.zip']);
  const dir = path.join(store.profileDir(profile.id), kind === 'shader' ? 'shaderpacks' : 'resourcepacks');
  fs.mkdirSync(dir, { recursive: true });
  await fetchFile(ctx, file, path.join(dir, name));
  return name;
}

// ---------- modpacks (.mrpack) ----------
async function modpackVersions(project) {
  const list = await projectVersions(project, { type: 'modpack' });
  return list.slice(0, 25).map((v) => ({
    id: v.id, name: v.name, number: v.version_number, type: v.version_type,
    gameVersions: v.game_versions || [], loaders: v.loaders || [], date: v.date_published,
  }));
}

async function installModpackVersion(versionId, ctx) {
  const ver = await net.getJson(`${api()}/version/${enc(versionId)}`, { timeout: 15000 });
  const file = (ver.files || []).find((f) => /\.mrpack$/i.test(f.filename) && f.primary) || (ver.files || []).find((f) => /\.mrpack$/i.test(f.filename));
  if (!file) throw new Error('This modpack version has no .mrpack file.');
  const dest = path.join(store.getBaseDir(), 'cache', 'modpacks', safeName(file.filename, ['.mrpack']));
  await fetchFile(ctx, file, dest);
  return installMrpack(dest, ctx);
}

function checkDownloadUrl(u) {
  let url;
  try { url = new URL(u); } catch { throw new Error(`The modpack contains an invalid download link: ${u}`); }
  const local = net.endpoints.modrinth.startsWith('http://127.0.0.1') && url.hostname === '127.0.0.1'; // tests only
  if (!local && (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.includes(url.hostname))) {
    throw new Error(`The modpack tries to download from ${url.hostname}, which is not an allowed source (only Modrinth, GitHub and GitLab are).`);
  }
  return u;
}

async function installMrpack(file, ctx, opts = {}) {
  const z = new Zip(file);
  let profile = null;
  try {
    if (!z.has('modrinth.index.json')) throw new Error('This is not a Modrinth modpack: modrinth.index.json is missing.');
    const index = z.readJson('modrinth.index.json');
    if (index.game !== 'minecraft') throw new Error(`This modpack is for "${index.game}", not Minecraft.`);
    if (index.formatVersion !== 1) throw new Error(`Unsupported modpack format version ${index.formatVersion}.`);
    const deps = index.dependencies || {};
    if (!deps.minecraft) throw new Error('The modpack does not say which Minecraft version it needs.');
    let loader = 'vanilla';
    let loaderVersion = '';
    if (deps['fabric-loader']) { loader = 'fabric'; loaderVersion = deps['fabric-loader']; }
    else if (deps.neoforge) { loader = 'neoforge'; loaderVersion = deps.neoforge; }
    else if (deps.forge) { loader = 'forge'; loaderVersion = deps.forge; }
    else if (deps['quilt-loader']) throw new Error("This modpack needs the Quilt loader, which Vex Client doesn't support yet.");

    profile = store.createProfile({ name: opts.name || index.name || 'Modpack', version: deps.minecraft, loader, loaderVersion });
    const dir = store.profileDir(profile.id);
    const base = path.resolve(dir);
    const files = (index.files || []).filter((f) => !(f.env && f.env.client === 'unsupported'));
    const jobs = files.map((f) => {
      const target = path.resolve(base, f.path || '');
      if (!f.path || path.isAbsolute(f.path) || !target.startsWith(base + path.sep)) throw new Error(`Unsafe file path in modpack: ${f.path}`);
      if (!f.hashes || !f.hashes.sha1) throw new Error(`The modpack has no checksum for ${f.path}.`);
      const urls = (f.downloads || []).map(checkDownloadUrl);
      if (!urls.length) throw new Error(`The modpack has no download link for ${f.path}.`);
      return { f, target, urls };
    });

    let done = 0;
    const label = `Installing ${profile.name}`;
    task(ctx, 'pack', label, 0, jobs.length, false);
    await net.pool(jobs, 4, async ({ f, target, urls }) => {
      let lastErr;
      for (const url of urls) {
        try {
          await net.download(url, target, { sha1: f.hashes.sha1, size: f.fileSize });
          lastErr = null;
          break;
        } catch (e) { lastErr = e; }
      }
      if (lastErr) throw new Error(`Could not download ${path.basename(f.path)}: ${lastErr.message}`);
      done++;
      task(ctx, 'pack', label, done, jobs.length, false);
    });

    z.extract('overrides/', dir);
    z.extract('client-overrides/', dir);

    const m = readManifest(profile);
    for (const { f } of jobs) {
      if (!/^mods\//.test(f.path) || !/\.jar$/i.test(f.path)) continue;
      const mm = /cdn\.modrinth\.com\/data\/([^/]+)\/versions\/([^/]+)\//.exec((f.downloads || [])[0] || '');
      m.mods[path.basename(f.path)] = { projectId: mm ? mm[1] : '', versionId: mm ? mm[2] : '', slug: '', title: path.basename(f.path, '.jar'), version: '', sha1: f.hashes.sha1, icon: '' };
    }
    writeManifest(profile, m);
    task(ctx, 'pack', label, jobs.length, jobs.length, true);
    return profile;
  } catch (e) {
    task(ctx, 'pack', 'Installing modpack', 1, 1, true);
    if (profile) { try { store.deleteProfile(profile.id, { force: true }); } catch { /* best effort */ } }
    throw e;
  } finally {
    z.close();
  }
}

module.exports = {
  categories, search, projectVersions, pickVersion, installMod, installedMods, removeMod, toggleMod, addLocalMods,
  checkUpdates, updateMod, updateAll, installPack, modpackVersions, installModpackVersion, installMrpack,
  inspectJar, satisfiesMc, modsDir, rememberMod, forgetMod, friendly, identifyInstalled,
};
