import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { groupAvailableColumns, matchesColumnSearch, reorderColumn } from "../../packages/platform/entity/runtime/list-view/src/columns";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";
import { entityFallbackMessages, entityMessages } from "../../packages/platform/foundation/i18n/src/entity-catalogs";

const english = createIntlRuntime({ localization: createEffectiveLocalization({ uiLocale: "en", formatLocale: "en" }), messages: entityMessages("en"), fallbackMessages: entityFallbackMessages });

const field = (key: string, label: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({ key, label, valueKind, defaultVisible: false, defaultOrder: 0, filterOperators: [], sortable: false, groupable: false, aggregations: [], ...options });

describe("entity list column browser", () => {
  it("searches labels, technical keys, semantic roles, types, and metadata groups", () => {
    const country = field("registration_country_code", "Country", "string", { semanticRole: "country_code", columnGroup: "Registration" });
    assert.equal(matchesColumnSearch(country, "country"), true);
    assert.equal(matchesColumnSearch(country, "registration_country"), true);
    assert.equal(matchesColumnSearch(country, "country-code"), true);
    assert.equal(matchesColumnSearch(country, "Registration"), true);
    assert.equal(matchesColumnSearch(country, "money"), false);
  });

  it("orders recommended, authored, built-in, then declared audit groups (foundation gap 7)", () => {
    const groups = groupAvailableColumns([
      field("custom", "Custom", "string", { columnGroup: "Commercial", defaultOrder: 20 }),
      field("status", "Status", "enum"),
      field("updated_at", "Updated", "datetime", { auditRole: "updatedAt" }),
      field("owner", "Owner", "reference"),
      field("legal_name", "Legal name", "string", { defaultVisible: true }),
      field("terms", "Terms", "string", { columnGroup: "Contract", defaultOrder: 10 }),
    ], english);
    // An authored group sits after Recommended, placed by its fields' published order.
    assert.deepEqual(groups.map((group) => group.label), ["Recommended fields", "Contract", "Commercial", "Status and classification", "Related records", "Audit and system fields"]);
    assert.deepEqual(groups.map((group) => group.audit), [false, false, false, false, false, true]);
  });

  it("never reads a field's name: undeclared stamps and ids go to ordinary groups", () => {
    const groups = groupAvailableColumns([
      field("created_at", "Created", "datetime"),
      field("tenant_id", "Tenant", "string"),
      field("row_version", "Version", "integer"),
    ], english);
    assert.deepEqual(groups.map((group) => group.key), ["builtIn:general", "builtIn:dates"]);
    assert.ok(groups.every((group) => !group.audit), "no audit group without a declaration");
  });

  it("an authored group named like a built-in one stays authored", () => {
    const groups = groupAvailableColumns([
      field("notes", "Notes", "string", { columnGroup: "Audit and system fields" }),
      field("changed", "Changed", "datetime", { auditRole: "updatedAt" }),
    ], english);
    assert.deepEqual(groups.map((group) => [group.key, group.audit]), [["authored:Audit and system fields", false], ["builtIn:audit", true]]);
  });

  it("labels built-in groups from the catalogue", () => {
    const intl = { message: (id: string) => `[${id}]` };
    const groups = groupAvailableColumns([field("owner", "Owner", "reference"), field("custom", "Custom", "string", { columnGroup: "Commercial" })], intl);
    assert.deepEqual(groups.map((group) => group.label), ["Commercial", "[list.chrome.fieldGroup.related]"], english);
  });

  it("reorders before or after a target without mutating the input", () => {
    const original = ["code", "name", "status", "updated_at"];
    assert.deepEqual(reorderColumn(original, "code", "status", "after"), ["name", "status", "code", "updated_at"]);
    assert.deepEqual(reorderColumn(original, "updated_at", "name", "before"), ["code", "updated_at", "name", "status"]);
    assert.deepEqual(original, ["code", "name", "status", "updated_at"]);
  });
});
