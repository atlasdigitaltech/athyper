import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT,
  RuntimeListIntentPrefetchLink,
  isIntentPrefetchEligible,
  type RuntimeListIntentPrefetchTarget,
} from "../runtime-list-intent-prefetch";

const prefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch }),
}));

const intentTarget: RuntimeListIntentPrefetchTarget = {
  entityCode: "journal_entry",
  href: "/app/journal_entry",
  label: "Journal entries",
  policy: { mode: "stale_while_revalidate", prefetch: "intent" },
};

describe("RuntimeListIntentPrefetchLink", () => {
  beforeEach(() => {
    prefetch.mockReset();
    window.sessionStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it("prefetches once on focus and emits measurable diagnostics", () => {
    const diagnostic = vi.fn();
    window.addEventListener(RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT, diagnostic);
    render(<RuntimeListIntentPrefetchLink target={intentTarget} />);

    const link = screen.getByRole("link", { name: "Journal entries" });
    fireEvent.focus(link);
    fireEvent.pointerEnter(link);

    expect(prefetch).toHaveBeenCalledOnce();
    expect(prefetch).toHaveBeenCalledWith("/app/journal_entry");
    expect(diagnostic).toHaveBeenCalled();
    expect((diagnostic.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      entityCode: "journal_entry",
      stage: "scheduled",
      intent: "focus",
    });
    expect(window.sessionStorage.getItem("athyper:runtime-list-prefetch:journal_entry")).toContain("focus");
    window.removeEventListener(RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT, diagnostic);
  });

  it("does not activate viewport, eager, disabled, or none policies", () => {
    for (const target of [
      { ...intentTarget, policy: { ...intentTarget.policy, prefetch: "viewport" as const } },
      { ...intentTarget, policy: { ...intentTarget.policy, prefetch: "eager" as const } },
      { ...intentTarget, policy: { ...intentTarget.policy, prefetch: "none" as const } },
      { ...intentTarget, policy: { ...intentTarget.policy, mode: "disabled" as const } },
    ]) {
      expect(isIntentPrefetchEligible(target)).toBe(false);
    }

    render(<RuntimeListIntentPrefetchLink target={{
      ...intentTarget,
      policy: { ...intentTarget.policy, prefetch: "viewport" },
    }} />);
    fireEvent.focus(screen.getByRole("link", { name: "Journal entries" }));
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("waits for sustained hover intent before prefetching", () => {
    vi.useFakeTimers();
    render(<RuntimeListIntentPrefetchLink target={intentTarget} />);
    const link = screen.getByRole("link", { name: "Journal entries" });

    fireEvent.pointerEnter(link);
    vi.advanceTimersByTime(59);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prefetch).toHaveBeenCalledOnce();
  });
});
