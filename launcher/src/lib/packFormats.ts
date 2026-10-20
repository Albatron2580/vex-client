// Java Edition resource-pack formats. 1.21.9+ replaced the single pack_format with a
// min_format/max_format range; older versions must use pack_format only.

export interface PackTarget { label: string; format: number; ranged: boolean; hudSprites: boolean }

export const PACK_TARGETS: PackTarget[] = [
  { label: "26.3",            format: 97, ranged: true,  hudSprites: true },
  { label: "26.2",            format: 88, ranged: true,  hudSprites: true },
  { label: "26.1 – 26.1.2",   format: 84, ranged: true,  hudSprites: true },
  { label: "1.21.11",         format: 75, ranged: true,  hudSprites: true },
  { label: "1.21.9 – 1.21.10",format: 69, ranged: true,  hudSprites: true },
  { label: "1.21.7 – 1.21.8", format: 64, ranged: false, hudSprites: true },
  { label: "1.21.6",          format: 63, ranged: false, hudSprites: true },
  { label: "1.21.5",          format: 55, ranged: false, hudSprites: true },
  { label: "1.21.4",          format: 46, ranged: false, hudSprites: true },
  { label: "1.21.2 – 1.21.3", format: 42, ranged: false, hudSprites: true },
  { label: "1.21 – 1.21.1",   format: 34, ranged: false, hudSprites: true },
  { label: "1.20.5 – 1.20.6", format: 32, ranged: false, hudSprites: true },
  { label: "1.20.3 – 1.20.4", format: 22, ranged: false, hudSprites: true },
  { label: "1.20.2",          format: 18, ranged: false, hudSprites: true },
  { label: "1.20 – 1.20.1",   format: 15, ranged: false, hudSprites: false },
];
export const DEFAULT_PACK_TARGET = "1.21.11";

export function findTarget(label: string): PackTarget {
  const t = PACK_TARGETS.find((p) => p.label === label);
  if (!t) throw new Error(`Unknown Minecraft version “${label}”.`);
  return t;
}

/** Picks the pack target matching an instance's version id (e.g. "1.21.11" or "1.20.4"). */
export function targetForVersion(version: string): PackTarget | null {
  const parse = (s: string) => s.split(".").map((x) => parseInt(x, 10) || 0);
  const [a, b, c] = parse(version);
  for (const t of PACK_TARGETS) {
    const [lo, hi = lo] = t.label.split(" – ").map(parse);
    const n = a * 10000 + b * 100 + (c ?? 0);
    const l = lo[0] * 10000 + lo[1] * 100 + (lo[2] ?? 0);
    const h = hi[0] * 10000 + hi[1] * 100 + (hi[2] ?? 0);
    if (n >= l && n <= h) return t;
  }
  return null;
}

export function packMcmeta(target: PackTarget, description: string): string {
  const pack: Record<string, unknown> = target.ranged
    ? { description, min_format: target.format, max_format: target.format }
    : { pack_format: target.format, description };
  return JSON.stringify({ pack }, null, 2);
}
