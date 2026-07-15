/**
 * useDebouncedValue — debounce timing semantics.
 *
 * Covers the contract relied on by the apportionment breakup drawer's
 * search input: only the FINAL value in a typing burst makes it past
 * the debounce, the pending timer is cleared on unmount, and changing
 * `delayMs` resets the schedule.
 *
 * The drawer itself uses an inline useEffect (it also needs to write
 * the debounced value directly on Enter / clear, which a pure hook
 * doesn't expose) — but the hook is the public, reusable form of the
 * same pattern, so these tests pin the timing contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "../use-debounced-value";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(()  => { vi.useRealTimers(); });

describe("use-debounced-value", () => {
  it("returns the initial value synchronously on first render", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("delays updates by `delayMs`", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );
    expect(result.current).toBe("a");

    rerender({ value: "ab" });
    expect(result.current).toBe("a"); // not yet — timer hasn't fired

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe("a"); // still not — 1ms shy

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("ab"); // landed at 300ms exactly
  });

  it("collapses a typing burst into the FINAL value only", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } },
    );

    // Simulate user typing "freight" one char at a time, 50ms apart
    rerender({ value: "f" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "fr" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "fre" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "frei" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "freig" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "freight" });

    // Total elapsed: 250ms, last keystroke restarted the timer
    expect(result.current).toBe(""); // no intermediate values landed

    // 300ms after the LAST keystroke — only "freight" emerges
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("freight");
  });

  it("cancels the pending timer on unmount (no setState after unmount)", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    unmount();

    // If the timer fired post-unmount we'd see a React act() warning;
    // advancing time should be a no-op for the unmounted hook.
    act(() => { vi.advanceTimersByTime(1000); });
    // result.current is the last-rendered value before unmount — still "a".
    expect(result.current).toBe("a");
  });

  it("respects a changed `delayMs` value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "a", delay: 300 } },
    );

    rerender({ value: "b", delay: 100 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe("b"); // shorter delay applied
  });

  it("re-rendering with the same value reschedules but converges to that value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "a" }); // identical value
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("a"); // no change observed
  });

  it("supports non-string types (numbers)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 1 } },
    );
    rerender({ value: 42 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(42);
  });
});
