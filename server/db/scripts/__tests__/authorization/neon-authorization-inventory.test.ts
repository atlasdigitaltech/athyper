import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  validateNeonAuthorizationInventory,
  type NeonOperationDefinition,
  type NeonReviewedSlicesContract,
  type NeonTableCoverageRow,
  type StudioNeonOrganizationBoundaryContract,
} from "../../seed/neon-authorization-inventory-model.js";

const dbRoot = resolve(import.meta.dirname, "../../..");
const rootRow: NeonTableCoverageRow = {
  table: "master.example",
  ddlSource: "ddl/example.sql",
  hasStatus: true,
  hasVersion: true,
  repositoryReferences: ["server/packages/services/example.ts"],
  writerReferences: ["server/packages/services/example.ts"],
  reviewStatus: "reviewed",
  slice: "example",
  businessDomain: "example",
  classification: "aggregate_root",
  aggregateRoot: "master.example",
  writerKind: "user_service",
  writerOwner: "@athyper/svc-example",
  externallyReadable: true,
  externallyWritable: true,
  sensitivity: "standard",
  requiredScopeKinds: ["resource"],
};
const operation: NeonOperationDefinition = {
  entityCode: "example",
  operationKey: "create",
  permissionCode: "neon.example.example.create",
  permissionKind: "entity_operation",
  storageRoot: "master.example",
  requiredScopeKinds: ["resource"],
  scopeCoordinateKeys: { resource: "resourceId" },
  riskTier: "medium",
  requiresMfa: false,
  requiresSod: false,
  serviceOwner: "@athyper/svc-example",
};

function contract(
  overrides: Partial<NeonReviewedSlicesContract> = {},
): NeonReviewedSlicesContract {
  return {
    contractVersion: "athyper.authorization.neon-reviewed-slices.v1",
    plane: "neon",
    tables: [
      {
        table: "master.example",
        slice: "example",
        businessDomain: "example",
        classification: "aggregate_root",
        aggregateRoot: "master.example",
        writerKind: "user_service",
        writerOwner: "@athyper/svc-example",
        externallyReadable: true,
        externallyWritable: true,
        sensitivity: "standard",
        requiredScopeKinds: ["resource"],
      },
    ],
    operations: [operation],
    lifecycles: [],
    ...overrides,
  };
}

test("rejects an unclassified Neon physical table", () => {
  const result = validateNeonAuthorizationInventory({
    discoveredTables: ["master.example", "document.missing"],
    coverage: [rootRow],
    contract: contract(),
  });
  assert.ok(result.errors.includes("unclassified table: document.missing"));
});

test("rejects an unowned reviewed writer", () => {
  const result = validateNeonAuthorizationInventory({
    discoveredTables: [rootRow.table],
    coverage: [{ ...rootRow, writerOwner: null }],
    contract: contract(),
  });
  assert.ok(result.errors.includes("unowned writer: master.example"));
});

test("rejects generic CRUD publication for an aggregate child", () => {
  const child = { ...rootRow, classification: "aggregate_child" as const };
  const result = validateNeonAuthorizationInventory({
    discoveredTables: [child.table],
    coverage: [child],
    contract: contract({
      tables: [{ ...contract().tables[0]!, classification: "aggregate_child" }],
    }),
  });
  assert.ok(
    result.errors.includes(
      "child published as generic CRUD: master.example/create",
    ),
  );
});

test("rejects an operation without its required scope coordinate", () => {
  const result = validateNeonAuthorizationInventory({
    discoveredTables: [rootRow.table],
    coverage: [rootRow],
    contract: contract({
      operations: [{ ...operation, scopeCoordinateKeys: {} }],
    }),
  });
  assert.ok(
    result.errors.includes(
      "operation scope coordinate missing: example:create/resource",
    ),
  );
});

test("strict validation rejects pending review while inventory mode reports it", () => {
  const pending: NeonTableCoverageRow = {
    ...rootRow,
    reviewStatus: "pending_review",
    classification: "pending_review",
    writerKind: null,
    writerOwner: null,
    aggregateRoot: null,
  };
  const inventory = validateNeonAuthorizationInventory({
    discoveredTables: [pending.table],
    coverage: [pending],
    contract: contract({ tables: [], operations: [] }),
  });
  assert.deepEqual(inventory.errors, []);
  assert.deepEqual(inventory.releaseBlockers, [
    "pending table review: master.example",
  ]);
  const strict = validateNeonAuthorizationInventory({
    discoveredTables: [pending.table],
    coverage: [pending],
    contract: contract({ tables: [], operations: [] }),
    strict: true,
  });
  assert.ok(strict.errors.includes("pending table review: master.example"));
});

test("rejects a Studio organization boundary that bypasses the Neon plane-local applier", async () => {
  const [artifact, reviewed, boundary] = await Promise.all([
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/neon/reviewed-slices.v1.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/neon/studio-neon-organization-boundary.v1.json",
      ),
      "utf8",
    ),
  ]);
  const coverage = JSON.parse(artifact) as { tables: NeonTableCoverageRow[] };
  const contract = JSON.parse(reviewed) as NeonReviewedSlicesContract;
  const organizationBoundary = JSON.parse(
    boundary,
  ) as StudioNeonOrganizationBoundaryContract;
  const unsafeBoundary = {
    ...organizationBoundary,
    source: { ...organizationBoundary.source, directNeonSql: true },
    target: {
      ...organizationBoundary.target,
      forbidsBusinessActivation: false,
    },
  } as unknown as StudioNeonOrganizationBoundaryContract;
  const result = validateNeonAuthorizationInventory({
    discoveredTables: coverage.tables.map((row) => row.table),
    coverage: coverage.tables,
    contract,
    organizationBoundary: unsafeBoundary,
  });
  assert.ok(
    result.errors.includes(
      "Studio organization boundary permits direct Neon SQL",
    ),
  );
  assert.ok(
    result.errors.includes(
      "Studio organization onboarding can activate Neon business state",
    ),
  );
});

test("publishes a deterministic canonical non-enforcing Neon inventory", async () => {
  const artifact = JSON.parse(
    await readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json",
      ),
      "utf8",
    ),
  ) as {
    mode: string;
    counts: {
      tables: number;
      masterTables: number;
      documentTables: number;
      reviewedTables: number;
      pendingReviewTables: number;
      operations: number;
      lifecycles: number;
      crossPlaneOrganizationResources: number;
      roles: number;
      grants: number;
    };
    tables: NeonTableCoverageRow[];
    studioNeonOrganizationBoundary: StudioNeonOrganizationBoundaryContract;
    releaseBlockers: string[];
  };
  assert.equal(artifact.mode, "inventory_only_non_enforcing");
  assert.equal(artifact.counts.tables, artifact.tables.length);
  assert.equal(artifact.counts.tables, artifact.counts.masterTables + artifact.counts.documentTables);
  assert.equal(artifact.counts.reviewedTables, 45);
  assert.equal(artifact.counts.pendingReviewTables, artifact.counts.tables - artifact.counts.reviewedTables);
  assert.equal(artifact.counts.operations, 43);
  assert.equal(artifact.counts.lifecycles, 6);
  assert.equal(artifact.counts.crossPlaneOrganizationResources, 3);
  assert.equal(artifact.counts.roles, 0);
  assert.equal(artifact.counts.grants, 0);
  assert.equal(
    artifact.studioNeonOrganizationBoundary.target.implementationStatus,
    "required_not_implemented",
  );
  assert.ok(
    artifact.releaseBlockers.includes(
      "cross-plane applier not implemented: @athyper/server-service-master-data",
    ),
  );
  assert.equal(new Set(artifact.tables.map((row) => row.table)).size, artifact.counts.tables);
});
