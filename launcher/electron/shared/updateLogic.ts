// Pure helpers for the updater (tested in tests/).

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** >0 if a is newer than b. Unparseable versions never count as newer. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export interface ReleaseAsset { name: string; browser_download_url: string; size: number }
export interface GithubRelease { tag_name: string; draft: boolean; prerelease: boolean; body?: string; assets: ReleaseAsset[] }

export interface UpdateInfo { version: string; notes: string; installer: ReleaseAsset; checksum: ReleaseAsset }

/** Picks the installer + its .sha256 from a release. Both are required — no checksum, no update. */
export function pickUpdate(rel: GithubRelease, current: string): UpdateInfo | null {
  if (rel.draft || rel.prerelease) return null;
  const version = rel.tag_name.replace(/^v/, "");
  if (compareVersions(version, current) <= 0) return null;
  const installer = rel.assets.find((a) => /^VEX-CLIENT-Setup-\d+\.\d+\.\d+\.exe$/.test(a.name));
  const checksum = installer && rel.assets.find((a) => a.name === `${installer.name}.sha256`);
  if (!installer || !checksum) return null;
  if (!/^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(installer.browser_download_url)) return null;
  return { version, notes: (rel.body ?? "").slice(0, 2000), installer, checksum };
}

/** Accepts "<hex>" or "<hex>  filename" (sha256sum / PowerShell output). */
export function parseChecksum(text: string): string | null {
  const m = /\b([a-fA-F0-9]{64})\b/.exec(text);
  return m ? m[1].toLowerCase() : null;
}
