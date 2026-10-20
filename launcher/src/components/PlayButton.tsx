import { useApp } from "../state/AppState";
import { Icon } from "./Icon";
import { Tooltip } from "./ui";
import { vex } from "../lib/bridge";

/** Play / progress / Stop for the selected instance. `big` is the Home hero version. */
export function PlayButton({ big }: { big?: boolean }) {
  const { instances, settings, ms, game, play, go, t } = useApp();
  const sel = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  const active = ms?.accounts.find((a) => a.active);
  const busyHere = game.state !== "idle";
  const cls = big ? "play-btn" : "playbar-play";

  if (game.state === "running") return (
    <button className={cls} onClick={() => vex().game.stop()} title="Close Minecraft"><Icon name="close" size={big ? 20 : 14} />{big ? "STOP" : "Stop"}</button>
  );
  if (game.state === "starting") return (
    <button className={`${cls} busy`} disabled aria-busy="true"><span className="spinner" style={{ borderTopColor: "#fff" }} />{big ? "STARTING" : "Starting"}</button>
  );
  const reason = !sel ? "Create an instance first." : !active ? "Add a Microsoft account first (bottom left)." : active.needsLogin ? `Sign in to ${active.name} again (bottom left).` : null;
  const btn = (
    <button className={cls} disabled={!!reason || busyHere} onClick={() => (sel ? play(sel.id) : go("instances"))}>
      <Icon name="play" size={big ? 22 : 14} />{big ? t("home.play") : "Play"}
    </button>
  );
  return reason ? <Tooltip text={reason}>{btn}</Tooltip> : btn;
}

/** Status line + progress bar while Minecraft is getting ready. */
export function GameProgress() {
  const { game } = useApp();
  if (game.state === "idle") return null;
  return (
    <div className="game-progress" role="status">
      <span className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.task ? game.task.label : game.status}</span>
      {game.state === "starting" && <div className={`progress ${game.task?.pct == null ? "indeterminate" : ""}`} style={{ height: 4 }}><i style={{ ["--pct" as any]: `${game.task?.pct ?? 0}%` }} /></div>}
    </div>
  );
}
