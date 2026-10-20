// Modrinth sign-in through the VEX online service, plus friends API calls.
// The browser does the Modrinth login; the service hands VEX a session token on a one-time
// loopback URL (http://127.0.0.1:<random port>/callback). The token is encrypted with
// Windows' DPAPI via Electron safeStorage — never stored in plain text.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { app, BrowserWindow, safeStorage, shell } from "electron";
import { log } from "./logger";
import { DEFAULT_ONLINE_URL } from "../config";

export interface Profile { id: string; username: string; avatar: string | null }
export interface AccountState { configured: boolean; serviceUrl: string; signedIn: boolean; profile: Profile | null; persistent: boolean }

let serviceUrl = "";
let token: string | null = null;
let profile: Profile | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let pendingLogin: { server: http.Server; reject: (e: Error) => void } | null = null;

const tokenFile = () => path.join(app.getPath("userData"), "account.bin");
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
const broadcast = () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("account:changed", accountState()));

export function accountState(): AccountState {
  return { configured: !!serviceUrl, serviceUrl, signedIn: !!token && !!profile, profile, persistent: canEncrypt() };
}

export async function initAccount(url: string) {
  serviceUrl = url || DEFAULT_ONLINE_URL;
  if (!serviceUrl) return;
  try {
    if (fs.existsSync(tokenFile()) && canEncrypt()) token = safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch (e: any) { log("warn", `Couldn't read saved sign-in: ${e.message}`); token = null; }
  if (token) await refreshProfile().catch(() => {});
}

export async function setServiceUrl(url: string) {
  const next = url || DEFAULT_ONLINE_URL;
  if (next === serviceUrl) return;
  await logout(true); serviceUrl = next; broadcast();
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
}

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

const PAGE = (title: string, msg: string) => `<!doctype html><meta charset="utf-8"><title>VEX CLIENT</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#170b16;color:#fbeaf4;font:16px system-ui">
<div style="text-align:center;padding:32px 40px;border:1px solid #ff8cc655;border-radius:20px;background:#2a1328;box-shadow:0 0 40px #ff6fb533">
<div style="font:700 28px system-ui;letter-spacing:.12em;background:linear-gradient(135deg,#ff6fb5,#b77dff);-webkit-background-clip:text;color:transparent">VEX CLIENT</div>
<h2 style="margin:12px 0 6px">${title}</h2><p style="opacity:.7;margin:0">${msg}</p></div></body>`;

export function login(): Promise<AccountState> {
  if (!serviceUrl) return Promise.reject(new Error("The VEX online service isn't set up yet."));
  pendingLogin?.reject(new Error("Sign-in restarted."));
  const state = crypto.randomBytes(24).toString("base64url");
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
      if (u.searchParams.get("state") !== state) { res.writeHead(400, { "content-type": "text/html" }).end(PAGE("Sign-in didn't match", "Go back to VEX and try again.")); return; }
      const err = u.searchParams.get("error"), t = u.searchParams.get("token");
      done();
      if (err || !t) {
        res.writeHead(200, { "content-type": "text/html" }).end(PAGE("Sign-in cancelled", "You can close this tab."));
        reject(new Error(err === "modrinth_failed" ? "Modrinth didn't accept the sign-in. Try again in a minute." : "Sign-in was cancelled.")); return;
      }
      try {
        token = t;
        if (canEncrypt()) fs.writeFileSync(tokenFile(), safeStorage.encryptString(t));
        await refreshProfile();
        log("info", `Signed in to VEX online as ${profile?.username}`);
        res.writeHead(200, { "content-type": "text/html" }).end(PAGE(`Signed in as ${escapeHtml(profile!.username)}`, "You can close this tab and go back to VEX CLIENT."));
        BrowserWindow.getAllWindows()[0]?.focus();
        resolve(accountState());
      } catch (e: any) {
        clearToken();
        res.writeHead(200, { "content-type": "text/html" }).end(PAGE("Sign-in failed", "Go back to VEX and try again."));
        reject(e);
      }
    });
    const timer = setTimeout(() => { done(); reject(new Error("Sign-in timed out. Try again.")); }, 5 * 60_000);
    const done = () => { clearTimeout(timer); server.close(); pendingLogin = null; };
    pendingLogin = { server, reject: (e) => { done(); reject(e); } };
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      shell.openExternal(`${serviceUrl}/auth/start?port=${port}&state=${state}`);
    });
    server.on("error", (e) => { done(); reject(e); });
  });
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function cancelLogin() { pendingLogin?.reject(new Error("Sign-in cancelled.")); }

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
