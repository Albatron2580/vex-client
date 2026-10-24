import { tr } from "../lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice, SearchBar, Segmented, Select } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { ProjectType, SearchHit } from "../vex";

const TYPES: { value: ProjectType; label: string }[] = [{ value: "mod", label: tr("Mods") }, { value: "shader", label: tr("Shaders") }, { value: "resourcepack", label: tr("Resource packs") }];
const SORTS = [{ value: "relevance", label: tr("Best match") }, { value: "downloads", label: tr("Most downloaded") }, { value: "updated", label: tr("Recently updated") }, { value: "newest", label: tr("Newest") }];
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** Mods: browse Modrinth and install straight into an instance. */
export function ModsPage() {
  const { instances, settings, update, toast, desktop, game } = useApp();
  const [type, setType] = useState<ProjectType>("mod");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, string>>({});
  const inst = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  const reqId = useRef(0);
  const running = !!inst && game.state !== "idle" && game.profileId === inst.id;

  const load = useCallback(async (offset: number) => {
    if (!desktop) return;
    const my = ++reqId.current;
    setError(null);
    try {
      const r = await vex().modrinth.search({ query, type, instanceId: inst?.id ?? null, sort, offset });
      if (my !== reqId.current) return;
      setTotal(r.total);
      setHits((cur) => (offset ? [...(cur ?? []), ...r.hits] : r.hits));
    } catch (e) { if (my === reqId.current) { setError(errMsg(e)); setHits((c) => c ?? []); } }
  }, [desktop, query, type, inst?.id, sort]);

  useEffect(() => { const t = setTimeout(() => { setHits(null); load(0); }, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    if (!inst || !desktop) return;
    vex().modrinth.installed(inst.id, type).then((ids) => setInstalled(new Set(ids))).catch(() => setInstalled(new Set()));
  }, [inst?.id, type, desktop]);

  const install = async (h: SearchHit) => {
    if (!inst) return;
    setBusy((b) => ({ ...b, [h.id]: "Installing…" }));
    try {
      const r = await vex().modrinth.install(inst.id, h.id, type);
      setInstalled((s) => new Set(s).add(h.id));
      toast("success", tr("{0} added to {1}", h.title, inst.name), r.added.length > 1 ? tr("Also added what it needs: {0}", r.added.slice(1).join(", ")) : undefined);
    } catch (e) { toast("error", tr("Couldn't add {0}", h.title), errMsg(e)); }
    finally { setBusy((b) => { const n = { ...b }; delete n[h.id]; return n; }); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{tr("Mods")}</h1></div>
        {inst && <div className="mods-target">
          <span className="tiny faint">{tr("Install into")}</span>
          <Select<string> label={tr("Instance")} value={inst.id} onChange={(v) => update({ selectedInstanceId: v })}
            options={instances.map((i) => ({ value: i.id, label: `${i.name} · ${i.loader === "vanilla" ? "" : i.loader + " "}${i.version}` }))} />
        </div>}
      </div>

      <div className="mods-bar">
        <Segmented<ProjectType> label={tr("What to browse")} value={type} onChange={setType} options={TYPES} />
        <div style={{ flex: 1, minWidth: 200 }}><SearchBar value={query} onChange={setQuery} placeholder={tr("Search {0} on Modrinth", TYPES.find((t) => t.value === type)!.label.toLowerCase())} /></div>
        <div style={{ width: 190 }}><Select<string> label={tr("Sort")} value={sort} onChange={setSort} options={SORTS} /></div>
      </div>

      {!inst && <Notice kind="warn">{tr("Make an instance first (Instances → New). Results then show only what works with it.")}</Notice>}
      {inst && type === "mod" && inst.loader === "vanilla" && <Notice kind="warn">{inst.name} {tr("has no mod loader. Pick a Fabric, Forge or NeoForge instance to add mods.")}</Notice>}
      {running && <Notice kind="warn">{inst!.name} {tr("is running. New mods load the next time you start it.")}</Notice>}
      {error && <Notice kind="danger">{error}</Notice>}

      {hits === null ? <div className="mods-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="mod-card skeleton" />)}</div>
        : !hits.length ? <div className="empty"><Icon name="search" size={28} /><span className="small">{tr("Nothing found")}{inst ? ` for ${inst.loader === "vanilla" ? "" : inst.loader + " "}${inst.version}` : ""}.</span></div>
        : <>
            <div className="mods-grid">
              {hits.map((h) => {
                const have = installed.has(h.id), b = busy[h.id];
                const blocked = !inst || (type === "mod" && inst.loader === "vanilla");
                return (
                  <article key={h.id} className="mod-card">
                    {h.icon ? <img src={h.icon} alt="" width={52} height={52} loading="lazy" /> : <span className="mod-icon"><Icon name="cube" size={22} /></span>}
                    <div className="mod-body">
                      <div className="mod-title"><b>{h.title}</b><span className="tiny faint">by {h.author}</span></div>
                      <p className="small muted">{h.description}</p>
                      <div className="mod-meta tiny faint">
                        <span><Icon name="download" size={12} />{short(h.downloads)}</span>
                        {h.categories.slice(0, 3).map((c) => <span key={c} className="mod-tag">{c}</span>)}
                      </div>
                    </div>
                    <div className="mod-actions">
                      <button className={`btn sm ${have ? "" : "primary"}`} disabled={blocked || have || !!b} onClick={() => install(h)}>
                        {b ? <span className="spinner" /> : have ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}{b ? tr("Adding") : have ? tr("Added") : tr("Add")}
                      </button>
                      <button className="btn ghost sm icon" aria-label={tr("Open {0} on Modrinth", h.title)} title={tr("Open on Modrinth")} onClick={() => vex().files.open("url", `https://modrinth.com/${type}/${h.slug}`)}><Icon name="external" size={14} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
            {hits.length < total && <div className="row" style={{ justifyContent: "center", marginTop: 14 }}><button className="btn" onClick={() => load(hits.length)}>{tr("Show more")}</button></div>}
          </>}
    </div>
  );
}
