import { useEffect, useState } from "react";
import { Card } from "../components/ui";
import { useApp } from "../state/AppState";
import { vex } from "../lib/bridge";

const ROADMAP: { name: string; status: "ready" | "next" | "planned"; note: string }[] = [
  { name: "Launcher design system & themes", status: "ready", note: "Six presets plus your own custom themes." },
  { name: "Custom Totem packs", status: "ready", note: "Classic, Arms Out and Big Head, 1.20 → 26.x." },
  { name: "Skin Lookup & library", status: "ready", note: "Official Mojang API; skins stay on your PC." },
  { name: "Crosshair Designer", status: "ready", note: "Pixel editor, presets, PNG and resource pack export." },
  { name: "Custom Sky", status: "ready", note: "Any image → seamless sky pack (needs Nuit or OptiFine)." },
  { name: "Desktop & Start menu shortcuts", status: "ready", note: "Added by the installer; toggle in Settings." },
  { name: "Instance manager", status: "ready", note: "Create, edit and organise instances." },
  { name: "Microsoft sign-in, game install & launch", status: "next", note: "Stage 4 — official auth, Mojang downloads, Fabric." },
  { name: "In-game radial menu, GUI settings, theme editor", status: "planned", note: "Stage 5 — Fabric mod." },
  { name: "Launcher ↔ client config sync", status: "planned", note: "Stage 6 — shared theme & settings files." },
  { name: "Friends & cosmetics shop", status: "planned", note: "Needs a VEX online service." },
];

export function DiscoverPage() {
  const { desktop } = useApp();
  const [latest, setLatest] = useState<{ release: string | null; count: number } | null>(null);
  useEffect(() => { if (desktop) vex().versions().then((v) => setLatest({ release: v.latest, count: v.versions.filter((x) => x.type === "release").length })).catch(() => {}); }, [desktop]);
  return (
    <div className="page">
      <div className="page-head"><div><span className="eyebrow">About</span><h1>Discover</h1><p>What VEX CLIENT does today and what's coming.</p></div></div>
      <div className="grid grid-3">
        <Card title="Latest Minecraft" icon="sparkle">
          <div style={{ font: "700 34px var(--font-display)" }}>{latest?.release ?? "—"}</div>
          <p className="small muted">{latest ? `${latest.count} release versions available for instances.` : "Loads from Mojang's version list."}</p>
        </Card>
        <Card title="Built for Fabric" icon="cube"><p className="small muted">The in-game VEX client is a Fabric mod, kept separate from this launcher and connected through documented JSON config files.</p></Card>
        <Card title="Safe by design" icon="lock"><p className="small muted">VEX never asks for your Microsoft password. Sign-in will use Microsoft's own login page, and tokens are stored with Windows' encrypted storage.</p></Card>
      </div>
      <Card title="Roadmap" icon="features">
        <div className="stack" style={{ gap: 4 }}>
          {ROADMAP.map((r) => (
            <div key={r.name} className="list-item">
              <span className={`chip ${r.status === "ready" ? "ok" : r.status === "next" ? "accent" : ""}`} style={{ minWidth: 76, justifyContent: "center" }}>{r.status === "ready" ? "Ready" : r.status === "next" ? "Next" : "Planned"}</span>
              <b className="small">{r.name}</b><span className="small faint" style={{ marginLeft: "auto", textAlign: "right" }}>{r.note}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="tiny faint">Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
    </div>
  );
}
