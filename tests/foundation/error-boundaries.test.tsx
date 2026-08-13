import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiTransportError } from "@athyper/platform-api-client";
import { AppErrorBoundary, AppLoadingBoundary, classifyAppError, createRedactedBoundaryEvent, safeLocalReturnTo } from "@athyper/platform-shell-app-foundation";

const cases = [
  ["authentication", new ApiTransportError("authentication", "secret bearer token", 401)],
  ["required-action", { status: 403, code: "MFA_REQUIRED" }],
  ["permission-denied", { status: 403, code: "PERMISSION_DENIED" }],
  ["context-mismatch", { status: 409, code: "AUTH_CONTEXT_MISMATCH" }],
  ["conflict", new ApiTransportError("conflict", "secret", 409)],
  ["validation", new ApiTransportError("validation", "secret", 422)],
  ["rate-limit", new ApiTransportError("rate-limit", "secret", 429, undefined, "req-rate", undefined, "9999")],
  ["service-unavailable", new ApiTransportError("dependency", "postgres sql secret", 503, undefined, "req-503")],
  ["network", new ApiTransportError("network", "https://internal.example", 0)],
  ["unexpected", new Error("password=never-render-this")],
] as const;

test("classifies the complete application error taxonomy", () => {
  for (const [kind, error] of cases) assert.equal(classifyAppError({ error, online: true }).kind, kind);
  assert.equal(classifyAppError({ error: new ApiTransportError("network", "secret"), online: false }).kind, "offline");
});

test("keeps conflict and validation input, bounds retry guidance, and sanitizes identifiers", () => {
  assert.equal(classifyAppError({ error: { status: 409 } }).preserveInput, true);
  assert.equal(classifyAppError({ error: { status: 422 } }).preserveInput, true);
  assert.equal(classifyAppError({ error: { status: 429 }, retryAfter: "9999" }).retryAfterSeconds, 300);
  assert.equal(classifyAppError({ error: { status: 503, requestId: "<script>" } }).requestId, undefined);
});

test("renders no raw error details and emits only redacted telemetry", () => {
  const error = Object.assign(new Error("Bearer private-token SQL select * from tenant"), { digest: "safe_digest", stack: "internal-url" });
  const model = classifyAppError({ error });
  const markup = renderToStaticMarkup(<AppErrorBoundary error={error} autoNavigate={false} />);
  assert.doesNotMatch(markup, /private-token|select \*|internal-url|Bearer/);
  assert.deepEqual(createRedactedBoundaryEvent(error, model), { name: "app_boundary_error", kind: "unexpected", digest: "safe_digest" });
});

test("rejects unsafe return paths", () => {
  assert.equal(safeLocalReturnTo("//evil.example"), "/");
  assert.equal(safeLocalReturnTo("/ok?next=1"), "/ok?next=1");
  assert.equal(safeLocalReturnTo("/bad\\path"), "/");
});

test("loading markup distinguishes stable bootstrap and local refresh states", () => {
  const bootstrap = renderToStaticMarkup(<AppLoadingBoundary kind="bootstrap" />), refresh = renderToStaticMarkup(<AppLoadingBoundary kind="refresh" />);
  assert.match(bootstrap, /aria-busy="true"/);
  assert.match(refresh, /Updating content/);
  assert.match(refresh, /aria-live="polite"/);
});

test("route error focuses its announced heading without a provider tree", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://app.example.test/work" });
  const previous = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, navigator: { configurable: true, value: dom.window.navigator }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } });
  try {
    const root = createRoot(dom.window.document.getElementById("root")!);
    await act(async () => root.render(<AppErrorBoundary error={{ status: 403 }} autoNavigate={false} />));
    assert.equal(dom.window.document.activeElement?.id, "app-error-title");
    assert.equal(dom.window.document.querySelector("[role=alert]")?.getAttribute("aria-live"), "assertive");
    await act(async () => root.unmount());
  } finally { for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]; dom.window.close(); }
});
