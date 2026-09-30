import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  validateMeshAuthorizationInventory,
  type MeshOperationDefinition,
  type MeshReviewedSlicesContract,
  type MeshTableCoverageRow,
  type StudioMeshNetworkBoundaryContract,
} from "../../seed/mesh-authorization-inventory-model.js";

const dbRoot = resolve(import.meta.dirname, "../../..");
const rootRow: MeshTableCoverageRow = {
  table: "mesh.network_account",
  ddlSource: "ddl/example.sql",
  hasStatus: true,
  hasVersion: false,
  repositoryReferences: [],
  writerReferences: [],
  reviewStatus: "reviewed",
  slice: "network_topology",
  businessDomain: "network",
  classification: "aggregate_root",
  aggregateRoots: ["mesh.network_account"],
  writerKind: "user_service",
  writerOwner: "@athyper/server-plane-mesh",
  externallyReadable: true,
  externallyWritable: true,
  sensitivity: "confidential",
  requiredScopeKinds: ["network_account"],
};
const operation: MeshOperationDefinition = {
  entityCode: "network_account",
  operationKey: "read",
  permissionCode: "mesh.network.network_account.read",
  permissionKind: "entity_operation",
  storageRoot: "mesh.network_account",
  coordinates: [
    {
      scopeKind: "network_account",
      coordinateKey: "networkAccountId",
      coordinateRole: "target",
      authorizationRequired: true,
    },
  ],
  participantRule: "single_owner",
  riskTier: "low",
  requiresMfa: false,
  requiresSod: false,
  serviceOwner: "@athyper/server-plane-mesh",
};

function contract(
  overrides: Partial<MeshReviewedSlicesContract> = {},
): MeshReviewedSlicesContract {
  return {
    contractVersion: "athyper.authorization.mesh-reviewed-slices.v1",
    plane: "mesh",
    tables: [
      {
        table: rootRow.table,
        slice: rootRow.slice,
        businessDomain: "network",
        classification: "aggregate_root",
        aggregateRoots: [rootRow.table],
        writerKind: "user_service",
        writerOwner: "@athyper/server-plane-mesh",
        externallyReadable: true,
        externallyWritable: true,
        sensitivity: "confidential",
        requiredScopeKinds: ["network_account"],
      },
    ],
    operations: [operation],
    lifecycles: [],
    ...overrides,
  };
}

test("rejects an unclassified Mesh physical table", () => {
  const result = validateMeshAuthorizationInventory({
    discoveredTables: [rootRow.table, "document.missing"],
    coverage: [rootRow],
    contract: contract(),
  });
  assert.ok(result.errors.includes("unclassified table: document.missing"));
});

test("rejects an unowned Mesh writer", () => {
  const result = validateMeshAuthorizationInventory({
    discoveredTables: [rootRow.table],
    coverage: [{ ...rootRow, writerOwner: null }],
    contract: contract(),
  });
  assert.ok(result.errors.includes("unowned writer: mesh.network_account"));
});

test("rejects generic operation publication for a Mesh aggregate child", () => {
  const child = { ...rootRow, classification: "aggregate_child" as const };
  const result = validateMeshAuthorizationInventory({
    discoveredTables: [child.table],
    coverage: [child],
    contract: contract({
      tables: [{ ...contract().tables[0]!, classification: "aggregate_child" }],
    }),
  });
  assert.ok(
    result.errors.includes(
      "child published as generic CRUD: mesh.network_account/read",
    ),
  );
});

test("rejects an operation without an authorization-bearing coordinate", () => {
  const result = validateMeshAuthorizationInventory({
    discoveredTables: [rootRow.table],
    coverage: [rootRow],
    contract: contract({
      operations: [
        {
          ...operation,
          coordinates: [
            { ...operation.coordinates[0]!, authorizationRequired: false },
          ],
        },
      ],
    }),
  });
  assert.ok(
    result.errors.includes(
      "operation has no authorization coordinate: network_account:read",
    ),
  );
});

test("rejects a relationship operation missing bilateral coordinates or using initiator acceptance", () => {
  const relationshipRow: MeshTableCoverageRow = {
    ...rootRow,
    table: "mesh.network_relationship",
    aggregateRoots: ["mesh.network_relationship"],
    requiredScopeKinds: ["network_relationship", "network_account"],
  };
  const unsafe: MeshOperationDefinition = {
    ...operation,
    entityCode: "network_relationship",
    operationKey: "accept",
    permissionCode: "mesh.network.network_relationship.accept",
    storageRoot: relationshipRow.table,
    coordinates: [
      {
        scopeKind: "network_relationship",
        coordinateKey: "networkRelationshipId",
        coordinateRole: "target",
        authorizationRequired: true,
      },
      {
        scopeKind: "network_account",
        coordinateKey: "actorNetworkAccountId",
        coordinateRole: "actor_account",
        authorizationRequired: true,
      },
    ],
    participantRule: "initiator_only",
  };
  const result = validateMeshAuthorizationInventory({
    discoveredTables: [relationshipRow.table],
    coverage: [relationshipRow],
    contract: contract({
      tables: [
        {
          ...contract().tables[0]!,
          table: relationshipRow.table,
          aggregateRoots: [relationshipRow.table],
          requiredScopeKinds: relationshipRow.requiredScopeKinds,
        },
      ],
      operations: [unsafe],
    }),
  });
  assert.ok(
    result.errors.includes(
      "bilateral relationship coordinate missing: network_relationship:accept/buyerNetworkAccountId",
    ),
  );
  assert.ok(
    result.errors.includes(
      "unsafe relationship participant rule: network_relationship:accept",
    ),
  );
});

test("strict validation rejects pending review while inventory mode reports it", () => {
  const pending: MeshTableCoverageRow = {
    ...rootRow,
    reviewStatus: "pending_review",
    classification: "pending_review",
    aggregateRoots: [],
    writerKind: null,
    writerOwner: null,
  };
  const inventory = validateMeshAuthorizationInventory({
    discoveredTables: [pending.table],
    coverage: [pending],
    contract: contract({ tables: [], operations: [] }),
  });
  assert.deepEqual(inventory.errors, []);
  assert.deepEqual(inventory.releaseBlockers, [
    "pending table review: mesh.network_account",
  ]);
  const strict = validateMeshAuthorizationInventory({
    discoveredTables: [pending.table],
    coverage: [pending],
    contract: contract({ tables: [], operations: [] }),
    strict: true,
  });
  assert.ok(
    strict.errors.includes("pending table review: mesh.network_account"),
  );
});

test("rejects a Studio boundary that writes Mesh directly or fabricates a relationship", async () => {
  const [artifactSource, reviewedSource, boundarySource] = await Promise.all([
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/mesh/reviewed-slices.v1.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/mesh/studio-mesh-network-boundary.v1.json",
      ),
      "utf8",
    ),
  ]);
  const artifact = JSON.parse(artifactSource) as {
    tables: MeshTableCoverageRow[];
  };
  const reviewed = JSON.parse(reviewedSource) as MeshReviewedSlicesContract;
  const boundary = JSON.parse(
    boundarySource,
  ) as StudioMeshNetworkBoundaryContract;
  const unsafe = {
    ...boundary,
    source: {
      ...boundary.source,
      directMeshSql: true,
      mayCreateOrAcceptRelationship: true,
    },
    target: {
      ...boundary.target,
      forbidsBusinessActivation: false,
      forbidsRelationshipMutation: false,
    },
  } as unknown as StudioMeshNetworkBoundaryContract;
  const result = validateMeshAuthorizationInventory({
    discoveredTables: artifact.tables.map((row) => row.table),
    coverage: artifact.tables,
    contract: reviewed,
    networkBoundary: unsafe,
  });
  assert.ok(
    result.errors.includes("Studio network boundary permits direct Mesh SQL"),
  );
  assert.ok(
    result.errors.includes(
      "Studio onboarding can mutate a bilateral Mesh relationship",
    ),
  );
  assert.ok(
    result.errors.includes(
      "Studio network onboarding can activate Mesh business state",
    ),
  );
});

test("publishes a deterministic canonical non-enforcing Mesh inventory", async () => {
  const artifact = JSON.parse(
    await readFile(
      resolve(
        dbRoot,
        "seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json",
      ),
      "utf8",
    ),
  ) as {
    mode: string;
    counts: {
      tables: number;
      masterTables: number;
      documentTables: number;
      meshTables: number;
      reviewedTables: number;
      pendingReviewTables: number;
      operations: number;
      lifecycles: number;
      broadParticipantMutationPolicies: number;
      currentUserBroadWritePolicies: number;
      roles: number;
      grants: number;
    };
    tables: MeshTableCoverageRow[];
    studioMeshNetworkBoundary: StudioMeshNetworkBoundaryContract;
    releaseBlockers: string[];
  };
  assert.equal(artifact.mode, "inventory_only_non_enforcing");
  assert.equal(artifact.counts.tables, artifact.tables.length);
  assert.equal(artifact.counts.tables, artifact.counts.masterTables + artifact.counts.documentTables + artifact.counts.meshTables);
  assert.equal(artifact.counts.reviewedTables, 9);
  assert.equal(artifact.counts.pendingReviewTables, artifact.counts.tables - artifact.counts.reviewedTables);
  assert.equal(artifact.counts.operations, 18);
  assert.equal(artifact.counts.lifecycles, 2);
  assert.equal(artifact.counts.broadParticipantMutationPolicies, 1);
  assert.equal(artifact.counts.currentUserBroadWritePolicies, 9);
  assert.equal(artifact.counts.roles, 0);
  assert.equal(artifact.counts.grants, 0);
  assert.equal(new Set(artifact.tables.map((row) => row.table)).size, artifact.counts.tables);
  assert.equal(
    artifact.studioMeshNetworkBoundary.target.implementationStatus,
    "required_not_implemented",
  );
  assert.ok(artifact.releaseBlockers.length >= artifact.counts.pendingReviewTables);
  assert.ok(
    artifact.releaseBlockers.includes(
      "broad participant FOR ALL mutation RLS: mesh.network_relationship",
    ),
  );
});
