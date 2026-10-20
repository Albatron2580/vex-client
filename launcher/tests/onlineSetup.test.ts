import { describe, it, expect, vi } from "vitest";
vi.mock("electron", () => ({ app: {}, BrowserWindow: { getAllWindows: () => [] }, shell: {} }));
import { findJson, findWorkersUrl } from "../electron/ipc/onlineSetup";

describe("online setup output parsing", () => {
  it("skips wrangler warning lines before JSON", () => {
    const out = "▲ [WARNING] Proxy environment variables detected.\n[\n  {\"uuid\":\"abc\",\"name\":\"vex-online\"}\n]\n";
    expect(findJson(out)).toEqual([{ uuid: "abc", name: "vex-online" }]);
    expect(findJson("no json here")).toBeNull();
  });
  it("finds the workers.dev address in deploy output", () => {
    expect(findWorkersUrl("Uploaded\n  https://vex-online.albatron.workers.dev\nCurrent Version ID")).toBe("https://vex-online.albatron.workers.dev");
    expect(findWorkersUrl("✘ [ERROR] You need to register a workers.dev subdomain")).toBeNull();
  });
});
