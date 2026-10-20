// Turns any landscape image into a seamless cube skybox in the OptiFine 3×2 layout:
//   row 0: bottom | top | south      row 1: west | north | east
// Read by OptiFine, and by Nuit through Nuit Interop (Fabric / NeoForge).
import { createImage, type Rgba } from "../../lib/pixels";
import { resizeBilinear } from "../../lib/resize";

export interface SkyOptions {
  face?: number;          // face size in px (default 512 → 1536×1024 texture)
  horizon: number;        // 0.3..1 — where the horizon sits in the source image (fraction of height)
  stars: boolean;         // extra crisp stars on the zenith face
  seed?: number;
}
export interface SkyResult { texture: Rgba; side: Rgba; top: Rgba }

type RGB = [number, number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function rowMean(img: Rgba, y: number): RGB {
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < img.width; x++) { const i = (y * img.width + x) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; }
  return [r / img.width, g / img.width, b / img.width];
}

/** Makes the image tile left↔right by cross-fading its last columns into its first. */
export function makeSeamless(img: Rgba, overlapFrac = 0.2): Rgba {
  const ov = Math.max(1, Math.floor(img.width * overlapFrac)), w = img.width - ov;
  const out = createImage(w, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, i = (y * img.width + x) * 4;
    if (x < ov) {
      const t = (x + 0.5) / ov, j = (y * img.width + w + x) * 4; // tail of the image flows into the head
      for (let c = 0; c < 4; c++) out.data[o + c] = mix(img.data[j + c], img.data[i + c], t);
    } else for (let c = 0; c < 4; c++) out.data[o + c] = img.data[i + c];
  }
  return out;
}

function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildSky(source: Rgba, opts: SkyOptions): SkyResult {
  if (source.width < 64 || source.height < 64) throw new Error("That image is too small — use one at least 64×64 pixels.");
  const S = opts.face ?? 512, half = S / 2;
  const strip = makeSeamless(source);
  const hz = Math.round(Math.min(1, Math.max(0.3, opts.horizon)) * strip.height);

  // Side face: sky above the horizon fills the top half; whatever is below (or darkness) fills the bottom half.
  const side = createImage(S, S);
  side.data.set(resizeBilinear(strip, 0, 0, strip.width, hz, S, half).data, 0);
  const below = hz < strip.height - 2 ? resizeBilinear(strip, 0, hz, strip.width, strip.height - hz, S, half) : null;
  const hzColor = rowMean(strip, Math.max(0, hz - 1));
  const bottomColor: RGB = below ? rowMean(below, half - 1).map((v) => v * 0.45) as RGB : hzColor.map((v) => v * 0.3) as RGB;
  for (let y = 0; y < half; y++) for (let x = 0; x < S; x++) {
    const o = ((half + y) * S + x) * 4;
    if (below) for (let c = 0; c < 4; c++) side.data[o + c] = below.data[(y * S + x) * 4 + c];
    else { const t = y / half; side.data[o] = mix(hzColor[0], bottomColor[0], t); side.data[o + 1] = mix(hzColor[1], bottomColor[1], t); side.data[o + 2] = mix(hzColor[2], bottomColor[2], t); side.data[o + 3] = 255; }
  }

  // Fade the top and bottom rows of the side face to single colours, so the seams with the
  // zenith/ground faces are invisible no matter how a renderer orients each face.
  const topColor = rowMean(side, 0);
  const nTop = Math.round(S * 0.14), nBot = Math.round(S * 0.27);
  for (let y = 0; y < S; y++) {
    const ft = y < nTop ? Math.pow(1 - y / nTop, 1.6) : 0;
    const fb = y >= S - nBot ? Math.pow((y - (S - nBot)) / nBot, 1.4) : 0;
    if (!ft && !fb) continue;
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) {
        let v = side.data[o + c];
        if (ft) v = mix(v, topColor[c], ft);
        if (fb) v = mix(v, bottomColor[c], fb);
        side.data[o + c] = v;
      }
      side.data[o + 3] = 255;
    }
  }

  // Zenith face: edge colour → slightly deeper centre, plus optional stars.
  const top = createImage(S, S);
  const deep = topColor.map((v) => v * 0.62);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.max(Math.abs(x + 0.5 - half), Math.abs(y + 0.5 - half)) / half; // 1 at every edge
    const t = Math.pow(d, 1.3), o = (y * S + x) * 4;
    top.data[o] = mix(deep[0], topColor[0], t); top.data[o + 1] = mix(deep[1], topColor[1], t); top.data[o + 2] = mix(deep[2], topColor[2], t); top.data[o + 3] = 255;
  }
  if (opts.stars) {
    const rnd = mulberry32(opts.seed ?? 7);
    const count = Math.round((S * S) / 620);
    for (let k = 0; k < count; k++) {
      const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), b = 0.45 + rnd() * 0.55, big = rnd() > 0.88;
      const edge = Math.max(Math.abs(x - half), Math.abs(y - half)) / half;
      if (edge > 0.94) continue; // keep the face edges clean for seamless joins
      const put = (px: number, py: number, v: number) => { const o = (py * S + px) * 4; for (let c = 0; c < 3; c++) top.data[o + c] = Math.max(top.data[o + c], v); };
      put(x, y, 255 * b);
      if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, c = y + dy; if (a >= 0 && c >= 0 && a < S && c < S) put(a, c, 150 * b); }
    }
  }

  const bottom = createImage(S, S);
  for (let i = 0; i < S * S; i++) { bottom.data[i * 4] = bottomColor[0]; bottom.data[i * 4 + 1] = bottomColor[1]; bottom.data[i * 4 + 2] = bottomColor[2]; bottom.data[i * 4 + 3] = 255; }

  const texture = createImage(S * 3, S * 2);
  const paste = (img: Rgba, cx: number, cy: number) => { for (let y = 0; y < S; y++) texture.data.set(img.data.subarray(y * S * 4, (y + 1) * S * 4), ((cy * S + y) * S * 3 + cx * S) * 4); };
  paste(bottom, 0, 0); paste(top, 1, 0); paste(side, 2, 0); paste(side, 0, 1); paste(side, 1, 1); paste(side, 2, 1);
  return { texture, side, top };
}

export interface SkyTiming { nightOnly: boolean; rotate: boolean }
/** OptiFine sky layer properties. Night-only fades in at dusk (18:00) and out at dawn (06:00). */
export function skyProperties(t: SkyTiming): string {
  const lines = ["# Generated by VEX CLIENT — Custom Sky", "source=./sky1.png", "blend=alpha", `rotate=${t.rotate}`, "transition=1"];
  if (t.nightOnly) lines.push("startFadeIn=17:30", "endFadeIn=18:45", "endFadeOut=06:30");
  return lines.join("\n") + "\n";
}
export const SKY_DIR = "assets/minecraft/optifine/sky/world0";
