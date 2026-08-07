#!/usr/bin/env tsx
/**
 * Static Wave 3 authority gate. Opens no database connection and never claims
 * that production principals have been backfilled.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");

type CompiledAuthority = {
  semanticContractVersion: string;
  database: string;
  planes: string[];
  publicationStatus: string;
  permissionSets: Array<{
    id: string;
    code: string;
    plane: string;
    permissionIds: string[];
    checksum: string;
  }>;
  roles: Array<{
    id: string;
    code: string;
    plane: string;
    permissionSetIds: string[];
    permissionIds: string[];
    checksum: string;
    status: string;
  }>;
  groups: Array<{
    id: string;
    code: string;
    plane: string;
    roleIds: string[];
    scopeKind: string | null;
    zeroGrant: boolean;
  }>;
  proofEdges: Array<{
    permissionId: string;
    roleId: string;
    groupId: string;
    plane: string;
    scopeKind: string | null;
  }>;
};

type Catalog = {
  operations: Array<{ permissionId: string; planes: string[] }>;
};

type Report = {
  status: string;
  failures: string[];
  readAudit: string[];
  gates: Record<string, boolean | string>;
};

let failures = 0;
function expect(condition: unknown, message: string): void {
  if (condition) process.stdout.write(`PASS ${message}\n`);
  else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const contract = await json<{
  contractVersion: string;
  rules: Record<string, unknown>;
}>(resolve(
  databaseRoot,
  "authority/authorization-authority-semantic-contract.v1.json",
));

expect(
  contract.rules["emptyScope"] === "deny_never_tenant_or_account_wide",
  "shared contract makes empty scope a deny",
);
expect(
  contract.rules["inactiveAuthority"] === "grants_nothing",
  "shared contract makes inactive authority grant nothing",
);
const authorities = new Map<string, CompiledAuthority>();
for (const target of ["neon-admin", "mesh"] as const) {
  const root = resolve(
    databaseRoot,
    `seed/contracts/authorization/authority/${target}/compiled`,
  );
  const authority = await json<CompiledAuthority>(
    resolve(root, "compiled-authority.v1.json"),
  );
  const report = await json<Report>(
    resolve(root, "reconciliation-report.v1.json"),
  );
  const userManifest = await json<{
    deliberateFallback: string;
    liveSnapshotRows: string;
  }>(resolve(root, "existing-user-group-manifest.v1.json"));
  authorities.set(target, authority);

  expect(report.status === "pass", `${target} compiler report passes`);
  expect(report.failures.length === 0, `${target} compiler has no failures`);
  expect(
    authority.semanticContractVersion === contract.contractVersion,
    `${target} uses the shared Wave 3 contract`,
  );
  expect(
    authority.publicationStatus === "draft",
    `${target} remains draft before live reconciliation`,
  );
  expect(
    userManifest.deliberateFallback === "quarantined_zero_grant",
    `${target} unmapped subjects fail closed`,
  );
  expect(
    userManifest.liveSnapshotRows === "generated_during_watermarked_backfill",
    `${target} does not fabricate live user mappings`,
  );
  expect(
    new Set(authority.permissionSets.map((row) => row.id)).size
      === authority.permissionSets.length,
    `${target} permission-set IDs are unique`,
  );
  expect(
    new Set(authority.roles.map((row) => row.id)).size
      === authority.roles.length,
    `${target} role IDs are unique`,
  );
  expect(
    new Set(authority.groups.map((row) => row.id)).size
      === authority.groups.length,
    `${target} group IDs are unique`,
  );
  expect(
    authority.roles.every((role) =>
      role.status === "draft"
      && role.permissionSetIds.length > 0
      && role.permissionIds.length > 0
      && /^[0-9a-f]{64}$/.test(role.checksum)
    ),
    `${target} roles are immutable draft compilations over exact IDs`,
  );
  expect(
    authority.groups.every((group) =>
      group.zeroGrant
        ? group.roleIds.length === 0
        : group.roleIds.length > 0
          && Boolean(group.scopeKind)
          && authority.roles.some((role) =>
            group.roleIds.includes(role.id) && role.plane === group.plane
          )
    ),
    `${target} groups are plane-consistent and granting scopes are non-empty`,
  );
  expect(
    report.gates["everyActiveUserDeliberatelyMapped"]
      === "live_snapshot_gate_required",
    `${target} active-user completeness is reserved for the live gate`,
  );
}

const neon = authorities.get("neon-admin")!;
const canonicalAccessRoleCodes = [
  "viewer",
  "reporter",
  "requester",
  "agent",
  "manager",
  "owner",
  "admin",
].map((code) => `neon.access.${code}`);
expect(
  canonicalAccessRoleCodes.every((code) =>
    neon.permissionSets.some((row) => row.code === code && row.plane === "neon")
    && neon.roles.some((row) => row.code === code && row.plane === "neon")
    && neon.groups.some((row) =>
      row.code === code && row.plane === "neon" && !row.zeroGrant
    )
  ),
  "all seven canonical Neon access roles compile to explicit sets, roles, and groups",
);
expect(
  ["admin.catalog.viewer", "admin.catalog.operator", "admin.catalog.owner"]
    .every((code) =>
      neon.roles.some((row) => row.code === code && row.plane === "admin")
    ),
  "approved Admin role catalog is complete",
);
expect(
  neon.groups.some((row) =>
    row.code === "neon.access.quarantine"
    && row.zeroGrant
    && row.roleIds.length === 0
  ),
  "Neon unmapped-user quarantine has zero grant edges",
);

const mesh = authorities.get("mesh")!;
const meshCatalog = await json<Catalog>(resolve(
  databaseRoot,
  "catalog/mesh/compiled/compiled-catalog.v1.json",
));
const meshReport = await json<Report>(resolve(
  databaseRoot,
  "authority/mesh/compiled/reconciliation-report.v1.json",
));
expect(
  JSON.stringify(meshReport.readAudit) === JSON.stringify([
    "authority/authorization-authority-semantic-contract.v1.json",
    "authority/mesh/authority.v1.json",
    "catalog/mesh/compiled/compiled-catalog.v1.json",
  ]),
  "Mesh compilation read audit is sealed to shared contract and Mesh inputs",
);
expect(
  meshCatalog.operations.every((permission) =>
    mesh.proofEdges.some((edge) =>
      edge.permissionId === permission.permissionId
      && edge.plane === "mesh"
      && Boolean(edge.scopeKind)
    )
  ),
  "every Mesh permission has a local permission-to-role-to-group proof edge",
);
expect(
  mesh.groups.some((row) =>
    row.code === "mesh.unassigned_review"
    && row.zeroGrant
    && row.roleIds.length === 0
  ),
  "Mesh unmapped-account quarantine has zero grant edges",
);

for (const [relativePath, tokens] of [
  [
    "ddl/planes/neon/authz/03_tables.sql",
    [
      "cardinality(target_group_ids) > 0",
      "legacy_scope_kind IS NOT NULL",
      "target_scope_id IS NOT NULL",
      "FORCE ROW LEVEL SECURITY",
    ],
  ],
  [
    "ddl/planes/mesh/authz/03_tables.sql",
    [
      "cardinality(target_group_ids) > 0",
      "legacy_scope_ref_id IS NOT NULL",
      "target_scope_id IS NOT NULL",
      "FORCE ROW LEVEL SECURITY",
    ],
  ],
  [
    "ddl/planes/neon/authz/07_functions.sql",
    [
      "membership.principal_id = NEW.principal_id",
      "member.principal_id = NEW.principal_id",
      "auth_group.status = 'active'",
      "quarantined_zero_grant",
      "target.scope_kind = NEW.legacy_scope_kind",
    ],
  ],
  [
    "ddl/planes/mesh/authz/07_functions.sql",
    [
      "membership.principal_id = NEW.principal_id",
      "member.principal_id = NEW.principal_id",
      "auth_group.status = 'active'",
      "quarantined_zero_grant",
      "target.scope_kind = NEW.legacy_scope_kind",
    ],
  ],
] as const) {
  const source = await readFile(resolve(databaseRoot, relativePath), "utf8");
  for (const token of tokens) {
    expect(source.includes(token), `${relativePath} enforces ${token}`);
  }
}

const forbiddenInference = [
  /\bpermission(?:Code|_code)\b[^\n]{0,180}\.split\s*\(/i,
  /\bpermission(?:Code|_code)\b[^\n]{0,180}\.endsWith\s*\(/i,
  /\bempty\b[^\n]{0,120}\btenant[-_ ]wide\b/i,
];
for (const root of [
  resolve(databaseRoot, "seed/contracts/authorization/authority"),
  resolve(databaseRoot, "scripts/authority"),
]) {
  for (const path of await collect(root)) {
    const source = await readFile(path, "utf8");
    for (const pattern of forbiddenInference) {
      expect(
        !pattern.test(source),
        `${path.slice(databaseRoot.length + 1)} has no inferred permission or empty-scope grant`,
      );
    }
  }
}

if (failures > 0) {
  process.stderr.write(`Wave 3 static verification failed: ${failures} gate(s)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Wave 3 static authority verification passed\n");
}

async function collect(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) paths.push(...await collect(path));
    else if (entry.isFile() && /\.(?:json|md|ts|sql)$/.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
}
