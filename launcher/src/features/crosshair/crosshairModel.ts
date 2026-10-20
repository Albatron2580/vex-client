// 15x15 pixel crosshair — the size of the vanilla HUD crosshair sprite (1.20.2+).
import { createImage, setPx, hexToRgba, type Rgba } from "../../lib/pixels";

export const GRID = 15;
export const CENTER = 7;
export type Pixels = (string | null)[];
export type MirrorMode = "off" | "x" | "y" | "xy";

export const emptyPixels = (): Pixels => Array(GRID * GRID).fill(null);
export const idx = (x: number, y: number) => y * GRID + x;

/** Returns every cell a stroke at (x,y) should touch under the mirror mode. */
export function mirroredCells(x: number, y: number, mode: MirrorMode): [number, number][] {
  const cells: [number, number][] = [[x, y]];
  const mx = GRID - 1 - x, my = GRID - 1 - y;
  if (mode === "x" || mode === "xy") cells.push([mx, y]);
  if (mode === "y" || mode === "xy") cells.push([x, my]);
  if (mode === "xy") cells.push([mx, my]);
  return cells.filter(([a, b], i, arr) => arr.findIndex(([c, d]) => c === a && d === b) === i);
}

export function paint(px: Pixels, x: number, y: number, color: string | null, mode: MirrorMode): Pixels {
  const next = px.slice();
  for (const [a, b] of mirroredCells(x, y, mode)) next[idx(a, b)] = color;
  return next;
}

export interface CrosshairParams {
  shape: "cross" | "dot" | "circle" | "t" | "x" | "square";
  size: number;       // arm length 1..7
  thickness: number;  // 1..3
  gap: number;        // 0..5
  dot: boolean;
  outline: boolean;
  color: string;
  outlineColor: string;
}
export const DEFAULT_PARAMS: CrosshairParams = { shape: "cross", size: 5, thickness: 1, gap: 2, dot: false, outline: false, color: "#ffffff", outlineColor: "#000000" };

/** Generates pixels from parameters (presets and the size/thickness/gap/outline sliders). */
export function generate(p: CrosshairParams): Pixels {
  const px = emptyPixels();
  const on = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < GRID && y < GRID) px[idx(x, y)] = p.color; };
  const half = Math.floor((p.thickness - 1) / 2);
  const band = (fn: (o: number) => void) => { for (let o = -half; o < p.thickness - half; o++) fn(o); };
  const size = Math.max(1, Math.min(7, p.size)), gap = Math.max(0, Math.min(5, p.gap));
  if (p.shape === "cross" || p.shape === "t") {
    for (let d = gap + 1; d <= Math.min(7, gap + size); d++) band((o) => {
      on(CENTER + d, CENTER + o); on(CENTER - d, CENTER + o); on(CENTER + o, CENTER + d);
      if (p.shape === "cross") on(CENTER + o, CENTER - d);
    });
  } else if (p.shape === "x") {
    for (let d = gap + 1; d <= Math.min(7, gap + size); d++) {
      on(CENTER + d, CENTER + d); on(CENTER - d, CENTER - d); on(CENTER + d, CENTER - d); on(CENTER - d, CENTER + d);
    }
  } else if (p.shape === "circle") {
    const r = Math.max(2, Math.min(7, gap + 2));
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const dd = Math.hypot(x - CENTER, y - CENTER);
      if (Math.abs(dd - r) < 0.5 + (p.thickness - 1) * 0.5) on(x, y);
    }
  } else if (p.shape === "square") {
    const r = Math.max(1, Math.min(7, gap + 1));
    for (let i = -r; i <= r; i++) { on(CENTER + i, CENTER - r); on(CENTER + i, CENTER + r); on(CENTER - r, CENTER + i); on(CENTER + r, CENTER + i); }
  }
  if (p.dot || p.shape === "dot") band((o) => band((q) => on(CENTER + o, CENTER + q)));
  return p.outline ? addOutline(px, p.outlineColor) : px;
}

/** 1px outline around every filled pixel (4-neighbourhood), without overwriting filled pixels. */
export function addOutline(px: Pixels, color: string): Pixels {
  const next = px.slice();
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (px[idx(x, y)]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const a = x + dx, b = y + dy;
      return a >= 0 && b >= 0 && a < GRID && b < GRID && px[idx(a, b)] && px[idx(a, b)] !== color;
    });
    if (n) next[idx(x, y)] = color;
  }
  return next;
}

export function toImage(px: Pixels): Rgba {
  const img = createImage(GRID, GRID);
  px.forEach((c, i) => { if (c) setPx(img, i % GRID, Math.floor(i / GRID), hexToRgba(c)); });
  return img;
}

export const PRESETS: { name: string; params: CrosshairParams }[] = [
  { name: "Classic", params: { ...DEFAULT_PARAMS, gap: 0, size: 4 } },
  { name: "Gap Cross", params: { ...DEFAULT_PARAMS } },
  { name: "Outlined", params: { ...DEFAULT_PARAMS, outline: true, gap: 1, size: 4 } },
  { name: "Dot", params: { ...DEFAULT_PARAMS, shape: "dot", thickness: 2 } },
  { name: "Ring", params: { ...DEFAULT_PARAMS, shape: "circle", gap: 3, dot: true } },
  { name: "T-Shape", params: { ...DEFAULT_PARAMS, shape: "t", gap: 1, size: 4 } },
  { name: "X", params: { ...DEFAULT_PARAMS, shape: "x", gap: 1, size: 3 } },
  { name: "Box", params: { ...DEFAULT_PARAMS, shape: "square", gap: 2, dot: true } },
];
