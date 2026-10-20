// VEX online service — Cloudflare Worker + D1.
// Sign-in uses Modrinth OAuth on the server (the client secret never leaves Cloudflare);
// the launcher only ever receives a VEX session token, never a Modrinth token.

export interface Env {
  DB: D1Database;
  MODRINTH_CLIENT_ID: string;
  MODRINTH_CLIENT_SECRET: string;
  MODRINTH_WEB?: string;  // overrides for local testing only
  MODRINTH_API?: string;
}

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

interface UserRow { id: string; username: string; avatar_url: string | null; last_seen: number; status: string; detail: string | null }
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
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: env.MODRINTH_CLIENT_SECRET },
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
  if (p === "/v1/me" && req.method === "GET") return json(publicUser(me, false));

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
    const { results } = await env.DB.prepare("SELECT * FROM users WHERE username_lower LIKE ? ESCAPE '\\' AND id != ? ORDER BY username_lower = ? DESC, length(username) LIMIT 15").bind(like, me.id, q).all<UserRow>();
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/") return json({ service: "vex-online", ok: true });
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
