import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGlitchTipTelemetryListener,
  type SentryLike,
} from "../glitchtip-bridge";
import type { AddItemTelemetryEvent } from "../events";

// ─────────────────────────────────────────────────────────────────────────────
// GlitchTip bridge — event-shape unit tests. Asserts the right Sentry call
// (captureException / captureMessage / addBreadcrumb) for each of the eight
// AddItemTelemetryEvent types, plus tag / extra / level / fallback semantics.
// ─────────────────────────────────────────────────────────────────────────────

type SentryMock = SentryLike & {
  captureException: ReturnType<typeof vi.fn>;
  captureMessage: ReturnType<typeof vi.fn>;
  addBreadcrumb: ReturnType<typeof vi.fn>;
};

function makeSentryMock(): SentryMock {
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  } as unknown as SentryMock;
}

function stampedEvent<E extends AddItemTelemetryEvent>(event: E): E {
  // Bridge consumes already-stamped events from the dispatcher.
  return event;
}

describe("createGlitchTipTelemetryListener — adapter.reject", () => {
  it("captures as 'error' message including the rejection code", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "adapter.reject",
      seq: 1,
      at: 0,
      adapterId: "open_po_line",
      code: "duplicate_id",
      reason: "Source adapter \"open_po_line\" is already registered",
    }));
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("reject open_po_line (duplicate_id)"),
      "error",
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("createGlitchTipTelemetryListener — picker.fetch.fail", () => {
  it("captures as exception with source_adapter + source_phase tags", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "picker.fetch.fail",
      seq: 2,
      at: 0,
      adapterId: "catalog",
      durationMs: 1234,
      error: "Backend 500",
    }));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = sentry.captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Backend 500");
    expect(ctx).toMatchObject({
      tags: { source_adapter: "catalog", source_phase: "picker.fetch" },
      extra: { durationMs: "1234", seq: "2" },
    });
  });
});

describe("createGlitchTipTelemetryListener — commit.fail", () => {
  it("captures as exception with comma-joined source_adapters tag", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "commit.fail",
      seq: 3,
      at: 0,
      adapterIds: ["catalog", "open_po_line"],
      error: "Duplicate link_source_line binding",
    }));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = sentry.captureException.mock.calls[0]!;
    expect((err as Error).message).toMatch(/Duplicate link_source_line/);
    expect(ctx).toMatchObject({
      tags: { source_adapters: "catalog,open_po_line", source_phase: "commit" },
    });
  });
});

describe("createGlitchTipTelemetryListener — commit.stale", () => {
  it("captures as 'warning' message when strategy=fail", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "commit.stale",
      seq: 4,
      at: 0,
      adapterId: "open_po_line",
      strategy: "fail",
      lineCount: 2,
    }));
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("stale open_po_line"),
      "warning",
    );
  });

  it("captures as 'info' message when strategy=warn", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "commit.stale",
      seq: 5,
      at: 0,
      adapterId: "catalog",
      strategy: "warn",
      lineCount: 1,
    }));
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      "info",
    );
  });
});

describe("createGlitchTipTelemetryListener — routine events as breadcrumbs", () => {
  it("addBreadcrumb for adapter.register with adapterId + version", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "adapter.register",
      seq: 6,
      at: 0,
      adapterId: "catalog",
      version: 1,
    }));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "source-adapter",
      message: "adapter.register",
      level: "info",
      data: { seq: 6, adapterId: "catalog", version: 1 },
    });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("addBreadcrumb for picker.open with adapterId", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "picker.open",
      seq: 7,
      at: 0,
      adapterId: "catalog",
    }));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "source-adapter",
      message: "picker.open",
      level: "info",
      data: { seq: 7, adapterId: "catalog" },
    });
  });

  it("addBreadcrumb for picker.fetch.ok with itemCount + durationMs", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "picker.fetch.ok",
      seq: 8,
      at: 0,
      adapterId: "catalog",
      itemCount: 12,
      durationMs: 87,
    }));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "source-adapter",
      message: "picker.fetch.ok",
      level: "info",
      data: { seq: 8, adapterId: "catalog", itemCount: 12, durationMs: 87 },
    });
  });

  it("addBreadcrumb for commit.ok with adapterIds + lineCount", () => {
    const sentry = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry });
    listen(stampedEvent({
      type: "commit.ok",
      seq: 9,
      at: 0,
      adapterIds: ["catalog", "manual_invoice_line"],
      lineCount: 3,
    }));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "source-adapter",
      message: "commit.ok",
      level: "info",
      data: { seq: 9, adapterIds: ["catalog", "manual_invoice_line"], lineCount: 3 },
    });
  });
});

describe("createGlitchTipTelemetryListener — SDK resolution", () => {
  it("uses an explicitly-passed sentry option over globalThis.Sentry", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Sentry = makeSentryMock();
    const explicit = makeSentryMock();
    const listen = createGlitchTipTelemetryListener({ sentry: explicit });
    listen(stampedEvent({
      type: "picker.open",
      seq: 1,
      at: 0,
      adapterId: "catalog",
    }));
    expect(explicit.addBreadcrumb).toHaveBeenCalledTimes(1);
    // The globalThis one stays untouched.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromGlobal = (globalThis as any).Sentry as SentryMock;
    expect(fromGlobal.addBreadcrumb).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Sentry;
  });

  it("picks up globalThis.Sentry when no option supplied", () => {
    const fromGlobal = makeSentryMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Sentry = fromGlobal;
    const listen = createGlitchTipTelemetryListener();
    listen(stampedEvent({
      type: "adapter.register",
      seq: 1,
      at: 0,
      adapterId: "x",
      version: 1,
    }));
    expect(fromGlobal.addBreadcrumb).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Sentry;
  });

  it("falls back to console.debug in dev when no SDK is available", () => {
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const listen = createGlitchTipTelemetryListener();
    listen(stampedEvent({
      type: "picker.open",
      seq: 1,
      at: 0,
      adapterId: "catalog",
    }));
    expect(consoleSpy).toHaveBeenCalledWith(
      "[source-adapters][fallback]",
      "picker.open",
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it("does not throw when fallback fires for any event type", () => {
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const listen = createGlitchTipTelemetryListener();
    const events: AddItemTelemetryEvent[] = [
      { type: "adapter.register", seq: 1, at: 0, adapterId: "a", version: 1 },
      { type: "adapter.reject", seq: 2, at: 0, adapterId: "a", code: "duplicate_id", reason: "x" },
      { type: "picker.open", seq: 3, at: 0, adapterId: "a" },
      { type: "picker.fetch.ok", seq: 4, at: 0, adapterId: "a", durationMs: 1, itemCount: 0 },
      { type: "picker.fetch.fail", seq: 5, at: 0, adapterId: "a", durationMs: 1, error: "x" },
      { type: "commit.ok", seq: 6, at: 0, adapterIds: ["a"], lineCount: 1 },
      { type: "commit.fail", seq: 7, at: 0, adapterIds: ["a"], error: "x" },
      { type: "commit.stale", seq: 8, at: 0, adapterId: "a", strategy: "fail", lineCount: 1 },
    ];
    for (const e of events) {
      expect(() => listen(e)).not.toThrow();
    }
    expect(consoleSpy).toHaveBeenCalledTimes(events.length);
    consoleSpy.mockRestore();
  });
});

describe("createGlitchTipTelemetryListener — clean state", () => {
  // Make sure mutations to globalThis.Sentry inside one test don't bleed
  // into another. RTL's cleanup() handles React; this clears Sentry.
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Sentry;
  });
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Sentry;
  });

  it("isolated globalThis between tests (sentinel)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).Sentry).toBeUndefined();
  });
});
