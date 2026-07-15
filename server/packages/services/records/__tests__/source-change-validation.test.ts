/**
 * Server source-change validation — unit tests.
 *
 * Covers the §6 server stale-submit behavior table with a stub Kysely
 * that returns canned rows for the validator's helper queries. Real DB
 * paths are covered by integration tests once the PI seed lands.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asResolverCode, type EntityFieldDefaults } from "@athyper/cascade";
import { applyServerSourceChangeActions, buildSourceChangeErrorPayload } from "../source-change-validation.js";
import {
  registerResolver,
  resetRegistryForTests,
} from "@athyper/svc-shared";

// ── stub Kysely ────────────────────────────────────────────────────────────────

interface StubDbOpts {
  /** Whether targetPassesDependentFilter's SELECT 1 returns a row. */
  refilterPasses?: boolean;
  /** loadFieldReferenceWiring result (null = no dep filter). */
  fieldRefs?: Record<string, {
    dependentFilter: { source_field?: string; target_field?: string } | null;
    referenceEntity: string | null;
    referenceValueField: string | null;
    table_schema?: string;
    table_name?: string;
  } | null>;
}

function stubDb(opts: StubDbOpts = {}) {
  return {
    __opts: opts,
  };
}

// Mock the helper queries used by source-change-validation. We can't easily
// stub Kysely's `sql` builder, so we monkey-patch the module's internal
// helpers via test seams added by the test file pattern. Instead, the
// minimal tests below directly exercise the pure decision logic by
// pre-seeding defaultsByField (which skips loadEntityFieldDefaults entirely)
// and by injecting a synthetic db.

// ── tests ──────────────────────────────────────────────────────────────────────

const defaultsClearOnSupplier: EntityFieldDefaults = {
  on_source_change: [
    {
      sources: ["supplier_id"],
      action:  "clear",
      layers:  ["server_on_save"],
    },
  ],
};

const defaultsRederiveOnSupplier: EntityFieldDefaults = {
  on_source_change: [
    {
      sources:  ["supplier_id"],
      action:   "rederive",
      layers:   ["server_on_save"],
      resolver: "supplier.default_payment_term",
    },
  ],
};

const defaultsLockOnStatus: EntityFieldDefaults = {
  on_source_change: [
    {
      sources: ["status"],
      action:  "lock",
      layers:  ["server_on_save"],
      when:    { source_value_in: ["posted"] },
    },
  ],
};

const defaultsValidate: EntityFieldDefaults = {
  on_source_change: [
    {
      sources: ["supplier_id"],
      action:  "validate",
      layers:  ["server_on_save"],
    },
  ],
};

beforeEach(() => {
  resetRegistryForTests();
});

afterEach(() => {
  resetRegistryForTests();
});

describe("applyServerSourceChangeActions — clear", () => {
  it("auto-clears target when supplier changes and target is omitted", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", remitto_address_id: "addr-1" },
      incomingPatch: { supplier_id: "B" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { remitto_address_id: defaultsClearOnSupplier },
    });
    expect(outcome.autoCleared).toEqual(["remitto_address_id"]);
    expect(outcome.errors).toEqual([]);
  });

  it("returns 422-worthy error when stale value is submitted alongside source change", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", remitto_address_id: "addr-1" },
      incomingPatch: { supplier_id: "B", remitto_address_id: "addr-1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { remitto_address_id: defaultsClearOnSupplier },
    });
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.code).toBe("FIELD_DEPENDENCY_STALE");
    expect(outcome.autoCleared).toEqual([]);
  });

  it("accepts when user explicitly submits null alongside source change", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", remitto_address_id: "addr-1" },
      incomingPatch: { supplier_id: "B", remitto_address_id: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { remitto_address_id: defaultsClearOnSupplier },
    });
    expect(outcome.errors).toEqual([]);
    expect(outcome.autoCleared).toEqual([]); // user already submitted null
  });

  it("does nothing when source is unchanged", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", remitto_address_id: "addr-1" },
      incomingPatch: { description: "edit" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { remitto_address_id: defaultsClearOnSupplier },
    });
    expect(outcome.autoCleared).toEqual([]);
    expect(outcome.errors).toEqual([]);
  });
});

describe("applyServerSourceChangeActions — rederive", () => {
  it("auto-fills via resolver when target is unset", async () => {
    registerResolver(
      {
        code: asResolverCode("supplier.default_payment_term"),
        description: "",
        requiredSources: ["supplier_id"],
        outputType: "uuid",
      },
      async (inputs) => `${inputs["supplier_id"]}-term`,
    );

    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", payment_term_id: null },
      incomingPatch: { supplier_id: "B" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { payment_term_id: defaultsRederiveOnSupplier },
    });
    expect(outcome.autoFilled).toEqual({ payment_term_id: "B-term" });
  });

  it("honors user submission and skips rederive when target is in payload", async () => {
    registerResolver(
      {
        code: asResolverCode("supplier.default_payment_term"),
        description: "",
        requiredSources: ["supplier_id"],
        outputType: "uuid",
      },
      async () => "RESOLVER_VALUE",
    );

    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", payment_term_id: null },
      incomingPatch: { supplier_id: "B", payment_term_id: "USER_VALUE" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { payment_term_id: defaultsRederiveOnSupplier },
    });
    expect(outcome.autoFilled).toEqual({});
    expect(outcome.errors).toEqual([]);
  });

  it("does not overwrite existing non-null target", async () => {
    registerResolver(
      {
        code: asResolverCode("supplier.default_payment_term"),
        description: "",
        requiredSources: ["supplier_id"],
        outputType: "uuid",
      },
      async () => "RESOLVER_VALUE",
    );

    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", payment_term_id: "EXISTING" },
      incomingPatch: { supplier_id: "B" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { payment_term_id: defaultsRederiveOnSupplier },
    });
    expect(outcome.autoFilled).toEqual({});
  });
});

describe("applyServerSourceChangeActions — validate / lock", () => {
  it("validate always emits FIELD_DEPENDENCY_INVALID on source change", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { supplier_id: "A", remitto_address_id: "addr-1" },
      incomingPatch: { supplier_id: "B" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { remitto_address_id: defaultsValidate },
    });
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.code).toBe("FIELD_DEPENDENCY_INVALID");
  });

  it("lock 422s when target is submitted under matching source state", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { status: "draft", supplier_id: "A" },
      incomingPatch: { status: "posted", supplier_id: "B" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { supplier_id: defaultsLockOnStatus },
    });
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.code).toBe("FIELD_LOCKED");
  });

  it("lock is silent when target is not submitted", async () => {
    const outcome = await applyServerSourceChangeActions({
      entityCode:    "purchase_invoice",
      currentRow:    { status: "draft", supplier_id: "A" },
      incomingPatch: { status: "posted" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db:            stubDb() as any,
      tenantId:      "t",
      userId:        "u",
      defaultsByField: { supplier_id: defaultsLockOnStatus },
    });
    expect(outcome.errors).toEqual([]);
  });
});

describe("buildSourceChangeErrorPayload", () => {
  it("collapses errors into a fields map keyed by target", () => {
    const payload = buildSourceChangeErrorPayload([
      { code: "FIELD_DEPENDENCY_STALE", field: "remitto_address_id", sources: ["supplier_id"], reason: "source_changed", message: "x" },
      { code: "FIELD_LOCKED",           field: "supplier_id",        sources: ["status"],      reason: "source_changed", message: "y" },
    ]);
    expect(payload.error).toBe("FIELD_LOCKED"); // highest severity
    expect(Object.keys(payload.fields).sort()).toEqual(["remitto_address_id", "supplier_id"]);
    expect(payload.fields["supplier_id"]?.action).toBe("lock");
    expect(payload.fields["remitto_address_id"]?.action).toBe("clear");
  });
});
