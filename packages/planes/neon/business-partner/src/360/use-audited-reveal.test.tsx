// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAuditedReveal } from "./use-audited-reveal";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let api: ReturnType<typeof useAuditedReveal>;
const div = document.createElement("div");
const root = createRoot(div);
function Probe({ scope }: { scope: string }) {
  api = useAuditedReveal(scope);
  return <span>{api.value ?? "masked"}</span>;
}
afterEach(async () => {
  await act(async () => root.render(null));
  vi.useRealTimers();
});
it("clears a successful reveal at expiry and after a denied retry", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<Probe scope="company-a" />));
  await act(async () =>
    api.run(async () => ({
      value: "synthetic",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    })),
  );
  expect(div.textContent).toBe("synthetic");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(div.textContent).toBe("masked");
  await act(async () =>
    api.run(async () => ({
      value: "synthetic",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    })),
  );
  await act(async () =>
    api.run(async () => {
      throw Error("403");
    }),
  );
  expect(div.textContent).toBe("masked");
  expect(api.failed).toBe(true);
});
it("aborts stale requests and prevents disclosure after a company switch", async () => {
  let resolve!: (r: any) => void;
  let signal!: AbortSignal;
  await act(async () => root.render(<Probe scope="company-a" />));
  let pending!: Promise<void>;
  await act(async () => {
    pending = api.run((s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    });
  });
  await act(async () => root.render(<Probe scope="company-b" />));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve({
      value: "old-company-value",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    await pending;
  });
  expect(div.textContent).toBe("masked");
});
it("rejects expired and invalid expiry responses", async () => {
  await act(async () => root.render(<Probe scope="a" />));
  for (const expiresAt of ["invalid", new Date(Date.now() - 1).toISOString()]) {
    await act(async () =>
      api.run(async () => ({ value: "synthetic", expiresAt })),
    );
    expect(div.textContent).toBe("masked");
    expect(api.failed).toBe(true);
  }
});
