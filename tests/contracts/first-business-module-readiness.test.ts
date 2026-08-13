import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createOperation } from "@athyper/platform-api-client";
import { createAccessSnapshot, decideRouteAccess } from "@athyper/platform-shell-runtime/core";
import { createServerQueryClient } from "@athyper/platform-query/server";

test("a business slice composes existing transport, access, query, provider, UI, and shell extension points", () => {
  const operation = createOperation<{ id: string }>({ method: "GET", path: "/api/invoices/:invoiceId", parse: (value) => value as { id: string } });
  assert.equal(operation.method, "GET");
  const access = createAccessSnapshot({ sessionState: "authenticated", contextAvailable: true, entitledModules: ["acc"], knownModules: ["acc"], permissions: ["finance.invoice.read"], knownPermissions: ["finance.invoice.read"], features: { "finance.invoice_ui": { enabled: true } }, knownFeatures: ["finance.invoice_ui"] });
  assert.equal(decideRouteAccess(access, { moduleCode: "acc", requiredPermissions: ["finance.invoice.read"], requiredFeatures: ["finance.invoice_ui"] }).allowed, true);
  const query = createServerQueryClient(); assert.equal(query.getDefaultOptions().mutations?.retry, false); query.clear();
  const foundation = readFileSync("packages/platform/shell/app-foundation/src/index.tsx", "utf8"), ui = JSON.parse(readFileSync("packages/platform/foundation/ui/package.json", "utf8")), surfaces = JSON.parse(readFileSync("packages/platform/foundation/surface-kit/package.json", "utf8"));
  for (const api of ["useApiClient", "PermissionGate", "FeatureGate", "RouteGuard", "runGuardedMutation"]) assert.ok(foundation.includes(api), `missing ${api}`);
  assert.ok(ui.exports["."]); assert.ok(surfaces.exports["."]);
});

test("the extension guide prohibits replacement infrastructure", () => {
  const guide = readFileSync("docs/architecture/frontend-first-business-module.md", "utf8");
  for (const phrase of ["fetch wrapper", "bearer token", "auth flow", "provider root", "raw permission parser", "cohort evaluator", "navigation mirror"]) assert.match(guide, new RegExp(phrase, "i"));
});
