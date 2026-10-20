import { log } from "./logger";

export type SkinLookupResult =
  | { ok: true; name: string; uuid: string; model: "classic" | "slim"; skinDataUrl: string; capeDataUrl: string | null }
  | { ok: false; reason: "invalid" | "not-found" | "rate-limited" | "network"; message: string };

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

async function getJson(url: string, timeoutMs = 10_000): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "VEX-CLIENT-Launcher" } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const textureCache = new Map<string, string>();
/** A skin texture from textures.minecraft.net as a data URL (for friends' faces). Cached for this run. */
export async function textureDataUrl(url: string): Promise<string> {
  if (!/^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{20,80}$/.test(String(url))) throw new Error("Not a Minecraft skin.");
  const hit = textureCache.get(url); if (hit) return hit;
  const data = await toDataUrl(url); textureCache.set(url, data);
  if (textureCache.size > 300) textureCache.delete(textureCache.keys().next().value!);
  return data;
}

async function toDataUrl(url: string): Promise<string> {
  // Only ever fetch textures from Mojang's texture host.
  const u = new URL(url);
  if (!/(^|\.)minecraft\.net$/.test(u.hostname)) throw new Error(`Unexpected texture host ${u.hostname}`);
  u.protocol = "https:";
  const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Texture download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 512 * 1024 || buf.subarray(1, 4).toString() !== "PNG") throw new Error("Texture is not a valid PNG");
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Public Mojang APIs only: username → UUID → profile textures. No credentials involved. */
export async function lookupSkin(username: string): Promise<SkinLookupResult> {
  const name = username.trim();
  if (!NAME_RE.test(name)) return { ok: false, reason: "invalid", message: "Usernames are 3–16 characters: letters, numbers and _ only." };
  try {
    const p = await getJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (p.status === 404 || p.status === 204 || !p.body?.id) return { ok: false, reason: "not-found", message: `No Minecraft account is called “${name}”.` };
    if (p.status === 429) return { ok: false, reason: "rate-limited", message: "Mojang is rate-limiting lookups. Wait a minute and try again." };
    if (p.status >= 400) throw new Error(`Profile API returned ${p.status}`);

    const s = await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${p.body.id}`);
    if (s.status === 429) return { ok: false, reason: "rate-limited", message: "Mojang is rate-limiting lookups. Wait a minute and try again." };
    if (s.status >= 400 || !s.body?.properties) throw new Error(`Session server returned ${s.status}`);
    const texProp = s.body.properties.find((x: any) => x.name === "textures");
    const tex = JSON.parse(Buffer.from(texProp.value, "base64").toString("utf8")).textures ?? {};
    if (!tex.SKIN?.url) return { ok: false, reason: "not-found", message: `${p.body.name} uses a default skin, so there is no custom skin to show.` };

    const [skinDataUrl, capeDataUrl] = await Promise.all([
      toDataUrl(tex.SKIN.url),
      tex.CAPE?.url ? toDataUrl(tex.CAPE.url).catch(() => null) : Promise.resolve(null),
    ]);
    log("info", `Skin lookup ok: ${p.body.name}`);
    return { ok: true, name: p.body.name, uuid: p.body.id, model: tex.SKIN.metadata?.model === "slim" ? "slim" : "classic", skinDataUrl, capeDataUrl };
  } catch (e: any) {
    log("warn", `Skin lookup for ${name} failed: ${e.message}`);
    return { ok: false, reason: "network", message: "Couldn't reach Mojang's servers. Check your connection and try again." };
  }
}
