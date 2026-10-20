// Access to the Electron bridge. When the UI is opened in a plain browser (design preview),
// calls fail with a clear message instead of pretending to work.
export function vex() {
  if (!window.vex) throw new Error("This action needs the VEX CLIENT desktop app.");
  return window.vex;
}
export const hasBridge = () => !!window.vex;
export const errMsg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
