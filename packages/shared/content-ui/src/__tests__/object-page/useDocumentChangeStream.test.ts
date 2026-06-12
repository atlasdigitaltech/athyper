/**
 * useDocumentChangeStream — SSE subscribe + reconnect contract.
 *
 * Phase 12 #1: locks in the behaviors that ship Phase 11's recovery flow:
 * URL gating, event dispatch, exponential backoff, backoff reset on
 * successful reconnect, and teardown on unmount / enabled flip.
 *
 * Uses the inspectable EventSource mock from
 * `../utils/mockEventSource.ts`. Each test installs a fresh registry in
 * `beforeEach` and reads the active instance via `registry.instances`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "../utils/renderHook";
import {
  installInspectableEventSource,
  type InspectableEventSourceRegistry,
} from "../utils/mockEventSource";
import {
  useDocumentChangeStream,
  type DocumentChangeEvent,
} from "../../object-page/useDocumentChangeStream";

interface SetupOptions {
  url?: string;
  enabled?: boolean;
  reconnectBackoffMs?: number[];
}

function setup(opts: SetupOptions = {}) {
  const onEvent = vi.fn<(e: DocumentChangeEvent) => void>();
  const onConnectionStateChange = vi.fn<(s: "connecting" | "open" | "closed") => void>();
  const hook = renderHook(
    (props: SetupOptions) =>
      useDocumentChangeStream({
        url: props.url ?? "/api/records/x/y/stream",
        enabled: props.enabled ?? true,
        onEvent,
        onConnectionStateChange,
        reconnectBackoffMs: props.reconnectBackoffMs,
      }),
    { initialProps: opts },
  );
  return { hook, onEvent, onConnectionStateChange };
}

describe("useDocumentChangeStream", () => {
  let registry: InspectableEventSourceRegistry;

  beforeEach(() => {
    registry = installInspectableEventSource();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    registry.cleanup();
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it("constructs an EventSource with the given URL when enabled", () => {
    setup({ url: "/api/records/foo/123/stream" });
    expect(registry.instances).toHaveLength(1);
    expect(registry.instances[0]?.url).toBe("/api/records/foo/123/stream");
  });

  it("does NOT construct an EventSource when enabled=false", () => {
    setup({ enabled: false });
    expect(registry.instances).toHaveLength(0);
  });

  it("closes the EventSource when enabled flips true → false", () => {
    const { hook } = setup({ enabled: true });
    expect(registry.instances).toHaveLength(1);
    const instance = registry.instances[0]!;

    hook.rerender({ enabled: false });
    expect(instance.closed).toBe(true);
  });

  it("closes the EventSource on unmount", () => {
    const { hook } = setup();
    const instance = registry.instances[0]!;
    hook.unmount();
    expect(instance.closed).toBe(true);
  });

  it("reopens with a new EventSource when URL changes", () => {
    const { hook } = setup({ url: "/a" });
    expect(registry.instances).toHaveLength(1);
    expect(registry.instances[0]?.closed).toBe(false);

    hook.rerender({ url: "/b" });
    expect(registry.instances).toHaveLength(2);
    expect(registry.instances[0]?.closed).toBe(true);
    expect(registry.instances[1]?.url).toBe("/b");
  });

  // ── Event dispatch ────────────────────────────────────────────────────────

  it("dispatches record.statusChanged with parsed payload", () => {
    const { onEvent } = setup();
    act(() => {
      registry.instances[0]!.emitMessage(
        "record.statusChanged",
        JSON.stringify({ etag: "v2", newStatus: "approved" }),
      );
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: "record.statusChanged",
      data: { etag: "v2", newStatus: "approved" },
    });
  });

  it("dispatches record.deleted", () => {
    const { onEvent } = setup();
    act(() => {
      registry.instances[0]!.emitMessage(
        "record.deleted",
        JSON.stringify({ actorId: "u-1" }),
      );
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: "record.deleted",
      data: { actorId: "u-1" },
    });
  });

  it("dispatches record.connected", () => {
    const { onEvent } = setup();
    act(() => {
      registry.instances[0]!.emitMessage(
        "record.connected",
        JSON.stringify({ etag: "v1", status: "draft" }),
      );
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: "record.connected",
      data: { etag: "v1", status: "draft" },
    });
  });

  it("swallows malformed JSON payloads instead of throwing", () => {
    const { onEvent } = setup();
    act(() => {
      registry.instances[0]!.emitMessage("record.statusChanged", "{not json");
    });
    expect(onEvent).not.toHaveBeenCalled();
  });

  // ── Connection state transitions ─────────────────────────────────────────

  it("reports connecting → open on successful subscribe", () => {
    const { onConnectionStateChange } = setup();
    expect(onConnectionStateChange).toHaveBeenCalledWith("connecting");
    act(() => { registry.instances[0]!.emitOpen(); });
    expect(onConnectionStateChange).toHaveBeenCalledWith("open");
  });

  it("reports closed on error", () => {
    const { onConnectionStateChange } = setup();
    act(() => { registry.instances[0]!.emitError(); });
    expect(onConnectionStateChange).toHaveBeenCalledWith("closed");
  });

  // ── Reconnect backoff ─────────────────────────────────────────────────────

  it("schedules reconnect after default backoff[0] = 1000ms on first error", async () => {
    setup();
    expect(registry.instances).toHaveLength(1);

    act(() => { registry.instances[0]!.emitError(); });

    // Not yet at 1000ms.
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(registry.instances).toHaveLength(1);

    // At 1000ms — reconnect fires.
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(registry.instances).toHaveLength(2);
  });

  it("escalates backoff through [1000, 2000, 4000, 8000, 16000]", async () => {
    const schedule = [1000, 2000, 4000, 8000, 16000];
    setup();

    for (let i = 0; i < schedule.length; i++) {
      const current = registry.instances[i]!;
      act(() => { current.emitError(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(schedule[i]! - 1); });
      // The next instance is NOT yet created.
      expect(registry.instances).toHaveLength(i + 1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      // Now it is.
      expect(registry.instances).toHaveLength(i + 2);
    }
  });

  it("caps backoff at the last value (16000ms) past the schedule length", async () => {
    setup();
    // Burn through the 5-step default schedule.
    const schedule = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < schedule.length; i++) {
      act(() => { registry.instances[i]!.emitError(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(schedule[i]!); });
    }
    expect(registry.instances).toHaveLength(schedule.length + 1);

    // Next error should reconnect after the SAME 16000ms (capped, not larger).
    act(() => { registry.instances[schedule.length]!.emitError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15999); });
    expect(registry.instances).toHaveLength(schedule.length + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(registry.instances).toHaveLength(schedule.length + 2);
  });

  it("resets backoff to index 0 after a successful open", async () => {
    setup();

    // Error → reconnect at 1000ms.
    act(() => { registry.instances[0]!.emitError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(registry.instances).toHaveLength(2);

    // Successful open on the new instance resets the counter.
    act(() => { registry.instances[1]!.emitOpen(); });

    // Next error should reconnect after 1000ms again, NOT 2000.
    act(() => { registry.instances[1]!.emitError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(registry.instances).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(registry.instances).toHaveLength(3);
  });

  it("honors a custom backoff schedule passed via reconnectBackoffMs", async () => {
    setup({ reconnectBackoffMs: [50, 100] });
    act(() => { registry.instances[0]!.emitError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(registry.instances).toHaveLength(2);

    act(() => { registry.instances[1]!.emitError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(registry.instances).toHaveLength(3);
  });

  // ── Reconnect timer cleanup ───────────────────────────────────────────────

  it("cancels a pending reconnect timer on unmount", async () => {
    const { hook } = setup();
    act(() => { registry.instances[0]!.emitError(); });

    // Unmount BEFORE the backoff fires.
    hook.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    // No new instance was constructed.
    expect(registry.instances).toHaveLength(1);
  });

  it("cancels a pending reconnect timer when enabled flips to false", async () => {
    const { hook } = setup({ enabled: true });
    act(() => { registry.instances[0]!.emitError(); });

    hook.rerender({ enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(registry.instances).toHaveLength(1);
  });
});
