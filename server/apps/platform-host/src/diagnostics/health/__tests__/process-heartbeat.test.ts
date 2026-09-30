import { describe, expect, it, vi } from "vitest";

import { startProcessHeartbeat } from "../process-heartbeat.js";

describe("process heartbeat", () => {
  it("pushes worker liveness to statuswatch when configured", async () => {
    process.env["STATUSWATCH_WORKER_PUSH_URL"] = "http://statuswatch:3001/api/push/worker-token?ping=1";
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const heartbeat = await startProcessHeartbeat("worker", 60_000);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/push/worker-token");
    expect(url.searchParams.get("ping")).toBe("1");
    expect(url.searchParams.get("status")).toBe("up");
    await heartbeat.stop();
    request.mockRestore();
    delete process.env["STATUSWATCH_WORKER_PUSH_URL"];
  });
});
