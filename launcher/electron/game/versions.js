// Minecraft versions (Mojang manifest) and mod loader setup: Fabric, Forge, NeoForge.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('./net');
const store = require('./store');
const { withZip } = require('./zip');

let manifestCache = null;
let manifestAt = 0;

async function manifest() {
  if (manifestCache && Date.now() - manifestAt < 10 * 60 * 1000) return manifestCache;
  const cacheFile = path.join(store.getBaseDir(), 'cache', 'version_manifest.json');
  try {
    manifestCache = await net.getJson(net.endpoints.mojangManifest, { timeout: 15000 });
    manifestAt = Date.now();
    store.writeJson(cacheFile, manifestCache);
  } catch (e) {
    const disk = store.readJson(cacheFile, null);
    if (!disk) throw e;
    manifestCache = disk;
    manifestAt = Date.now() - 9 * 60 * 1000; // try the network again in a minute
  }
  return manifestCache;
}

async function listVersions() {
  const m = await manifest();
  return {
    latest: m.latest || {},
    versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
  };
}

async function versionMeta(id) {
  const cacheFile = path.join(store.getBaseDir(), 'cache', 'versions', `${id}.json`);
  const cached = store.readJson(cacheFile, null);
  if (cached) return cached;
  const m = await manifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Minecraft ${id} is not in Mojang's version list.`);
  const meta = await net.getJson(entry.url, { timeout: 20000 });
  store.writeJson(cacheFile, meta);
  return meta;
}

// Java major version a Minecraft version asks for (old versions don't say, they use Java 8).
function javaMajor(meta) {
  return (meta && meta.javaVersion && meta.javaVersion.majorVersion) || 8;
}

function cmpVersions(a, b) {
  const pa = String(a).split(/[.-]/);
  const pb = String(b).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i]);
    const y = Number(pb[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) { if (x !== y) return x - y; } else if ((pa[i] || '') !== (pb[i] || '')) return String(pa[i] || '').localeCompare(String(pb[i] || ''));
  }
  return 0;
}

// ---------- Fabric ----------
async function fabricLoaders(mc) {
  const list = await net.getJson(`${net.endpoints.fabric}/versions/loader/${encodeURIComponent(mc)}`, { timeout: 15000 });
  if (!Array.isArray(list)) return [];
  return list.map((l) => ({ version: l.loader.version, stable: !!l.loader.stable }));
}

function installedFabric(root, mc) {
  const dir = path.join(root, 'versions');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  const hits = names.filter((n) => n.startsWith('fabric-loader-') && n.endsWith(`-${mc}`) && fs.existsSync(path.join(dir, n, `${n}.json`)));
  return hits.sort().pop() || null;
}

async function prepareFabric(root, mc, wanted) {
  let loaders;
  try {
    loaders = await fabricLoaders(mc);
  } catch (e) {
    const have = installedFabric(root, mc);
    if (have && e.offline) return have; // offline: use what is already installed
    throw e;
  }
  if (!loaders.length) throw new Error(`Fabric doesn't support Minecraft ${mc}. Pick another version, or switch this profile to Vanilla.`);
  let ver = wanted;
  if (ver && !loaders.some((l) => l.version === ver)) throw new Error(`Fabric loader ${ver} isn't available for Minecraft ${mc}.`);
  if (!ver) ver = (loaders.find((l) => l.stable) || loaders[0]).version;
  const predicted = `fabric-loader-${ver}-${mc}`;
  if (fs.existsSync(path.join(root, 'versions', predicted, `${predicted}.json`))) return predicted;
  const prof = await net.getJson(`${net.endpoints.fabric}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(ver)}/profile/json`, { timeout: 20000 });
  const id = prof.id || predicted;
  const dir = path.join(root, 'versions', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(prof));
  return id;
}

// ---------- Forge / NeoForge ----------
async function forgeVersions(mc) {
  const data = await net.getJson(net.endpoints.forgePromos, { timeout: 15000 });
  const promos = data.promos || {};
  return { recommended: promos[`${mc}-recommended`] || '', latest: promos[`${mc}-latest`] || '' };
}

async function neoVersions(mc) {
  const p = String(mc).split('.');
  const minor = Number(p[1]);
  const patch = Number(p[2] || 0);
  if (p[0] !== '1' || !(minor > 20 || (minor === 20 && patch >= 2))) return [];
  const prefix = `${minor}.${patch}.`;
  let versions = [];
  try {
    const xml = await net.getText(`${net.endpoints.neoMaven}/net/neoforged/neoforge/maven-metadata.xml`, { timeout: 15000 });
    versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  } catch (e) {
    const api = net.endpoints.neoMaven.replace(/\/releases\/?$/, '') + '/api/maven/versions/releases/net/neoforged/neoforge';
    const j = await net.getJson(api, { timeout: 15000 }).catch(() => { throw e; });
    versions = j.versions || [];
  }
  return versions
    .filter((v) => v.startsWith(prefix))
    .sort((a, b) => cmpVersions(b, a))
    .map((v) => ({ version: v, stable: !/[-+]/.test(v) }));
}

// Choices shown when creating or editing a profile.
async function loaderChoices(loader, mc) {
  if (loader === 'vanilla') return [];
  if (loader === 'fabric') {
    const l = await fabricLoaders(mc);
    return l.map((x) => ({ value: x.version, label: x.version + (x.stable ? '' : ' (unstable)') }));
  }
  if (loader === 'forge') {
    const f = await forgeVersions(mc);
    const out = [];
    if (f.recommended) out.push({ value: f.recommended, label: `${f.recommended} (recommended)` });
    if (f.latest && f.latest !== f.recommended) out.push({ value: f.latest, label: `${f.latest} (latest)` });
    return out;
  }
  if (loader === 'neoforge') {
    return (await neoVersions(mc)).map((x) => ({ value: x.version, label: x.version + (x.stable ? '' : ' (beta)') }));
  }
  return [];
}

function installerUrl(loader, mc, ver) {
  if (loader === 'forge') return `${net.endpoints.forgeMaven}/net/minecraftforge/forge/${mc}-${ver}/forge-${mc}-${ver}-installer.jar`;
  return `${net.endpoints.neoMaven}/net/neoforged/neoforge/${ver}/neoforge-${ver}-installer.jar`;
}

function installerVersionId(jar) {
  return withZip(jar, (z) => {
    if (z.has('version.json')) {
      const j = z.readJson('version.json');
      if (j.id) return j.id;
    }
    if (z.has('install_profile.json')) {
      const j = z.readJson('install_profile.json');
      return (j.versionInfo && j.versionInfo.id) || (typeof j.version === 'string' ? j.version : null);
    }
    return null;
  });
}

function runInstaller(java, jar, root, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(java, ['-jar', jar, '--installClient', root], { cwd: path.dirname(jar), windowsHide: true });
    const feed = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(onLine);
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`The mod loader installer failed (exit code ${code}). The launcher log has the details.`))));
  });
}

const loadersFile = (root) => path.join(root, 'vex-loaders.json');

async function prepareInstaller({ loader, mc, wanted, javaExe, root, log, onProgress }) {
  const label = loader === 'forge' ? 'Forge' : 'NeoForge';
  let ver = wanted;
  const state = store.readJson(loadersFile(root), {});
  try {
    if (!ver) {
      if (loader === 'forge') {
        const f = await forgeVersions(mc);
        ver = f.recommended || f.latest;
      } else {
        const list = await neoVersions(mc);
        ver = (list.find((x) => x.stable) || list[0] || {}).version;
      }
    }
  } catch (e) {
    const fallback = state[`${loader}:${mc}`];
    if (e.offline && fallback && fs.existsSync(path.join(root, 'versions', fallback, `${fallback}.json`))) return fallback;
    throw e;
  }
  if (!ver) throw new Error(`${label} isn't available for Minecraft ${mc}. Pick another version or loader.`);

  const key = `${loader}:${mc}:${ver}`;
  const known = state[key];
  if (known && fs.existsSync(path.join(root, 'versions', known, `${known}.json`))) return known;

  const url = installerUrl(loader, mc, ver);
  const jar = path.join(root, 'installers', `${loader}-${mc}-${ver}-installer.jar`);
  let sha1 = '';
  try { sha1 = (await net.getText(url + '.sha1', { timeout: 15000 })).trim().split(/\s+/)[0]; } catch { /* checksum file is optional */ }
  log(`Downloading the ${label} installer…`);
  await net.download(url, jar, { sha1: /^[0-9a-f]{40}$/i.test(sha1) ? sha1 : undefined, onProgress });

  const profiles = path.join(root, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));

  log(`Installing ${label} ${ver}. This can take a few minutes the first time…`);
  await runInstaller(javaExe, jar, root, (l) => log(l));
  const id = installerVersionId(jar);
  if (!id || !fs.existsSync(path.join(root, 'versions', id, `${id}.json`))) {
    throw new Error(`${label} installed, but the launcher could not find the new version. Check the launcher log.`);
  }
  state[key] = id;
  state[`${loader}:${mc}`] = id;
  store.writeJson(loadersFile(root), state);
  return id;
}

// Returns the custom version id MCLC should launch, or null for vanilla.
async function prepareLoader(profile, ctx) {
  const { root } = ctx;
  if (profile.loader === 'vanilla') return null;
  if (profile.loader === 'fabric') return prepareFabric(root, profile.version, profile.loaderVersion);
  return prepareInstaller({ loader: profile.loader, mc: profile.version, wanted: profile.loaderVersion, ...ctx });
}

module.exports = {
  manifest, listVersions, versionMeta, javaMajor, cmpVersions,
  fabricLoaders, forgeVersions, neoVersions, loaderChoices, prepareLoader,
  installerVersionId, installerUrl,
};
