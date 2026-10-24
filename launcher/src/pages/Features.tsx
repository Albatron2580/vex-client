import { tr } from "../lib/i18n";
import { useState } from "react";
import { TotemPanel } from "../features/totem/TotemPanel";
import { SkinLookupPanel } from "../features/skinLookup/SkinLookupPanel";
import { CrosshairPanel } from "../features/crosshair/CrosshairPanel";
import { SkyPanel } from "../features/sky/SkyPanel";
import type { FoundSkin } from "../features/skinLookup/useSkinLookup";

export function FeaturesPage() {
  const [forTotem, setForTotem] = useState<FoundSkin | null>(null);
  return (
    <div className="page">
      <div className="page-head"><div><h1>{tr("Features")}</h1></div></div>
      <div className="features-grid">
        <TotemPanel incoming={forTotem} />
        <SkinLookupPanel onUseForTotem={(s) => setForTotem({ ...s })} />
        <CrosshairPanel />
        <SkyPanel />
      </div>
    </div>
  );
}
