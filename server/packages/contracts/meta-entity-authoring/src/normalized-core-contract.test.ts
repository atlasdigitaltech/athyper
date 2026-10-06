import { describe, expect, it } from "vitest";
import {
  normalizedCoreMembers,
  normalizedCoreSchema,
  validateNormalizedCoreRow,
} from "./normalized-core-contract.js";
import { parseNormalizedCoreGraph } from "./normalized-core-validation.js";
import {
  coreFixture,
  coreFixtureContext,
  coreFixtureId,
} from "./normalized-core.fixtures.js";
const edit = (work: (g: any) => void) => {
  const g = coreFixture();
  work(g);
  return g;
};
describe("normalized field/runtime/surface contract", () => {
  it("has a closed typed column for every selected core property and no JSON bags", () => {
    for (const d of Object.values(normalizedCoreMembers))
      expect(Object.values(d.columns).every((c) => c.sqlType !== "jsonb")).toBe(
        true,
      );
    const schema = normalizedCoreSchema() as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.field.items.additionalProperties).toBe(false);
    expect(
      parseNormalizedCoreGraph(coreFixture(), coreFixtureContext()),
    ).toEqual(coreFixture());
  });
  it("separates draft incompleteness from qualification completeness", () => {
    const draft = edit((g) => {
      g.field[2].dataType = "money";
      g.field[2].storageType = null;
      g.field[2].currencyCode = null;
      g.field[2].currencyFieldId = null;
      g.surface[0].labelId = null;
    });
    expect(() =>
      parseNormalizedCoreGraph(draft, coreFixtureContext("draft")),
    ).not.toThrow();
    expect(() => parseNormalizedCoreGraph(draft, coreFixtureContext())).toThrow(
      "NORMALIZED_CORE_INCOMPLETE",
    );
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[2].dataType = "money";
          g.field[2].currencyCode = "USD";
          g.field[2].currencyFieldId = coreFixtureId(2);
        }),
        coreFixtureContext("draft"),
      ),
    ).toThrow("NORMALIZED_CORE_CURRENCY_CONFLICT");
  });
  it("rejects writable service-owned identities/storage facts and unsupported legacy bags", () => {
    for (const values of [
      { fieldIdentityId: coreFixtureId(11) },
      { parentFieldId: null },
      { storageType: "text" },
      { typeConfig: {} },
      { defaultSpec: {} },
      { layoutConfig: {} },
    ])
      expect(() =>
        validateNormalizedCoreRow("field", values, true, true),
      ).toThrow();
    expect(() =>
      validateNormalizedCoreRow(
        "field",
        { labelId: coreFixtureId(31) },
        true,
        true,
      ),
    ).not.toThrow();
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => (g.surface[0].layoutConfig = {})),
        coreFixtureContext(),
      ),
    ).toThrow("FOUNDATION_UNSUPPORTED_PROPERTY");
  });
  it("rejects owner/identity/reference/conflicting/default mismatches", () => {
    for (const change of [
      (g: any) => (g.field[1].fieldIdentityId = coreFixtureId(11)),
      (g: any) => (g.field[1].labelId = coreFixtureId(999)),
      (g: any) => (g.runtime[0].idFieldId = coreFixtureId(999)),
      (g: any) => (g.surface[0].componentContractId = coreFixtureId(999)),
      (g: any) =>
        g.surface.push({
          ...g.surface[0],
          id: coreFixtureId(99),
          surfaceKey: "other",
        }),
      (g: any) => (g.field[1].parentFieldId = coreFixtureId(3)),
    ])
      expect(() =>
        parseNormalizedCoreGraph(edit(change), coreFixtureContext()),
      ).toThrow();
    expect(() =>
      parseNormalizedCoreGraph(coreFixture(), {
        ...coreFixtureContext(),
        tenantId: coreFixtureId(500),
      }),
    ).toThrow("NORMALIZED_CORE_FIELD_IDENTITY_INVALID");
  });
  it("enforces family applicability and exact arbitrary-precision range ordering", () => {
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => (g.field[1].minimum = "1")),
        coreFixtureContext(),
      ),
    ).toThrow("NORMALIZED_CORE_TYPE_OPTION_INVALID");
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[1].dataType = "decimal";
          g.field[1].minimum = "9007199254740993.0000000000000001";
          g.field[1].maximum = "9007199254740993.0000000000000000";
        }),
        coreFixtureContext("draft"),
      ),
    ).toThrow("NORMALIZED_CORE_RANGE_INVALID");
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[1].dataType = "bigint";
          g.field[1].minimum = "2.1";
        }),
        coreFixtureContext("draft"),
      ),
    ).toThrow("NORMALIZED_CORE_INTEGRAL_VALUE_REQUIRED");
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[1].dataType = "decimal";
          g.field[1].precision = 2;
          g.field[1].scale = 3;
        }),
        coreFixtureContext("draft"),
      ),
    ).toThrow("NORMALIZED_CORE_SCALE_INVALID");
  });
  it("validates real calendar bounds and preserves microsecond ordering", () => {
    for (const value of ["2026-02-29", "2024-04-31", "0000-01-01"])
      expect(() =>
        parseNormalizedCoreGraph(
          edit((g) => {
            g.field[1].dataType = "date";
            g.field[1].minimumDate = value;
          }),
          coreFixtureContext("draft"),
        ),
      ).toThrow("NORMALIZED_CORE_TEMPORAL_INVALID");
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[1].dataType = "datetime";
          g.field[1].minimumDatetime = "2026-10-06T00:00:00.000002Z";
          g.field[1].maximumDatetime = "2026-10-06T00:00:00.000001Z";
        }),
        coreFixtureContext("draft"),
      ),
    ).toThrow("NORMALIZED_CORE_RANGE_INVALID");
  });
  it("requires zero-parameter pinned resources and never evaluates a pattern with JS RegExp", () => {
    const g = edit((g) => {
      g.field[1].validationContractKey = "registered.validation";
      g.field[1].validationContractVersion = 1;
    });
    expect(() => parseNormalizedCoreGraph(g, coreFixtureContext())).toThrow(
      "NORMALIZED_CORE_RESOURCE_UNAVAILABLE",
    );
    const contract = {
      kind: "validation" as const,
      key: "registered.validation",
      version: 1,
      hash: "a".repeat(64),
      parameterCount: 0,
    };
    expect(() =>
      parseNormalizedCoreGraph(g, {
        ...coreFixtureContext(),
        contracts: [contract],
      }),
    ).not.toThrow();
    expect(() =>
      parseNormalizedCoreGraph(g, {
        ...coreFixtureContext(),
        contracts: [{ ...contract, parameterCount: 1 }],
      }),
    ).toThrow();
    const pattern = edit((g) => (g.field[1].pattern = "(?=unsupported)"));
    expect(() =>
      parseNormalizedCoreGraph(pattern, coreFixtureContext("draft")),
    ).not.toThrow();
    expect(() =>
      parseNormalizedCoreGraph(pattern, coreFixtureContext()),
    ).toThrow("NORMALIZED_CORE_PATTERN_CONTRACT_UNAVAILABLE");
  });
  it("keeps literal/default-kind/type/nullability rules distinct", () => {
    for (const change of [
      (g: any) => (g.field[1].defaultText = "x"),
      (g: any) => (g.field[1].defaultKind = "literal_null"),
      (g: any) => {
        g.field[1].writeMode = "mutable";
        g.field[1].defaultKind = "literal";
        g.field[1].defaultBoolean = true;
      },
      (g: any) => {
        g.field[1].defaultText = "x";
        g.field[1].defaultBoolean = true;
      },
    ])
      expect(() =>
        parseNormalizedCoreGraph(edit(change), coreFixtureContext()),
      ).toThrow();
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => {
          g.field[0].writeMode = "mutable";
          g.field[0].defaultKind = "literal";
          g.field[0].defaultUuid = coreFixtureId(700);
        }),
        coreFixtureContext(),
      ),
    ).toThrow("NORMALIZED_CORE_UUID_LITERAL_CONTRACT_UNAVAILABLE");
  });
  it("checks catalogue facts independently and respects runtime mode constraints", () => {
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => (g.field[1].storageType = "varchar")),
        coreFixtureContext(),
      ),
    ).toThrow("NORMALIZED_CORE_STORAGE_FACT_MISMATCH");
    expect(() =>
      parseNormalizedCoreGraph(coreFixture(), {
        ...coreFixtureContext(),
        catalogues: [],
      }),
    ).toThrow("NORMALIZED_CORE_CATALOGUE_UNAVAILABLE");
    for (const change of [
      (g: any) => (g.runtime[0].apiExposure = "none"),
      (g: any) => (g.runtime[0].createMode = "direct"),
      (g: any) => (g.runtime[0].concurrencyMode = "append_only"),
      (g: any) => (g.runtime[0].readHandlerKey = "unpaired"),
      (g: any) => {
        g.field[1].valueOrigin = "projected";
        g.field[1].writeMode = "mutable";
      },
    ])
      expect(() =>
        parseNormalizedCoreGraph(edit(change), coreFixtureContext()),
      ).toThrow();
  });
  it("rejects UUID readable identity, wrong surface properties and invalid page budgets", () => {
    for (const change of [
      (g: any) => (g.surface[0].identityFieldId = coreFixtureId(1)),
      (g: any) => (g.surface[0].titleFieldId = coreFixtureId(2)),
      (g: any) => (g.surface[0].columnCount = 2),
      (g: any) => (g.surface[0].allowedPageSizes = [25, 25]),
      (g: any) => (g.surface[0].defaultPageSize = 11),
      (g: any) => (g.surface[0].supportedModes = ["compact"]),
      (g: any) => (g.surface[0].embeddedMode = "collection"),
    ])
      expect(() =>
        parseNormalizedCoreGraph(edit(change), coreFixtureContext()),
      ).toThrow();
  });
  it("does not mistake physical SQL type equivalence for semantic type/cardinality evidence", () => {
    const c = coreFixtureContext();
    for (const columns of [
      c.catalogues[0]!.columns.map((column) => ({
        ...column,
        supportedDataTypes: [],
      })),
      c.catalogues[0]!.columns.map((column) => ({
        ...column,
        cardinalities: [],
      })),
    ])
      expect(() =>
        parseNormalizedCoreGraph(coreFixture(), {
          ...c,
          catalogues: [{ ...c.catalogues[0]!, columns }],
        }),
      ).toThrow("NORMALIZED_CORE_STORAGE_FACT_MISMATCH");
    expect(() =>
      parseNormalizedCoreGraph(
        edit((g) => (g.field[1].labelId = null)),
        c,
      ),
    ).toThrow("NORMALIZED_CORE_INCOMPLETE");
  });
  it("requires well-formed resource pins even in incomplete drafts", () => {
    const c = coreFixtureContext("draft");
    for (const resource of [
      {
        kind: "schema" as const,
        key: "valid",
        version: 0,
        hash: "a".repeat(64),
        parameterCount: 0,
      },
      {
        kind: "schema" as const,
        key: "valid",
        version: 1,
        hash: "missing",
        parameterCount: 0,
      },
      {
        kind: "schema" as const,
        key: "valid",
        version: 1,
        hash: "a".repeat(64),
        parameterCount: -1,
      },
    ])
      expect(() =>
        parseNormalizedCoreGraph(coreFixture(), {
          ...c,
          contracts: [resource],
        }),
      ).toThrow("NORMALIZED_CORE_CONTEXT_INVALID");
  });
});
