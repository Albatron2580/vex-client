import { useEffect, useMemo, useState } from "react";
import { Field, Modal, Notice, Progress } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { FoundInstance, ImportPart } from "../vex";

const PARTS: { id: ImportPart; label: string; desc: string; on: boolean }[] = [
  { id: "mods", label: "Mods", desc: "Everything in mods/", on: true },
  { id: "config", label: "Mod configs", desc: "config/ — your mod settings", on: true },
  { id: "settings", label: "Game settings", desc: "Keybinds, video settings, server list", on: true },
  { id: "resourcepacks", label: "Resource packs", desc: "", on: true },
  { id: "shaderpacks", label: "Shader packs", desc: "", on: true },
  { id: "worlds", label: "Worlds", desc: "Singleplayer saves — can be big", on: false },
];
const SOURCE_ICON: Record<string, string> = { modrinth: "cube", curseforge: "cube", prism: "cube", multimc: "cube", vanilla: "sparkle", norisk: "shield", folder: "folder" };
const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function ImportDialog({ onClose }: { onClose(): void }) {
  const { refreshInstances, toast, update, settings } = useApp();
  const [found, setFound] = useState<FoundInstance[] | null>(null);
  const [sel, setSel] = useState<FoundInstance | null>(null);
  const [parts, setParts] = useState<Set<ImportPart>>(new Set(PARTS.filter((p) => p.on).map((p) => p.id)));
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [size, setSize] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ pct: number; item: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { vex().importer.scan().then(setFound).catch((e) => { setFound([]); setError(errMsg(e)); }); }, []);
  useEffect(() => window.vex?.importer.onProgress(setProgress), []);
  useEffect(() => { if (sel) { setName(sel.name); setVersion(sel.version ?? ""); } }, [sel]);
  const chosen = useMemo(() => [...parts].filter((p) => sel?.parts[p]), [parts, sel]);
  useEffect(() => { setSize(null); if (sel && chosen.length) vex().importer.measure(sel, chosen).then(setSize).catch(() => {}); }, [sel, chosen]);

  const pick = async () => {
    const r = await vex().importer.pickFolder();
    if (r === null) return;
    if (!r.length) { setError("No Minecraft files found in that folder. Pick an instance folder (with mods/ or options.txt in it)."); return; }
    setError(null); setFound((f) => [...r, ...(f ?? []).filter((x) => !r.some((y) => y.gameDir === x.gameDir))]); setSel(r[0]);
  };
  const run = async () => {
    if (!sel) return;
    setError(null); setProgress({ pct: 0, item: "" });
    try {
      const inst = await vex().importer.run(sel, chosen, name.trim(), version.trim());
      await refreshInstances();
      if (!settings.selectedInstanceId) await update({ selectedInstanceId: inst.id });
      const skipped: { item: string; reason: string }[] = (inst as any).skipped ?? [];
      if (skipped.length) toast("info", `Imported “${inst.name}”, but some parts were skipped`, skipped.map((x) => `${x.item}: ${x.reason}`).join("; "));
      else toast("success", `Imported “${inst.name}”`, `Your ${sel.sourceLabel} files weren't changed.`);
      onClose();
    } catch (e) { setProgress(null); setError(errMsg(e)); }
  };
  const groups = useMemo(() => {
    const m = new Map<string, FoundInstance[]>();
    for (const f of found ?? []) m.set(f.sourceLabel, [...(m.get(f.sourceLabel) ?? []), f]);
    return [...m.entries()];
  }, [found]);
  const versionOk = /^\d+\.\d+(\.\d+)?$/.test(version.trim());

  return (
    <Modal title="Import from another launcher" onClose={progress ? () => {} : onClose}>
      <div className="stack">
        <Notice><b>No risk:</b> VEX only <i>copies</i> files into a new instance. Nothing in your other launcher is moved, changed or deleted.</Notice>
        {found === null ? <div className="row small muted"><span className="spinner" />Looking for Modrinth App, CurseForge, Prism, MultiMC and Minecraft…</div>
          : !sel ? (
            <>
              {groups.length === 0 && <div className="empty"><Icon name="search" size={26} /><span className="small">No other launchers found on this PC.</span></div>}
              <div className="stack" style={{ gap: 10, maxHeight: 340, overflow: "auto" }}>
                {groups.map(([label, list]) => (
                  <div key={label}>
                    <div className="label" style={{ marginBottom: 4 }}>{label}</div>
                    {list.map((f) => (
                      <button key={f.gameDir} className="list-item" style={{ width: "100%", background: "none", border: "1px solid var(--line)", marginBottom: 4, cursor: "pointer", color: "var(--text)", textAlign: "left" }} onClick={() => setSel(f)}>
                        <Icon name={SOURCE_ICON[f.source] ?? "cube"} />
                        <div style={{ flex: 1, minWidth: 0 }}><b className="small">{f.name}</b>
                          <div className="tiny faint">{f.version ?? "Unknown version"} · {f.loader}{f.parts.mods ? " · mods" : ""}{f.parts.worlds ? " · worlds" : ""}</div></div>
                        <Icon name="external" size={14} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={pick}><Icon name="folder" size={14} />Choose a folder…</button>
            </>
          ) : (
            <>
              <div className="row"><button className="btn ghost sm" disabled={!!progress} onClick={() => setSel(null)}>← Back</button><span className="chip accent">{sel.sourceLabel}</span><span className="tiny faint mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sel.gameDir}>{sel.gameDir}</span></div>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Field label="New instance name">{(id) => <input id={id} className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
                <Field label="Minecraft version" error={version && !versionOk ? "Like 1.21.11" : null} hint={sel.version ? "Taken from the source" : "Couldn't detect it — type it in"}>
                  {(id) => <input id={id} className="input" value={version} placeholder="1.21.11" onChange={(e) => setVersion(e.target.value)} />}
                </Field>
              </div>
              <div className="label">What to copy</div>
              <div className="grid grid-2" style={{ gap: 6 }}>
                {PARTS.map((p) => (
                  <label key={p.id} className="list-item" style={{ border: "1px solid var(--line)", cursor: sel.parts[p.id] ? "pointer" : "not-allowed", opacity: sel.parts[p.id] ? 1 : 0.45 }}>
                    <input type="checkbox" disabled={!sel.parts[p.id] || !!progress} checked={sel.parts[p.id] && parts.has(p.id)}
                      onChange={(e) => setParts((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                    <div><b className="small">{p.label}</b><div className="tiny faint">{sel.parts[p.id] ? p.desc || " " : "None found"}</div></div>
                  </label>
                ))}
              </div>
              <div className="tiny faint">{chosen.length === 0 ? "Pick at least one thing to copy." : size === null ? "Measuring…" : `About ${fmtSize(size)} will be copied.`} The loader ({sel.loader}) is kept so your mods match.</div>
              {progress && <div className="stack" style={{ gap: 6 }}><div className="row tiny muted">Copying {progress.item}…<span className="spacer" />{progress.pct}%</div><Progress value={progress.pct} label="Import progress" /></div>}
            </>
          )}
        {error && <Notice kind="danger">{error}</Notice>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" disabled={!!progress} onClick={onClose}>Cancel</button>
          {sel && <button className="btn primary" disabled={!!progress || !chosen.length || !name.trim() || !versionOk} onClick={run}>{progress ? <span className="spinner" /> : <Icon name="download" size={15} />}Import</button>}
        </div>
      </div>
    </Modal>
  );
}
