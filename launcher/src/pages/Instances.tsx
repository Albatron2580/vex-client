import { useEffect, useMemo, useState } from "react";
import { Card, Field, Modal, Notice, Segmented, Select, Slider, Tooltip, SearchBar } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { Instance, Loader } from "../../electron/shared/settingsModel";
import type { VersionList } from "../vex";
import { ImportDialog } from "../features/ImportDialog";

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
        <Field label="Mod loader" hint="Saved now; the loader itself is installed in Stage 4. VEX's in-game client needs Fabric.">
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
        <div><span className="eyebrow">Library</span><h1>Instances</h1><p>Separate Minecraft setups, each with its own version, mods and folder.</p></div>
        <div className="row">
          <button className="btn" disabled={!desktop} onClick={() => setImporting(true)}><Icon name="upload" size={16} />Import</button>
          <button className="btn primary" disabled={!desktop} onClick={() => setEditing("new")}><Icon name="plus" size={16} />New instance</button>
        </div>
      </div>
      <Notice><b>Stage 3 build.</b> You can create and organise instances, and Features can install resource packs into them. Downloading game files, installing Fabric/Forge and launching arrive in Stage 4.</Notice>
      {instances.length > 3 && <SearchBar value={q} onChange={setQ} placeholder="Search instances" />}
      {shown.length === 0 ? (
        <div className="empty"><Icon name="cube" size={34} /><b style={{ color: "var(--text)" }}>{instances.length ? "No matches" : "No instances yet"}</b>
          <span className="small">{instances.length ? "Try a different search." : "Create one, or import your mods and settings from another launcher."}</span>
          {!instances.length && desktop && <button className="btn sm" onClick={() => setImporting(true)}><Icon name="upload" size={14} />Import from another launcher</button>}</div>
      ) : (
        <div className="grid grid-3">
          {shown.map((i) => (
            <Card key={i.id} className={settings.selectedInstanceId === i.id ? "glow" : ""} title={<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</span>} icon="cube"
              extra={settings.selectedInstanceId === i.id ? <span className="chip accent">Selected</span> : undefined}>
              <dl className="kv"><dt>Version</dt><dd>{i.version}</dd><dt>Loader</dt><dd style={{ textTransform: "capitalize" }}>{i.loader}</dd><dt>Memory</dt><dd>{(i.memoryMb / 1024).toFixed(1)} GB</dd>
                <dt>Folder</dt><dd className="mono" title={i.gameDir}>{i.gameDir}</dd></dl>
              <div className="row" style={{ marginTop: 14 }}>
                <span className="chip warn"><span className="dot" />Not installed</span><span className="spacer" />
                <Tooltip text="Open folder"><button className="btn sm icon" aria-label="Open folder" onClick={() => vex().files.open("path", i.gameDir)}><Icon name="folder" size={15} /></button></Tooltip>
                <Tooltip text="Edit"><button className="btn sm icon" aria-label="Edit" onClick={() => setEditing(i)}><Icon name="edit" size={15} /></button></Tooltip>
                <Tooltip text="Delete"><button className="btn sm icon danger" aria-label="Delete" onClick={() => setDeleting(i)}><Icon name="trash" size={15} /></button></Tooltip>
                {settings.selectedInstanceId !== i.id && <button className="btn sm" onClick={() => update({ selectedInstanceId: i.id })}>Select</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
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
