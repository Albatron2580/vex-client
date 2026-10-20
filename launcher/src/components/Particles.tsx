import { useEffect, useRef } from "react";

/** Floating petals + motes. Count scales with intensity; pauses when the window is hidden. */
export function Particles({ intensity, enabled }: { intensity: number; enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !enabled || intensity <= 0) return;
    const ctx = c.getContext("2d")!;
    let w = 0, h = 0, raf = 0;
    const resize = () => { w = c.width = innerWidth * devicePixelRatio; h = c.height = innerHeight * devicePixelRatio; };
    resize(); addEventListener("resize", resize);
    const css = getComputedStyle(document.documentElement);
    const colors = [css.getPropertyValue("--accent").trim() || "#ff6fb5", css.getPropertyValue("--accent-2").trim() || "#b77dff", "#ffffff"];
    const count = Math.round(8 + intensity * 0.55);
    const make = (anyY = true) => ({
      x: Math.random() * w, y: anyY ? Math.random() * h : -20, r: (Math.random() * 3 + 2) * devicePixelRatio,
      vy: (Math.random() * 0.35 + 0.15) * devicePixelRatio, vx: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02,
      petal: Math.random() < 0.55, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 0.35 + 0.15, sway: Math.random() * 6.28,
    });
    const ps = Array.from({ length: count }, () => make());
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.sway += 0.01; p.x += p.vx + Math.sin(p.sway) * 0.3; p.y += p.vy; p.rot += p.vr;
        if (p.y > h + 20) Object.assign(p, make(false));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
        ctx.shadowColor = p.c; ctx.shadowBlur = 8 * devicePixelRatio;
        ctx.beginPath();
        if (p.petal) ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.8, 0, 0, Math.PI * 2); else ctx.arc(0, 0, p.r * 0.45, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, intensity]);
  return enabled ? <canvas ref={ref} className="particles" style={{ width: "100%", height: "100%" }} aria-hidden="true" /> : null;
}
