// server/src/runtimes/__tests__/liveness.test.ts
//
// F4 regression — /livez must never take a dependency on db/redis/auth.
//
// Liveness reports "is the Node event loop responsive?" — a transient dep
// flap (DB fail-over, Redis reconnect, KC slow) must not fail this probe,
// or Docker restarts the container and amplifies the outage. This test
// exists specifically to catch a common mistake: someone adding `await
// deps.db.health()` (or similar) to /livez thinking they're being thorough.

import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { livenessHandler } from "../liveness.js";

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json:   ReturnType<typeof vi.fn>;
  };
}

describe("F4 — /livez liveness handler", () => {
  it("responds 200 with { status: 'alive', ts: <number> }", () => {
    const res = mockRes();
    livenessHandler({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0]![0] as { status: string; ts: number };
    expect(body.status).toBe("alive");
    expect(typeof body.ts).toBe("number");
  });

  it("is synchronous (does not await anything)", () => {
    // If someone adds an `await deps.db.ping()` to the handler, the return
    // value changes from `void` to `Promise<void>`. Assert the function
    // returns void (not a Promise) — a structural proof of "no awaits".
    const res = mockRes();
    const result = livenessHandler({} as Request, res);
    expect(result).toBeUndefined();
  });

  it("module has zero dependency imports beyond express types", async () => {
    // Defence against the closure-over-outer-scope variant: someone imports
    // the shared deps bag into liveness.ts and closes over it. If this test
    // fails, the fix is to move that logic to /readyz (api.ts readinessHandler).
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(resolve(here, "../liveness.ts"), "utf8");

    // Strip block + line comments so the rationale comment (which intentionally
    // names ServerDeps) doesn't trigger a false positive. We only want to
    // catch *code* references.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    const forbidden = [
      "ServerDeps",
      "kernel/bootstrap",
      "@athyper/adapter-db",
      "@athyper/adapter-memorycache",
      "@athyper/adapter-auth",
      "healthChecks",
    ];
    for (const tok of forbidden) {
      expect(code, `liveness.ts must not reference '${tok}' in code`).not.toContain(tok);
    }
  });
});
