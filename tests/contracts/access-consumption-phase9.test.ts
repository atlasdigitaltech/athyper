import assert from "node:assert/strict";
import test from "node:test";
import { accessMessage, classifyServerDenial, createAccessSnapshot, decideRouteAccess, hasAnyPermission, hasPermission, isFeatureEnabled, runGuardedMutation, type AccessFailureReason } from "../../packages/platform/shell/shell-runtime/src/core";

const requirement = { moduleCode: "acc", requiredPermissions: ["finance.invoice.read"], requiredFeatures: ["finance.invoice_ui"], navigation: "primary" as const };
function snapshot(bits: { session: boolean; context: boolean; module: boolean; permission: boolean; feature: boolean }) { return createAccessSnapshot({ sessionState: bits.session ? "authenticated" : "anonymous", contextAvailable: bits.context, entitledModules: bits.module ? ["acc"] : [], knownModules: ["acc"], permissions: bits.permission ? ["finance.invoice.read"] : [], knownPermissions: ["finance.invoice.read"], features: { "finance.invoice_ui": { enabled: bits.feature } }, knownFeatures: ["finance.invoice_ui"] }); }
function expected(bits: { session: boolean; context: boolean; module: boolean; permission: boolean; feature: boolean }): AccessFailureReason | undefined { if (!bits.session) return "session_unavailable"; if (!bits.context) return "context_unavailable"; if (!bits.module) return "not_entitled"; if (!bits.permission) return "not_permitted"; if (!bits.feature) return "feature_disabled"; return undefined; }

test("covers every session/context/module/permission/feature truth-table combination", () => {
  for (let mask = 0; mask < 32; mask++) {
    const bits = { session: Boolean(mask & 16), context: Boolean(mask & 8), module: Boolean(mask & 4), permission: Boolean(mask & 2), feature: Boolean(mask & 1) };
    const decision = decideRouteAccess(snapshot(bits), requirement), reason = expected(bits);
    assert.equal(decision.allowed, reason === undefined, `mask ${mask}`);
    assert.equal(decision.reason, reason, `mask ${mask}`);
    assert.equal(decision.presentation, reason === "not_permitted" ? "hidden" : reason === "not_entitled" || reason === "feature_disabled" ? "locked" : reason ? "unavailable" : "available", `mask ${mask}`);
  }
});

test("permission and feature consumers use exact server decisions without wildcard expansion", () => {
  const access = createAccessSnapshot({ sessionState: "authenticated", contextAvailable: true, entitledModules: ["acc"], permissions: ["finance.*", "finance.invoice.read"], features: { "finance.invoice_ui": { enabled: true }, "finance.permission-lookalike": { enabled: true } }, knownModules: ["acc"], knownPermissions: ["finance.*", "finance.invoice.read", "finance.invoice.write"], knownFeatures: ["finance.invoice_ui", "finance.permission-lookalike"] });
  assert.equal(hasPermission(access, "finance.invoice.read"), true);
  assert.equal(hasPermission(access, "finance.invoice.write"), false);
  assert.equal(hasAnyPermission(access, ["finance.invoice.write", "finance.invoice.read"]), true);
  assert.equal(isFeatureEnabled(access, "finance.invoice_ui"), true);
  assert.equal(hasPermission(access, "finance.permission-lookalike"), false, "feature flags never grant permissions");
});

test("unknown modules, permissions, and features fail closed with safe diagnostics", () => {
  const events: unknown[] = [], access = createAccessSnapshot({ sessionState: "authenticated", contextAvailable: true, entitledModules: ["acc"], permissions: [], features: {}, knownModules: ["acc"], knownPermissions: ["finance.invoice.read"], knownFeatures: ["finance.invoice_ui"], onDiagnostic: (event) => events.push(event) });
  assert.equal(decideRouteAccess(access, { ...requirement, moduleCode: "future" }).reason, "unknown_module");
  assert.equal(decideRouteAccess(access, { ...requirement, requiredPermissions: ["future.permission"] }).reason, "unknown_permission");
  assert.equal(decideRouteAccess(access, { ...requirement, requiredPermissions: [], requiredFeatures: ["future.feature"] }).reason, "unknown_feature");
  assert.deepEqual(events.map((event) => (event as { kind: string }).kind), ["unknown-module", "unknown-permission", "unknown-feature"]);
});

test("end-user messages distinguish safe states without exposing access codes", () => {
  for (const [reason, phrase] of [["context_unavailable", "context"], ["not_entitled", "plan"], ["not_permitted", "access"], ["feature_disabled", "unavailable"]] as const) { const message = accessMessage({ allowed: false, presentation: "unavailable", reason }); assert.match(message, new RegExp(phrase, "i")); assert.doesNotMatch(message, /finance|invoice|tenant-|role|group/i); }
});

test("401 and 403 server denials remain authoritative after visible-state allowance", async () => {
  assert.equal(decideRouteAccess(snapshot({ session: true, context: true, module: true, permission: true, feature: true }), requirement).allowed, true);
  assert.deepEqual(classifyServerDenial({ status: 403 }), { authoritative: true, kind: "permission", status: 403, presentation: "hidden" });
  assert.deepEqual(classifyServerDenial({ kind: "authentication", status: 0 }), { authoritative: true, kind: "session", status: 401, presentation: "unavailable" });
  let denial: unknown;
  await assert.rejects(() => runGuardedMutation(async () => { throw Object.assign(new Error("server detail"), { status: 403 }); }, (value) => { denial = value; }));
  assert.deepEqual(denial, { authoritative: true, kind: "permission", status: 403, presentation: "hidden" });
});
