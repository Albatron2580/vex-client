import { useEffect, useState } from "react";
import { createImage } from "../lib/pixels";
import { drawPart } from "../features/totem/totemLayout";
import { loadRgba } from "../lib/image";
import { PixelImage } from "./ui";
import type { Rgba } from "../lib/pixels";

const cache = new Map<string, Rgba | null>();

/** The face (with hat layer) of a Microsoft account's real Minecraft skin. */
export function McHead({ uuid, name, size = 32 }: { uuid: string; name: string; size?: number }) {
  const [img, setImg] = useState<Rgba | null>(cache.get(uuid) ?? null);
  useEffect(() => {
    if (cache.has(uuid) || !window.vex) { setImg(cache.get(uuid) ?? null); return; }
    let live = true;
    window.vex.ms.skin(uuid).then(async (s) => {
      let head: Rgba | null = null;
      if (s) { const skin = await loadRgba(s.dataUrl); head = createImage(8, 8); drawPart(skin, head, "head", 0, 0, 8, 8); }
      cache.set(uuid, head); if (live) setImg(head);
    }).catch(() => { cache.set(uuid, null); });
    return () => { live = false; };
  }, [uuid]);
  if (!img) return <span className="inst-tile" style={{ width: size, height: size, borderRadius: size * 0.25, background: "var(--gradient)", color: "#fff", fontSize: size * 0.45 }}>{name[0]?.toUpperCase()}</span>;
  return <span style={{ width: size, height: size, borderRadius: size * 0.25, overflow: "hidden", flex: "none", display: "inline-flex" }}><PixelImage image={img} scale={size / 8} label={`${name}'s head`} /></span>;
}

const urlCache = new Map<string, Rgba | null>();
/** Face from a skin texture URL (textures.minecraft.net), fetched by the main process. */
export function SkinFace({ url, name, size = 32 }: { url: string; name: string; size?: number }) {
  const [img, setImg] = useState<Rgba | null>(urlCache.get(url) ?? null);
  useEffect(() => {
    if (urlCache.has(url) || !window.vex) { setImg(urlCache.get(url) ?? null); return; }
    let live = true;
    window.vex.skins.texture(url).then(async (dataUrl) => {
      const skin = await loadRgba(dataUrl); const head = createImage(8, 8); drawPart(skin, head, "head", 0, 0, 8, 8);
      urlCache.set(url, head); if (live) setImg(head);
    }).catch(() => urlCache.set(url, null));
    return () => { live = false; };
  }, [url]);
  if (!img) return <span className="inst-tile" style={{ width: size, height: size, borderRadius: size * 0.25, background: "var(--gradient)", color: "#fff", fontSize: size * 0.45 }}>{name[0]?.toUpperCase()}</span>;
  return <span style={{ width: size, height: size, borderRadius: size * 0.25, overflow: "hidden", flex: "none", display: "inline-flex" }}><PixelImage image={img} scale={size / 8} label={`${name}'s head`} /></span>;
}
