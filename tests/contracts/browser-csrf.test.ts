import assert from "node:assert/strict";
import test from "node:test";
import { readCsrfCookie, readBrowserCsrfToken } from "../../packages/platform/shell/app-foundation/src/browser-csrf";

test("coexisting production and development cookies use the active session namespace", () => {
  for (const cookies of [
    "__Host-athyper-csrf=production-token; athyper-csrf=development-token",
    "athyper-csrf=development-token; __Host-athyper-csrf=production-token",
  ]) {
    assert.equal(readCsrfCookie(cookies, false), "development-token");
    assert.equal(readCsrfCookie(cookies, true), "production-token");
  }
});

test("missing or malformed active cookie never falls back to another session namespace", () => {
  assert.equal(readCsrfCookie("__Host-athyper-csrf=old", false), undefined);
  assert.equal(readCsrfCookie("athyper-csrf=old", true), undefined);
  assert.equal(readCsrfCookie("athyper-csrf=; __Host-athyper-csrf=old", false), undefined);
  assert.equal(readCsrfCookie("athyper-csrf=%ZZ; __Host-athyper-csrf=old", false), undefined);
  assert.equal(readCsrfCookie("", false), undefined);
});

test("server rendering does not access document", () => {
  assert.equal(readBrowserCsrfToken(), undefined);
});
