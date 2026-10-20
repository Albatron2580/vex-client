// Network helpers: JSON requests and verified, resumable-looking downloads with progress.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');

const UA = `VexClient/${require('../../package.json').version} (Minecraft launcher)`;

// Every remote service in one place so tests can point them at a local server.
const endpoints = {
  modrinth: 'https://api.modrinth.com/v2',
  modrinthSite: 'https://modrinth.com',
  mojangManifest: 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
  mojangNews: 'https://launchercontent.mojang.com',
  fabric: 'https://meta.fabricmc.net/v2',
  forgePromos: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
  forgeMaven: 'https://maven.minecraftforge.net',
  neoMaven: 'https://maven.neoforged.net/releases',
  mcServices: 'https://api.minecraftservices.com',
  session: 'https://sessionserver.mojang.com',
};

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

async function request(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      body: opts.body,
      signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : undefined,
    });
  } catch (e) {
    const err = new Error(`Can't reach ${hostOf(url)}. Check your internet connection and try again.`);
    err.cause = e;
    err.offline = true;
    throw err;
  }
  if (!res.ok && !opts.allowStatus) {
    const err = new Error(`${hostOf(url)} answered ${res.status} ${res.statusText}`.trim());
    err.status = res.status;
    throw err;
  }
  return res;
}

async function getJson(url, opts = {}) {
  const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  return res.json();
}

async function getText(url, opts = {}) {
  return (await request(url, opts)).text();
}

async function postJson(url, data, opts = {}) {
  return getJson(url, {
    ...opts,
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

// Download to dest. Verifies sha1/sha512 when given. Writes to dest.part first so a failed
// download never leaves a half file under the real name.
async function download(url, dest, opts = {}) {
  const { sha1, sha512, onProgress, size } = opts;
  const res = await request(url);
  const total = Number(res.headers.get('content-length')) || size || 0;
  const algo = sha512 ? 'sha512' : sha1 ? 'sha1' : null;
  const expected = (sha512 || sha1 || '').toLowerCase();
  const hash = algo ? crypto.createHash(algo) : null;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const ws = fs.createWriteStream(tmp);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      if (!ws.write(chunk)) await once(ws, 'drain');
      if (hash) hash.update(chunk);
      received += chunk.length;
      if (onProgress) onProgress(received, total);
    }
    ws.end();
    await once(ws, 'finish');
  } catch (e) {
    ws.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  if (hash && hash.digest('hex') !== expected) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Download of ${path.basename(dest)} was corrupted (checksum mismatch). Try again.`);
  }
  fs.renameSync(tmp, dest);
  return dest;
}

function sha1File(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

// Run async fn over items with a small concurrency limit; stops at the first error.
async function pool(items, limit, fn) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

module.exports = { UA, endpoints, request, getJson, getText, postJson, download, sha1File, pool };
