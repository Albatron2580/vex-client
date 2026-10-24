import { tr } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Modal, Notice, SearchBar, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { Instance } from "../../electron/shared/settingsModel";
import type { FoundInstance, ModFile, ModInfo } from "../vex";

const pretty = (f: string) => f.replace(/\.jar(\.disabled)?$/i, "").replace(/[-_+]/g, " ");
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : tr("{0} KB", Math.max(1, Math.round(n / 1e3))));

export function ModsDialog({ inst, onClose }: { inst: Instance; onClose(): void }) {
  const { toast, game } = useApp();
  const [mods, setMods] = useState<ModFile[] | null>(null);
  const [info, setInfo] = useState<Record<string, ModInfo>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const running = game.state !== "idle" && game.profileId === inst.id;

  const apply = async (p: Promise<ModFile[] | { mods: ModFile[]; added: number } | null>) => {
    try {
      const r = await p; if (!r) return;
      const list = Array.isArray(r) ? r : r.mods;
      setMods(list);
      if (!Array.isArray(r)) toast("success", tr("Added {0} mod{1}", r.added, r.added === 1 ? "" : "s"));
      vex().mods.info(list.map((m) => m.sha1)).then((i) => setInfo((cur) => ({ ...cur, ...i }))).catch(() => {});
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { apply(vex().mods.list(inst.id)); }, [inst.id]);

  const shown = useMemo(() => (mods ?? []).filter((m) => `${info[m.sha1]?.title ?? ""} ${m.file}`.toLowerCase().includes(q.toLowerCase())), [mods, info, q]);
  const enabled = mods?.filter((m) => m.enabled).length ?? 0;

  return (
    <Modal title={tr("Mods · {0}", inst.name)} onClose={onClose} wide>
      <div className="stack">
        <div className="row">
          <div style={{ flex: 1 }}><SearchBar value={q} onChange={setQ} placeholder={tr("Search mods")} /></div>
          <button className="btn" disabled={running} onClick={() => setCopying(true)}><Icon name="download" size={15} />{tr("Copy from launcher")}</button>
          <button className="btn" disabled={running} onClick={() => apply(vex().mods.add(inst.id))}><Icon name="plus" size={15} />{tr("Add .jar")}</button>
          <button className="btn icon" aria-label={tr("Open mods folder")} title={tr("Open mods folder")} onClick={() => vex().files.open("path", `${inst.gameDir}${inst.gameDir.includes("\\") ? "\\" : "/"}mods`)}><Icon name="folder" size={15} /></button>
        </div>
        {running && <Notice kind="warn">{tr("Minecraft is running this instance. Close the game to change mods.")}</Notice>}
        {error && <Notice kind="danger">{error}</Notice>}
        <div className="tiny faint">{mods ? tr("{0} mods · {1} enabled", mods.length, enabled) : tr("Loading…")}</div>
        <div className="mods-list">
          {mods === null ? <div className="row small muted"><span className="spinner" />{tr("Loading…")}</div>
            : !mods.length ? <div className="empty"><Icon name="cube" size={28} /><span className="small">{tr("No mods yet. Add .jar files, import from another launcher, or get a shared instance in Collab.")}</span></div>
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
                  <button className="btn ghost sm icon danger" disabled={running} aria-label={tr("Remove {0}", i?.title ?? m.file)} onClick={() => apply(vex().mods.remove(inst.id, m.file))}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
        </div>
      </div>
      {copying && <CopyFrom inst={inst} onClose={() => setCopying(false)} onDone={(list) => apply(Promise.resolve(list))} />}
    </Modal>
  );
}

/** Pick an instance in another launcher (Modrinth App, NoRisk Client, Minecraft Launcher, CurseForge, Prism…) and copy its mods in. */
function CopyFrom({ inst, onClose, onDone }: { inst: Instance; onClose(): void; onDone(mods: ModFile[]): void }) {
  const { toast } = useApp();
  const [found, setFound] = useState<FoundInstance[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { vex().importer.scan().then((f) => setFound(f.filter((x) => (x.modCount ?? 0) > 0))).catch((e) => { setError(errMsg(e)); setFound([]); }); }, []);
  const groups = useMemo(() => {
    const m = new Map<string, FoundInstance[]>();
    for (const f of found ?? []) m.set(f.sourceLabel, [...(m.get(f.sourceLabel) ?? []), f]);
    return [...m.entries()];
  }, [found]);
  const copy = async (f: FoundInstance) => {
    const key = f.gameDir + (f.modsDir ?? "");
    setBusy(key); setError(null);
    try {
      const r = await vex().mods.copyFrom(inst.id, f);
      onDone(r.mods);
      toast("success", tr("Copied {0} mod{1} from {2}", r.added, r.added === 1 ? "" : "s", f.sourceLabel), r.skipped ? `${r.skipped} were already here. Your ${f.sourceLabel} files weren't changed.` : `Your ${f.sourceLabel} files weren't changed.`);
      onClose();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };
  return (
    <Modal title={tr("Copy mods from another launcher")} onClose={onClose}>
      <div className="stack">
        <span className="small muted">{tr("Pick an instance. Its mod files are copied into {0}; nothing in the other launcher is moved or changed.", inst.name)}</span>
        {error && <Notice kind="danger">{error}</Notice>}
        {found === null ? <div className="row small muted"><span className="spinner" />{tr("Looking in Modrinth App, NoRisk Client, Minecraft Launcher, CurseForge and Prism…")}</div>
          : !found.length ? <div className="empty"><Icon name="search" size={26} /><span className="small">{tr("No instances with mods found in other launchers on this PC.")}</span></div>
          : <div className="mods-list" style={{ maxHeight: 380 }}>
              {groups.map(([label, list]) => (
                <div key={label} className="stack" style={{ gap: 6 }}>
                  <b className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</b>
                  {list.map((f) => {
                    const key = f.gameDir + (f.modsDir ?? "");
                    const mismatch = (f.version && f.version !== inst.version) || (f.loader !== "vanilla" && f.loader !== inst.loader);
                    return (
                      <div key={key} className="mod-row">
                        <span className="inst-tile ghost" style={{ width: 36, height: 36 }}><Icon name="cube" size={16} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <b className="small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</b>
                          <span className="tiny faint">{[f.loader !== "vanilla" ? f.loader : null, f.version, `${f.modCount} mods`].filter(Boolean).join(" · ")}</span>
                          {mismatch && <span className="tiny" style={{ display: "block", color: "var(--warn, #f5b84b)" }}>{tr("Made for {0}; this instance is {1}. Some mods may not load.", `${f.loader} ${f.version ?? ""}`.trim(), `${inst.loader} ${inst.version}`)}</span>}
                        </div>
                        <button className="btn sm primary" disabled={!!busy} onClick={() => copy(f)}>{busy === key ? <span className="spinner" /> : <Icon name="download" size={14} />}{tr("Copy")}</button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>}
      </div>
    </Modal>
  );
}
