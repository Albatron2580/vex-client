import { useEffect, useMemo, useState } from "react";
import { Field, Modal, Notice, Segmented, Select, Slider, Tooltip, SearchBar } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { Instance, Loader } from "../../electron/shared/settingsModel";
import type { VersionList } from "../vex";
import { ImportDialog } from "../features/ImportDialog";
import { ModsDialog } from "../features/ModsDialog";
import { InstanceIcon } from "../components/InstanceIcon";

const LOADER_NAME: Record<string, string> = { vanilla: "Vanilla", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt" };
const played = (t: number | null) => {
  if (!t) return "Never played";
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "Just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

function InstanceRow({ inst, selected, loaderVersion, onSelect, onMods, onEdit, onDelete }: { inst: Instance; selected: boolean; loaderVersion?: string; onSelect(): void; onMods(): void; onEdit(): void; onDelete(): void }) {
  const { play, game, ms } = useApp();
  const busy = game.state !== "idle";
  const thisOne = busy && game.profileId === inst.id;
  const canPlay = !!ms?.accounts.some((a) => a.active && !a.needsLogin);
  return (
    <div className={`inst-row ${selected ? "selected" : ""}`}>
      <InstanceIcon id={inst.id} loader={inst.loader} />
      <div className="meta" onClick={onSelect} title="Select this instance">
        <b>{inst.name}</b>
        <div className="sub">
          <span><Icon name="cube" size={13} />{inst.version}</span><i className="sep" />
          <span>{LOADER_NAME[inst.loader]}{loaderVersion ? ` ${loaderVersion}` : ""}</span><i className="sep" />
          <span>{thisOne ? (game.state === "running" ? "Playing now" : "Starting…") : played(inst.lastPlayed)}</span>
          {selected && <span className="chip accent" style={{ height: 18 }}>Selected</span>}
        </div>
      </div>
      {thisOne && game.state === "running"
        ? <button className="btn play-row" onClick={() => vex().game.stop()}><Icon name="close" size={13} />STOP</button>
        : <Tooltip text={canPlay ? (busy ? "Minecraft is already starting or running." : "Play this instance") : "Add a Microsoft account first (bottom left)."}>
            <button className="btn play-row" disabled={busy || !canPlay} onClick={() => { onSelect(); play(inst.id); }}>{thisOne ? <span className="spinner" /> : <Icon name="play" size={13} />}{thisOne ? "Starting" : "Play"}</button>
          </Tooltip>}
      <button className="btn mods-row" onClick={onMods}><Icon name="puzzle" size={14} />Mods</button>
      <InstanceMenu inst={inst} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function InstanceMenu({ inst, onEdit, onDelete }: { inst: Instance; onEdit(): void; onDelete(): void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const t = setTimeout(() => addEventListener("click", close), 0);
    return () => { clearTimeout(t); removeEventListener("click", close); };
  }, [open]);
  return (
    <span style={{ position: "relative" }}>
      <button className="btn icon" aria-label={`Settings for ${inst.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="settings" size={16} /></button>
      {open && (
        <div className="account-menu" role="menu" style={{ bottom: "auto", top: "calc(100% + 6px)", left: "auto", right: 0, width: 200 }}>
          <button className="list-item" role="menuitem" onClick={onEdit}><Icon name="edit" size={14} /><span className="small">Edit instance</span></button>
          <button className="list-item" role="menuitem" onClick={() => vex().files.open("path", inst.gameDir)}><Icon name="folder" size={14} /><span className="small">Open folder</span></button>
          <button className="list-item" role="menuitem" onClick={onDelete}><Icon name="trash" size={14} /><span className="small" style={{ color: "var(--danger)" }}>Delete…</span></button>
        </div>
      )}
    </span>
  );
}

function InstanceEditor({ initial, onClose }: { initial: Instance | null; onClose(): void }) {
  const { info, refreshInstances, toast, update, settings } = useApp();
  const [versions, setVersions] = useState<VersionList | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [version, setVersion] = useState(initial?.version ?? "");
  const [loader, setLoader] = useState<Loader>(initial?.loader ?? "fabric");
  const maxMem = Math.max(2048, Math.floor(((info?.totalMemMb ?? 8192) * 0.75) / 512) * 512);
  const [memory, setMemory] = useState(Math.min(initial?.memoryMb ?? 4096, maxMem));
  const [gameDir, setGameDir] = useState(initial?.gameDir ?? "");
  const [jvmArgs, setJvmArgs] = useState(initial?.jvmArgs ?? "");
  const [busy, setBusy] = useState(false);

  const loadVersions = () => { setVersions(null); vex().versions().then((v) => { setVersions(v); if (!version && v.latest) setVersion(v.latest); }).catch((e) => setVersions({ versions: [], latest: null, fromCache: false, error: errMsg(e) })); };
  useEffect(loadVersions, []);
  const list = useMemo(() => (versions?.versions ?? []).filter((v) => v.type === "release" || (showSnapshots && v.type === "snapshot")), [versions, showSnapshots]);
  const nameErr = name.trim() ? null : "Give the instance a name.";
  const verErr = version ? null : "Pick a Minecraft version.";

  const save = async () => {
    if (nameErr || verErr) return;
    setBusy(true);
    try {
      const inst: Instance = { id: initial?.id ?? (await vex().instances.newId()), name: name.trim(), version, loader, gameDir, memoryMb: memory, jvmArgs,
        createdAt: initial?.createdAt ?? Date.now(), lastPlayed: initial?.lastPlayed ?? null, installed: initial?.installed ?? false };
      const saved = await vex().instances.save(inst);
      await refreshInstances();
      if (!settings.selectedInstanceId) await update({ selectedInstanceId: saved.id });
      toast("success", initial ? "Instance updated" : "Instance created", saved.gameDir);
      onClose();
    } catch (e) { toast("error", "Couldn't save the instance", errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : "New instance"} onClose={onClose}>
      <div className="stack">
        <Field label="Name" error={name.length ? nameErr : null}>{(id) => <input id={id} className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PvP 1.21" />}</Field>
        <Field label="Minecraft version" hint={versions?.fromCache ? "Offline — showing the last downloaded version list." : versions?.versions.length ? "From Mojang's official version manifest." : undefined}>
          {(id) => versions === null ? <div className="row small muted"><span className="spinner" />Loading versions…</div>
            : versions.versions.length === 0 ? <div className="stack" style={{ gap: 8 }}><Notice kind="danger">Couldn't load versions ({versions.error}). Check your connection.</Notice><button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={loadVersions}><Icon name="refresh" size={14} />Retry</button></div>
            : <div className="row"><Select id={id} value={version} onChange={setVersion} options={list.map((v) => ({ value: v.id, label: v.id + (v.id === versions.latest ? " (latest)" : "") }))} />
                <label className="row tiny muted" style={{ whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={showSnapshots} onChange={(e) => setShowSnapshots(e.target.checked)} />Snapshots</label></div>}
        </Field>
        <Field label="Mod loader" hint="The loader installs itself the first time you press Play. Quilt can't launch yet.">
          {() => <Segmented label="Mod loader" value={loader} onChange={setLoader} options={[{ value: "vanilla", label: "Vanilla" }, { value: "fabric", label: "Fabric" }, { value: "forge", label: "Forge" }, { value: "neoforge", label: "NeoForge" }, { value: "quilt", label: "Quilt" }]} />}
        </Field>
        <Field label="Memory" hint={`Your PC has ${((info?.totalMemMb ?? 0) / 1024).toFixed(0)} GB. VEX caps this at 75% so Windows stays responsive.`}>
          {() => <Slider label="Memory" value={memory} min={1024} max={maxMem} step={512} onChange={setMemory} format={(v) => `${(v / 1024).toFixed(1)} GB`} />}
        </Field>
        <Field label="Game folder" hint={gameDir ? undefined : "Leave empty to use a new folder inside VEX's instances folder."}>
          {(id) => <div className="row"><input id={id} className="input mono" value={gameDir} readOnly placeholder="Default" />
            <button className="btn" onClick={async () => { const d = await vex().files.pickDir("Choose a game folder"); if (d) setGameDir(d); }}><Icon name="folder" size={16} />Browse</button>
            {gameDir && <button className="btn ghost icon" aria-label="Use default folder" onClick={() => setGameDir("")}><Icon name="close" size={14} /></button>}</div>}
        </Field>
        <Field label="Extra JVM arguments" hint="Optional, e.g. -XX:+UseG1GC">{(id) => <input id={id} className="input mono" value={jvmArgs} maxLength={500} onChange={(e) => setJvmArgs(e.target.value)} />}</Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !!nameErr || !!verErr} onClick={save}>{busy && <span className="spinner" />}{initial ? "Save changes" : "Create instance"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function InstancesPage() {
  const { instances, settings, update, refreshInstances, toast, desktop } = useApp();
  const [editing, setEditing] = useState<Instance | null | "new">(null);
  const [deleting, setDeleting] = useState<Instance | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [modsFor, setModsFor] = useState<Instance | null>(null);
  const [loaderVersions, setLoaderVersions] = useState<Record<string, string>>({});
  useEffect(() => { if (desktop) vex().loaderVersions().then(setLoaderVersions).catch(() => {}); }, [desktop, instances]);
  const shown = instances.filter((i) => `${i.name} ${i.version} ${i.loader}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await vex().instances.remove(deleting.id, deleteFiles); await refreshInstances();
      if (settings.selectedInstanceId === deleting.id) await update({ selectedInstanceId: null, recentInstanceIds: settings.recentInstanceIds.filter((x) => x !== deleting.id) });
      toast("success", `Deleted ${deleting.name}`);
    } catch (e) { toast("error", "Couldn't delete the instance", errMsg(e)); }
    setDeleting(null); setDeleteFiles(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Instances</h1><p>{instances.length} {instances.length === 1 ? "instance" : "instances"}</p></div>
        <div className="row">
          <button className="btn" disabled={!desktop} onClick={() => setImporting(true)}><Icon name="upload" size={16} />Import</button>
          <button className="btn primary" disabled={!desktop} onClick={() => setEditing("new")}><Icon name="plus" size={16} />New instance</button>
        </div>
      </div>
      
      {instances.length > 3 && <SearchBar value={q} onChange={setQ} placeholder="Search instances" />}
      {shown.length === 0 ? (
        <div className="empty"><Icon name="cube" size={34} /><b style={{ color: "var(--text)" }}>{instances.length ? "No matches" : "No instances yet"}</b>
          <span className="small">{instances.length ? "Try a different search." : "Create one, or import your mods and settings from another launcher."}</span>
          {!instances.length && desktop && <button className="btn sm" onClick={() => setImporting(true)}><Icon name="upload" size={14} />Import from another launcher</button>}</div>
      ) : (
        <div className="inst-list">
          {shown.map((i) => (
            <InstanceRow key={i.id} inst={i} selected={settings.selectedInstanceId === i.id} loaderVersion={loaderVersions[`${i.loader}:${i.version}`]}
              onSelect={() => update({ selectedInstanceId: i.id })} onMods={() => setModsFor(i)} onEdit={() => setEditing(i)} onDelete={() => setDeleting(i)} />
          ))}
        </div>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {modsFor && <ModsDialog inst={modsFor} onClose={() => setModsFor(null)} />}
      {editing && <InstanceEditor initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)}>
          <div className="stack">
            <p className="muted small">This removes the instance from VEX CLIENT.</p>
            <label className="row small" style={{ cursor: "pointer" }}><input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
              Also delete its folder (worlds, packs, screenshots). Only folders VEX created are ever deleted.</label>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn ghost" onClick={() => setDeleting(null)}>Cancel</button><button className="btn danger" onClick={doDelete}><Icon name="trash" size={15} />Delete</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
