import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiTransportError } from "@athyper/platform-api-client";
import { AppErrorBoundary, AppLoadingBoundary, NotFoundBoundary, classifyAppError, createRedactedBoundaryEvent, resolveProfileColorMode, safeLocalReturnTo } from "@athyper/platform-shell-app-foundation";

for (const app of ["neon", "mesh", "studio"]) {
  for (const route of ["error", "(shell)/error", "global-error"]) {
    test(`${app}/${route} retries server rendering or reloads the document`, async () => {
      const { default: Boundary } = await import(`../../apps/${app}/app/${route}.tsx`);
      const global = route === "global-error";
      const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test/work" });
      let reloads = 0;
      let retries = 0;
      let resets = 0;
      const browserWindow = new Proxy(dom.window, {
        get(target, key) {
          return key === "location" ? { reload: () => { reloads++; } } : Reflect.get(target, key);
        },
      });
      const previous = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
      Object.defineProperties(globalThis, { window: { configurable: true, value: browserWindow }, document: { configurable: true, value: dom.window.document }, navigator: { configurable: true, value: dom.window.navigator }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } });
      const root = createRoot(global ? dom.window.document : dom.window.document.getElementById("root")!);
      try {
        const props = { error: Object.assign(new Error("Temporary failure"), { status: 503 }), reset: () => { resets++; } };
        await act(async () => root.render(<Boundary {...props} retry={() => { retries++; }} />));
        const clickRetry = async () => {
          const button = dom.window.document.querySelector("button")!;
          assert.equal(button.textContent, "Try again");
          assert.equal(button.disabled, false);
          await act(async () => button.click());
        };
        await clickRetry();
        assert.equal(retries, global ? 0 : 1);
        assert.equal(reloads, global ? 1 : 0);
        assert.equal(resets, 0, "recovery must not merely clear the error state");

        if (!global) {
          await act(async () => root.render(<Boundary {...props} />));
          await clickRetry();
          assert.equal(reloads, 1, "missing framework retry falls back to browser refresh");
          assert.equal(resets, 0);
        }
      } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key];
        dom.window.close();
      }
    });
  }
}

const cases = [
  ["authentication", new ApiTransportError("authentication", "secret bearer token", 401)],
  ["required-action", { status: 403, code: "MFA_REQUIRED" }],
  ["permission-denied", { status: 403, code: "PERMISSION_DENIED" }],
  ["context-mismatch", { status: 409, code: "AUTH_CONTEXT_MISMATCH" }],
  ["authentication", { status: 401, code: "AUTH_CONTEXT_MISMATCH" }],
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
  const bootstrap = renderToStaticMarkup(<AppLoadingBoundary kind="bootstrap" />), collapsed = renderToStaticMarkup(<AppLoadingBoundary kind="bootstrap" collapsed applicationName="Neon" planeDescriptor="Business Operating Platform" planeIconSrc="/icon.png" />), persistent = renderToStaticMarkup(<AppLoadingBoundary kind="bootstrap" collapsed applicationName="Neon" planeDescriptor="Business Operating Platform" planeIconSrc="/icon.png" planeWordmarkSrc="/lockup.svg" persistentDesktopBrand />), refresh = renderToStaticMarkup(<AppLoadingBoundary kind="refresh" />);
  assert.match(bootstrap, /aria-busy="true"/);
  assert.match(bootstrap, /a-app-loader__rail/);
  assert.match(collapsed, /data-collapsed="true"/);
  assert.match(collapsed, />›</);
  assert.doesNotMatch(collapsed, />BOP</);
  assert.match(collapsed, /a-app-loader__brand-icon/);
  assert.match(persistent, /data-desktop-brand="true"/);
  assert.match(persistent, /a-app-loader__desktop-brand/);
  assert.match(persistent, /a-app-loader__desktop-menu/);
  assert.match(persistent, /a-app-loader__brand-wordmark/);
  assert.match(persistent, /a-app-loader__header-actions/);
  assert.match(persistent, /a-app-loader__secondary-grid/);
  assert.match(persistent, /a-app-loader__activity/);
  assert.match(persistent, /a-app-loader__rail-footer/);
  assert.match(persistent, /a-app-loader__rail-profile/);
  assert.doesNotMatch(persistent, /Business Operating Platform/);
  assert.doesNotMatch(persistent, /a-app-loader__brand-icon/);
  assert.match(refresh, /Updating content/);
  assert.match(refresh, /a-app-loader__grid/);
  assert.match(refresh, /aria-live="polite"/);
});

test("authenticated error and not-found states render as shell content with recovery navigation", () => {
  const error = renderToStaticMarkup(<AppErrorBoundary error={{ status: 503 }} autoNavigate={false} surface="content" homeHref="/" />);
  const missing = renderToStaticMarkup(<NotFoundBoundary applicationName="Athyper Neon" surface="content" homeHref="/" homeLabel="Return to Neon home" />);
  assert.match(error, /<section class="a-error-surface a-error-surface--content"/);
  assert.doesNotMatch(error, /<main/);
  assert.match(error, /Try again/);
  assert.match(error, /Return to workspace/);
  assert.match(missing, /Return to Neon home/);
  assert.match(missing, /current workspace/);
});

test("profile appearance resolves explicit and operating-system themes deterministically", () => {
  assert.equal(resolveProfileColorMode("light", true, true), "light");
  assert.equal(resolveProfileColorMode("dark"), "dark");
  assert.equal(resolveProfileColorMode("high_contrast"), "high-contrast");
  assert.equal(resolveProfileColorMode("system", true, false), "dark");
  assert.equal(resolveProfileColorMode("system", true, true), "high-contrast");
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
