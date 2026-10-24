import { tr } from "../lib/i18n";
import { useEffect, useState } from "react";
import { Notice } from "./ui";
import { Icon } from "./Icon";
import { useApp } from "../state/AppState";
import { OnlineSetupWizard } from "../features/OnlineSetupWizard";

/** "Your online service can be updated" + the button that redeploys it with the wizard. */
export function ServiceUpdate() {
  const { account } = useApp();
  const [v, setV] = useState<{ deployed: string | null; bundled: string | null } | null>(null);
  const [wizard, setWizard] = useState(false);
  useEffect(() => {
    if (!account?.configured || !window.vex) return;
    Promise.all([window.vex.online.serviceVersion(), window.vex.online.bundledServerVersion()]).then(([deployed, bundled]) => setV({ deployed, bundled }));
  }, [account?.configured, wizard]);
  if (!v?.deployed || !v.bundled || v.deployed === v.bundled) return wizard ? <OnlineSetupWizard onClose={() => setWizard(false)} /> : null;
  return (
    <>
      <Notice kind="warn"><b>{tr("Your online service can be updated")}</b> ({v.deployed} → {v.bundled}{tr(") so sign-in, Collab, admin, news and the in-game V badge work. Do this on the PC that set it up.")}
        <div style={{ marginTop: 8 }}><button className="btn primary sm" onClick={() => setWizard(true)}><Icon name="refresh" size={14} />{tr("Update online service")}</button></div></Notice>
      {wizard && <OnlineSetupWizard onClose={() => setWizard(false)} />}
    </>
  );
}
