import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "../utils/render-hook";
import { useScrollIntent } from "../../object-page/use-scroll-intent";

describe("use-scroll-intent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns isSuppressed=false initially", () => {
    const { result } = renderHook(() => useScrollIntent());
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("begin(\"focus\") does NOT suppress — focus follow is desired UX", () => {
    const { result } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("focus"));
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("begin(\"tabClick\") suppresses immediately; auto-clears after 1000ms", () => {
    const { result } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("tabClick"));
    expect(result.current.isSuppressed()).toBe(true);

    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.isSuppressed()).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("begin(\"jumpToError\") uses 1000ms suppression (same as tabClick)", () => {
    const { result } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("jumpToError"));
    expect(result.current.isSuppressed()).toBe(true);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("begin(\"modeToggle\") uses shorter 500ms suppression", () => {
    const { result } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("modeToggle"));
    expect(result.current.isSuppressed()).toBe(true);

    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current.isSuppressed()).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("rapid begin() calls reset the timer — last source wins", () => {
    const { result } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("tabClick"));     // 1000ms
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.isSuppressed()).toBe(true);

    // Re-arm with modeToggle (500ms) — old timer should be cleared.
    act(() => result.current.begin("modeToggle"));

    // Still suppressed by the new timer.
    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current.isSuppressed()).toBe(true);

    // After 500ms total from the second begin(), suppression clears.
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.isSuppressed()).toBe(false);
  });

  it("unmount clears any pending timer (no lingering state)", () => {
    const { result, unmount } = renderHook(() => useScrollIntent());
    act(() => result.current.begin("tabClick"));
    expect(result.current.isSuppressed()).toBe(true);

    unmount();

    // After unmount, advancing the timer should not throw or trigger anything
    // observable. The hook's stale state stays where it was at unmount, but
    // since the component is gone, isSuppressed() is no longer relevant —
    // the test asserts no errors thrown during cleanup.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
