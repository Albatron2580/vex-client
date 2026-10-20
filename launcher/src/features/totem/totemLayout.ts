// Turns a Minecraft skin (64x64, or legacy 64x32) into a 16x16 Totem of Undying texture.
import { createImage, blitScaled, type Rgba } from "../../lib/pixels";

export type TotemStyle = "classic" | "arms-out" | "big-head";
export const TOTEM_STYLES: { id: TotemStyle; label: string }[] = [
  { id: "classic", label: "Classic" }, { id: "arms-out", label: "Arms Out" }, { id: "big-head", label: "Big Head" },
];

// Front-face UV rectangles on the skin [x, y, w, h].
const UV = {
  head: [8, 8, 8, 8], hat: [40, 8, 8, 8],
  body: [20, 20, 8, 12], jacket: [20, 36, 8, 12],
  rArm: [44, 20, 4, 12], rSleeve: [44, 36, 4, 12],
  lArm: [36, 52, 4, 12], lSleeve: [52, 52, 4, 12],
  rLeg: [4, 20, 4, 12], rPants: [4, 36, 4, 12],
  lLeg: [20, 52, 4, 12], lPants: [4, 52, 4, 12],
} as const;
type Part = keyof typeof UV;

export function validateSkin(img: Rgba): string | null {
  if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return `Skins must be 64×64 or 64×32 pixels. This file is ${img.width}×${img.height}.`;
  return null;
}

/** Slim skins have 3px-wide arms. */
export function drawPart(skin: Rgba, out: Rgba, part: "head" | "body" | "rArm" | "lArm" | "rLeg" | "lLeg",
  dx: number, dy: number, dw: number, dh: number, opts: { slim?: boolean; rotate90?: boolean } = {}) {
  const legacy = skin.height === 32;
  const layers: { uv: Part; mirrorOf?: Part }[] = {
    head: [{ uv: "head" }, { uv: "hat" }],
    body: [{ uv: "body" }, { uv: "jacket" }],
    rArm: [{ uv: "rArm" }, { uv: "rSleeve" }],
    lArm: legacy ? [{ uv: "lArm", mirrorOf: "rArm" }] : [{ uv: "lArm" }, { uv: "lSleeve" }],
    rLeg: [{ uv: "rLeg" }, { uv: "rPants" }],
    lLeg: legacy ? [{ uv: "lLeg", mirrorOf: "rLeg" }] : [{ uv: "lLeg" }, { uv: "lPants" }],
  }[part] as { uv: Part; mirrorOf?: Part }[];
  for (const layer of layers) {
    const isOverlay = /hat|jacket|Sleeve|Pants/.test(layer.uv);
    if (legacy && isOverlay && layer.uv !== "hat") continue; // legacy skins have no body overlays
    const src = layer.mirrorOf ?? layer.uv;
    let [sx, sy, sw, sh] = UV[src] as readonly number[];
    if (opts.slim && /Arm|Sleeve/.test(src)) sw = 3;
    blitScaled(skin, sx, sy, sw, sh, out, dx, dy, dw, dh, { flipX: !!layer.mirrorOf, rotate90: opts.rotate90 });
  }
}

export function renderTotem(skin: Rgba, style: TotemStyle, slim = false): Rgba {
  const err = validateSkin(skin); if (err) throw new Error(err);
  const t = createImage(16, 16);
  if (style === "classic") {
    drawPart(skin, t, "head", 4, 1, 8, 8);
    drawPart(skin, t, "rArm", 3, 9, 2, 4, { slim });
    drawPart(skin, t, "body", 5, 9, 6, 4);
    drawPart(skin, t, "lArm", 11, 9, 2, 4, { slim });
    drawPart(skin, t, "rLeg", 5, 13, 3, 3);
    drawPart(skin, t, "lLeg", 8, 13, 3, 3);
  } else if (style === "arms-out") {
    drawPart(skin, t, "head", 4, 1, 8, 8);
    drawPart(skin, t, "rArm", 1, 9, 4, 2, { slim, rotate90: true });
    drawPart(skin, t, "body", 5, 9, 6, 4);
    drawPart(skin, t, "lArm", 11, 9, 4, 2, { slim, rotate90: true });
    drawPart(skin, t, "rLeg", 5, 13, 3, 3);
    drawPart(skin, t, "lLeg", 8, 13, 3, 3);
  } else {
    drawPart(skin, t, "head", 3, 0, 10, 10);
    drawPart(skin, t, "rArm", 3, 10, 2, 3, { slim });
    drawPart(skin, t, "body", 5, 10, 6, 3);
    drawPart(skin, t, "lArm", 11, 10, 2, 3, { slim });
    drawPart(skin, t, "rLeg", 5, 13, 3, 3);
    drawPart(skin, t, "lLeg", 8, 13, 3, 3);
  }
  return t;
}

/** Flat front view of the whole player (16x32), used for skin previews. */
export function renderFrontView(skin: Rgba, slim = false): Rgba {
  const out = createImage(16, 32);
  const aw = slim ? 3 : 4;
  drawPart(skin, out, "head", 4, 0, 8, 8);
  drawPart(skin, out, "rArm", 4 - aw, 8, aw, 12, { slim });
  drawPart(skin, out, "body", 4, 8, 8, 12);
  drawPart(skin, out, "lArm", 12, 8, aw, 12, { slim });
  drawPart(skin, out, "rLeg", 4, 20, 4, 12);
  drawPart(skin, out, "lLeg", 8, 20, 4, 12);
  return out;
}
