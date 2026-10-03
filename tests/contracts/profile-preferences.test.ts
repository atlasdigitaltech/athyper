import assert from "node:assert/strict";
import test from "node:test";
import { entityOwnRecordOperation, parseExperienceBootstrap, updatePrincipalAppearanceOperation } from "@athyper/platform-api-client";
import { resolveEntityReadRoute } from "../../packages/contracts/platform/entity-runtime/src/routes/entity-read-route";

const scopeA: PrincipalQueryScope = { plane: "neon", tenantId: "tenant-a", principalId: "principal-a", authEpoch: 1 };
const raw = { schemaVersion: 1, state: "ready", planeKey: "neon", tenantId: scopeA.tenantId, principalId: scopeA.principalId, revision: "experience-1", identity:{displayName:"User One",secondaryLabel:"user.one",initials:"UO"},tenant:{id:scopeA.tenantId,code:"tenant-alpha",displayName:"Tenant Alpha"}, profile: { localeCode: "en-MY", languageCode: "en", timezoneCode: "Asia/Kuala_Lumpur", dateFormat: "yyyy-MM-dd", numberFormat: "latn", weekStart: 1, weekendDays: [0, 6], appearanceMode: "dark", densityCode: "compact" }, workspaces: [{ code: "finance", name: "Finance", sortOrder: 1, modules: [{ code: "invoice", name: "Invoice", sortOrder: 1, primary: true }] }], permissions: ["finance.invoice.read"], features: { "finance.invoice_v2": { code: "finance.invoice_v2", enabled: true, source: "tenant_override" } }, nextActions: [] };

test("a saved design system travels in the profile; an invalid one is dropped", () => {
  const withFamily = parseExperienceBootstrap({ ...raw, profile: { ...raw.profile, themeFamily: "atlas-mono" } });
  assert.equal(withFamily.profile.themeFamily, "atlas-mono");
  const invalid = parseExperienceBootstrap({ ...raw, profile: { ...raw.profile, themeFamily: "Not A Family" } });
  assert.equal(invalid.profile.themeFamily, undefined);
  assert.equal(parseExperienceBootstrap(raw).profile.themeFamily, undefined);
});

test("appearance saves to the principal profile; own records resolve on the server", () => {
  assert.equal(updatePrincipalAppearanceOperation.method, "PATCH");
  assert.equal(updatePrincipalAppearanceOperation.path, "/api/platform/profile/appearance");
  const path = entityOwnRecordOperation.path as (params: Record<string, string>) => string;
  assert.equal(path({ entityCode: "principal_profile" }), "/api/entity-runtime/principal_profile/own-record");
  assert.deepEqual(entityOwnRecordOperation.parse({ recordId: "abc-123" }), { recordId: "abc-123" });
  assert.throws(() => entityOwnRecordOperation.parse({ recordId: "../x" }));
});

test("/app/entity/{code}/me asks for the caller's own record, never a literal id", () => {
  assert.deepEqual(resolveEntityReadRoute("principal_profile", ["me"]), { entityCode: "principal_profile", own: true });
  assert.equal(resolveEntityReadRoute("principal_profile", ["me", "extra"]), undefined);
});
