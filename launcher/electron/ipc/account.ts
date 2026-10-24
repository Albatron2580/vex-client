// Modrinth sign-in through the VEX online service, plus friends API calls.
// The browser does the Modrinth login; the service hands VEX a session token on a one-time
// loopback URL (http://127.0.0.1:<random port>/callback). The token is encrypted with
// Windows' DPAPI via Electron safeStorage — never stored in plain text.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, BrowserWindow, safeStorage } from "electron";
import { log } from "./logger";
import { DEFAULT_ONLINE_URL } from "../config";

export interface Profile { id: string; username: string; avatar: string | null; mcName?: string | null; admin?: boolean }
export interface AccountState { configured: boolean; serviceUrl: string; signedIn: boolean; profile: Profile | null; persistent: boolean; loginError: string | null }

let serviceUrl = "";
let token: string | null = null;
let loginError: string | null = null;  // why the last automatic sign-in failed (shown on the Friends page)
let profile: Profile | null = null;
let heartbeat: NodeJS.Timeout | null = null;

const tokenFile = () => path.join(app.getPath("userData"), "account.bin");
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
const broadcast = () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("account:changed", accountState()));

export function accountState(): AccountState {
  return { configured: !!serviceUrl, serviceUrl, signedIn: !!token && !!profile, profile, persistent: canEncrypt(), loginError: token && profile ? null : loginError };
}

export async function initAccount(url: string) {
  serviceUrl = url || DEFAULT_ONLINE_URL;
  if (!serviceUrl) return;
  try {
    if (fs.existsSync(tokenFile()) && canEncrypt()) token = safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch (e: any) { log("warn", `Couldn't read saved sign-in: ${e.message}`); token = null; }
  if (token) await refreshProfile().catch(() => {});
}

export async function setServiceUrl(url: string): Promise<boolean> {
  const next = url || DEFAULT_ONLINE_URL;
  if (next === serviceUrl) return false;
  await logout(true); serviceUrl = next; broadcast();
  return true;
}

async function call<T>(method: string, p: string, body?: unknown): Promise<T> {
  if (!serviceUrl) throw new Error("The VEX online service isn't set up yet.");
  if (!token) throw new Error("Sign in with Modrinth first.");
  let res: Response;
  try {
    res = await fetch(serviceUrl + p, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": `VEX-CLIENT/${app.getVersion()}` },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  } catch { throw new Error("Couldn't reach the VEX server. Check your internet connection."); }
  if (res.status === 401) { clearToken(); throw new Error("Your sign-in expired. Please sign in again."); }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `VEX server error (${res.status})`);
  return data as T;
}

async function refreshProfile() {
  profile = await call<Profile>("GET", "/v1/me");
  startHeartbeat(); broadcast();
  linkMinecraft().catch(() => {});
}

// Proves which Minecraft account this player uses (the server checks it with Mojang).
// That's what unlocks the admin panel for the admin accounts.
let mcTokenSource: () => Promise<{ token: string; name: string; uuid?: string } | null> = async () => null;
export function setMinecraftTokenSource(fn: typeof mcTokenSource) { mcTokenSource = fn; }
export async function linkMinecraft() {
  if (!token || !profile) return accountState();
  const mc = await mcTokenSource().catch(() => null);
  if (!mc) return accountState();
  if (profile.mcName === mc.name && profile.admin !== undefined) return accountState();
  const r = await call<{ mcName: string; admin: boolean }>("POST", "/v1/link-minecraft", { token: mc.token });
  profile = { ...profile, mcName: r.mcName, admin: r.admin };
  log("info", `Linked Minecraft account ${r.mcName} to VEX online${r.admin ? " (admin)" : ""}`);
  broadcast();
  return accountState();
}

/** Announcements + featured server — public, works without signing in. */
export async function publicHome() {
  if (!serviceUrl) return { announcements: [], featured: null, configured: false };
  try {
    const r = await fetch(`${serviceUrl}/v1/public/home`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(String(r.status));
    return { ...(await r.json() as object), configured: true };
  } catch { return { announcements: [], featured: null, configured: true, offline: true }; }
}

export async function serviceVersion(): Promise<string | null> {
  if (!serviceUrl) return null;
  try { const r = await fetch(`${serviceUrl}/`, { signal: AbortSignal.timeout(10_000) }); return ((await r.json()) as any).version ?? "1.0.0"; } catch { return null; }
}

const id = (v: unknown) => { const s = String(v ?? ""); if (!/^[A-Za-z0-9]{1,40}$/.test(s)) throw new Error("Bad id."); return s; };
const num = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new Error("Bad id."); return n; };
export const online = {
  reportBug: (title: string, body: string, version: string) => call("POST", "/v1/bugs", { title, body, version }),
  /** A one-time code for the phone app, and the link its QR code opens. */
  pairPhone: async () => {
    const r = await call<{ code: string; expiresAt: number }>("POST", "/v1/pair");
    return { ...r, url: `${serviceUrl}/app#code=${r.code}`, appUrl: `${serviceUrl}/app` };
  },
  shares: () => call("GET", "/v1/shares"),
  share: (to: string, instance: unknown) => call("POST", "/v1/shares", { to: id(to), instance }),
  dismissShare: (shareId: number) => call("DELETE", `/v1/shares/${num(shareId)}`),
};
export const adminApi = {
  overview: () => call("GET", "/v1/admin/overview"),
  users: (q: string, filter: string) => call("GET", `/v1/admin/users?q=${encodeURIComponent(String(q ?? "").slice(0, 40))}&filter=${["online", "banned"].includes(filter) ? filter : ""}`),
  ban: (userId: string, banned: boolean) => call("POST", `/v1/admin/users/${id(userId)}/ban`, { banned: !!banned }),
  announce: (title: string, body: string, kind: string) => call("POST", "/v1/admin/announcements", { title, body, kind }),
  unannounce: (annId: number) => call("DELETE", `/v1/admin/announcements/${num(annId)}`),
  setFeatured: (f: unknown) => call("PUT", "/v1/admin/featured", f),
  clearFeatured: () => call("DELETE", "/v1/admin/featured"),
  bugs: (status: string) => call("GET", `/v1/admin/bugs?status=${["open", "fixed", "wontfix"].includes(status) ? status : "open"}`),
  setBug: (bugId: number, status: string) => call("POST", `/v1/admin/bugs/${num(bugId)}`, { status }),
};

function clearToken() {
  token = null; profile = null;
  if (heartbeat) clearInterval(heartbeat); heartbeat = null;
  fs.rmSync(tokenFile(), { force: true }); broadcast();
}

function startHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  const beat = () => call("POST", "/v1/presence", { status: "online", detail: "In VEX CLIENT" }).catch(() => {});
  beat(); heartbeat = setInterval(beat, 60_000);
}


// Sign in to VEX online with the Minecraft account used to play. The server checks the
// Minecraft token with Mojang, then the token is dropped — nothing to register anywhere.
let loginBusy: Promise<AccountState> | null = null;
export function login(): Promise<AccountState> {
  if (!serviceUrl) return Promise.reject(new Error("The VEX online service isn't set up yet."));
  if (loginBusy) return loginBusy;
  loginBusy = (async () => {
    const mc = await mcTokenSource().catch((e: Error) => { throw new Error(e.message || "Sign in with Microsoft again."); });
    if (!mc) throw new Error("Sign in with a Microsoft account first.");
    const ua = { "user-agent": `VEX-CLIENT/${app.getVersion()}` };
    const post = async (url: string, body: unknown, what: string) => {
      try { return await fetch(url, { method: "POST", headers: { ...ua, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) }); }
      catch { throw new Error(`Couldn't reach ${what}. Check your internet connection.`); }
    };
    // 1. a one-time code from VEX online
    const ch = await post(`${serviceUrl}/auth/minecraft/challenge`, {}, "the VEX server");
    if (ch.status === 404) throw new Error("Your online service is older than this VEX, so it can't sign you in yet. Update it: Settings → VEX online → Update online service (on the PC that set it up).");
    const chData: any = await ch.json().catch(() => ({}));
    if (!ch.ok || !/^[0-9a-f]{40}$/.test(chData.serverId ?? "")) throw new Error(chData.error ?? `VEX server error (${ch.status})`);
    const uuid = (mc.uuid ?? "").replace(/-/g, "");
    const mcHeaders = { ...ua, authorization: `Bearer ${mc.token}` };
    // 2. Minecraft's own key pair for this account (the one used for signed chat); Mojang signs its public key.
    //    The private key signs VEX's one-time code, so VEX can check the account without asking Mojang itself.
    let cert: any;
    try {
      const r = await fetch("https://api.minecraftservices.com/player/certificates", { method: "POST", headers: mcHeaders, signal: AbortSignal.timeout(20_000) });
      if (r.status === 401 || r.status === 403) throw new Error("Mojang says your Minecraft sign-in expired. Click your account at the bottom left and sign in with Microsoft again.");
      if (!r.ok) throw new Error(`Mojang answered ${r.status}. Try again in a minute.`);
      cert = await r.json();
    } catch (e: any) { throw new Error(/Mojang/.test(e?.message) ? e.message : "Couldn't reach Mojang. Check your internet connection."); }
    const pem = (k: string) => String(k ?? "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    // Mojang labels its keys "RSA PRIVATE/PUBLIC KEY" but they're really PKCS#8 / SPKI, so read the bytes ourselves.
    const der = Buffer.from(pem(cert?.keyPair?.privateKey), "base64");
    let priv: crypto.KeyObject;
    try { priv = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" }); }
    catch { priv = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs1" }); }
    const signature = crypto.sign("RSA-SHA256", Buffer.from(chData.serverId), priv).toString("base64");
    const spki = (b: string) => {
      const d = Buffer.from(b, "base64");
      let k: crypto.KeyObject;
      try { k = crypto.createPublicKey({ key: d, format: "der", type: "spki" }); } catch { k = crypto.createPublicKey({ key: d, format: "der", type: "pkcs1" }); }
      return (k.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
    };
    let skin: string | undefined;
    try {
      const p: any = await (await fetch("https://api.minecraftservices.com/minecraft/profile", { headers: mcHeaders, signal: AbortSignal.timeout(10_000) })).json();
      skin = (p?.skins ?? []).find((x: any) => x.state === "ACTIVE")?.url;
    } catch { /* just no face picture */ }
    // 3. VEX online checks Mojang's signature (built in) and ours, then signs you in
    const res = await post(`${serviceUrl}/auth/minecraft/cert`, {
      uuid, name: mc.name, serverId: chData.serverId, expiresAt: Date.parse(cert.expiresAt),
      publicKey: spki(pem(cert.keyPair.publicKey)), keySignature: cert.publicKeySignatureV2, signature, skin,
    }, "the VEX server");
    if (res.status === 404) throw new Error("Your online service is older than this VEX, so it can't sign you in yet. Update it: Settings → VEX online → Update online service (on the PC that set it up).");
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data.error ?? `VEX server error (${res.status})`);
    token = data.token;
    if (canEncrypt()) fs.writeFileSync(tokenFile(), safeStorage.encryptString(data.token));
    await refreshProfile();
    log("info", `Signed in to VEX online as ${profile?.username}`);
    return accountState();
  })().finally(() => { loginBusy = null; });
  return loginBusy;
}

/** For the in-game mod: the VEX online address + session token (null when not signed in). */
export function modCredentials(): { url: string; token: string } | null {
  return serviceUrl && token && profile ? { url: serviceUrl, token } : null;
}

/** Login check: makes sure VEX online is signed in as the active Microsoft account. Quiet on failure. */
export async function ensureSignedIn(activeName: string | null) {
  if (!serviceUrl) return accountState();
  if (!activeName) { if (token) await logout(true); loginError = "Sign in with a Microsoft account first."; return accountState(); }
  if (token && profile && (profile.mcName ?? profile.username)?.toLowerCase() === activeName.toLowerCase()) return accountState();
  try { const st = await login(); loginError = null; return st; }
  catch (e: any) { loginError = e?.message || "Couldn't connect to VEX online."; log("warn", `Automatic VEX online sign-in failed: ${loginError}`); broadcast(); return accountState(); }
}


export function cancelLogin() { /* Minecraft sign-in has no browser step to cancel */ }

export async function logout(silent = false) {
  if (token && serviceUrl) await call("POST", "/v1/logout").catch(() => {});
  clearToken();
  if (!silent) log("info", "Signed out of VEX online");
}

// Friends
export const friends = {
  list: () => call("GET", "/v1/friends"),
  search: (q: string) => call("GET", `/v1/users/search?q=${encodeURIComponent(q.slice(0, 40))}`),
  add: (id: string) => { if (!/^[A-Za-z0-9]{1,40}$/.test(id)) throw new Error("Bad user id."); return call("POST", `/v1/friends/${id}`); },
  remove: (id: string) => { if (!/^[A-Za-z0-9]{1,40}$/.test(id)) throw new Error("Bad user id."); return call("DELETE", `/v1/friends/${id}`); },
};
