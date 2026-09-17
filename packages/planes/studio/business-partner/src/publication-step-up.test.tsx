// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PublicationStepUp } from "./workbench-publication";

it("reuses verified session status and offers verification again after expiry", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        state: "authenticated",
        assurance: "elevated",
        elevationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(<PublicationStepUp canAct={() => true} />),
    );
    expect(host.textContent).toContain("Identity verified");
    expect(host.querySelector("form")).toBeNull();
    await act(async () => vi.advanceTimersByTime(60_001));
    expect(host.textContent).toContain("Verify with MFA");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
