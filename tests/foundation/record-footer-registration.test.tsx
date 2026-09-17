import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  RecordFooterProvider,
  RecordFooterSource,
  useRecordFooterSources,
} from "../../packages/platform/shell/shell/src/record-footer";

test("footer ownership survives stale cleanup and clears on scope/access changes without remounting input", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const previous = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  function Owner({
    name,
    allowed = true,
  }: {
    name: string;
    allowed?: boolean;
  }) {
    useRecordFooterSources(
      allowed
        ? [{ sourceObject: name, observedAt: "2026-09-18T00:00:00Z" }]
        : [],
    );
    return null;
  }
  function App({
    old,
    next,
    scope = "record-a",
    allowed = true,
  }: {
    old: boolean;
    next: boolean;
    scope?: string;
    allowed?: boolean;
  }) {
    return (
      <RecordFooterProvider scopeKey={scope}>
        <input defaultValue="Unsaved draft" />
        {old && <Owner key="old" name="old-source" />}
        {next && <Owner key="next" name="new-source" allowed={allowed} />}
        <RecordFooterSource />
      </RecordFooterProvider>
    );
  }
  try {
    await act(async () => root.render(<App old next={false} />));
    const input = dom.window.document.querySelector("input");
    await act(async () => root.render(<App old next />));
    assert.match(dom.window.document.body.textContent!, /new-source/);
    await act(async () => root.render(<App old={false} next />));
    assert.match(dom.window.document.body.textContent!, /new-source/);
    await act(async () =>
      root.render(<App old={false} next allowed={false} />),
    );
    assert.doesNotMatch(
      dom.window.document.body.textContent!,
      /new-source|Observed/,
    );
    await act(async () =>
      root.render(<App old={false} next={false} scope="record-b" />),
    );
    assert.doesNotMatch(dom.window.document.body.textContent!, /Data source/);
    assert.equal(dom.window.document.querySelector("input"), input);
    assert.equal(input?.value, "Unsaved draft");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous)
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete (globalThis as Record<string, unknown>)[key];
    dom.window.close();
  }
});
