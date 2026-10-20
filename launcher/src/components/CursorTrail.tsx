import { useEffect, useRef } from "react";
import type { TrailSettings, TrailStyle } from "../../electron/shared/settingsModel";

// Mouse trail drawn on one full-window canvas above the UI (pointer-events: none).
// Particles are pooled, the loop sleeps when idle, and it pauses while the window is hidden.

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; rot: number; vr: number; color: string; kind: "petal" | "dot" | "spark" | "ribbon" }

const STYLE: Record<Exclude<TrailStyle, "off">, { kind: P["kind"]; colors: (accent: string, accent2: string) => string[]; gravity: number; spread: number }> = {
  petals:   { kind: "petal",  colors: () => ["#ffb7d5", "#ff8cc6", "#ffd1e3", "#f9a8d4"], gravity: 0.025, spread: 1.1 },
  aurora:   { kind: "ribbon", colors: () => ["#4fe0c0", "#7cf0d6", "#b48cff", "#5b9dff"], gravity: -0.01, spread: 0.6 },
  light:    { kind: "dot",    colors: () => ["#7df9ff", "#b8fbff", "#4fd8ff"], gravity: 0, spread: 0.35 },
  stardust: { kind: "spark",  colors: () => ["#b48cff", "#d8b4fe", "#ffffff", "#8b5cf6"], gravity: 0.01, spread: 1.4 },
  soft:     { kind: "dot",    colors: (a, b) => [a, b], gravity: 0, spread: 0.2 },
  minimal:  { kind: "dot",    colors: () => ["#ffffff"], gravity: 0, spread: 0 },
};

export function CursorTrail({ trail, animationsOff }: { trail: TrailSettings; animationsOff: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cfg = useRef(trail); cfg.current = trail;

  useEffect(() => {
    if (trail.style === "off" || animationsOff) return;
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    resize(); addEventListener("resize", resize);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#ff6fb5", accent2 = css.getPropertyValue("--accent-2").trim() || "#b77dff";
    const ps: P[] = [];
    let raf = 0, last = { x: -1, y: -1 }, running = false, carry = 0;

    const spawn = (x: number, y: number, dist: number) => {
      const t = cfg.current; if (t.style === "off") return;
      const st = STYLE[t.style];
      const cap = t.performance ? 60 : 220;
      const perPx = (t.density / 100) * (t.performance ? 0.12 : 0.35) * (st.kind === "dot" && t.style === "minimal" ? 0.4 : 1);
      carry += dist * perPx;
      const palette = t.color ? [t.color] : st.colors(accent, accent2);
      while (carry >= 1 && ps.length < cap) {
        carry -= 1;
        const sp = (t.speed / 100) * 1.6;
        const ang = Math.random() * Math.PI * 2;
        const max = 18 + (t.length / 100) * 70 + Math.random() * 15;
        ps.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: Math.cos(ang) * sp * st.spread, vy: Math.sin(ang) * sp * st.spread,
          life: max, max, size: (1.5 + (t.size / 100) * 6) * (0.6 + Math.random() * 0.6), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.15,
          color: palette[Math.floor(Math.random() * palette.length)], kind: st.kind });
      }
      if (carry > 4) carry = 0;
    };

    const draw = () => {
      const t = cfg.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const st = t.style === "off" ? null : STYLE[t.style];
      const speed = 0.5 + t.speed / 100;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= speed; if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy += (st?.gravity ?? 0) * speed; p.x += p.vx * speed; p.y += p.vy * speed; p.vx *= 0.97; p.vy *= 0.97; p.rot += p.vr * speed;
        const k = p.life / p.max;
        ctx.globalAlpha = (t.opacity / 100) * Math.min(1, k * 1.4);
        ctx.shadowColor = p.color; ctx.shadowBlur = t.performance ? 0 : (t.glow / 100) * 16;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const s = p.size * (p.kind === "petal" ? 1 : 0.5 + k * 0.5);
        ctx.beginPath();
        if (p.kind === "petal") { ctx.ellipse(0, 0, s * 1.1, s * 0.55, 0, 0, Math.PI * 2); }
        else if (p.kind === "spark") { for (let j = 0; j < 4; j++) { ctx.rotate(Math.PI / 2); ctx.moveTo(0, 0); ctx.lineTo(s * 0.25, s * 0.25); ctx.lineTo(0, s * 1.2); ctx.lineTo(-s * 0.25, s * 0.25); } }
        else if (p.kind === "ribbon") { ctx.ellipse(0, 0, s * 1.6, s * 0.35, 0, 0, Math.PI * 2); }
        else ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (ps.length) raf = requestAnimationFrame(draw); else running = false;
    };
    const wake = () => { if (!running && !document.hidden) { running = true; raf = requestAnimationFrame(draw); } };
    const onMove = (e: PointerEvent) => {
      if (last.x < 0) { last = { x: e.clientX, y: e.clientY }; return; }
      const dx = e.clientX - last.x, dy = e.clientY - last.y, dist = Math.hypot(dx, dy);
      last = { x: e.clientX, y: e.clientY };
      if (dist > 0 && dist < 300) { spawn(e.clientX, e.clientY, dist); wake(); }
    };
    const onLeave = () => { last = { x: -1, y: -1 }; };
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false; } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave); document.removeEventListener("visibilitychange", onVis);
      ctx.clearRect(0, 0, c.width, c.height);
    };
  }, [trail.style, animationsOff]);

  if (trail.style === "off" || animationsOff) return null;
  return <canvas ref={ref} className="cursor-trail" aria-hidden="true" />;
}
