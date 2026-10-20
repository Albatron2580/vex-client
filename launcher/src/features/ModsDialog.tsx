import { useEffect, useMemo, useState } from "react";
import { Modal, Notice, SearchBar, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { Instance } from "../../electron/shared/settingsModel";
import type { ModFile, ModInfo } from "../vex";

const pretty = (f: string) => f.replace(/\.jar(\.disabled)?$/i, "").replace(/[-_+]/g, " ");
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function ModsDialog({ inst, onClose }: { inst: Instance; onClose(): void }) {
  const { toast, game } = useApp();
  const [mods, setMods] = useState<ModFile[] | null>(null);
  const [info, setInfo] = useState<Record<string, ModInfo>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const running = game.state !== "idle" && game.profileId === inst.id;

  const apply = async (p: Promise<ModFile[] | { mods: ModFile[]; added: number } | null>) => {
    try {
      const r = await p; if (!r) return;
      const list = Array.isArray(r) ? r : r.mods;
      setMods(list);
      if (!Array.isArray(r)) toast("success", `Added ${r.added} mod${r.added === 1 ? "" : "s"}`);
      vex().mods.info(list.map((m) => m.sha1)).then((i) => setInfo((cur) => ({ ...cur, ...i }))).catch(() => {});
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { apply(vex().mods.list(inst.id)); }, [inst.id]);

  const shown = useMemo(() => (mods ?? []).filter((m) => `${info[m.sha1]?.title ?? ""} ${m.file}`.toLowerCase().includes(q.toLowerCase())), [mods, info, q]);
  const enabled = mods?.filter((m) => m.enabled).length ?? 0;

  return (
    <Modal title={`Mods · ${inst.name}`} onClose={onClose} wide>
      <div className="stack">
        <div className="row">
          <div style={{ flex: 1 }}><SearchBar value={q} onChange={setQ} placeholder="Search mods" /></div>
          <button className="btn" disabled={running} onClick={() => apply(vex().mods.add(inst.id))}><Icon name="plus" size={15} />Add .jar</button>
          <button className="btn icon" aria-label="Open mods folder" title="Open mods folder" onClick={() => vex().files.open("path", `${inst.gameDir}${inst.gameDir.includes("\\") ? "\\" : "/"}mods`)}><Icon name="folder" size={15} /></button>
        </div>
        {running && <Notice kind="warn">Minecraft is running this instance. Close the game to change mods.</Notice>}
        {error && <Notice kind="danger">{error}</Notice>}
        <div className="tiny faint">{mods ? `${mods.length} mods · ${enabled} enabled` : "Loading…"}</div>
        <div className="mods-list">
          {mods === null ? <div className="row small muted"><span className="spinner" />Loading…</div>
            : !mods.length ? <div className="empty"><Icon name="cube" size={28} /><span className="small">No mods yet. Add .jar files, import from another launcher, or get a shared instance in Collab.</span></div>
            : shown.map((m) => {
              const i = info[m.sha1];
              return (
                <div key={m.file} className={`mod-row ${m.enabled ? "" : "off"}`}>
                  {i?.icon ? <img src={i.icon} alt="" width={36} height={36} /> : <span className="inst-tile ghost" style={{ width: 36, height: 36 }}><Icon name="cube" size={16} /></span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b className="small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i?.title ?? pretty(m.file)}</b>
                    <span className="tiny faint">{i ? `${i.version} · ` : ""}{m.file} · {kb(m.size)}</span>
                  </div>
                  <Toggle checked={m.enabled} disabled={running} label={`${m.enabled ? "Disable" : "Enable"} ${i?.title ?? m.file}`} onChange={(v) => apply(vex().mods.toggle(inst.id, m.file, v))} />
                  <button className="btn ghost sm icon danger" disabled={running} aria-label={`Remove ${i?.title ?? m.file}`} onClick={() => apply(vex().mods.remove(inst.id, m.file))}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
        </div>
      </div>
    </Modal>
  );
}
