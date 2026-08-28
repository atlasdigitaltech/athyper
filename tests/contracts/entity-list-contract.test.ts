import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeListLocationState,
  encodeListLocationState,
  parseEntityListDescriptor,
  parseEntityListResult,
  toSaveableListState,
} from "../../packages/contracts/platform/entity-list/src/index";
import { describeFilter, nextPrimarySort, visibleListFields, withoutNavigation } from "../../packages/platform/entity/runtime/list-view/src/state";

const digest = "a".repeat(64);
const descriptorPayload = {
  schemaVersion: 1,
  plane: "neon",
  entity: { code: "business_partner", label: "Business partner", pluralLabel: "Business partners", identityField: "code", detailRouteTemplate: "/app/business-partner/:recordId" },
  revision: { release: 1, descriptorHash: digest, surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list",
    title: "Business partners",
    defaultState: { filters: [], sort: [{ field: "name", direction: "asc" }], columns: ["code", "name"], density: "comfortable", mode: "table" },
    supportedModes: ["table", "compact"],
  },
  fields: [
    { key: "code", label: "Code", columnGroup: "Identification", valueKind: "string", defaultVisible: true, defaultOrder: 0, filterOperators: ["eq", "contains"], sortable: true, groupable: false, aggregations: [] },
    { key: "name", label: "Name", valueKind: "string", defaultVisible: true, defaultOrder: 1, filterOperators: ["contains"], sortable: true, groupable: false, aggregations: [] },
    { key: "status", label: "Status", valueKind: "enum", defaultVisible: true, defaultOrder: 2, filterOperators: ["eq", "in"], sortable: true, groupable: true, aggregations: ["count"] },
  ],
  actions: [{ key: "create", label: "Create", placement: "primary", selection: "none", execution: "navigate", state: "enabled", requiresPreflight: false, supportsAllMatching: false }],
  scope: { status: "ready", labels: [{ key: "company", label: "Company", value: "MY01" }], fingerprint: "c".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50, 100], maxSortLevels: 3, countMode: "none" },
} as const;

describe("entity list browser contract", () => {
  it("parses bounded descriptor-driven import and export capabilities", () => {
    const enabled = { state: "enabled", maxRecords: 5000, requiredPermission: "records.export", requiresPreflight: true, requiresApproval: false };
    const hidden = { state: "hidden", requiresPreflight: false, requiresApproval: false };
    const parsed = parseEntityListDescriptor({ ...descriptorPayload, dataOperations: { export: { currentPage: enabled, selected: enabled, filtered: enabled, all: hidden, formats: ["csv", "json", "ndjson"], defaultFormat: "csv", exportableFields: ["code", "name", "not_readable"], asynchronousThreshold: 1000 }, import: { create: hidden, update: hidden, upsert: hidden, downloadTemplate: hidden, formats: ["csv", "json"], defaultFormat: "csv", importableFields: ["name", "not_readable"], maxFileBytes: 10_000_000, maxRows: 10_000, draftOnly: false } } });
    assert.deepEqual(parsed.dataOperations?.export.exportableFields, ["code", "name"]);
    assert.deepEqual(parsed.dataOperations?.import.importableFields, ["name"]);
    assert.equal(parsed.dataOperations?.export.filtered.requiredPermission, "records.export");
  });

  it("parses a safe descriptor and drops undeclared storage coordinates", () => {
    const descriptor = parseEntityListDescriptor({ ...descriptorPayload, storage: { schema: "master", object: "business_partner" }, fields: descriptorPayload.fields.map((field) => ({ ...field, storagePath: field.key })) });
    assert.equal(descriptor.entity.identityField, "code");
    assert.equal(descriptor.fields[0]?.columnGroup, "Identification");
    assert.equal(Object.isFrozen(descriptor.fields), true);
    assert.equal("storage" in descriptor, false);
    assert.equal("storagePath" in descriptor.fields[0]!, false);
  });

  it("rejects descriptors whose identity field is not readable", () => {
    assert.throws(() => parseEntityListDescriptor({ ...descriptorPayload, entity: { ...descriptorPayload.entity, identityField: "tax_id" } }), /identityField/);
  });

  it("normalizes unknown URL fields, unsupported operators, duplicate sorts, and unsupported modes", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const state = decodeListLocationState("?q=acme&filter.status=%7B%22operator%22%3A%22eq%22%2C%22value%22%3A%22active%22%7D&filter.tax_id=%7B%22operator%22%3A%22eq%22%2C%22value%22%3A%22secret%22%7D&sort=name:desc,name:asc,tax_id:asc&cols=name,tax_id&view=board&pageSize=75", descriptor);
    assert.deepEqual(state.filters, [{ field: "status", operator: "eq", value: "active" }]);
    assert.deepEqual(state.sort, [{ field: "name", direction: "desc" }]);
    assert.deepEqual(state.columns, ["code", "name"]);
    assert.equal(state.mode, "table");
    assert.equal(state.pageSize, 50);
  });

  it("round-trips canonical location state and excludes navigation state when saving", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const state = decodeListLocationState("?q=acme&sort=status:desc:last&cols=code,status&density=compact&view=compact&vid=view-1&cursor=opaque&pageSize=100", descriptor);
    const roundTrip = decodeListLocationState(encodeListLocationState(state, descriptor), descriptor);
    assert.deepEqual(roundTrip, state);
    assert.deepEqual(toSaveableListState(state), { query: "acme", filters: [], sort: [{ field: "status", direction: "desc", nulls: "last" }], columns: ["code", "status"], density: "compact", mode: "compact" });
  });

  it("parses bounded list results and rejects totals reported as count mode none", () => {
    const result = parseEntityListResult({ schemaVersion: 1, descriptorHash: digest, scopeFingerprint: "c".repeat(64), queryHash: "d".repeat(64), rows: [{ id: "bp-1", version: 2, values: { code: "ACME", status: "active" } }], pagination: { pageSize: 1, hasNext: false, hasPrevious: false, total: 1, countMode: "exact", requestedCountMode: "exact" } });
    assert.equal(result.rows[0]?.values.code, "ACME");
    assert.throws(() => parseEntityListResult({ ...result, pagination: { ...result.pagination, countMode: "none" } }), /total is not allowed/);
  });

  it("provides deterministic Phase 1A list-state transitions", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    assert.deepEqual(nextPrimarySort([], "name"), [{ field: "name", direction: "asc" }]);
    assert.deepEqual(nextPrimarySort([{ field: "name", direction: "asc" }], "name"), [{ field: "name", direction: "desc" }]);
    assert.deepEqual(nextPrimarySort([{ field: "name", direction: "desc" }], "name"), []);
    const state = decodeListLocationState("?cols=status,code&cursor=opaque&page=3", descriptor);
    assert.deepEqual(visibleListFields(descriptor, state).map((field) => field.key), ["status", "code"]);
    assert.equal(withoutNavigation(state).cursor, undefined);
    assert.equal(withoutNavigation(state).pageIndex, 0);
    assert.equal(describeFilter({ field: "status", operator: "in", value: ["active", "draft"] }, descriptor), "Status is any of active, draft");
  });
});
