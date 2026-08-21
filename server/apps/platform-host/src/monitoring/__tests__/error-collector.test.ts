import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(), setTag: vi.fn(), captureException: vi.fn(), flush: vi.fn(async () => true),
  setLevel: vi.fn(), scopeSetTag: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: sentry.init,
  setTag: sentry.setTag,
  captureException: sentry.captureException,
  flush: sentry.flush,
  withScope: (work: (scope: { setLevel: typeof sentry.setLevel; setTag: typeof sentry.scopeSetTag }) => void) =>
    work({ setLevel: sentry.setLevel, setTag: sentry.scopeSetTag }),
}));

describe("Sentry-compatible exception collection", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    delete process.env["GLITCHTIP_DSN"]; delete process.env["SENTRY_DSN"];
    delete process.env["SENTRY_TRACES_SAMPLE_RATE"]; delete process.env["MODE"];
  });
  afterEach(() => { delete process.env["GLITCHTIP_DSN"]; delete process.env["SENTRY_DSN"]; });

  it("is an explicit no-op when no DSN is configured", async () => {
    const collector = await import("../error-collector.js");
    collector.initializeErrorCollector();
    collector.captureOperationalError(new Error("not sent"));
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    await expect(collector.flushErrorCollector()).resolves.toBe(true);
  });

  it("captures operational and fatal exception paths and flushes on shutdown", async () => {
    process.env["SENTRY_DSN"] = "https://public@example.invalid/1";
    process.env["SENTRY_TRACES_SAMPLE_RATE"] = "0.25";
    process.env["MODE"] = "worker";
    const collector = await import("../error-collector.js");
    collector.initializeErrorCollector();
    const operational = new Error("delivery failed"), fatal = new Error("boot failed");
    collector.captureOperationalError(operational, { component: "integration-delivery" });
    collector.captureFatalError(fatal, "boot");
    await collector.flushErrorCollector(500);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: process.env["SENTRY_DSN"], tracesSampleRate: 0.25, serverName: "athyper-platform-worker",
    }));
    expect(sentry.captureException).toHaveBeenNthCalledWith(1, operational);
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, fatal);
    expect(sentry.scopeSetTag).toHaveBeenCalledWith("component", "integration-delivery");
    expect(sentry.scopeSetTag).toHaveBeenCalledWith("failure.phase", "boot");
    expect(sentry.setLevel).toHaveBeenCalledWith("fatal");
    expect(sentry.flush).toHaveBeenCalledWith(500);
  });
});
