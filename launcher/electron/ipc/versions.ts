import { log } from "./logger";
import { readJson, writeJson } from "./jsonStore";

export interface McVersion { id: string; type: "release" | "snapshot" | "old_beta" | "old_alpha"; releaseTime: string }
const MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/** Official Mojang version manifest, cached on disk so the list still works offline. */
export async function getVersions(): Promise<{ versions: McVersion[]; latest: string | null; fromCache: boolean; error?: string }> {
  try {
    const res = await fetch(MANIFEST, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: any = await res.json();
    const versions: McVersion[] = body.versions.map((v: any) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
    writeJson("cache/version_manifest.json", { latest: body.latest?.release ?? null, versions });
    return { versions, latest: body.latest?.release ?? null, fromCache: false };
  } catch (e: any) {
    log("warn", `Version manifest fetch failed: ${e.message}`);
    const cached: any = readJson("cache/version_manifest.json");
    if (cached?.versions) return { versions: cached.versions, latest: cached.latest, fromCache: true, error: e.message };
    return { versions: [], latest: null, fromCache: false, error: e.message };
  }
}
