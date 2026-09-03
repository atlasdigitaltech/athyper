import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  buildAuthorizationInventory,
  classifyArtifact,
  classifyReferenceAccess,
  isStrongAuthorizationObjectName,
  renderAuthorizationInventoryMarkdown,
  serializeAuthorizationInventory,
  stripSourceComments,
  validateRegistry,
  type AuthorizationRegistry,
} from "./authorization-inventory.js";
import { verifyAuthorizationInventory } from "./verify-authorization-inventory.js";

const temporaryRoots: string[] = [];

after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function makeRegistry(
  objects: AuthorizationRegistry["objects"] = [],
): AuthorizationRegistry {
  return {
    schemaVersion: 1,
    contract: {
      name: "test.authorization.inventory",
      description: "Test registry",
      scanRoots: ["src"],
      excludedDirectories: ["node_modules", "dist"],
      excludedFiles: [
        "config/governance/authorization-inventory.v1.json",
        "policy/reports/authorization/inventories/authorization-source-inventory.md",
      ],
      captureSourceDdls: [
        {
          plane: "neon",
          path: "src/capture-sources-neon.sql",
          registryTable: "control.authorization_capture_source",
        },
        {
          plane: "mesh",
          path: "src/capture-sources-mesh.sql",
          registryTable: "mesh_control.authorization_capture_source",
        },
      ],
    },
    objects,
    captureSourceObjectIds: {
      neon: [],
      mesh: [],
    },
    keycloakRestWriters: [],
    knownSourceAnomalies: [],
    securitySymbols: [],
    contractFields: [],
    generatedArtifacts: [],
  };
}

function makeRepository(
  source: string,
  registry = makeRegistry(),
): string {
  const root = mkdtempSync(join(tmpdir(), "athyper-authorization-inventory-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "config", "governance"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "config", "governance", "authorization-source-registry.v1.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(root, "src", "reader.ts"), source, "utf8");
  writeFileSync(join(root, "src", "capture-sources-neon.sql"), "", "utf8");
  writeFileSync(join(root, "src", "capture-sources-mesh.sql"), "", "utf8");
  return root;
}

test("artifact classification distinguishes routes, UI, seeds, and test harnesses", () => {
  assert.equal(classifyArtifact("server/packages/services/iam/routes/operator.routes.ts"), "route");
  assert.equal(classifyArtifact("apps/neon/app/page.tsx"), "ui");
  assert.equal(classifyArtifact("server/db/seed/platform/017_permission.sql"), "seed");
  assert.equal(classifyArtifact("packages/example/src/__tests__/reader.test.ts"), "test");
  assert.equal(classifyArtifact("packages/example/src/test-harness/reader.ts"), "test");
});

test("reference access recognizes SQL and Kysely writers without treating reads as writes", () => {
  const insert = 'db.insertInto("master.auth_group").values(row)';
  const update = 'db.updateTable("master.auth_group").set(row)';
  const select = 'db.selectFrom("master.auth_group").selectAll()';
  const definition = "CREATE TABLE master.auth_group (id uuid);";
  assert.equal(
    classifyReferenceAccess(insert, insert.indexOf("master.auth_group"), "master.auth_group"),
    "insert",
  );
  assert.equal(
    classifyReferenceAccess(update, update.indexOf("master.auth_group"), "master.auth_group"),
    "update",
  );
  assert.equal(
    classifyReferenceAccess(select, select.indexOf("master.auth_group"), "master.auth_group"),
    "read",
  );
  assert.equal(
    classifyReferenceAccess(
      definition,
      definition.indexOf("master.auth_group"),
      "master.auth_group",
    ),
    "define",
  );
});

test("strong discovery does not classify keyword-only business role/group tables as IAM", () => {
  assert.equal(isStrongAuthorizationObjectName("master.auth_group"), true);
  assert.equal(isStrongAuthorizationObjectName("master.permission_decision"), true);
  assert.equal(isStrongAuthorizationObjectName("master.pay_group"), false);
  assert.equal(isStrongAuthorizationObjectName("master.tax_group"), false);
  assert.equal(isStrongAuthorizationObjectName("control.posting_role_alias"), false);
  assert.equal(isStrongAuthorizationObjectName("master.party_contact_role"), false);
  assert.equal(isStrongAuthorizationObjectName("master.legal_entity_identity_binding"), false);
  assert.equal(isStrongAuthorizationObjectName("shared.plan_permission_access_uq"), false);
});

test("comment stripping preserves line numbers and removes commented sources", () => {
  const source = [
    "select 1;",
    "-- select * from master.auth_group;",
    "/* master.permission_decision */",
    "select 2;",
  ].join("\n");
  const stripped = stripSourceComments(source, ".sql");
  assert.equal(stripped.split("\n").length, source.split("\n").length);
  assert.equal(stripped.includes("master.auth_group"), false);
  assert.equal(stripped.includes("master.permission_decision"), false);
});

test("registry validation rejects duplicate identities and missing ownership", () => {
  const object = {
    id: "authorization.group",
    database: "neon",
    qualifiedName: "master.auth_group",
    kind: "table" as const,
    authorityClass: "authorization",
    owner: "",
    planes: ["neon"],
    sourceOfTruth: false,
    disposition: "keep",
  };
  const failures = validateRegistry(makeRegistry([
    object,
    { ...object, id: "authorization.group.duplicate", owner: "platform-iam" },
  ]));
  assert.ok(failures.some((failure) => failure.includes("no owner")));
  assert.ok(failures.some((failure) => failure.includes("Duplicate qualified object name")));
});

test("unknown authorization writer is exposed while business group/role names are ignored", () => {
  const root = makeRepository([
    'db.insertInto("master.auth_shadow").values(row);',
    'db.insertInto("master.pay_group").values(row);',
    'db.selectFrom("control.posting_role_alias").selectAll();',
  ].join("\n"));
  const inventory = buildAuthorizationInventory(root);
  assert.equal(inventory.gates.unknownWriters.length, 1);
  assert.equal(inventory.gates.unknownWriters[0]?.qualifiedName, "master.auth_shadow");
  assert.equal(inventory.gates.unknownSources.length, 1);
  assert.equal(inventory.summary.authorizationFiles, 3);
});

test("reviewed writer has an exact owner and disposition and clears writer gates", () => {
  const registry = makeRegistry([{
    id: "authorization.shadow",
    database: "neon",
    qualifiedName: "master.auth_shadow",
    kind: "table",
    authorityClass: "authorization",
    owner: "platform-iam",
    planes: ["neon"],
    sourceOfTruth: false,
    disposition: "replace",
  }]);
  const root = makeRepository(
    'db.insertInto("master.auth_shadow").values(row);',
    registry,
  );
  const inventory = buildAuthorizationInventory(root);
  assert.equal(inventory.gates.unknownSources.length, 0);
  assert.equal(inventory.gates.unknownWriters.length, 0);
  assert.equal(inventory.gates.unclassifiedWriters.length, 0);
  assert.equal(inventory.objects[0]?.writerCount, 1);
});

test("reviewed drift moves from unknown to a certification-blocking known anomaly", () => {
  const registry = makeRegistry();
  registry.knownSourceAnomalies.push({
    id: "drift.auth-shadow",
    type: "object",
    identity: "master.auth_shadow",
    owner: "platform-iam",
    currentPaths: ["src/reader.ts"],
    disposition: "remove_writer",
    removalWave: "Wave 1",
    blocksStrictCertification: true,
  });
  const root = makeRepository(
    'db.insertInto("master.auth_shadow").values(row);',
    registry,
  );
  const inventory = buildAuthorizationInventory(root);
  assert.equal(inventory.gates.unknownSources.length, 0);
  assert.equal(inventory.gates.unknownWriters.length, 0);
  assert.equal(inventory.gates.knownSourceAnomalies.length, 1);
  assert.equal(
    inventory.gates.knownSourceAnomalies[0]?.identity,
    "master.auth_shadow",
  );
});

test("capture-source registry and DDL must match exactly in both directions", () => {
  const registry = makeRegistry([{
    id: "identity.tenant",
    database: "neon",
    qualifiedName: "master.tenant",
    kind: "table",
    authorityClass: "identity",
    owner: "platform-iam",
    planes: ["studio", "neon"],
    sourceOfTruth: true,
    disposition: "keep",
  }]);
  registry.captureSourceObjectIds.neon.push("identity.tenant");
  const root = makeRepository("", registry);
  writeFileSync(
    join(root, "src", "capture-sources-neon.sql"),
    "INSERT INTO control.authorization_capture_source\n"
      + "  (source_schema, source_table, source_class, primary_key_columns, tenant_column, key_columns, change_scope)\n"
      + "VALUES ('master', 'tenant', 'identity', ARRAY['id'], 'id', '{}', 'tenant; PII redacted')\n"
      + "ON CONFLICT (source_schema, source_table) DO UPDATE SET source_class = EXCLUDED.source_class;\n",
    "utf8",
  );
  const matching = buildAuthorizationInventory(root);
  assert.deepEqual(matching.gates.unknownCaptureSources, []);
  assert.deepEqual(matching.gates.staleCaptureSourceRegistrations, []);
  assert.deepEqual(matching.gates.duplicateCaptureSources, []);
  assert.deepEqual(matching.gates.crossPlaneCaptureSources, []);

  writeFileSync(
    join(root, "src", "capture-sources-neon.sql"),
    "INSERT INTO control.authorization_capture_source\n"
      + "  (source_schema, source_table, source_class, primary_key_columns, tenant_column, key_columns, change_scope)\n"
      + "VALUES ('master', 'tenant', 'identity', ARRAY['id'], 'id', '{}', 'tenant')\n"
      + "ON CONFLICT (source_schema, source_table) DO UPDATE SET source_class = EXCLUDED.source_class;\n"
      + "INSERT INTO control.authorization_capture_source\n"
      + "  (source_schema, source_table, source_class, primary_key_columns, tenant_column, key_columns, change_scope)\n"
      + "VALUES ('master', 'tenant', 'identity', ARRAY['id'], 'id', '{}', 'tenant')\n"
      + "ON CONFLICT (source_schema, source_table) DO UPDATE SET source_class = EXCLUDED.source_class;\n",
    "utf8",
  );
  const duplicated = buildAuthorizationInventory(root);
  assert.deepEqual(
    duplicated.gates.duplicateCaptureSources,
    ["neon:master.tenant:2"],
  );

  writeFileSync(
    join(root, "src", "capture-sources-neon.sql"),
    "INSERT INTO control.authorization_capture_source\n"
      + "  (source_schema, source_table, source_class, primary_key_columns, tenant_column, key_columns, change_scope)\n"
      + "VALUES ('master', 'principal', 'identity', ARRAY['id'], 'tenant_id', '{}', 'principal')\n"
      + "ON CONFLICT (source_schema, source_table) DO UPDATE SET source_class = EXCLUDED.source_class;\n",
    "utf8",
  );
  const drifted = buildAuthorizationInventory(root);
  assert.deepEqual(
    drifted.gates.unknownCaptureSources,
    ["neon:master.principal"],
  );
  assert.deepEqual(
    drifted.gates.staleCaptureSourceRegistrations,
    ["neon:master.tenant"],
  );

  writeFileSync(join(root, "src", "capture-sources-neon.sql"), "", "utf8");
  writeFileSync(
    join(root, "src", "capture-sources-mesh.sql"),
    "INSERT INTO mesh_control.authorization_capture_source\n"
      + "  (source_schema, source_table, source_kind, primary_key_columns, scope_kind, scope_columns, redacted_columns, notes)\n"
      + "VALUES ('master', 'tenant', 'identity', ARRAY['id'], 'global', '{}', '{}', 'wrong plane')\n"
      + "ON CONFLICT (source_schema, source_table) DO UPDATE SET source_kind = EXCLUDED.source_kind;\n",
    "utf8",
  );
  const crossPlane = buildAuthorizationInventory(root);
  assert.deepEqual(
    crossPlane.gates.crossPlaneCaptureSources,
    ["master.tenant:registry=neon:ddl=mesh"],
  );
});

test("Keycloak Admin REST writers require an exact owned operation set", () => {
  const registry = makeRegistry();
  registry.keycloakRestWriters.push({
    id: "keycloak.demo-user-writer",
    path: "src/reader.ts",
    owner: "platform-iam",
    disposition: "replace_with_seed_fixture",
    allowedOperations: ["POST:user"],
  });
  const root = makeRepository(
    "await api('POST', `/admin/realms/${realm}/users`, payload, token);",
    registry,
  );
  const matching = buildAuthorizationInventory(root);
  assert.equal(matching.keycloakRestWriters[0]?.classification, "reviewed");
  assert.deepEqual(matching.gates.unknownKeycloakRestWriters, []);
  assert.deepEqual(matching.gates.staleKeycloakRestWriterRules, []);

  writeFileSync(
    join(root, "src", "reader.ts"),
    "await api('DELETE', `/admin/realms/${realm}/users/${userId}`, null, token);",
    "utf8",
  );
  const drifted = buildAuthorizationInventory(root);
  assert.equal(drifted.keycloakRestWriters[0]?.classification, "unclassified");
  assert.equal(drifted.gates.unknownKeycloakRestWriters.length, 1);
  assert.deepEqual(
    drifted.gates.staleKeycloakRestWriterRules,
    ["keycloak.demo-user-writer:POST:user"],
  );
});

test("Keycloak user lifecycle, group membership, and mapper writes are classified", () => {
  const registry = makeRegistry();
  registry.keycloakRestWriters.push({
    id: "keycloak.high-risk-writer",
    path: "src/reader.ts",
    owner: "platform-iam",
    disposition: "retain_reviewed_operations",
    allowedOperations: [
      "DELETE:user",
      "POST:protocol_mapper_or_realm_import",
      "POST:user",
      "PUT:user",
      "PUT:user_group_membership",
    ],
  });
  const root = makeRepository(
    [
      "await api('POST', `/admin/realms/${realm}/users`, payload, token);",
      "await api('PUT', `/admin/realms/${realm}/users/${userId}`, payload, token);",
      "await api('DELETE', `/admin/realms/${realm}/users/${userId}`, null, token);",
      "await api('PUT', `/admin/realms/${realm}/users/${userId}/groups/${groupId}`, {}, token);",
      "await api('POST', `/admin/realms/${realm}/clients/${clientId}/protocol-mappers/models`, mapper, token);",
    ].join("\n"),
    registry,
  );
  const inventory = buildAuthorizationInventory(root);
  assert.deepEqual(
    inventory.keycloakRestWriters[0]?.operations,
    registry.keycloakRestWriters[0]?.allowedOperations,
  );
  assert.equal(inventory.keycloakRestWriters[0]?.classification, "reviewed");
  assert.deepEqual(inventory.gates.unknownKeycloakRestWriters, []);
  assert.deepEqual(inventory.gates.staleKeycloakRestWriterRules, []);
});

test("verification separates structural drift from owned known anomalies", () => {
  const registry = makeRegistry();
  registry.knownSourceAnomalies.push({
    id: "legacy.auth-shadow",
    type: "object",
    identity: "master.auth_shadow",
    owner: "platform-iam",
    currentPaths: ["src/reader.ts"],
    disposition: "remove_writer",
    removalWave: "Wave 1",
    blocksStrictCertification: true,
  });
  registry.knownSourceAnomalies.push({
    id: "boundary.legacy-auth-shadow",
    type: "configuration",
    identity: "neon.runtime.legacy_auth_shadow",
    owner: "platform-iam",
    currentPaths: ["src/reader.ts"],
    matchText: "master.auth_shadow",
    disposition: "remove_cross_plane_reader",
    removalWave: "Wave 1",
    blocksStrictCertification: true,
    boundaryClass: "zero_mesh_neon_reader",
  });
  const root = makeRepository(
    'db.insertInto("master.auth_shadow").values(row);',
    registry,
  );
  const inventory = buildAuthorizationInventory(root);
  mkdirSync(join(root, "policy", "reports", "authorization", "inventories"), { recursive: true });
  writeFileSync(
    join(root, "config", "governance", "authorization-inventory.v1.json"),
    serializeAuthorizationInventory(inventory),
    "utf8",
  );
  writeFileSync(
    join(root, "policy", "reports", "authorization", "inventories", "authorization-source-inventory.md"),
    renderAuthorizationInventoryMarkdown(inventory),
    "utf8",
  );

  const knownOnly = verifyAuthorizationInventory(root);
  assert.equal(knownOnly.structuralPassed, true);
  assert.equal(knownOnly.strictPassed, false);
  assert.deepEqual(knownOnly.artifactDriftFailures, []);
  assert.deepEqual(knownOnly.structuralGateFailures, []);
  assert.equal(knownOnly.inventory.gates.knownSourceAnomalies.length, 1);
  assert.equal(knownOnly.inventory.gates.zeroMeshNeonBoundaryFindings.length, 1);
  assert.equal(knownOnly.knownAnomalyFailures.length, 2);

  writeFileSync(
    join(root, "src", "reader.ts"),
    'db.insertInto("master.auth_shadow").values(row);\n',
    "utf8",
  );
  const drifted = verifyAuthorizationInventory(root);
  assert.equal(drifted.structuralPassed, false);
  assert.ok(drifted.artifactDriftFailures.length > 0);
});
