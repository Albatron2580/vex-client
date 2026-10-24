import { tr } from "../../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, ColorPicker, Field, Modal, Progress, Select, Slider, Toggle, Tooltip } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppState";
import { GRID, idx, paint, generate, toImage, emptyPixels, PRESETS, DEFAULT_PARAMS, type Pixels, type MirrorMode, type CrosshairParams } from "./crosshairModel";
import { PACK_TARGETS, DEFAULT_PACK_TARGET, findTarget, targetForVersion } from "../../lib/packFormats";
import { buildResourcePack, CROSSHAIR_TEXTURE } from "../../lib/resourcePack";
import { encodePng } from "../../lib/png";
import { rgbaToDataUrl } from "../../lib/image";
import { vex, errMsg } from "../../lib/bridge";
import { InstanceTarget } from "../InstanceTarget";
import { usePackInstall } from "../usePackInstall";

const CELL = 18;

export function CrosshairPanel() {
  const { settings, update, toast, instances, desktop } = useApp();
  const [params, setParams] = useState<CrosshairParams>(DEFAULT_PARAMS);
  const [px, setPx] = useState<Pixels>(() => generate(DEFAULT_PARAMS));
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [mirror, setMirror] = useState<MirrorMode>("xy");
  const [color, setColor] = useState("#ffffff");
  const [scene, setScene] = useState<"day" | "night">("day");
  const [blend, setBlend] = useState(true);
  const [target, setTarget] = useState("default");
  const [version, setVersion] = useState(DEFAULT_PACK_TARGET);
  const [saveName, setSaveName] = useState("");
  const [help, setHelp] = useState(false);
  const { job, run } = usePackInstall();
  const painting = useRef<string | null | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const setParam = <K extends keyof CrosshairParams>(k: K, v: CrosshairParams[K]) => {
    const next = { ...params, [k]: v }; setParams(next); setPx(generate(next));
  };
  useEffect(() => { const t = targetForVersion(instances.find((i) => i.id === target)?.version ?? ""); if (t?.hudSprites) setVersion(t.label); }, [target, instances]);

  // Editor canvas
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!; const s = CELL * devicePixelRatio;
    c.width = c.height = GRID * s;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      ctx.fillStyle = (x + y) % 2 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.065)"; ctx.fillRect(x * s, y * s, s, s);
      const v = px[idx(x, y)]; if (v) { ctx.fillStyle = v; ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
    }
    ctx.strokeStyle = "rgba(255,111,181,0.55)"; ctx.lineWidth = devicePixelRatio;
    ctx.strokeRect(7 * s + 0.5, 7 * s + 0.5, s - 1, s - 1); // centre marker
  }, [px]);

  const cellAt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * GRID), Math.floor(((e.clientY - r.top) / r.height) * GRID)] as const;
  };
  const stroke = useCallback((x: number, y: number, c: string | null) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    setPx((p) => paint(p, x, y, c, mirror));
  }, [mirror]);
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = cellAt(e);
    // Right-click always erases; pen on a same-coloured pixel toggles it off.
    const c = e.button === 2 || tool === "eraser" ? null : px[idx(x, y)] === color ? null : color;
    painting.current = c; stroke(x, y, c);
  };
  const move = (e: React.PointerEvent) => { if (painting.current !== undefined) { const [x, y] = cellAt(e); stroke(x, y, painting.current); } };
  const up = () => { painting.current = undefined; };

  // Keyboard painting: arrows move, Space paints, Delete erases.
  const [cursor, setCursor] = useState([7, 7]);
  const onKey = (e: React.KeyboardEvent) => {
    const [x, y] = cursor; const mv: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mv[e.key]) { e.preventDefault(); setCursor([Math.min(14, Math.max(0, x + mv[e.key][0])), Math.min(14, Math.max(0, y + mv[e.key][1]))]); }
    if (e.key === " ") { e.preventDefault(); stroke(x, y, tool === "eraser" ? null : color); }
    if (e.key === "Delete" || e.key === "Backspace") stroke(x, y, null);
  };

  const image = useMemo(() => toImage(px), [px]);
  const previewUrl = useMemo(() => rgbaToDataUrl(image), [image]);
  const empty = !px.some(Boolean);

  const saveDesign = async () => {
    const name = saveName.trim() || tr("Crosshair {0}", settings.crosshairs.length + 1);
    const existing = settings.crosshairs.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const entry = { id: existing?.id ?? crypto.randomUUID(), name, pixels: px, savedAt: Date.now() };
    await update({ crosshairs: [...settings.crosshairs.filter((c) => c.id !== entry.id), entry] });
    setSaveName(""); toast("success", existing ? `Updated “${name}”` : `Saved “${name}”`);
  };
  const exportPng = async () => {
    try { const r = await vex().files.saveAs("vex-crosshair", "png", encodePng(image)); if (r.ok) toast("success", tr("Crosshair PNG saved"), r.path); }
    catch (e) { toast("error", tr("Couldn't save the PNG"), errMsg(e)); }
  };
  const build = () => buildResourcePack({ target: findTarget(version), description: "VEX Crosshair", icon: image, files: [{ path: CROSSHAIR_TEXTURE, image }] });
  const spriteTargets = PACK_TARGETS.filter((t) => t.hudSprites);

  return (
    <Card title={tr("Crosshair Designer")} icon="crosshair" glow sub={tr("Draw a 15×15 crosshair pixel by pixel, or start from a preset.")}
      extra={<button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setHelp(true)}><Icon name="info" size={14} />{tr("How to use")}</button>}>
      <div className="stack">
        <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 8 }}>
            <canvas ref={canvasRef} tabIndex={0} aria-label={tr("Crosshair editor grid. Arrow keys move, Space paints, Delete erases.")} role="application"
              style={{ width: GRID * CELL, height: GRID * CELL, borderRadius: 10, border: "1px solid var(--line-strong)", cursor: "crosshair", touchAction: "none", background: "color-mix(in oklab, var(--bg) 70%, transparent)" }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} onKeyDown={onKey} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row" style={{ gap: 4 }}>
                <Tooltip text={tr("Pen (left click)")}><button className={`btn sm icon ${tool === "pen" ? "is-on" : ""}`} aria-pressed={tool === "pen"} aria-label={tr("Pen")} onClick={() => setTool("pen")}><Icon name="pencil" size={15} /></button></Tooltip>
                <Tooltip text={tr("Eraser (or right click)")}><button className={`btn sm icon ${tool === "eraser" ? "is-on" : ""}`} aria-pressed={tool === "eraser"} aria-label={tr("Eraser")} onClick={() => setTool("eraser")}><Icon name="eraser" size={15} /></button></Tooltip>
                <Tooltip text={tr("Clear everything")}><button className="btn sm icon" aria-label={tr("Clear")} onClick={() => setPx(emptyPixels())}><Icon name="trash" size={15} /></button></Tooltip>
              </div>
              <Select label={tr("Mirror")} value={mirror} onChange={setMirror} options={[{ value: "off", label: tr("No mirror") }, { value: "x", label: tr("Mirror ↔") }, { value: "y", label: tr("Mirror ↕") }, { value: "xy", label: tr("Mirror 4-way") }]} />
            </div>
          </div>

          <div className="stack" style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">{tr("Live preview")}</span>
              <div className="row" style={{ gap: 4 }}>
                <button className={`btn sm icon ${scene === "day" ? "is-on" : ""}`} aria-label={tr("Day scene")} aria-pressed={scene === "day"} onClick={() => setScene("day")}><Icon name="sun" size={14} /></button>
                <button className={`btn sm icon ${scene === "night" ? "is-on" : ""}`} aria-label={tr("Night scene")} aria-pressed={scene === "night"} onClick={() => setScene("night")}><Icon name="moon" size={14} /></button>
              </div>
            </div>
            <div className={`xh-scene ${scene}`} aria-label={`${scene} preview`}>
              {!empty && <img src={previewUrl} alt="" className="pixelated" style={{ width: 60, height: 60, mixBlendMode: blend ? "difference" : "normal" }} />}
              {empty && <span className="tiny" style={{ color: "#fff", opacity: 0.7 }}>{tr("Nothing drawn yet")}</span>}
            </div>
            <label className="row tiny muted" style={{ cursor: "pointer" }}><Toggle checked={blend} onChange={setBlend} label={tr("Simulate vanilla blending")} />{tr("Simulate vanilla inverted blending")}</label>
            {px.some((c) => c && parseInt(c.slice(1), 16) < 0x202020) && <span className="tiny" style={{ color: "var(--warn)" }}>{tr("Near-black pixels are invisible in vanilla's inverted crosshair. Use white or a colour for parts that must show.")}</span>}
          </div>
        </div>

        <ColorPicker label={tr("Crosshair colour")} value={color} onChange={(c) => { setColor(c); setTool("pen"); }} />

        <div className="stack" style={{ gap: 4 }}>
          <span className="label">{tr("Presets")}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {PRESETS.map((p) => <button key={p.name} className="btn sm" onClick={() => { const next = { ...p.params, color, outlineColor: params.outlineColor }; setParams(next); setPx(generate(next)); }}>{p.name}</button>)}
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: "6px 16px" }}>
          <Field label={tr("Arm length")}>{() => <Slider label={tr("Arm length")} value={params.size} min={1} max={7} onChange={(v) => setParam("size", v)} format={(v) => `${v}px`} />}</Field>
          <Field label={tr("Thickness")}>{() => <Slider label={tr("Thickness")} value={params.thickness} min={1} max={3} onChange={(v) => setParam("thickness", v)} format={(v) => `${v}px`} />}</Field>
          <Field label={tr("Centre gap")}>{() => <Slider label={tr("Centre gap")} value={params.gap} min={0} max={5} onChange={(v) => setParam("gap", v)} format={(v) => `${v}px`} />}</Field>
          <div className="row" style={{ gap: 14, alignItems: "flex-end", paddingBottom: 4 }}>
            <label className="row small" style={{ cursor: "pointer" }}><Toggle label={tr("Outline")} checked={params.outline} onChange={(v) => setParam("outline", v)} />{tr("Outline")}</label>
            <label className="row small" style={{ cursor: "pointer" }}><Toggle label={tr("Centre dot")} checked={params.dot} onChange={(v) => setParam("dot", v)} />{tr("Dot")}</label>
          </div>
        </div>
        <span className="hint">{tr("Sliders and presets rebuild the design in the current colour. Draw afterwards to fine-tune.")}</span>

        <hr className="divider" />
        <div className="row">
          <input className="input" placeholder={tr("Design name")} aria-label={tr("Design name")} maxLength={40} value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !empty && saveDesign()} />
          <button className="btn" disabled={empty} onClick={saveDesign}><Icon name="save" size={15} />{tr("Save")}</button>
          <button className="btn" disabled={empty || !desktop} onClick={exportPng}><Icon name="download" size={15} />{tr("PNG")}</button>
        </div>
        {settings.crosshairs.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {settings.crosshairs.map((c) => (
              <span key={c.id} className="chip" style={{ paddingRight: 2, height: 28 }}>
                <img src={rgbaToDataUrl(toImage(c.pixels))} alt="" className="pixelated" style={{ width: 15, height: 15, background: "#555", borderRadius: 3 }} />
                <button className="btn ghost sm" style={{ height: 22, padding: "0 4px" }} onClick={() => { setPx(c.pixels); setSaveName(c.name); }}>{c.name}</button>
                <button className="btn ghost sm icon" style={{ height: 22, width: 22 }} aria-label={tr("Delete {0}", c.name)} onClick={() => update({ crosshairs: settings.crosshairs.filter((x) => x.id !== c.id) })}><Icon name="close" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label={tr("Instance")}>{(id) => <InstanceTarget id={id} value={target} onChange={setTarget} />}</Field>
          <Field label={tr("Pack version")} hint={tr("1.20.2 and newer")}>{(id) => <Select id={id} value={version} onChange={setVersion} options={spriteTargets.map((p) => ({ value: p.label, label: p.label }))} />}</Field>
        </div>
        {job && <div className="stack" style={{ gap: 6 }}><div className="row tiny muted">{job.step}<span className="spacer" />{job.pct}%</div><Progress value={job.pct} label={job.step} /></div>}
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} disabled={empty || !!job || !desktop} onClick={() => run("install", target, "VEX Crosshair", build)}><Icon name="download" size={16} />{tr("Install pack")}</button>
          <button className="btn" style={{ flex: 1 }} disabled={empty || !!job || !desktop} onClick={() => run("zip", target, "VEX Crosshair", build)}><Icon name="zip" size={16} />{tr("Save as ZIP")}</button>
        </div>
      </div>

      {help && (
        <Modal title={tr("Using your crosshair in Minecraft")} onClose={() => setHelp(false)}>
          <ol className="stack small muted" style={{ paddingLeft: 18, margin: 0 }}>
            <li>{tr("“Install pack” puts VEX Crosshair.zip in the instance's resourcepacks folder. Or use “Save as ZIP” and drop the file into that folder yourself.")}</li>
            <li>{tr("In Minecraft, open Options → Resource Packs, hover VEX Crosshair and click the arrow to move it to Selected. Put it above other packs that change the HUD.")}</li>
            <li>{tr("Click Done. The crosshair updates immediately; no restart needed.")}</li>
            <li>{tr("Vanilla draws the crosshair with inverted blending: white shows as the opposite of what's behind it, colours shift, and pure black disappears completely. “Simulate vanilla inverted blending” previews exactly that, so black outlines only show with the blending switched off (the VEX in-game client will offer that later).")}</li>
            <li>{tr("Works on Java 1.20.2 and newer (the crosshair became its own sprite then). PNG exports the bare 15×15 texture, e.g. for other clients.")}</li>
          </ol>
        </Modal>
      )}
    </Card>
  );
}
