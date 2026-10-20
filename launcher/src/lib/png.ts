// Dependency-free PNG encoder (RGBA8, zlib "stored" blocks). Output is a fully valid PNG;
// for the tiny textures VEX writes (15x15 to 64x64) compression would save only bytes.
import type { Rgba } from "./pixels";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (const x of bytes) { a = (a + x) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): number[] {
  const typed = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) typed[i] = type.charCodeAt(i);
  typed.set(data, 4);
  return [...u32(data.length), ...typed, ...u32(crc32(typed))];
}

export function encodePng(img: Rgba): Uint8Array {
  const { width, height, data } = img;
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const z: number[] = [0x78, 0x01];
  for (let off = 0; off < raw.length || off === 0; off += 65535) {
    const block = raw.subarray(off, Math.min(off + 65535, raw.length));
    const last = off + 65535 >= raw.length ? 1 : 0;
    z.push(last, block.length & 255, block.length >> 8, ~block.length & 255, (~block.length >> 8) & 255, ...block);
    if (last) break;
  }
  z.push(...u32(adler32(raw)));
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr), ...chunk("IDAT", new Uint8Array(z)), ...chunk("IEND", new Uint8Array()),
  ]);
}
