import { useState } from "react";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";

export interface PackJob { step: string; pct: number }

/** Runs build → write with honest progress; success is only reported after the file is on disk. */
export function usePackInstall() {
  const { toast, settings } = useApp();
  const [job, setJob] = useState<PackJob | null>(null);
  const run = async (mode: "install" | "zip", target: string, fileName: string, build: () => Promise<Uint8Array>) => {
    try {
      setJob({ step: "Rendering textures", pct: 20 });
      await new Promise((r) => setTimeout(r, 0));
      setJob({ step: "Packing resource pack", pct: 55 });
      const bytes = await build();
      setJob({ step: mode === "install" ? "Installing into resourcepacks" : "Choosing where to save", pct: 85 });
      if (mode === "install") {
        const r = await vex().files.installPack(target, fileName, bytes);
        setJob({ step: "Done", pct: 100 });
        toast("success", "Resource pack installed", `Saved to ${r.path.split(/[\\/]/).slice(-3).join("/")}. Enable it under Options → Resource Packs.`);
        if (settings.notifications) vex().notify("VEX CLIENT", "Resource pack installed");
      } else {
        const r = await vex().files.saveAs(fileName, "zip", bytes);
        setJob(r.ok ? { step: "Done", pct: 100 } : null);
        if (r.ok) toast("success", "Resource pack saved", r.path);
      }
    } catch (e) {
      setJob(null);
      toast("error", mode === "install" ? "Install failed" : "Couldn't save the pack", errMsg(e));
      return;
    }
    setTimeout(() => setJob(null), 1600);
  };
  return { job, run };
}
