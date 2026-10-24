import { tr } from "../../lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, Notice, PixelImage, Progress, Segmented, Select } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppState";
import { renderTotem, renderFrontView, validateSkin, TOTEM_STYLES, type TotemStyle } from "./totemLayout";
import { PACK_TARGETS, DEFAULT_PACK_TARGET, findTarget, targetForVersion } from "../../lib/packFormats";
import { buildResourcePack, TOTEM_TEXTURE } from "../../lib/resourcePack";
import { loadRgba } from "../../lib/image";
import { errMsg } from "../../lib/bridge";
import type { Rgba } from "../../lib/pixels";
import { useSkinLookup, type FoundSkin } from "../skinLookup/useSkinLookup";
import { InstanceTarget } from "../InstanceTarget";
import { usePackInstall } from "../usePackInstall";

export function TotemPanel({ incoming }: { incoming?: FoundSkin | null }) {
  const { instances, desktop } = useApp();
  const [skin, setSkin] = useState<{ image: Rgba; slim: boolean; label: string } | null>(null);
  const [player, setPlayer] = useState("");
  const [style, setStyle] = useState<TotemStyle>("classic");
  const [target, setTarget] = useState("default");
  const [version, setVersion] = useState(DEFAULT_PACK_TARGET);
  const [fileError, setFileError] = useState<string | null>(null);
  const { state, lookup } = useSkinLookup();
  const { job, run } = usePackInstall();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (incoming) { setSkin({ image: incoming.image, slim: incoming.model === "slim", label: incoming.name }); setPlayer(incoming.name); } }, [incoming]);
  // Picking an instance selects the matching pack version automatically.
  useEffect(() => {
    const inst = instances.find((i) => i.id === target);
    const t = inst && targetForVersion(inst.version);
    if (t) setVersion(t.label);
  }, [target, instances]);

  const totem = useMemo(() => (skin ? renderTotem(skin.image, style, skin.slim) : null), [skin, style]);

  const fetchPlayer = async () => {
    setFileError(null);
    const s = await lookup(player.trim());
    if (s) setSkin({ image: s.image, slim: s.model === "slim", label: s.name });
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setFileError(null);
    try {
      if (f.type && f.type !== "image/png") throw new Error(tr("Choose a .png skin file."));
      const img = await loadRgba(f);
      const err = validateSkin(img); if (err) throw new Error(err);
      setSkin({ image: img, slim: false, label: f.name.replace(/\.png$/i, "") });
    } catch (e) { setFileError(errMsg(e)); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const build = () => buildResourcePack({
    target: findTarget(version), description: `VEX Totem · ${skin!.label}`, icon: totem!, files: [{ path: TOTEM_TEXTURE, image: totem! }],
  });
  const fileName = `VEX Totem - ${skin?.label ?? "custom"}`;
  const lookupBusy = state.status === "loading";

  return (
    <Card title={tr("Custom Totem")} icon="totem" glow sub={tr("Turn any skin into your Totem of Undying.")}>
      <div className="stack">
        <div className="row" style={{ gap: 16, alignItems: "stretch" }}>
          <div style={{ width: 172, height: 172, flex: "none", display: "grid", placeItems: "center", borderRadius: "var(--r-lg)", border: "1px solid var(--line)",
            background: "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--accent) 28%, transparent), color-mix(in oklab, var(--bg) 60%, transparent) 70%)" }}>
            {totem ? <PixelImage image={totem} scale={9} label={tr("Totem preview")} /> : <div className="faint small" style={{ textAlign: "center", padding: 12 }}><Icon name="totem" size={30} /><br />{tr("Load a skin to preview")}</div>}
          </div>
          <div className="stack" style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
            {skin ? (
              <div className="row"><PixelImage image={renderFrontView(skin.image, skin.slim)} scale={2.5} label={tr("Skin preview")} />
                <div style={{ minWidth: 0 }}><b>{skin.label}</b><div className="tiny faint">{skin.slim ? tr("Slim") : tr("Classic")} skin</div>
                  <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setSkin((s) => s && { ...s, slim: !s.slim })}>{skin.slim ? tr("Switch to classic arms") : tr("Switch to slim arms")}</button></div>
              </div>
            ) : <span className="small faint">{tr("Use a player's name or pick a skin file.")}</span>}
            <Segmented label={tr("Totem style")} value={style} onChange={setStyle} options={TOTEM_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
          </div>
        </div>

        <div className="row">
          <input className="input" placeholder={tr("Player name")} aria-label={tr("Player name")} value={player} maxLength={16}
            onChange={(e) => setPlayer(e.target.value.replace(/\s/g, ""))} onKeyDown={(e) => e.key === "Enter" && fetchPlayer()} />
          <button className="btn" onClick={fetchPlayer} disabled={!desktop || lookupBusy || !/^[A-Za-z0-9_]{3,16}$/.test(player)}>{lookupBusy ? <span className="spinner" /> : <Icon name="download" size={16} />}{tr("Fetch")}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="folder" size={16} />{tr("File")}</button>
          <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {state.status === "error" && <Notice kind="warn">{state.message}</Notice>}
        {fileError && <Notice kind="danger">{fileError}</Notice>}

        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label={tr("Instance")}>{(id) => <InstanceTarget id={id} value={target} onChange={setTarget} />}</Field>
          <Field label={tr("Pack version")}>{(id) => <Select id={id} value={version} onChange={setVersion} options={PACK_TARGETS.map((p) => ({ value: p.label, label: p.label }))} />}</Field>
        </div>

        {job ? <div className="stack" style={{ gap: 6 }}><div className="row tiny muted">{job.step}<span className="spacer" />{job.pct}%</div><Progress value={job.pct} label={job.step} /></div> : null}
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} disabled={!totem || !!job || !desktop} onClick={() => run("install", target, fileName, build)}><Icon name="download" size={16} />{tr("Install")}</button>
          <button className="btn" style={{ flex: 1 }} disabled={!totem || !!job || !desktop} onClick={() => run("zip", target, fileName, build)}><Icon name="zip" size={16} />{tr("Save as ZIP")}</button>
        </div>
      </div>
    </Card>
  );
}
