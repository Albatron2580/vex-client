import { useEffect, useRef, useState } from "react";
import { Card, Notice, PixelImage, Tooltip } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { SkinLookupPanel } from "../features/skinLookup/SkinLookupPanel";
import { renderFrontView, validateSkin } from "../features/totem/totemLayout";
import { loadRgba, dataUrlToBytes } from "../lib/image";
import { vex, errMsg } from "../lib/bridge";
import type { Rgba } from "../lib/pixels";
import type { LibrarySkin } from "../vex";

export function SkinsPage() {
  const { toast, desktop } = useApp();
  const [lib, setLib] = useState<(LibrarySkin & { image: Rgba })[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!desktop) { setLib([]); return; }
    try { const list = await vex().skins.library(); setLib(await Promise.all(list.map(async (s) => ({ ...s, image: await loadRgba(s.dataUrl) })))); }
    catch (e) { toast("error", "Couldn't load your skins", errMsg(e)); setLib([]); }
  };
  useEffect(() => { load(); }, []);

  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const img = await loadRgba(f); const err = validateSkin(img); if (err) throw new Error(err);
      await vex().skins.add(f.name.replace(/\.png$/i, ""), "classic", new Uint8Array(await f.arrayBuffer()));
      toast("success", "Skin imported"); load();
    } catch (e) { toast("error", "Couldn't import that skin", errMsg(e)); }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><span className="eyebrow">Wardrobe</span><h1>Skins</h1></div>
        <button className="btn primary" disabled={!desktop} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Import PNG</button>
        <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", alignItems: "start" }}>
        <Card title="My skin library" icon="skins" extra={lib && <span className="chip">{lib.length}</span>}>
          {lib === null ? <div className="row small muted"><span className="spinner" />Loading…</div>
            : lib.length === 0 ? <div className="empty"><Icon name="skins" size={30} /><span className="small">No skins saved yet. Import a PNG or add one from Skin Lookup.</span></div>
            : <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                {lib.map((s) => (
                  <div key={s.id} className="list-item" style={{ flexDirection: "column", border: "1px solid var(--line)", padding: 12 }}>
                    <PixelImage image={renderFrontView(s.image, s.model === "slim")} scale={3} label={s.name} />
                    <b className="small" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</b>
                    <div className="row" style={{ gap: 4 }}>
                      <Tooltip text="Download"><button className="btn sm icon" aria-label="Download" onClick={async () => { const r = await vex().files.saveAs(s.name, "png", dataUrlToBytes(s.dataUrl)); if (r.ok) toast("success", "Skin saved", r.path); }}><Icon name="download" size={14} /></button></Tooltip>
                      <Tooltip text="Applying skins to your Microsoft account is coming soon"><button className="btn sm icon" aria-label="Apply (unavailable)" disabled><Icon name="lock" size={14} /></button></Tooltip>
                      <Tooltip text="Remove"><button className="btn sm icon danger" aria-label="Remove" onClick={async () => { await vex().skins.remove(s.id); load(); }}><Icon name="trash" size={14} /></button></Tooltip>
                    </div>
                  </div>
                ))}
              </div>}
          <div style={{ marginTop: 14 }}><Notice>Skins are stored only on this PC. Changing the skin on your Minecraft account from VEX is coming soon.</Notice></div>
        </Card>
        <SkinLookupPanel compact onSaved={load} />
      </div>
    </div>
  );
}
