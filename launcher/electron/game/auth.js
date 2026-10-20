// Microsoft / Xbox / Minecraft sign-in (through msmc), multiple accounts, and Mojang capes.
// Refresh tokens are encrypted with Electron's safeStorage (Windows DPAPI, tied to your Windows user).
// The Microsoft password is never seen by this app: sign-in happens on Microsoft's own page.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const net = require('./net');

const deps = { safeStorage: null, msmc: null };
const sessions = new Map();   // uuid -> { mclc, at }
const memTokens = new Map();  // uuid -> raw refresh token (this run only, used when encryption is unavailable)
const profileCache = new Map(); // uuid -> { at, data }

function init({ safeStorage } = {}) { deps.safeStorage = safeStorage || null; }
function setMsmc(m) { deps.msmc = m; } // tests inject a fake
const getMsmc = () => deps.msmc || require('msmc');

const canEncrypt = () => !!(deps.safeStorage && deps.safeStorage.isEncryptionAvailable());
const accountsFile = () => path.join(store.getBaseDir(), 'accounts.json');

function readAccounts() {
  const d = store.readJson(accountsFile(), { accounts: [] });
  return Array.isArray(d.accounts) ? d.accounts : [];
}

function writeAccounts(accounts) {
  store.writeJson(accountsFile(), { accounts });
  try { fs.chmodSync(accountsFile(), 0o600); } catch { /* not supported on Windows */ }
}

const encrypt = (raw) => deps.safeStorage.encryptString(raw).toString('base64');
const decrypt = (b64) => deps.safeStorage.decryptString(Buffer.from(b64, 'base64'));

function friendly(e) {
  const raw = [typeof e === 'string' ? e : '', e && e.message, e && e.ts, e && e.code].filter(Boolean).join(' ');
  if (/closed|cancel/i.test(raw)) return 'Sign-in was cancelled because the window was closed.';
  if (/entitlement/i.test(raw)) return "This Microsoft account doesn't own Minecraft: Java Edition. Buy it at minecraft.net, or sign in with the account that owns it.";
  if (/profile/i.test(raw)) return 'This account owns Minecraft but has no profile name yet. Open the official Minecraft Launcher once to choose one, then try again.';
  if (/xbox|xsts|xbl/i.test(raw)) return 'Xbox sign-in failed. The account may need an Xbox profile, or a child account may need an adult to allow online play at account.microsoft.com/family.';
  if (/ENOTFOUND|network|fetch failed|ECONN/i.test(raw)) return "Can't reach Microsoft. Check your internet connection and try again.";
  return `Sign-in failed${raw ? ': ' + raw : '.'}`;
}

function list() {
  const active = store.settings().activeAccount;
  return readAccounts().map((a) => ({ uuid: a.uuid, name: a.name, active: a.uuid === active, needsLogin: !!a.needsLogin }));
}

function status() {
  return { secureStorage: canEncrypt(), accounts: list() };
}

function save(uuid, name, rawToken) {
  memTokens.set(uuid, rawToken);
  const accounts = readAccounts().filter((a) => a.uuid !== uuid);
  accounts.push({ uuid, name, token: canEncrypt() ? encrypt(rawToken) : '', needsLogin: false });
  writeAccounts(accounts);
}

async function login() {
  const { Auth } = getMsmc();
  const auth = new Auth('select_account');
  let mc;
  let xbox;
  try {
    xbox = await auth.launch('electron');
    mc = await xbox.getMinecraft();
  } catch (e) {
    throw new Error(friendly(e));
  }
  const prof = mc.profile || {};
  const mclc = mc.mclc();
  const uuid = String(prof.id || mclc.uuid || '').replace(/-/g, '');
  const name = prof.name || mclc.name;
  if (!uuid || !name) throw new Error(friendly('profile'));
  save(uuid, name, xbox.save());
  sessions.set(uuid, { mclc, at: Date.now() });
  profileCache.delete(uuid);
  store.saveSettings({ activeAccount: uuid });
  return { uuid, name, secureStorage: canEncrypt() };
}

// A launch-ready session. Refreshes the stored token when the cached one is older than 15 minutes.
async function session(uuid) {
  const hit = sessions.get(uuid);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.mclc;
  const acc = readAccounts().find((a) => a.uuid === uuid);
  if (!acc) throw new Error('That account is not signed in. Add it on the Account page.');
  let raw = memTokens.get(uuid);
  if (!raw && acc.token) {
    try { raw = decrypt(acc.token); } catch { raw = ''; }
  }
  if (!raw) {
    markNeedsLogin(uuid);
    throw new Error('Your saved sign-in could not be read on this PC. Sign in again from the Account page.');
  }
  try {
    const { Auth } = getMsmc();
    const xbox = await new Auth('select_account').refresh(raw);
    const mc = await xbox.getMinecraft();
    save(uuid, acc.name, xbox.save());
    const mclc = mc.mclc();
    sessions.set(uuid, { mclc, at: Date.now() });
    return mclc;
  } catch (e) {
    if (/ENOTFOUND|network|fetch failed|ECONN/i.test(String(e && e.message || e))) throw new Error(friendly(e));
    markNeedsLogin(uuid);
    throw new Error('Your Microsoft session expired. Sign in again from the Account page.');
  }
}

function markNeedsLogin(uuid) {
  writeAccounts(readAccounts().map((a) => (a.uuid === uuid ? { ...a, needsLogin: true } : a)));
}

function setActive(uuid) {
  if (!readAccounts().some((a) => a.uuid === uuid)) throw new Error('That account is not signed in.');
  store.saveSettings({ activeAccount: uuid });
}

function signOut(uuid) {
  const rest = readAccounts().filter((a) => a.uuid !== uuid);
  writeAccounts(rest);
  sessions.delete(uuid);
  memTokens.delete(uuid);
  profileCache.delete(uuid);
  fs.rmSync(path.join(store.getBaseDir(), 'cache', `skin-${uuid}.png`), { force: true });
  fs.rmSync(path.join(store.getBaseDir(), 'cache', `skin-${uuid}.json`), { force: true });
  if (store.settings().activeAccount === uuid) store.saveSettings({ activeAccount: rest[0] ? rest[0].uuid : '' });
}

// ---------- Minecraft services ----------
async function minecraftProfile(uuid) {
  const hit = profileCache.get(uuid);
  if (hit && Date.now() - hit.at < 2 * 60 * 1000) return hit.data;
  const s = await session(uuid);
  const data = await net.getJson(`${net.endpoints.mcServices}/minecraft/profile`, {
    headers: { Authorization: `Bearer ${s.access_token}` },
    timeout: 15000,
  });
  profileCache.set(uuid, { at: Date.now(), data });
  return data;
}

// Skin as a data URL (cached on disk so it still shows offline).
async function skin(uuid) {
  const dir = path.join(store.getBaseDir(), 'cache');
  const png = path.join(dir, `skin-${uuid}.png`);
  const meta = path.join(dir, `skin-${uuid}.json`);
  try {
    const p = await minecraftProfile(uuid);
    const s = (p.skins || []).find((x) => x.state === 'ACTIVE') || (p.skins || [])[0];
    if (s && s.url) {
      const buf = Buffer.from(await (await net.request(s.url, { timeout: 15000 })).arrayBuffer());
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(png, buf);
      store.writeJson(meta, { slim: String(s.variant).toUpperCase() === 'SLIM' });
    }
  } catch { /* offline or signed out: fall back to the cached copy */ }
  if (!fs.existsSync(png)) return null;
  return {
    dataUrl: 'data:image/png;base64,' + fs.readFileSync(png).toString('base64'),
    slim: !!store.readJson(meta, {}).slim,
  };
}

async function capes(uuid) {
  const p = await minecraftProfile(uuid);
  return (p.capes || []).map((c) => ({ id: c.id, alias: c.alias || 'Cape', url: c.url, active: c.state === 'ACTIVE' }));
}

// Equip (id) or hide (null) a cape the account owns. This is the only kind of cape other players see.
async function setCape(uuid, id) {
  const s = await session(uuid);
  const url = `${net.endpoints.mcServices}/minecraft/profile/capes/active`;
  const headers = { Authorization: `Bearer ${s.access_token}` };
  if (id) {
    await net.request(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId: id }) });
  } else {
    await net.request(url, { method: 'DELETE', headers });
  }
  profileCache.delete(uuid);
  return capes(uuid);
}

module.exports = { init, setMsmc, login, session, list, status, setActive, signOut, skin, capes, setCape, friendly, canEncrypt };
