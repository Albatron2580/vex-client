// Minimal RGBA image helpers that work identically in the renderer and in Node tests.

export interface Rgba { width: number; height: number; data: Uint8ClampedArray }

export const createImage = (width: number, height: number): Rgba => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

export function getPx(img: Rgba, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return [0, 0, 0, 0];
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
export function setPx(img: Rgba, x: number, y: number, p: readonly number[]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = p[3];
}

/**
 * Nearest-neighbour copy of a source rectangle into a destination rectangle (any scale).
 * Pixel-centre sampling keeps pixel art crisp. Fully transparent source pixels are skipped,
 * so overlay layers (hat, jacket) can be drawn on top of base layers.
 */
export function blitScaled(
  src: Rgba, sx: number, sy: number, sw: number, sh: number,
  dst: Rgba, dx: number, dy: number, dw: number, dh: number,
  opts: { flipX?: boolean; rotate90?: boolean } = {},
) {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      // Rotation maps the destination's x-axis onto the source's y-axis (for horizontal arms).
      let u = (x + 0.5) / dw, v = (y + 0.5) / dh;
      if (opts.rotate90) [u, v] = [v, 1 - u];
      if (opts.flipX) u = 1 - u;
      const p = getPx(src, sx + Math.floor(u * sw), sy + Math.floor(v * sh));
      if (p[3] > 0) setPx(dst, dx + x, dy + y, [p[0], p[1], p[2], 255]);
    }
  }
}

export function scaleUp(img: Rgba, factor: number): Rgba {
  const out = createImage(img.width * factor, img.height * factor);
  blitScaled(img, 0, 0, img.width, img.height, out, 0, 0, out.width, out.height);
  return out;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
