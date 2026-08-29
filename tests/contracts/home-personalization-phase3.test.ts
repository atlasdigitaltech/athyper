import assert from "node:assert/strict";
import test from "node:test";
import { createAccessSnapshot } from "../../packages/platform/shell/shell-runtime/src/core";
import {
  DEFAULT_HOME_PERSONALIZATION,
  homePersonalizationStorageKey,
  isHomeItemAllowed,
  moveHomeWidget,
  parseHomePersonalization,
  recommendHomeItems,
  rememberHomeInteraction,
  updateHomeWidgetVisibility,
} from "../../packages/platform/shell/shell/src/home-personalization";

const access = createAccessSnapshot({
  sessionState: "authenticated",
  contextAvailable: true,
  entitledModules: ["fnd"],
  permissions: ["neon.relationship.business_partner.read"],
  features: {},
  knownModules: ["fnd"],
  knownPermissions: ["neon.relationship.business_partner.read", "neon.relationship.business_partner_request.create"],
});

test("home recommendations fail closed against the current access snapshot", () => {
  const allowed = { href: "/mdg/business-partner/partners", category: "Records", access: { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner.read"] } };
  const denied = { href: "/mdg/business-partner/new", category: "Action", access: { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner_request.create"] } };
  assert.equal(isHomeItemAllowed(allowed, access), true);
  assert.equal(isHomeItemAllowed(denied, access), false);
  assert.deepEqual(recommendHomeItems([allowed, denied], access, DEFAULT_HOME_PERSONALIZATION).map(({ item }) => item.href), [allowed.href]);
});

test("recent activity raises only an authorized destination and explains the recommendation", () => {
  const records = { href: "/mdg/business-partner/partners", category: "Records", access: { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner.read"] } };
  const overview = { href: "/mdg/business-partner", category: "Module", access: { moduleCode: "fnd" } };
  const personalized = rememberHomeInteraction(rememberHomeInteraction(DEFAULT_HOME_PERSONALIZATION, records.href, "2026-08-29T10:00:00.000Z"), records.href, "2026-08-29T11:00:00.000Z");
  const recommendations = recommendHomeItems([overview, records], access, personalized, Date.parse("2026-08-29T12:00:00.000Z"));
  assert.equal(recommendations[0]?.item.href, records.href);
  assert.equal(recommendations[0]?.reason, "Frequently opened by you");
});

test("dashboard preferences are validated, reorderable, and isolated by identity scope", () => {
  const hidden = updateHomeWidgetVisibility(DEFAULT_HOME_PERSONALIZATION, "recent", false);
  const moved = moveHomeWidget(hidden, "quick-actions", -1);
  const restored = parseHomePersonalization(JSON.parse(JSON.stringify(moved)));
  assert.equal(restored.hiddenWidgets.includes("recent"), true);
  assert.deepEqual(restored.widgetOrder.slice(0, 3), ["recommendations", "quick-actions", "workspaces"]);
  assert.notEqual(homePersonalizationStorageKey("Neon", "tenant-a", "principal-a"), homePersonalizationStorageKey("Neon", "tenant-a", "principal-b"));
  assert.notEqual(homePersonalizationStorageKey("Neon", "tenant-a", "principal-a"), homePersonalizationStorageKey("Mesh", "tenant-a", "principal-a"));
});
