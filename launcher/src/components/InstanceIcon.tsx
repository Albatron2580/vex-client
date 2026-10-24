import { memo } from "react";
import type { Loader } from "../../electron/shared/settingsModel";

/**
 * A pixel block for an instance, like an item in a Minecraft slot. The block type shows the loader
 * (grass for vanilla, a theme-coloured block for Fabric, iron and copper for Forge/NeoForge, amethyst for Quilt)
 * and the texture noise comes from the instance id, so every instance looks a little different.
 */
const PALETTES: Record<Loader, { top: string[]; body: string[] }> = {
  vanilla: { top: ["#6cbf45", "#5aa83a", "#4c922f"], body: ["#8d5b3d", "#7a4c31", "#a06b49", "#6b4129"] },
  fabric: {
    top: ["var(--accent)", "color-mix(in oklab, var(--accent) 75%, white)", "color-mix(in oklab, var(--accent) 80%, black)"],
    body: ["#2b2b33", "#34343d", "#24242b", "color-mix(in oklab, var(--accent) 35%, #2b2b33)"],
  },
  forge: { top: ["#e0782c", "#c9661f", "#f0954c"], body: ["#8e8e97", "#7a7a83", "#a3a3ab", "#6b6b73"] },
  neoforge: { top: ["#f39a43", "#e0802a", "#ffb468"], body: ["#3b3b44", "#2f2f37", "#46464f", "#272730"] },
  quilt: { top: ["#b48cff", "#9c6ff2", "#c9aaff"], body: ["#4b3a6e", "#3e2f5c", "#58457f", "#33264d"] },
};

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}

export const InstanceIcon = memo(function InstanceIcon({ id, loader, size = 52 }: { id: string; loader: Loader; size?: number }) {
  const p = PALETTES[loader] ?? PALETTES.vanilla;
  const r = rng(id + loader);
  const cells: { x: number; y: number; fill: string }[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    // a grass-like top that drips a little into the side
    const drip = y === 2 && r() < 0.45;
    const top = y < 2 || drip;
    const pal = top ? p.top : p.body;
    const v = r();
    cells.push({ x, y, fill: pal[v < 0.55 ? 0 : v < 0.75 ? 1 : v < 0.92 ? 2 : (pal[3] ? 3 : 0)] });
  }
  return (
    <span className="inst-tile inst-icon" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 8 8" width={size - 8} height={size - 8} shapeRendering="crispEdges">
        {cells.map((c) => <rect key={c.x + c.y * 8} x={c.x} y={c.y} width={1.02} height={1.02} style={{ fill: c.fill }} />)}
        <rect x={0} y={7} width={8} height={1} style={{ fill: "rgb(0 0 0 / 0.22)" }} />
        <rect x={7} y={0} width={1} height={8} style={{ fill: "rgb(0 0 0 / 0.14)" }} />
      </svg>
    </span>
  );
});
