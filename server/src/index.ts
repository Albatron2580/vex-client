// VEX online service — Cloudflare Worker + D1.
// Sign-in uses Modrinth OAuth on the server (the client secret never leaves Cloudflare);
// the launcher only ever receives a VEX session token, never a Modrinth token.

import { PHONE_APP } from "./phoneApp.gen";

export interface Env {
  DB: D1Database;
  MODRINTH_CLIENT_ID: string;
  MODRINTH_CLIENT_SECRET?: string;
  MODRINTH_WEB?: string;  // overrides for local testing only
  MODRINTH_API?: string;
  MC_API?: string;
  MC_SESSION?: string;     // override for local testing only
  MOJANG_KEY_SPKI?: string; // override for local testing only
  ADMINS?: string;        // comma-separated Minecraft UUIDs or names; defaults to DEFAULT_ADMINS
}

const SERVER_VERSION = "2.5.0";
// Admins are checked against the Minecraft account the player linked — the server verifies that
// account with Mojang itself, so nobody can make themselves an admin by renaming anything.
// HAckerbest11 and RaxMc by UUID (can't be faked by renaming); UNCdel by name until its UUID is added.
const DEFAULT_ADMINS = "20c0e7bfca2743b39a86e0a84dea3fb6,58e2d5f6a1184f21a2da4107de66f632,UNCdel";
const DEFAULT_ADMIN_NAMES: Record<string, string> = { "20c0e7bfca2743b39a86e0a84dea3fb6": "HAckerbest11", "58e2d5f6a1184f21a2da4107de66f632": "RaxMc" };

const SESSION_DAYS = 60;
const ONLINE_MS = 120_000;   // a heartbeat every 60 s keeps you online
const LOGIN_TTL_MS = 10 * 60_000;
const MAX_FRIENDS = 200, MAX_OUTGOING = 50;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status: number, error: string) => json({ error }, status);
const now = () => Date.now();

function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const loopback = (port: number, params: Record<string, string>) => `http://127.0.0.1:${port}/callback?${new URLSearchParams(params)}`;

interface UserRow { id: string; username: string; avatar_url: string | null; last_seen: number; status: string; detail: string | null; mc_name: string | null; mc_uuid: string | null; banned: number; created_at: number; name_verified?: number }
const adminList = (env: Env) => (env.ADMINS || DEFAULT_ADMINS).split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
const isAdmin = (env: Env, u: UserRow) => {
  const list = adminList(env);
  const uuid = (u.mc_uuid ?? "").replace(/-/g, "").toLowerCase();
  if (uuid && list.includes(uuid)) return true;
  // by name only when Mojang confirmed the name (otherwise anyone could claim it)
  return !!u.mc_name && !!u.name_verified && list.includes(u.mc_name.toLowerCase());
};
const publicUser = (u: UserRow, withPresence: boolean) => ({
  id: u.id, username: u.username, avatar: u.avatar_url,
  ...(withPresence ? { online: now() - u.last_seen < ONLINE_MS, status: now() - u.last_seen < ONLINE_MS ? u.status : "offline", detail: now() - u.last_seen < ONLINE_MS ? u.detail : null, lastSeen: u.last_seen || null } : {}),
});
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

async function authed(req: Request, env: Env): Promise<UserRow | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(h);
  if (!m) return null;
  const row = await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(await sha256(m[1]), now()).first<UserRow>();
  return row ?? null;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function authStart(url: URL, env: Env) {
  const port = Number(url.searchParams.get("port"));
  const clientState = url.searchParams.get("state") ?? "";
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9_-]{16,64}$/.test(clientState)) return fail(400, "Bad login request.");
  const id = randomToken(24);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM logins WHERE created_at < ?").bind(now() - LOGIN_TTL_MS),
    env.DB.prepare("INSERT INTO logins (id, port, client_state, created_at) VALUES (?, ?, ?, ?)").bind(id, port, clientState, now()),
  ]);
  const auth = new URL("/auth/authorize", env.MODRINTH_WEB ?? "https://modrinth.com");
  auth.searchParams.set("client_id", env.MODRINTH_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  auth.searchParams.set("scope", "USER_READ");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("state", id);
  return Response.redirect(auth.toString(), 302);
}

// Sign in with the Minecraft account the player already uses in VEX. The launcher sends a fresh
// Minecraft access token once; the server asks Mojang whose it is, then drops the token.
// No Modrinth app or other registration is needed for this.
// ---------- Sign-in through Mojang's session server ----------
// The same check every Minecraft server does: VEX hands out a one-time serverId, the launcher tells
// Mojang "this account joins <serverId>" (from the player's own PC), then VEX asks Mojang hasJoined.
// The Minecraft token never reaches VEX.
const UA = { "user-agent": "VEX-online (github.com/Albatron2580/vex-client)" };
async function authChallenge(env: Env) {
  const id = [...crypto.getRandomValues(new Uint8Array(20))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mc_challenges WHERE created_at < ?").bind(now() - LOGIN_TTL_MS),
    env.DB.prepare("INSERT INTO mc_challenges (id, created_at) VALUES (?, ?)").bind(id, now()),
  ]);
  return json({ serverId: id });
}

async function authVerify(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; serverId?: string };
  const name = String(body.name ?? ""), serverId = String(body.serverId ?? "");
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name) || !/^[0-9a-f]{40}$/.test(serverId)) return fail(400, "Bad sign-in request.");
  const ch = await env.DB.prepare("DELETE FROM mc_challenges WHERE id = ? AND created_at > ? RETURNING id").bind(serverId, now() - 5 * 60_000).first<{ id: string }>();
  if (!ch) return fail(400, "That sign-in expired. Try again.");
  let prof: { id?: string; name?: string; properties?: { name: string; value: string }[] } | null = null;
  try {
    const u = `${env.MC_SESSION ?? "https://sessionserver.mojang.com"}/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${serverId}`;
    for (let i = 0; i < 3 && !prof; i++) {
      const r = await fetch(u, { headers: UA });
      if (r.status === 200) prof = await r.json();
      else if (r.status === 204) { await new Promise((res) => setTimeout(res, 700)); }
      else throw new Error(String(r.status));
    }
  } catch (e: any) { return fail(502, `Couldn't reach Mojang from the VEX server (${String(e?.message ?? e).slice(0, 40)}).`); }
  if (!prof?.id || !prof.name) return fail(401, "Mojang couldn't confirm your Minecraft account. Sign in with Microsoft again.");
  let skin: string | null = null;
  try {
    const tex = prof.properties?.find((p) => p.name === "textures")?.value;
    if (tex) skin = (JSON.parse(atob(tex)) as any)?.textures?.SKIN?.url ?? null;
  } catch { /* no skin */ }
  return createMinecraftSession(env, String(prof.id), String(prof.name), skin);
}

// ---------- Phone app ----------
const PAIR_TTL_MS = 5 * 60_000;
async function authPair(req: Request, env: Env) {
  const code = String(((await req.json().catch(() => ({}))) as { code?: string }).code ?? "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return fail(400, "The code has 8 letters and numbers.");
  const row = await env.DB.prepare("DELETE FROM pair_codes WHERE code = ? AND created_at > ? RETURNING user_id").bind(code, now() - PAIR_TTL_MS).first<{ user_id: string }>();
  if (!row) return fail(400, "That code is wrong or expired. Make a new one in VEX on your PC.");
  const user = await env.DB.prepare("SELECT banned FROM users WHERE id = ?").bind(row.user_id).first<{ banned: number }>();
  if (!user || user.banned) return fail(403, "This account can't use VEX online.");
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), row.user_id, now(), now() + SESSION_DAYS * 86_400_000).run();
  return json({ token });
}

function phoneApp(path: string) {
  const f = PHONE_APP[path === "/app/" || path === "/app/index.html" ? "/app" : path];
  if (!f) return null;
  const body = f.b64 ? Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)) : f.body!;
  return new Response(body, { headers: {
    "content-type": f.type,
    "cache-control": path.endsWith(".png") ? "public, max-age=86400" : "no-cache",
    "x-content-type-options": "nosniff",
    ...(f.type.startsWith("text/html") ? { "content-security-policy": "default-src 'self'; img-src 'self' https://textures.minecraft.net data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'", "referrer-policy": "no-referrer" } : {}),
  } });
}

// ---------- Sign-in with Minecraft's chat-signing certificate ----------
// Mojang gives every player a key pair whose public key Mojang signs (the same proof servers use for
// signed chat). The launcher signs VEX's one-time code with the private key; VEX checks both signatures
// with Mojang's public key, which is built in. No call from the VEX server to Mojang is needed.
const MOJANG_KEY_SPKI = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAylB4B6m5lz7jwrcFz6Fd/fnfUhcvlxsTSn5kIK/2aGG1C3kMy4VjhwlxF6BFUSnfxhNswPjh3ZitkBxEAFY25uzkJFRwHwVA9mdwjashXILtR6OqdLXXFVyUPIURLOSWqGNBtb08EN5fMnG8iFLgEJIBMxs9BvF3s3/FhuHyPKiVTZmXY0WY4ZyYqvoKR+XjaTRPPvBsDa4WI2u1zxXMeHlodT3lnCzVvyOYBLXL6CJgByuOxccJ8hnXfF9yY4F0aeL080Jz/3+EBNG8RO4ByhtBf4Ny8NQ6stWsjfeUIvH7bU/4zCYcYOq4WrInXHqS8qruDmIl7P5XXGcabuzQstPf/h2CRAUpP/PlHXcMlvewjmGU6MfDK+lifScNYwjPxRo4nKTGFZf/0aqHCh/EAsQyLKrOIYRE0lDG3bzBh8ogIMLAugsAfBb6M3mqCqKaTMAf/VAjh5FFJnjS+7bE+bZEV0qwax1CEoPPJL1fIQjOS8zj086gjpGRCtSy9+bTPTfTR/SJ+VUB5G2IeCItkNHpJX2ygojFZ9n5Fnj7R9ZnOM+L8nyIjPu3aePvtcrXlyLhH/hvOfIOjPxOlqW+O5QwSFP4OEcyLAUgDdUgyW36Z5mB285uKW/ighzZsOTevVUG2QwDItObIV6i8RCxFbN2oDHyPaO5j1tTaBNyVt8CAwEAAQ==";
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let mojangKey: CryptoKey | null = null;

async function authCert(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const uuid = String(body.uuid ?? "").replace(/-/g, "").toLowerCase(), name = String(body.name ?? ""), serverId = String(body.serverId ?? "");
  const expiresAt = Number(body.expiresAt);
  if (!/^[0-9a-f]{32}$/.test(uuid) || !/^[A-Za-z0-9_]{1,16}$/.test(name) || !/^[0-9a-f]{40}$/.test(serverId) || !Number.isSafeInteger(expiresAt)) return fail(400, "Bad sign-in request.");
  if (expiresAt < now()) return fail(401, "Your Minecraft key expired. Sign in with Microsoft again.");
  const ch = await env.DB.prepare("DELETE FROM mc_challenges WHERE id = ? AND created_at > ? RETURNING id").bind(serverId, now() - 5 * 60_000).first<{ id: string }>();
  if (!ch) return fail(400, "That sign-in expired. Try again.");
  try {
    const pub = b64(String(body.publicKey ?? "")), keySig = b64(String(body.keySignature ?? "")), sig = b64(String(body.signature ?? ""));
    if (pub.length < 100 || pub.length > 1000 || keySig.length < 100 || sig.length < 100) return fail(400, "Bad sign-in request.");
    // 1. Mojang signed: uuid (16 bytes) + expiresAt (8 bytes, big-endian) + the player's public key
    const signed = new Uint8Array(24 + pub.length);
    for (let i = 0; i < 16; i++) signed[i] = parseInt(uuid.slice(i * 2, i * 2 + 2), 16);
    new DataView(signed.buffer).setBigInt64(16, BigInt(expiresAt));
    signed.set(pub, 24);
    mojangKey ??= await crypto.subtle.importKey("spki", b64(env.MOJANG_KEY_SPKI || MOJANG_KEY_SPKI), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", mojangKey, keySig, signed))) return fail(401, "Mojang's signature on your key didn't check out. Sign in with Microsoft again.");
    // 2. the player signed our one-time code with the matching private key
    const playerKey = await crypto.subtle.importKey("spki", pub, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", playerKey, sig, new TextEncoder().encode(serverId)))) return fail(401, "Couldn't confirm your Minecraft account. Try again.");
  } catch { return fail(400, "Bad sign-in request."); }
  // The UUID is proven. Confirm the name with Mojang when the VEX server can reach it (best effort).
  let verifiedName: string | null = null, skin: string | null = null;
  try {
    const r = await fetch(`${env.MC_SESSION ?? "https://sessionserver.mojang.com"}/session/minecraft/profile/${uuid}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const p = (await r.json()) as { name?: string; properties?: { name: string; value: string }[] };
      if (p.name && /^[A-Za-z0-9_]{1,16}$/.test(p.name)) verifiedName = p.name;
      const tex = p.properties?.find((x) => x.name === "textures")?.value;
      if (tex) skin = (JSON.parse(atob(tex)) as any)?.textures?.SKIN?.url ?? null;
    }
  } catch { /* Mojang not reachable from Cloudflare: use the name the launcher sent */ }
  if (!skin && typeof body.skin === "string") skin = body.skin; // only a picture; checked to be a Mojang texture URL below
  return createMinecraftSession(env, uuid, verifiedName ?? name, skin, !!verifiedName);
}

async function createMinecraftSession(env: Env, rawUuid: string, name: string, skin: string | null, verified = true) {
  const uuid = rawUuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(uuid)) return fail(400, "That account has no Minecraft profile.");
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return fail(400, "That account has no Minecraft name yet.");
  const avatar = skin && /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/.test(skin) ? skin.replace(/^http:/, "https:") : null;
  const existing = await env.DB.prepare("SELECT banned FROM users WHERE id = ?").bind(uuid).first<{ banned: number }>();
  if (existing?.banned) return fail(403, "This account is banned from VEX online.");
  if (!verified) {
    // the name wasn't confirmed by Mojang: don't let it take a name another account already uses
    const taken = await env.DB.prepare("SELECT id FROM users WHERE username_lower = ? AND id != ?").bind(name.toLowerCase(), uuid).first();
    if (taken) return fail(409, "Another account already uses that name on VEX online.");
  }
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, username, username_lower, avatar_url, created_at, mc_name, mc_uuid, name_verified) VALUES (?1, ?2, ?3, ?4, ?5, ?2, ?1, ?6)
      ON CONFLICT (id) DO UPDATE SET username = excluded.username, username_lower = excluded.username_lower, avatar_url = COALESCE(excluded.avatar_url, users.avatar_url), mc_name = excluded.mc_name, mc_uuid = excluded.mc_uuid, name_verified = excluded.name_verified`)
      .bind(uuid, name, name.toLowerCase(), avatar, now(), verified ? 1 : 0),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), uuid, now(), now() + SESSION_DAYS * 86_400_000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
  ]);
  return json({ token });
}

async function authMinecraft(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 4000) return fail(400, "Missing Minecraft sign-in.");
  let prof: { id?: string; name?: string; skins?: { state?: string; url?: string }[] };
  try {
    const r = await fetch(`${env.MC_API ?? "https://api.minecraftservices.com"}/minecraft/profile`, { headers: { ...UA, authorization: `Bearer ${body.token}` } });
    if (r.status === 401 || r.status === 403) return fail(401, "Mojang didn't accept that Minecraft sign-in. Sign in with Microsoft again.");
    if (r.status === 404) return fail(400, "That Microsoft account doesn't own Minecraft: Java Edition.");
    if (!r.ok) throw new Error(String(r.status));
    prof = await r.json();
  } catch { return fail(502, "Couldn't reach Mojang. Try again in a minute."); }
  const uuid = String(prof.id ?? "").replace(/-/g, "");
  const name = String(prof.name ?? "");
  if (!/^[0-9a-fA-F]{32}$/.test(uuid) && !/^[A-Za-z0-9]{1,40}$/.test(uuid)) return fail(400, "That account has no Minecraft profile.");
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return fail(400, "That account has no Minecraft name yet.");
  const skin = (prof.skins ?? []).find((s) => s.state === "ACTIVE")?.url ?? prof.skins?.[0]?.url ?? null;
  const avatar = skin && /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/.test(skin) ? skin.replace(/^http:/, "https:") : null;
  const existing = await env.DB.prepare("SELECT banned FROM users WHERE id = ?").bind(uuid).first<{ banned: number }>();
  if (existing?.banned) return fail(403, "This account is banned from VEX online.");
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, username, username_lower, avatar_url, created_at, mc_name, mc_uuid, name_verified) VALUES (?1, ?2, ?3, ?4, ?5, ?2, ?1, 1)
      ON CONFLICT (id) DO UPDATE SET username = excluded.username, username_lower = excluded.username_lower, avatar_url = excluded.avatar_url, mc_name = excluded.mc_name, mc_uuid = excluded.mc_uuid, name_verified = 1`)
      .bind(uuid, name, name.toLowerCase(), avatar, now()),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), uuid, now(), now() + SESSION_DAYS * 86_400_000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
  ]);
  return json({ token });
}

async function authCallback(url: URL, env: Env) {
  const id = url.searchParams.get("state") ?? "";
  const login = await env.DB.prepare("SELECT * FROM logins WHERE id = ?").bind(id).first<{ port: number; client_state: string; created_at: number }>();
  if (!login || now() - login.created_at > LOGIN_TTL_MS) return new Response("This sign-in link expired. Go back to VEX CLIENT and try again.", { status: 400 });
  await env.DB.prepare("DELETE FROM logins WHERE id = ?").bind(id).run(); // single use
  const back = (p: Record<string, string>) => Response.redirect(loopback(login.port, { state: login.client_state, ...p }), 302);
  const code = url.searchParams.get("code");
  if (!code) return back({ error: url.searchParams.get("error") ?? "cancelled" });
  try {
    const api = env.MODRINTH_API ?? "https://api.modrinth.com";
    const tok = await fetch(`${api}/_internal/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: env.MODRINTH_CLIENT_SECRET ?? "" },
      body: new URLSearchParams({ code, client_id: env.MODRINTH_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, grant_type: "authorization_code" }),
    });
    if (!tok.ok) throw new Error(`token ${tok.status}`);
    const { access_token } = (await tok.json()) as { access_token: string };
    const me = await fetch(`${api}/v2/user`, { headers: { authorization: access_token, "user-agent": "VEX-CLIENT-Online" } });
    if (!me.ok) throw new Error(`user ${me.status}`);
    const u = (await me.json()) as { id: string; username: string; avatar_url?: string | null };
    if (!u.id || !u.username) throw new Error("bad user");
    // The Modrinth token is used once and dropped; VEX keeps only id, name and avatar.
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, username, username_lower, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET username = excluded.username, username_lower = excluded.username_lower, avatar_url = excluded.avatar_url`)
        .bind(u.id, u.username, u.username.toLowerCase(), u.avatar_url ?? null, now()),
      env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), u.id, now(), now() + SESSION_DAYS * 86_400_000),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    ]);
    return back({ token });
  } catch (e) {
    console.error("oauth", (e as Error).message);
    return back({ error: "modrinth_failed" });
  }
}

async function relation(env: Env, me: string, other: string) {
  const [a, b] = pair(me, other);
  const f = await env.DB.prepare("SELECT requester, status FROM friendships WHERE user_a = ? AND user_b = ?").bind(a, b).first<{ requester: string; status: string }>();
  if (!f) return "none";
  if (f.status === "accepted") return "friends";
  return f.requester === me ? "outgoing" : "incoming";
}

async function api(req: Request, url: URL, env: Env, me: UserRow) {
  const p = url.pathname;
  if (me.banned) return fail(403, "This account is banned from VEX online.");
  if (p === "/v1/me" && req.method === "GET") return json({ ...publicUser(me, false), mcName: me.mc_name, admin: isAdmin(env, me) });

  // Link the player's Minecraft account: the launcher sends a fresh Minecraft access token once,
  // the server asks Mojang whose it is, keeps only the name + uuid, and drops the token.
  if (p === "/v1/link-minecraft" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 4000) return fail(400, "Missing Minecraft token.");
    const r = await fetch(`${env.MC_API ?? "https://api.minecraftservices.com"}/minecraft/profile`, { headers: { ...UA, authorization: `Bearer ${body.token}` } });
    if (!r.ok) return fail(400, "Mojang didn't accept that Minecraft sign-in.");
    const prof = (await r.json()) as { id?: string; name?: string };
    if (!prof.id || !prof.name) return fail(400, "That account has no Minecraft profile.");
    await env.DB.prepare("UPDATE users SET mc_name = ?, mc_uuid = ? WHERE id = ?").bind(prof.name, prof.id, me.id).run();
    const updated = { ...me, mc_name: prof.name, mc_uuid: prof.id };
    return json({ mcName: prof.name, admin: isAdmin(env, updated) });
  }

  // The in-game mod: "this player is in Minecraft with VEX right now" (shows the grey V badge to other VEX players).
  if (p === "/v1/mod/presence" && req.method === "POST") {
    await env.DB.prepare("UPDATE users SET mod_seen = ? WHERE id = ?").bind(now(), me.id).run();
    return json({ ok: true, uuid: me.mc_uuid });
  }

  // Phone app: a one-time code (8 characters, 5 minutes) that signs a phone in as you.
  if (p === "/v1/pair" && req.method === "POST") {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = [...bytes].map((b) => A[b % A.length]).join("");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM pair_codes WHERE created_at < ? OR user_id = ?").bind(now() - PAIR_TTL_MS, me.id),
      env.DB.prepare("INSERT INTO pair_codes (code, user_id, created_at) VALUES (?, ?, ?)").bind(code, me.id, now()),
    ]);
    return json({ code, expiresAt: now() + PAIR_TTL_MS });
  }

  // Bug reports from players.
  if (p === "/v1/bugs" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = clip(body.title, 120), text = clip(body.body, 4000), version = clip(body.version, 20);
    if (title.length < 4 || text.length < 10) return fail(400, "Give the bug a short title and describe what happened.");
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM bug_reports WHERE user_id = ? AND created_at > ?").bind(me.id, now() - 86_400_000).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 5) return fail(429, "You've sent 5 reports today. Thanks — try again tomorrow.");
    await env.DB.prepare("INSERT INTO bug_reports (user_id, title, body, version, created_at) VALUES (?, ?, ?, ?, ?)").bind(me.id, title, text, version || null, now()).run();
    return json({ ok: true });
  }

  // Collab: send an instance recipe to a friend.
  if (p === "/v1/shares" && req.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT s.id, s.payload, s.created_at, s.from_user, s.to_user, fu.username AS from_name, fu.avatar_url AS from_avatar, tu.username AS to_name
      FROM shares s JOIN users fu ON fu.id = s.from_user JOIN users tu ON tu.id = s.to_user WHERE s.to_user = ?1 OR s.from_user = ?1 ORDER BY s.created_at DESC LIMIT 100`).bind(me.id).all<any>();
    const map = (r: any) => ({ id: r.id, createdAt: r.created_at, from: { id: r.from_user, username: r.from_name, avatar: r.from_avatar }, to: { id: r.to_user, username: r.to_name }, instance: JSON.parse(r.payload) });
    return json({ incoming: results.filter((r) => r.to_user === me.id).map(map), sent: results.filter((r) => r.from_user === me.id).map(map) });
  }
  if (p === "/v1/shares" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { to?: string; instance?: any };
    const to = typeof body.to === "string" ? body.to : "";
    if ((await relation(env, me.id, to)) !== "friends") return fail(403, "You can only share with friends.");
    const inst = validateRecipe(body.instance);
    if (!inst) return fail(400, "That instance couldn't be shared.");
    const sent = await env.DB.prepare("SELECT COUNT(*) AS n FROM shares WHERE from_user = ? AND created_at > ?").bind(me.id, now() - 86_400_000).first<{ n: number }>();
    if ((sent?.n ?? 0) >= 30) return fail(429, "You've shared 30 instances today. Try again tomorrow.");
    await env.DB.prepare("INSERT INTO shares (from_user, to_user, payload, created_at) VALUES (?, ?, ?, ?)").bind(me.id, to, JSON.stringify(inst), now()).run();
    return json({ ok: true });
  }
  const sm = /^\/v1\/shares\/(\d{1,12})$/.exec(p);
  if (sm && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM shares WHERE id = ? AND (to_user = ?2 OR from_user = ?2)").bind(Number(sm[1]), me.id).run();
    return json({ ok: true });
  }

  if (p.startsWith("/v1/admin/")) {
    if (!isAdmin(env, me)) return fail(403, me.mc_name ? "Your Minecraft account isn't a VEX admin." : "Link your Minecraft account first (sign in with Microsoft in VEX).");
    return admin(req, url, env, me);
  }

  if (p === "/v1/presence" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { status?: string; detail?: string };
    const status = body.status === "playing" ? "playing" : "online";
    const detail = typeof body.detail === "string" ? body.detail.slice(0, 60) : null;
    await env.DB.prepare("UPDATE users SET last_seen = ?, status = ?, detail = ? WHERE id = ?").bind(now(), status, detail, me.id).run();
    return json({ ok: true });
  }
  if (p === "/v1/logout" && req.method === "POST") {
    const t = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(t)).run();
    await env.DB.prepare("UPDATE users SET last_seen = 0 WHERE id = ?").bind(me.id).run();
    return json({ ok: true });
  }
  if (p === "/v1/users/search" && req.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 2 || q.length > 40) return json([]);
    const like = q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
    const { results } = await env.DB.prepare("SELECT * FROM users WHERE username_lower LIKE ? ESCAPE '\\' AND id != ? AND banned = 0 ORDER BY username_lower = ? DESC, length(username) LIMIT 15").bind(like, me.id, q).all<UserRow>();
    return json(await Promise.all(results.map(async (u) => ({ ...publicUser(u, false), relation: await relation(env, me.id, u.id) }))));
  }
  if (p === "/v1/friends" && req.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT u.*, f.requester AS f_requester, f.status AS f_status FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = ?1 OR f.user_b = ?1`).bind(me.id).all<UserRow & { f_requester: string; f_status: string }>();
    const friends = results.filter((r) => r.f_status === "accepted").map((r) => publicUser(r, true))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
    return json({
      friends,
      incoming: results.filter((r) => r.f_status === "pending" && r.f_requester !== me.id).map((r) => publicUser(r, false)),
      outgoing: results.filter((r) => r.f_status === "pending" && r.f_requester === me.id).map((r) => publicUser(r, false)),
    });
  }
  const m = /^\/v1\/friends\/([A-Za-z0-9]{1,40})$/.exec(p);
  if (m) {
    const other = m[1];
    if (other === me.id) return fail(400, "You can't add yourself.");
    const exists = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(other).first();
    if (!exists) return fail(404, "That player hasn't signed in to VEX yet.");
    const [a, b] = pair(me.id, other);
    const rel = await relation(env, me.id, other);
    if (req.method === "POST") {
      if (rel === "friends" || rel === "outgoing") return json({ relation: rel });
      if (rel === "incoming") {
        await env.DB.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").bind(a, b).run();
        return json({ relation: "friends" });
      }
      const counts = await env.DB.prepare(`SELECT SUM(status = 'accepted') AS friends, SUM(status = 'pending' AND requester = ?1) AS outgoing FROM friendships WHERE user_a = ?1 OR user_b = ?1`).bind(me.id).first<{ friends: number; outgoing: number }>();
      if ((counts?.friends ?? 0) >= MAX_FRIENDS) return fail(429, `You can have up to ${MAX_FRIENDS} friends.`);
      if ((counts?.outgoing ?? 0) >= MAX_OUTGOING) return fail(429, "Too many pending requests. Wait for some to be answered.");
      await env.DB.prepare("INSERT INTO friendships (user_a, user_b, requester, status, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(a, b, me.id, now()).run();
      return json({ relation: "outgoing" });
    }
    if (req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").bind(a, b).run();
      return json({ relation: "none" });
    }
  }
  return fail(404, "Not found.");
}

// Collab instance recipe: what a friend needs to rebuild the instance (mods come from Modrinth).
function validateRecipe(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  const name = clip(raw.name, 40), version = clip(raw.version, 40);
  const loader = ["vanilla", "fabric", "forge", "neoforge", "quilt"].includes(raw.loader) ? raw.loader : null;
  if (!name || !/^[\w.\- ]{1,40}$/.test(version) || !loader) return null;
  const mods = Array.isArray(raw.mods) ? raw.mods.slice(0, 400).flatMap((m: any) => {
    const projectId = clip(m?.projectId, 20), versionId = clip(m?.versionId, 20), title = clip(m?.title, 80), file = clip(m?.file, 120);
    return /^[A-Za-z0-9]{6,20}$/.test(projectId) && /^[A-Za-z0-9]{6,20}$/.test(versionId) ? [{ projectId, versionId, title, file }] : [];
  }) : [];
  const missing = Array.isArray(raw.missing) ? raw.missing.slice(0, 200).map((f: unknown) => clip(f, 120)).filter(Boolean) : [];
  return { name, version, loader, mods, missing, memoryMb: Math.min(32768, Math.max(1024, Number(raw.memoryMb) || 4096)) };
}

async function getConfig(env: Env, key: string) {
  const r = await env.DB.prepare("SELECT value FROM config WHERE key = ?").bind(key).first<{ value: string }>();
  try { return r ? JSON.parse(r.value) : null; } catch { return null; }
}

// Minecraft UUIDs (no dashes) of players who had the VEX mod open in the last few minutes. Only UUIDs,
// which every Minecraft server already shows, so this is safe to be public.
const MOD_ONLINE_MS = 5 * 60_000;
async function vexPlayers(env: Env) {
  const { results } = await env.DB.prepare("SELECT mc_uuid FROM users WHERE mod_seen > ? AND mc_uuid IS NOT NULL AND banned = 0 LIMIT 5000").bind(now() - MOD_ONLINE_MS).all<{ mc_uuid: string }>();
  return new Response(JSON.stringify({ uuids: results.map((r) => r.mc_uuid.replace(/-/g, "").toLowerCase()) }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=30" } });
}

async function publicHome(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, title, body, kind, author, created_at FROM announcements ORDER BY created_at DESC LIMIT 5").all<any>();
  return json({
    announcements: results.map((a) => ({ id: a.id, title: a.title, body: a.body, kind: a.kind, author: a.author, createdAt: a.created_at })),
    featured: await getConfig(env, "featured"),
  });
}

async function admin(req: Request, url: URL, env: Env, me: UserRow) {
  const p = url.pathname;
  if (p === "/v1/admin/overview" && req.method === "GET") {
    const c = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE last_seen > ?1) AS online,
      (SELECT COUNT(*) FROM users WHERE created_at > ?2) AS newWeek, (SELECT COUNT(*) FROM bug_reports WHERE status = 'open') AS openBugs,
      (SELECT COUNT(*) FROM users WHERE banned = 1) AS banned, (SELECT COUNT(*) FROM friendships WHERE status = 'accepted') AS friendships`)
      .bind(now() - ONLINE_MS, now() - 7 * 86_400_000).first();
    return json({ ...c, serverVersion: SERVER_VERSION, admins: (env.ADMINS || DEFAULT_ADMINS).split(",").map((n) => n.trim()).filter(Boolean).map((n) => DEFAULT_ADMIN_NAMES[n.toLowerCase()] ?? n) });
  }
  if (p === "/v1/admin/users" && req.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 40);
    const filter = url.searchParams.get("filter");
    const like = "%" + q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
    const where = filter === "online" ? "AND last_seen > ?2" : filter === "banned" ? "AND banned = 1" : "";
    const { results } = await env.DB.prepare(`SELECT * FROM users WHERE (username_lower LIKE ?1 ESCAPE '\\' OR lower(coalesce(mc_name,'')) LIKE ?1 ESCAPE '\\') ${where} ORDER BY last_seen DESC LIMIT 100`)
      .bind(...(filter === "online" ? [like, now() - ONLINE_MS] : [like])).all<UserRow>();
    return json(results.map((u) => ({ ...publicUser(u, true), mcName: u.mc_name, banned: !!u.banned, admin: isAdmin(env, u), joined: u.created_at })));
  }
  const bm = /^\/v1\/admin\/users\/([A-Za-z0-9]{1,40})\/ban$/.exec(p);
  if (bm && req.method === "POST") {
    if (bm[1] === me.id) return fail(400, "You can't ban yourself.");
    const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(bm[1]).first<UserRow>();
    if (!target) return fail(404, "No such player.");
    if (isAdmin(env, target)) return fail(400, "Admins can't be banned.");
    const banned = ((await req.json().catch(() => ({}))) as { banned?: boolean }).banned !== false;
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET banned = ? WHERE id = ?").bind(banned ? 1 : 0, target.id),
      ...(banned ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id)] : []),
    ]);
    return json({ ok: true, banned });
  }
  if (p === "/v1/admin/announcements" && req.method === "POST") {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = clip(b.title, 100), body = clip(b.body, 2000);
    const kind = ["news", "update", "warning"].includes(b.kind as string) ? (b.kind as string) : "news";
    if (!title || !body) return fail(400, "An announcement needs a title and text.");
    await env.DB.prepare("INSERT INTO announcements (title, body, kind, author, created_at) VALUES (?, ?, ?, ?, ?)").bind(title, body, kind, me.mc_name ?? me.username, now()).run();
    return publicHome(env);
  }
  const am = /^\/v1\/admin\/announcements\/(\d{1,12})$/.exec(p);
  if (am && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(Number(am[1])).run();
    return publicHome(env);
  }
  if (p === "/v1/admin/featured" && req.method === "PUT") {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = clip(b.name, 60), address = clip(b.address, 120).toLowerCase(), description = clip(b.description, 200), version = clip(b.version, 40);
    if (!name || !/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(address)) return fail(400, "Give the server a name and a valid address like play.example.net.");
    const value = JSON.stringify({ name, address, description, version, updatedBy: me.mc_name, updatedAt: now() });
    await env.DB.prepare("INSERT INTO config (key, value) VALUES ('featured', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(value).run();
    return publicHome(env);
  }
  if (p === "/v1/admin/featured" && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM config WHERE key = 'featured'").run();
    return publicHome(env);
  }
  if (p === "/v1/admin/bugs" && req.method === "GET") {
    const status = ["open", "fixed", "wontfix"].includes(url.searchParams.get("status") ?? "") ? url.searchParams.get("status") : "open";
    const { results } = await env.DB.prepare(`SELECT b.*, u.username, u.mc_name FROM bug_reports b JOIN users u ON u.id = b.user_id WHERE b.status = ? ORDER BY b.created_at DESC LIMIT 200`).bind(status).all<any>();
    return json(results.map((b) => ({ id: b.id, title: b.title, body: b.body, version: b.version, status: b.status, createdAt: b.created_at, by: b.mc_name || b.username })));
  }
  const gm = /^\/v1\/admin\/bugs\/(\d{1,12})$/.exec(p);
  if (gm && req.method === "POST") {
    const status = ((await req.json().catch(() => ({}))) as { status?: string }).status;
    if (!["open", "fixed", "wontfix"].includes(status ?? "")) return fail(400, "Bad status.");
    await env.DB.prepare("UPDATE bug_reports SET status = ? WHERE id = ?").bind(status, Number(gm[1])).run();
    return json({ ok: true });
  }
  return fail(404, "Not found.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/") return json({ service: "vex-online", ok: true, version: SERVER_VERSION });
      if (url.pathname === "/v1/public/home" && req.method === "GET") return await publicHome(env);
      if (url.pathname === "/v1/public/vex-players" && req.method === "GET") return await vexPlayers(env);
      if (url.pathname === "/auth/minecraft" && req.method === "POST") return await authMinecraft(req, env);
      if (url.pathname === "/auth/minecraft/challenge" && req.method === "POST") return await authChallenge(env);
      if (url.pathname === "/auth/minecraft/verify" && req.method === "POST") return await authVerify(req, env);
      if (url.pathname === "/auth/minecraft/cert" && req.method === "POST") return await authCert(req, env);
      if (url.pathname === "/auth/pair" && req.method === "POST") return await authPair(req, env);
      if (url.pathname === "/app" || url.pathname.startsWith("/app/")) { const r = phoneApp(url.pathname); if (r) return r; }
      if (url.pathname === "/auth/start") return await authStart(url, env);
      if (url.pathname === "/auth/callback") return await authCallback(url, env);
      if (url.pathname.startsWith("/v1/")) {
        const me = await authed(req, env);
        if (!me) return fail(401, "Please sign in again.");
        return await api(req, url, env, me);
      }
      return fail(404, "Not found.");
    } catch (e) {
      console.error(e);
      return fail(500, "Something went wrong on the VEX server.");
    }
  },
};
