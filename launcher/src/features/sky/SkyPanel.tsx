import { tr } from "../../lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, Notice, Progress, Select, Slider, ToggleRow } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppState";
import { buildSky, skyProperties, SKY_DIR } from "./skyBuilder";
import { PACK_TARGETS, DEFAULT_PACK_TARGET, findTarget, targetForVersion } from "../../lib/packFormats";
import { buildResourcePack } from "../../lib/resourcePack";
import { loadRgba } from "../../lib/image";
import { errMsg } from "../../lib/bridge";
import { createImage, type Rgba } from "../../lib/pixels";
import { InstanceTarget } from "../InstanceTarget";
import { usePackInstall } from "../usePackInstall";
import auroraUrl from "../../assets/aurora.png";

const PRESETS = [{ id: "aurora", name: "Aurora", url: auroraUrl, horizon: 0.76 }];

/** Draws the four side faces in a row: what you see turning 360° in the world. */
function Panorama({ side, top }: { side: Rgba | null; top: Rgba | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !side || !top) return;
    const S = side.width; c.width = S * 4; c.height = S;
    const ctx = c.getContext("2d")!;
    const sideData = new ImageData(new Uint8ClampedArray(side.data), S, S);
    for (let i = 0; i < 4; i++) ctx.putImageData(sideData, i * S, 0);
  }, [side, top]);
  return side ? <canvas ref={ref} role="img" aria-label={tr("Sky preview, full 360° view")} style={{ width: "100%", aspectRatio: "4 / 1", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", display: "block" }} />
    : <div className="empty" style={{ aspectRatio: "4 / 1" }}><Icon name="moon" size={28} /><span className="small">{tr("Pick an image or a preset")}</span></div>;
}

export function SkyPanel() {
  const { instances, desktop } = useApp();
  const [source, setSource] = useState<{ image: Rgba; label: string } | null>(null);
  const [preset, setPreset] = useState<string>("aurora");
  const [horizon, setHorizon] = useState(0.76);
  const [nightOnly, setNightOnly] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [target, setTarget] = useState("default");
  const [version, setVersion] = useState(DEFAULT_PACK_TARGET);
  const [error, setError] = useState<string | null>(null);
  const { job, run } = usePackInstall();
  const fileRef = useRef<HTMLInputElement>(null);

  const usePreset = async (id: string) => {
    const p = PRESETS.find((x) => x.id === id); if (!p) return;
    setError(null); setPreset(id); setHorizon(p.horizon);
    try { setSource({ image: await loadRgba(p.url), label: p.name }); } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { usePreset("aurora"); }, []);
  useEffect(() => { const t = targetForVersion(instances.find((i) => i.id === target)?.version ?? ""); if (t) setVersion(t.label); }, [target, instances]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setError(null);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error(tr("Choose a PNG, JPG or WebP image."));
      if (f.size > 25 * 1024 * 1024) throw new Error(tr("That image is over 25 MB. Try a smaller one."));
      const img = await loadRgba(f);
      if (img.width < 64 || img.height < 64) throw new Error(tr("That image is too small — use one at least 64×64."));
      setSource({ image: img, label: f.name.replace(/\.[a-z]+$/i, "") }); setPreset("");
    } catch (e) { setError(errMsg(e)); }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Low-res live preview while adjusting; the full 512px faces are built only for the pack.
  const preview = useMemo(() => {
    if (!source) return null;
    try { return buildSky(source.image, { face: 192, horizon, stars: true }); } catch (e) { return null; }
  }, [source, horizon]);

  const build = async () => {
    const sky = buildSky(source!.image, { face: 512, horizon, stars: true });
    return buildResourcePack({
      target: findTarget(version), description: `VEX Sky · ${source!.label}`, icon: sky.side ?? createImage(1, 1),
      files: [{ path: `${SKY_DIR}/sky1.png`, image: sky.texture }],
      texts: [{ path: `${SKY_DIR}/sky1.properties`, text: skyProperties({ nightOnly, rotate }) }],
    });
  };
  const fileName = `VEX Sky - ${source?.label ?? "custom"}`;

  return (
    <Card title={tr("Custom Sky")} icon="moon" glow sub={tr("Turn any picture into the overworld sky — seamless all the way round.")}>
      <div className="stack">
        <Panorama side={preview?.side ?? null} top={preview?.top ?? null} />
        <div className="row wrap">
          <span className="label" style={{ marginRight: 4 }}>{tr("Presets")}</span>
          {PRESETS.map((p) => <button key={p.id} className={`btn sm ${preset === p.id ? "is-on" : ""}`} aria-pressed={preset === p.id} onClick={() => usePreset(p.id)}><Icon name="sparkle" size={14} />{p.name}</button>)}
          <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon name="folder" size={14} />{tr("Your image…")}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {source && <span className="chip accent" style={{ marginLeft: "auto" }}>{source.label} · {source.image.width}×{source.image.height}</span>}
        </div>
        {error && <Notice kind="danger">{error}</Notice>}
        {source && source.image.width < 1000 && <span className="hint">{tr("Small images look soft in-game. 2000px wide or more gives the sharpest sky.")}</span>}

        <div className="grid grid-2" style={{ gap: "6px 20px", alignItems: "start" }}>
          <div className="stack" style={{ gap: 6 }}>
            <Field label={tr("Horizon line")} hint={tr("Where land meets sky in your picture. Everything above it becomes sky.")}>
              {() => <Slider label={tr("Horizon line")} value={horizon} min={0.3} max={1} step={0.01} onChange={setHorizon} format={(v) => `${Math.round(v * 100)}%`} />}
            </Field>
          </div>
          <div>
            <ToggleRow title={tr("Only at night")} desc={tr("Fades in at dusk, out at dawn")} checked={nightOnly} onChange={setNightOnly} />
            <ToggleRow title={tr("Turn with the sun")} desc={tr("Off keeps it still")} checked={rotate} onChange={setRotate} />
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label={tr("Instance")}>{(id) => <InstanceTarget id={id} value={target} onChange={setTarget} />}</Field>
          <Field label={tr("Pack version")}>{(id) => <Select id={id} value={version} onChange={setVersion} options={PACK_TARGETS.map((p) => ({ value: p.label, label: p.label }))} />}</Field>
        </div>
        <Notice>
          <b>{tr("Needs a sky mod.")}</b> {tr("Vanilla Minecraft can't show image skies. Add")}{" "}<a href="https://modrinth.com/mod/nuit" target="_blank" rel="noreferrer">{tr("Nuit")}</a> {tr("and")} <a href="https://modrinth.com/mod/nuit-interop" target="_blank" rel="noreferrer">{tr("Nuit Interop")}</a> {tr("(Fabric/NeoForge), or use OptiFine. Then enable the pack under Options → Resource Packs.")}
        </Notice>
        {job && <div className="stack" style={{ gap: 6 }}><div className="row tiny muted">{job.step}<span className="spacer" />{job.pct}%</div><Progress value={job.pct} label={job.step} /></div>}
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} disabled={!source || !!job || !desktop} onClick={() => run("install", target, fileName, build)}><Icon name="download" size={16} />{tr("Install sky")}</button>
          <button className="btn" style={{ flex: 1 }} disabled={!source || !!job || !desktop} onClick={() => run("zip", target, fileName, build)}><Icon name="zip" size={16} />{tr("Save as ZIP")}</button>
        </div>
      </div>
    </Card>
  );
}
