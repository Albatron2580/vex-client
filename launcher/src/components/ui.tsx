import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { Rgba } from "../lib/pixels";

export function Card({ title, icon, extra, sub, glow, className = "", children }: { title?: ReactNode; icon?: string; extra?: ReactNode; sub?: ReactNode; glow?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`card ${glow ? "glow" : ""} ${className}`}>
      {title && <h2 className="card-title">{icon && <Icon name={icon} size={20} />}{title}{extra}</h2>}
      {sub && <p className="card-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!checked)} />;
}
export function ToggleRow({ title, desc, checked, onChange, disabled }: { title: string; desc?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div className="text"><b>{title}</b>{desc && <span>{desc}</span>}</div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange, format, label }: { value: number; min: number; max: number; step?: number; onChange(v: number): void; format?(v: number): string; label: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} style={{ ["--pct" as any]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format ? format(value) : value}</output>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="error-text" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Select<T extends string>({ id, value, onChange, options, label }: { id?: string; value: T; onChange(v: NoInfer<T>): void; options: { value: NoInfer<T>; label: string; disabled?: boolean }[]; label?: string }) {
  return (
    <select id={id} aria-label={label} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange(v: NoInfer<T>): void; options: { value: NoInfer<T>; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder, onEnter }: { value: string; onChange(v: string): void; placeholder: string; onEnter?(): void }) {
  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input className="input" value={value} placeholder={placeholder} aria-label={placeholder} spellCheck={false}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter?.()} />
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return <span className="tip">{children}<span role="tooltip">{text}</span></span>;
}

export function Progress({ value, label }: { value: number | null; label: string }) {
  return (
    <div className={`progress ${value === null ? "indeterminate" : ""}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <i style={{ ["--pct" as any]: `${value ?? 0}%` }} />
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "danger"; children: ReactNode }) {
  return <div className={`notice ${kind}`} role={kind === "danger" ? "alert" : undefined}><Icon name={kind === "info" ? "info" : "alert"} size={16} /><div>{children}</div></div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  // Focus the first field once when the window opens (not on every re-render).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, button:not(.x)")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);
  // Rendered straight into <body> so blurred/zoomed parents can't push it off-centre.
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div ref={ref} className={`card glow modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="card-title">{title}<button className="btn ghost sm icon x" onClick={() => close.current()} aria-label="Close"><Icon name="close" size={16} /></button></h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const PALETTE = ["#ffffff", "#000000", "#ff6fb5", "#b77dff", "#ff4d6a", "#ffbf3f", "#5fe3a1", "#4fe0c0", "#5b9dff", "#ff8a2b", "#9aa0a6", "#ffe066"];
export function ColorPicker({ value, onChange, palette = PALETTE, label }: { value: string; onChange(v: string): void; palette?: string[]; label: string }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {palette.map((c) => <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} aria-pressed={c.toLowerCase() === value.toLowerCase()} onClick={() => onChange(c)} />)}
      <Tooltip text="Custom colour">
        <span className="color-input" style={{ background: palette.includes(value) ? undefined : value }}>
          <input type="color" aria-label={`${label}: custom`} value={value} onChange={(e) => onChange(e.target.value)} />
        </span>
      </Tooltip>
    </div>
  );
}

/** Draws an RGBA image scaled up with crisp pixels. */
export function PixelImage({ image, scale, className, label }: { image: Rgba | null; scale: number; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !image) return;
    c.width = image.width; c.height = image.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }, [image]);
  if (!image) return null;
  return <canvas ref={ref} role="img" aria-label={label} className={`pixelated ${className ?? ""}`} style={{ width: image.width * scale, height: image.height * scale }} />;
}
