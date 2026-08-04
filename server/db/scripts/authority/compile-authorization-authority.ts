#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type Target = "neon-admin" | "mesh";
type Permission = {
  permissionId: string;
  entityCode: string;
  operationCode: string;
  canonicalPermissionCode: string;
  operationKind: "read" | "mutation";
  riskTier: "low" | "medium" | "high" | "critical";
  requiresMfa: boolean;
  requiresSod: boolean;
  shareable: boolean;
  delegable: boolean;
  planes: string[];
};

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const argument = process.argv.find((value) => value.startsWith("--authority="));
const target = argument?.slice("--authority=".length) as Target | undefined;
if (target !== "neon-admin" && target !== "mesh") {
  throw new Error("Use --authority=neon-admin or --authority=mesh");
}

const readAudit: string[] = [];
async function readJson<T>(path: string): Promise<T> {
  readAudit.push(relative(databaseRoot, path).split(sep).join("/"));
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function uuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const contract = await readJson<{ contractVersion: string; rules: object }>(
  resolve(databaseRoot, "authority/authorization-authority-semantic-contract.v1.json"),
);
const manifest = await readJson<any>(
  resolve(databaseRoot, `authority/${target}/authority.v1.json`),
);
const catalog = await readJson<{ operations: Permission[] }>(
  resolve(databaseRoot, manifest.catalogInput),
);

const failures: string[] = [];
function expect(condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}
expect(
  manifest.contractVersion === contract.contractVersion,
  "authority manifest must use the shared Wave 3 contract",
);

type CompiledSet = {
  id: string;
  code: string;
  name: string;
  plane: string;
  permissionIds: string[];
  checksum: string;
  source: string;
};
type CompiledRole = {
  id: string;
  code: string;
  name: string;
  plane: string;
  permissionSetIds: string[];
  permissionIds: string[];
  checksum: string;
  status: "draft";
};

const permissionSets: CompiledSet[] = [];
const roles: CompiledRole[] = [];
const groups: Array<{
  id: string;
  code: string;
  plane: string;
  roleIds: string[];
  scopeKind: string | null;
  zeroGrant: boolean;
}> = [];

function addSetAndRole(
  plane: string,
  code: string,
  name: string,
  permissions: Permission[],
  source: string,
): CompiledRole {
  const permissionIds = [...new Set(permissions.map((row) => row.permissionId))]
    .sort();
  const setId = uuid(`${manifest.manifestVersion}:permission-set:${plane}:${code}`);
  const roleId = uuid(`${manifest.manifestVersion}:role:${plane}:${code}`);
  const set: CompiledSet = {
    id: setId,
    code,
    name,
    plane,
    permissionIds,
    checksum: hash(permissionIds),
    source,
  };
  const role: CompiledRole = {
    id: roleId,
    code,
    name,
    plane,
    permissionSetIds: target === "mesh" ? [setId] : [],
    permissionIds,
    checksum: hash({ permissionSetIds: target === "mesh" ? [setId] : [], permissionIds }),
    status: "draft",
  };
  if (target === "mesh") permissionSets.push(set);
  roles.push(role);
  return role;
}

if (target === "neon-admin") {
  const order = manifest.canonicalAccessRoles.roleOrder as string[];
  const tiers = manifest.canonicalAccessRoles.operationTiers as Record<string, string[]>;
  const inherited = new Set<string>();
  for (const accessRole of order) {
    const codes = tiers[accessRole] ?? [];
    if (codes.includes("*")) {
      for (const permission of catalog.operations) {
        if (permission.planes.includes("neon")) inherited.add(permission.operationCode);
      }
    } else {
      for (const code of codes) inherited.add(code);
    }
    const permissions = catalog.operations.filter((permission) =>
      permission.planes.includes("neon")
      && inherited.has(permission.operationCode)
    );
    addSetAndRole(
      "neon",
      `neon.access.${accessRole}`,
      `Neon ${accessRole} access`,
      permissions,
      `canonical-access-role:${accessRole}`,
    );
  }
  for (const definition of manifest.adminRoles as any[]) {
    const permissions = catalog.operations.filter((permission) => {
      if (!permission.planes.includes("admin")) return false;
      if (definition.operationKinds) {
        return definition.operationKinds.includes(permission.operationKind);
      }
      return definition.riskTiers.includes(permission.riskTier);
    });
    addSetAndRole(
      "admin",
      definition.code,
      definition.name,
      permissions,
      "approved-admin-role-catalog",
    );
  }
  for (const accessRole of order) {
    const code = `neon.access.${accessRole}`;
    const role = roles.find((candidate) => candidate.code === code);
    expect(Boolean(role), `${code}: canonical access role is missing`);
    groups.push({
      id: uuid(`${manifest.manifestVersion}:group:${code}`),
      code,
      plane: "neon",
      roleIds: role ? [role.id] : [],
      scopeKind: "tenant",
      zeroGrant: false,
    });
  }
  for (const template of manifest.groupTemplates as any[]) {
    const roleIds = roles
      .filter((role) => template.roleCodes.includes(role.code))
      .map((role) => role.id)
      .sort();
    groups.push({
      id: uuid(`${manifest.manifestVersion}:group:${template.code}`),
      code: template.code,
      plane: template.plane ?? "neon",
      roleIds,
      scopeKind: template.code === "neon.access.quarantine"
        ? null
        : "tenant",
      zeroGrant: roleIds.length === 0,
    });
  }
} else {
  for (const definition of manifest.roles as any[]) {
    const selector = definition.selector;
    const permissions = catalog.operations.filter((permission) => {
      if (selector.all) return true;
      if (selector.operationKinds?.includes(permission.operationKind)) return true;
      if (selector.riskTiers?.includes(permission.riskTier)) return true;
      if (selector.entities?.includes(permission.entityCode)) return true;
      return false;
    });
    addSetAndRole(
      "mesh",
      definition.code,
      definition.name,
      permissions,
      "mesh-local-authority-manifest",
    );
  }
  for (const definition of manifest.groups as any[]) {
    const roleIds = roles
      .filter((role) => definition.roleCodes.includes(role.code))
      .map((role) => role.id)
      .sort();
    groups.push({
      id: uuid(`${manifest.manifestVersion}:group:${definition.code}`),
      code: definition.code,
      plane: "mesh",
      roleIds,
      scopeKind: definition.scopeKind,
      zeroGrant: roleIds.length === 0,
    });
  }
}

for (const permissionSet of permissionSets) {
  expect(
    permissionSet.permissionIds.length > 0
      || permissionSet.code.includes("unassigned"),
    `${permissionSet.code}: permission set is unexpectedly empty`,
  );
}
expect(
  new Set(permissionSets.map((row) => row.id)).size === permissionSets.length,
  "permission-set IDs must be unique",
);
expect(
  new Set(roles.map((row) => row.id)).size === roles.length,
  "role IDs must be unique",
);
expect(
  roles.every((role) =>
    role.permissionIds.every((permissionId) =>
      catalog.operations.some((operation) =>
        operation.permissionId === permissionId
        && operation.planes.includes(role.plane)
      )
    )
  ),
  "every role permission must be exact and eligible for its local plane",
);
expect(
  groups.every((group) =>
    group.roleIds.every((roleId) =>
      roles.some((role) => role.id === roleId && role.plane === group.plane)
    )
  ),
  "every group role is plane-consistent",
);
expect(
  groups.every((group) =>
    group.zeroGrant || (group.scopeKind !== null && group.scopeKind !== "")
  ),
  "every granting group has a non-empty typed scope",
);

if (target === "mesh") {
  const allowed = manifest.allowedReadRoots as string[];
  expect(
    JSON.stringify(readAudit) === JSON.stringify(allowed),
    `Mesh authority compiler read outside sealed roots: ${readAudit.join(", ")}`,
  );
  expect(
    readAudit.every((path) =>
      !path.includes("neon-admin")
    ),
    "Mesh authority compiler must not read Neon authority data",
  );
  expect(
    catalog.operations.every((permission) =>
      roles.some((role) => role.permissionIds.includes(permission.permissionId))
      && groups.some((group) =>
        group.roleIds.some((roleId) =>
          roles.find((role) => role.id === roleId)
            ?.permissionIds.includes(permission.permissionId)
        )
      )
    ),
    "every Mesh permission has a local role and group proof path",
  );
}

const proofEdges = roles.flatMap((role) =>
  role.permissionIds.flatMap((permissionId) =>
    groups
      .filter((group) => group.roleIds.includes(role.id))
      .map((group) => ({
        permissionId,
        roleId: role.id,
        groupId: group.id,
        plane: role.plane,
        scopeKind: group.scopeKind,
      }))
  )
);
const compiled = {
  authorityVersion: manifest.manifestVersion,
  semanticContractVersion: manifest.contractVersion,
  database: manifest.database,
  planes: manifest.planes,
  publicationStatus: "draft",
  permissionSets,
  roles,
  groups,
  proofEdges,
  subjectMapping: target === "mesh"
    ? manifest.subjectAdmission
    : manifest.existingUserPolicy,
  scopeMigration: target === "mesh" ? manifest.scopes : manifest.scopeMigration,
};
const report = {
  reportVersion: "wave3.authorization-authority.verification.v1",
  reproducibleInputSha256: hash({ contract, manifest, catalog }),
  authorityVersion: manifest.manifestVersion,
  target,
  status: failures.length === 0 ? "pass" : "fail",
  counts: {
    catalogPermissions: catalog.operations.length,
    permissionSets: permissionSets.length,
    roles: roles.length,
    groups: groups.length,
    zeroGrantGroups: groups.filter((group) => group.zeroGrant).length,
    proofEdges: proofEdges.length,
  },
  gates: {
    exactPermissionSets: failures.every((value) => !value.includes("role permission")),
    tenantPlaneConsistent: failures.every((value) => !value.includes("plane-consistent")),
    emptyScopeNeverGrants: failures.every((value) => !value.includes("non-empty typed scope")),
    meshLocalProofGraph: target !== "mesh"
      || failures.every((value) => !value.includes("local role and group proof")),
    everyActiveUserDeliberatelyMapped: "live_snapshot_gate_required",
    inactiveAuthorityGrantsNothing: "live_database_gate_required",
    backfillAnomaliesZero: "live_database_gate_required",
    targetConstraintsValidated: "live_database_gate_required",
    finalAuthorityNotNull: "post_backfill_live_gate_required",
  },
  readAudit,
  failures,
};

function compileNeonAdminSeedSql(
  plane: "neon" | "admin",
  tenantLookup: string,
): string {
  const planeRoles = roles.filter((role) => role.plane === plane);
  const planeGroups = groups.filter((group) => group.plane === plane);
  const roleById = new Map(planeRoles.map((role) => [role.id, role]));
  const roleRows = planeRoles.map((role) =>
    `      (${sqlLiteral(role.code)}, ${sqlLiteral(role.name)})`
  ).join(",\n");
  const permissionRows = planeRoles.flatMap((role) =>
    role.permissionIds.map((permissionId) =>
      `      (${sqlLiteral(role.code)}, ${sqlLiteral(permissionId)}::uuid)`
    )
  ).join(",\n");
  const groupRows = planeGroups.map((group) => {
    const roleCode = group.roleIds.length === 0
      ? "NULL::text"
      : sqlLiteral(roleById.get(group.roleIds[0]!)!.code);
    return `      (${sqlLiteral(group.code)}, ${roleCode})`;
  }).join(",\n");
  const principalFilter = plane === "admin"
    ? "AND (principal.code LIKE 'platform.%' OR principal.code = 'support.agent')"
    : "";
  const groupExpression = plane === "admin"
    ? `CASE
             WHEN principal.code IN ('platform.owner', 'platform.admin')
               THEN 'admin.platform.owners'
             ELSE 'admin.platform.quarantine'
           END`
    : `CASE
             WHEN regexp_replace(principal.code, '^.*\\.', '') IN
                  ('viewer', 'reporter', 'requester', 'agent', 'manager', 'owner', 'admin')
               THEN 'neon.access.' || regexp_replace(principal.code, '^.*\\.', '')
             ELSE 'neon.access.quarantine'
           END`;

  return `-- GENERATED by compile-authorization-authority.ts. DO NOT EDIT.
-- Deterministic, idempotent ${plane} authority for the local clean-reset profile.
DO $canonical_authority$
DECLARE
  v_tid uuid;
  v_scope_id uuid;
  v_system uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  ${tenantLookup}
  IF v_tid IS NULL THEN
    RAISE EXCEPTION '[canonical-${plane}-authority] tenant not found';
  END IF;

  INSERT INTO master.auth_scope_target (
    id, tenant_id, plane_code, scope_kind, tenant_scope_id, scope_key,
    display_name, status, metadata, created_by
  )
  VALUES (
    md5(v_tid::text || ':auth-scope:${plane}:tenant')::uuid,
    v_tid, ${sqlLiteral(plane)}, 'tenant', v_tid, v_tid::text,
    ${sqlLiteral(`${plane} tenant scope`)}, 'active',
    '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  )
  ON CONFLICT (tenant_id, plane_code, scope_kind, scope_key) DO UPDATE
    SET status = EXCLUDED.status,
        display_name = EXCLUDED.display_name,
        metadata = EXCLUDED.metadata;

  SELECT id INTO STRICT v_scope_id
  FROM master.auth_scope_target
  WHERE tenant_id = v_tid AND plane_code = ${sqlLiteral(plane)}
    AND scope_kind = 'tenant' AND scope_key = v_tid::text;

  INSERT INTO master.auth_role (
    id, tenant_id, plane_code, code, name, description, role_kind,
    status, source_type, source_ref, metadata, created_by
  )
  SELECT md5(v_tid::text || ':auth-role:${plane}:' || role_seed.code)::uuid,
         v_tid, ${sqlLiteral(plane)}, role_seed.code, role_seed.name,
         'Canonical direct-permission role', 'system', 'active',
         'seed', ${sqlLiteral(manifest.manifestVersion)},
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM (VALUES
${roleRows}
  ) AS role_seed(code, name)
  ON CONFLICT (tenant_id, plane_code, code) DO UPDATE
    SET name = EXCLUDED.name,
        status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata;

  INSERT INTO master.auth_role_permission (
    id, tenant_id, plane_code, role_id, permission_id, status,
    metadata, created_by
  )
  SELECT md5(role_row.id::text || ':' || permission_seed.permission_id::text)::uuid,
         v_tid, ${sqlLiteral(plane)}, role_row.id,
         permission_seed.permission_id, 'active',
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM (VALUES
${permissionRows}
  ) AS permission_seed(role_code, permission_id)
  JOIN master.auth_role role_row
    ON role_row.tenant_id = v_tid
   AND role_row.plane_code = ${sqlLiteral(plane)}
   AND role_row.code = permission_seed.role_code
  ON CONFLICT (tenant_id, plane_code, role_id, permission_id) DO UPDATE
    SET status = EXCLUDED.status,
        metadata = EXCLUDED.metadata;

  INSERT INTO master.auth_group (
    id, tenant_id, plane_code, code, name, description, status,
    is_system, source_type, source_ref, metadata, created_by
  )
  SELECT md5(v_tid::text || ':auth-group:${plane}:' || group_seed.code)::uuid,
         v_tid, ${sqlLiteral(plane)}, group_seed.code, group_seed.code,
         'Canonical authorization group', 'active', true, 'seed',
         ${sqlLiteral(manifest.manifestVersion)},
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM (VALUES
${groupRows}
  ) AS group_seed(code, role_code)
  ON CONFLICT (tenant_id, plane_code, code) DO UPDATE
    SET status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata;

  INSERT INTO master.auth_group_role (
    id, tenant_id, plane_code, group_id, role_id, scope_target_id,
    status, source_type, source_ref, metadata, created_by
  )
  SELECT md5(group_row.id::text || ':' || role_row.id::text || ':' || v_scope_id::text)::uuid,
         v_tid, ${sqlLiteral(plane)}, group_row.id, role_row.id, v_scope_id,
         'active', 'seed', ${sqlLiteral(manifest.manifestVersion)},
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM (VALUES
${groupRows}
  ) AS group_seed(code, role_code)
  JOIN master.auth_group group_row
    ON group_row.tenant_id = v_tid
   AND group_row.plane_code = ${sqlLiteral(plane)}
   AND group_row.code = group_seed.code
  JOIN master.auth_role role_row
    ON role_row.tenant_id = v_tid
   AND role_row.plane_code = ${sqlLiteral(plane)}
   AND role_row.code = group_seed.role_code
  WHERE group_seed.role_code IS NOT NULL
  ON CONFLICT (tenant_id, plane_code, group_id, role_id, scope_target_id) DO UPDATE
    SET status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata;

  INSERT INTO master.auth_plane_membership (
    id, tenant_id, plane_code, principal_id, status, source_type,
    source_ref, metadata, created_by
  )
  SELECT md5(principal.id::text || ':auth-plane:${plane}')::uuid,
         v_tid, ${sqlLiteral(plane)}, principal.id, 'active', 'seed',
         ${sqlLiteral(manifest.manifestVersion)},
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM master.principal principal
  WHERE principal.tenant_id = v_tid
    AND principal.status = 'active'
    AND NOT principal.is_locked
    ${principalFilter}
  ON CONFLICT (tenant_id, plane_code, principal_id) DO UPDATE
    SET status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata;

  INSERT INTO master.auth_group_member (
    id, tenant_id, plane_code, group_id, principal_id, status,
    source_type, source_ref, metadata, created_by
  )
  SELECT md5(group_row.id::text || ':' || principal.id::text)::uuid,
         v_tid, ${sqlLiteral(plane)}, group_row.id, principal.id, 'active',
         'seed', ${sqlLiteral(manifest.manifestVersion)},
         '{"seed_owner":"canonical-authorization-v2"}'::jsonb, v_system
  FROM master.principal principal
  JOIN master.auth_group group_row
    ON group_row.tenant_id = v_tid
   AND group_row.plane_code = ${sqlLiteral(plane)}
   AND group_row.code = ${groupExpression}
  WHERE principal.tenant_id = v_tid
    AND principal.status = 'active'
    AND NOT principal.is_locked
    ${principalFilter}
  ON CONFLICT (tenant_id, plane_code, group_id, principal_id) DO UPDATE
    SET status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata;
END
$canonical_authority$;
`;
}

const output = resolve(databaseRoot, `authority/${target}/compiled`);
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "compiled-authority.v1.json"),
  `${JSON.stringify(compiled, null, 2)}\n`,
);
await writeFile(
  resolve(output, "existing-user-group-manifest.v1.json"),
  `${JSON.stringify({
    authorityVersion: manifest.manifestVersion,
    approval: manifest.approval ?? {
      status: "policy_approved",
      basis: "Mesh local account-grant reconciliation with zero-grant quarantine.",
    },
    mappingPolicy: compiled.subjectMapping,
    deliberateFallback: "quarantined_zero_grant",
    liveSnapshotRows: "generated_during_watermarked_backfill",
  }, null, 2)}\n`,
);
await writeFile(
  resolve(output, "reconciliation-report.v1.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve(output, "reconciliation-report.md"),
  `# ${target} Wave 3 authority reconciliation

- Status: **${report.status.toUpperCase()}**
- Permission sets: ${report.counts.permissionSets}
- Roles: ${report.counts.roles}
- Group templates: ${report.counts.groups}
- Zero-grant quarantine groups: ${report.counts.zeroGrantGroups}
- Local permission → role → group proof edges: ${report.counts.proofEdges}
- Active-user mapping: live watermarked snapshot gate required
- Constraint/NOT NULL certification: post-backfill live gate required

Static compilation proves exact local permission, role, group, plane, and scope
structure. It does not fabricate active production users or claim a live
backfill occurred.
  `,
);
if (target === "neon-admin") {
  await writeFile(
    resolve(
      databaseRoot,
      "seed/blueprints/universal/990_validation/998_canonical_neon_authority.sql",
    ),
    compileNeonAdminSeedSql(
      "neon",
      `v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;`,
    ),
  );
  await writeFile(
    resolve(databaseRoot, "seed/tenants/admin/010_canonical_admin_authority.sql"),
    compileNeonAdminSeedSql(
      "admin",
      `SELECT id INTO v_tid FROM master.tenant
   WHERE realm_key = 'athyper' AND code = 'athyper';`,
    ),
  );
}

process.stdout.write(
  `${target}: ${report.status}; sets=${permissionSets.length}; `
    + `roles=${roles.length}; groups=${groups.length}; edges=${proofEdges.length}\n`,
);
for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
if (failures.length) process.exitCode = 1;
