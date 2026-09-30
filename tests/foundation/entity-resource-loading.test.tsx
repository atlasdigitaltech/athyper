import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useAsyncResource } from "../../packages/platform/entity/runtime/form-detail/src/use-async-resource";

test("detail resource waits for readiness, avoids StrictMode double dispatch and aborts stale context", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const root = createRoot(document.getElementById("root")!);
  const calls: { key: string; signal: AbortSignal; resolve(value: string): void }[] = [];
  function Probe({ scope, ready }: { scope: string; ready: boolean }) {
    const result = useAsyncResource(scope, signal => new Promise<string>(resolve => {
      calls.push({ key: scope, signal, resolve });
    }), [], ready);
    return <span>{result.data ?? "loading"}</span>;
  }
  const render = (scope: string, ready: boolean) => act(async () => {
    root.render(<React.StrictMode><Probe scope={scope} ready={ready}/></React.StrictMode>);
  });
  try {
    await render("initial", false);
    assert.equal(calls.length, 0);
    await render("a", true);
    assert.equal(calls.length, 1);
    await render("b", true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].signal.aborted, true);
    await act(async () => calls[0].resolve("old principal"));
    assert.equal(document.getElementById("root")!.textContent, "loading");
    await act(async () => calls[1].resolve("current principal"));
    assert.equal(document.getElementById("root")!.textContent, "current principal");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
