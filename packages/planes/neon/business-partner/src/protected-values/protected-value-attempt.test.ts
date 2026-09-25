import { afterEach, expect, it, vi } from "vitest";
import { createProtectedValueAttempt } from "@athyper/platform-entity-form-detail/record";

afterEach(() => vi.useRealTimers());
it("cancels transport and expiry idempotently, without retaining protected data", () => {
  vi.useFakeTimers();
  const attempt = createProtectedValueAttempt(), expired = vi.fn();
  attempt.expireIn(100, expired);
  expect(vi.getTimerCount()).toBe(1);
  attempt.cancel(); attempt.cancel();
  expect(attempt.controller.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  attempt.expireIn(100, expired);
  vi.advanceTimersByTime(1000);
  expect(expired).not.toHaveBeenCalled();
  expect(attempt).not.toHaveProperty("value");
});
it("replaces its own expiry timer without affecting another attempt", () => {
  vi.useFakeTimers();
  const first = createProtectedValueAttempt(), second = createProtectedValueAttempt();
  const old = vi.fn(), current = vi.fn(), other = vi.fn();
  first.expireIn(100, old); first.expireIn(200, current); second.expireIn(100, other);
  vi.advanceTimersByTime(100);
  expect(old).not.toHaveBeenCalled(); expect(other).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(100);
  expect(current).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  first.cancel(); second.cancel();
});
it("allows the owning UI to clear and abort on expiry", () => {
  vi.useFakeTimers();
  const attempt = createProtectedValueAttempt();
  attempt.expireIn(100, () => attempt.cancel());
  vi.advanceTimersByTime(100);
  expect(attempt.controller.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
