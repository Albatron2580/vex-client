import { createImage, type Rgba } from "./pixels";

/** Bilinear resample of a source rectangle (for photos; pixel art uses blitScaled). */
export function resizeBilinear(src: Rgba, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Rgba {
  const out = createImage(dw, dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / dh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / dw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const i00 = ((sy + y0) * src.width + sx + x0) * 4, i10 = ((sy + y0) * src.width + sx + x1) * 4;
      const i01 = ((sy + y1) * src.width + sx + x0) * 4, i11 = ((sy + y1) * src.width + sx + x1) * 4, o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.data[i00 + c] * (1 - tx) + src.data[i10 + c] * tx;
        const bot = src.data[i01 + c] * (1 - tx) + src.data[i11 + c] * tx;
        out.data[o + c] = top * (1 - ty) + bot * ty;
      }
    }
  }
  return out;
}
