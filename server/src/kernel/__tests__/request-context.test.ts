// server/src/kernel/__tests__/request-context.test.ts
//
// Unit tests for the AsyncLocalStorage request context.
//
// Exit criteria for Phase 3:
//   ✓ getContext() throws outside any context scope
//   ✓ tryGetContext() returns undefined outside any context scope
//   ✓ runWithContext() provides context to the wrapped function
//   ✓ Context is not visible outside the run boundary
//   ✓ Contexts are isolated — concurrent runWithContext() calls don't bleed
//   ✓ Child async tasks inherit parent context (standard ALS behaviour)
//   ✓ runWithJobContext() provides context for async handlers without error
//   ✓ runWithJobContext() generates requestId when payload omits it
//   ✓ BullMQ worker scenario — handler calls getContext() without outside-scope error

import { describe, it, expect } from "vitest";
import {
  getContext,
  tryGetContext,
  runWithContext,
  runWithJobContext,
} from "../request-context.js";

// ─── getContext() ─────────────────────────────────────────────────────────────

describe("getContext()", () => {
  it("throws when called outside any context scope", () => {
    expect(() => getContext()).toThrow("outside request scope");
  });
});

// ─── tryGetContext() ──────────────────────────────────────────────────────────

describe("tryGetContext()", () => {
  it("returns undefined when called outside any context scope", () => {
    expect(tryGetContext()).toBeUndefined();
  });
});

// ─── runWithContext() ─────────────────────────────────────────────────────────

describe("runWithContext()", () => {
  it("provides context to the wrapped function", () => {
    const ctx = { requestId: "req-001", realm: "athyper" };
    runWithContext(ctx, () => {
      expect(getContext()).toStrictEqual(ctx);
    });
  });

  it("context is not visible outside the run boundary", () => {
    runWithContext({ requestId: "req-002" }, () => { /* no-op */ });
    expect(tryGetContext()).toBeUndefined();
  });

  it("isolates concurrent contexts — no bleed between parallel runs", async () => {
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) =>
        runWithContext({ requestId: "req-a" }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push(getContext().requestId);
          resolve();
        }),
      ),
      new Promise<void>((resolve) =>
        runWithContext({ requestId: "req-b" }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          results.push(getContext().requestId);
          resolve();
        }),
      ),
    ]);

    // Each async chain saw its own context despite overlapping execution.
    expect(results).toHaveLength(2);
    expect(results).toContain("req-a");
    expect(results).toContain("req-b");
  });

  it("child async tasks inherit the parent context", async () => {
    let childCtxId: string | undefined;

    await new Promise<void>((resolve) =>
      runWithContext({ requestId: "req-parent" }, async () => {
        await Promise.resolve(); // yield — child microtask
        childCtxId = getContext().requestId;
        resolve();
      }),
    );

    expect(childCtxId).toBe("req-parent");
  });
});

// ─── runWithJobContext() ──────────────────────────────────────────────────────

describe("runWithJobContext()", () => {
  it("provides context for async job handlers without error", async () => {
    let seenCtx: ReturnType<typeof getContext> | undefined;

    await runWithJobContext({ requestId: "job-001", realm: "athyper" }, async () => {
      seenCtx = getContext();
    });

    expect(seenCtx).toMatchObject({ requestId: "job-001", realm: "athyper" });
  });

  it("generates a requestId when the payload omits it", async () => {
    let seenId: string | undefined;

    await runWithJobContext({}, async () => {
      seenId = getContext().requestId;
    });

    // Must be a valid v4 UUID
    expect(seenId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("BullMQ worker scenario — handler calls getContext() without outside-scope error", async () => {
    // Simulates a BullMQ job processor entry point:
    //   const process = async (job) =>
    //     runWithJobContext({ requestId: job.data.requestId }, () => handler(job));
    const simulatedJobData = { requestId: "job-abc", tenantId: "tenant-x" };

    const result = await runWithJobContext(simulatedJobData, async () => {
      const ctx = getContext(); // must not throw
      return ctx.requestId;
    });

    expect(result).toBe("job-abc");
  });

  it("context set by runWithJobContext is not visible after the handler resolves", async () => {
    await runWithJobContext({ requestId: "job-scoped" }, async () => {
      expect(getContext().requestId).toBe("job-scoped");
    });
    // Outside the job handler — no context leak
    expect(tryGetContext()).toBeUndefined();
  });
});
