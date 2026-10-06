/** Synthetic contract fixtures, never installed storage/security/host evidence. */
import {
  normalizedCoreMembers,
  type NormalizedCoreRow,
  type NormalizedCoreKind,
  type NormalizedCoreGraph,
} from "./normalized-core-contract.js";
import type { NormalizedCoreContext } from "./normalized-core-validation.js";
export const coreFixtureId = (n: number) =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
export function coreFixtureRow<K extends NormalizedCoreKind>(
  kind: K,
  id: string,
  values: Record<string, unknown>,
): NormalizedCoreRow<K> {
  return {
    id,
    ...Object.fromEntries(
      Object.keys(normalizedCoreMembers[kind].columns).map((key) => [
        key,
        null,
      ]),
    ),
    ...values,
  } as NormalizedCoreRow<K>;
}
export function coreFixture(): NormalizedCoreGraph {
  return {
    field: [
      coreFixtureRow("field", coreFixtureId(1), {
        fieldIdentityId: coreFixtureId(11),
        labelId: coreFixtureId(31),
        dataType: "uuid",
        storageType: "uuid",
        cardinality: "one",
        valueOrigin: "stored",
        storageKind: "column",
        storagePath: "id",
        nullable: false,
        required: false,
        writeMode: "read_only",
        dataClassification: "public",
        defaultKind: "none",
        keyGeneration: "provided",
      }),
      coreFixtureRow("field", coreFixtureId(2), {
        fieldIdentityId: coreFixtureId(12),
        labelId: coreFixtureId(32),
        dataType: "string",
        storageType: "text",
        cardinality: "one",
        valueOrigin: "stored",
        storageKind: "column",
        storagePath: "code",
        nullable: false,
        required: false,
        writeMode: "read_only",
        dataClassification: "public",
        defaultKind: "none",
        keyGeneration: "none",
      }),
      coreFixtureRow("field", coreFixtureId(3), {
        fieldIdentityId: coreFixtureId(13),
        labelId: coreFixtureId(33),
        dataType: "string",
        storageType: "text",
        cardinality: "one",
        valueOrigin: "stored",
        storageKind: "column",
        storagePath: "name",
        nullable: true,
        required: false,
        writeMode: "read_only",
        dataClassification: "public",
        defaultKind: "none",
        keyGeneration: "none",
      }),
    ],
    runtime: [
      coreFixtureRow("runtime", coreFixtureId(20), {
        profileKey: "default",
        backingKind: "table",
        storagePlane: "studio",
        storageSchema: "shared",
        storageObject: "synthetic_reference",
        storageCatalogueHash: "a".repeat(64),
        readMode: "generic",
        writeMode: "none",
        apiExposure: "api",
        createMode: "form_only",
        concurrencyMode: "none",
        idFieldId: coreFixtureId(1),
      }),
    ],
    surface: [
      coreFixtureRow("surface", coreFixtureId(40), {
        surfaceKey: "list",
        surfaceKind: "list",
        labelId: coreFixtureId(34),
        layoutKind: "stack",
        isDefault: true,
        identityFieldId: coreFixtureId(2),
        supportedModes: ["table"],
        defaultPageSize: 25,
        allowedPageSizes: [10, 25, 50],
        maxSortLevels: 3,
        countMode: "exact",
        maxFilters: 20,
        maxFilterDepth: 3,
        maxPageSize: 50,
        componentContractId: coreFixtureId(50),
      }),
    ],
  };
}
export function coreFixtureContext(
  phase: NormalizedCoreContext["phase"] = "qualification",
): NormalizedCoreContext {
  return {
    entityId: coreFixtureId(100),
    tenantId: null,
    phase,
    maxMembers: 1000,
    identities: ["id", "code", "name"].map((fieldKey, i) => ({
      id: coreFixtureId(11 + i),
      entityId: coreFixtureId(100),
      tenantId: null,
      fieldKey,
      parentIdentityId: null,
    })),
    labels: [31, 32, 33, 34].map(coreFixtureId),
    searchProfiles: [],
    relationIds: [],
    keyIds: [],
    classificationCodes: ["public", "internal"],
    domains: [],
    contracts: [],
    components: [
      {
        id: coreFixtureId(50),
        level: "surface",
        surfaceKinds: ["list", "detail", "form", "embedded"],
        modes: ["table"],
      },
    ],
    catalogues: [
      {
        hash: "a".repeat(64),
        plane: "studio",
        schema: "shared",
        object: "synthetic_reference",
        columns: [
          {
            path: "id",
            storageType: "uuid",
            nullable: false,
            supportedDataTypes: ["uuid"],
            cardinalities: ["one"],
          },
          {
            path: "code",
            storageType: "text",
            nullable: false,
            supportedDataTypes: ["string"],
            cardinalities: ["one"],
          },
          {
            path: "name",
            storageType: "text",
            nullable: true,
            supportedDataTypes: ["string"],
            cardinalities: ["one"],
          },
        ],
      },
    ],
  };
}
