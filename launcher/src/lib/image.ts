import { createImage, type Rgba } from "./pixels";
import { encodePng } from "./png";

/** Decodes a PNG (data URL, blob URL or File) into RGBA via an offscreen canvas. */
export async function loadRgba(src: string | File): Promise<Rgba> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error("That file couldn't be read as an image."); });
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const out = createImage(d.width, d.height); out.data.set(d.data); return out;
  } finally { if (typeof src !== "string") URL.revokeObjectURL(url); }
}

export function rgbaToDataUrl(img: Rgba): string {
  const bytes = encodePng(img); let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(s)}`;
}

export function dataUrlToBytes(url: string): Uint8Array {
  const bin = atob(url.split(",")[1] ?? ""); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
