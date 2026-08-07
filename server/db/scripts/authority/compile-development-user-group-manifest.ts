#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface DemoUser {
  id: string;
  username: string;
  enabled?: boolean;
  attributes?: { tenant_code?: string[]; principal_id?: string[] };
  realmRoles?: string[];
}
interface Organization {
  alias: string;
  enabled?: boolean;
  attributes?: {
    tenant_code?: string[];
    buyer_account_code?: string[];
    supplier_account_code?: string[];
  };
  members?: Array<{ id: string; username: string }>;
}
interface Authority {
  authorityVersion: string;
  groups: Array<{
    id: string;
    code: string;
    plane: string;
    roleIds: string[];
    zeroGrant: boolean;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const sourcePath = resolve(repositoryRoot, "stack/config/iam/realm-athyper-demosetup.json");
const source = JSON.parse(await readFile(sourcePath, "utf8")) as {
  realm: string;
  users: DemoUser[];
  organizations: Organization[];
};
const neonAuthority = await json<Authority>(
  resolve(databaseRoot, "seed/contracts/authorization/authority/neon-admin/compiled/compiled-authority.v1.json"),
);
const meshAuthority = await json<Authority>(
  resolve(databaseRoot, "seed/contracts/authorization/authority/mesh/compiled/compiled-authority.v1.json"),
);
const enabledUsers = source.users.filter((user) => user.enabled !== false);
const subjectMappings: Record<string, unknown> = {};

for (const user of enabledUsers.sort((left, right) => left.id.localeCompare(right.id))) {
  if (!user.id || !user.username) throw new Error("enabled managed users require id and username");
  const organizations = source.organizations
    .filter((organization) =>
      organization.enabled !== false
      && organization.members?.some((member) => member.id === user.id)
    )
    .sort((left, right) => left.alias.localeCompare(right.alias));
  const discoveredTenantCodes = unique([
    ...(user.attributes?.tenant_code ?? []),
    ...organizations.flatMap((organization) => organization.attributes?.tenant_code ?? []),
  ]);
  const tenantCodes = discoveredTenantCodes.length > 0
    ? discoveredTenantCodes
    : ["athyper"];

  const planes: Array<Record<string, unknown>> = [];
  if (user.realmRoles?.includes("NEON_USER")) {
    const accessCode = organizations.length > 0
      ? canonicalNeonAccessCode(user.username)
      : "neon.access.quarantine";
    planes.push({
      plane: "neon",
      membershipStatus: "active",
      group: group(neonAuthority, accessCode),
      scopedRoleAssignments: organizations.map((organization) => ({
        scopeKind: "legal_entity",
        scopeKey: organization.alias,
        groupCode: accessCode,
      })),
    });
  }
  if (user.realmRoles?.includes("ADMIN_USER")) {
    planes.push({
      plane: "admin",
      membershipStatus: "active",
      group: group(neonAuthority, "admin.platform.owners"),
      scopedRoleAssignments: tenantCodes.map((tenantCode) => ({
        scopeKind: "tenant",
        scopeKey: tenantCode,
        groupCode: "admin.platform.owners",
      })),
    });
  }
  if (
    user.realmRoles?.includes("MESH_BUYER_USER")
    || user.realmRoles?.includes("MESH_PARTNER_USER")
  ) {
    const meshGroupCode = canonicalMeshGroupCode(user.username);
    const accountCodes = unique(organizations.flatMap((organization) => [
      ...(organization.attributes?.buyer_account_code ?? []),
      ...(organization.attributes?.supplier_account_code ?? []),
    ]));
    if (accountCodes.length === 0) {
      throw new Error(`enabled Mesh subject ${user.id} has no account scope`);
    }
    planes.push({
      plane: "mesh",
      membershipStatus: "active",
      group: group(meshAuthority, meshGroupCode),
      scopedRoleAssignments: accountCodes.map((accountCode) => ({
        scopeKind: "account",
        scopeKey: accountCode,
        groupCode: meshGroupCode,
      })),
    });
  }
  if (planes.length === 0) {
    throw new Error(`enabled managed subject ${user.id} has no plane membership`);
  }
  if (planes.some((plane) => {
    const canonicalGroup = plane["group"] as { zeroGrant?: boolean };
    const assignments = plane["scopedRoleAssignments"];
    return !Array.isArray(assignments)
      || (!canonicalGroup.zeroGrant && assignments.length === 0);
  })) {
    throw new Error(`enabled subject ${user.id} has an empty granting scope`);
  }

  subjectMappings[user.id] = {
    keycloakSubject: user.id,
    username: user.username,
    principalId: user.attributes?.principal_id?.[0] ?? user.id,
    tenantCodes,
    planes,
    disposition: discoveredTenantCodes.length > 0
      ? "managed_explicit_assignment"
      : "managed_zero_grant_quarantine",
  };
}

const manifest = {
  contractVersion: "authorization-v2.development-user-groups.v1",
  realm: source.realm,
  managedBy: "athyper.authorization-v2",
  source: "stack/config/iam/realm-athyper-demosetup.json",
  sourceSha256: sha256(await readFile(sourcePath, "utf8")),
  unmanagedKeycloakUsers: "unchanged",
  enabledSubjectCount: enabledUsers.length,
  mappedSubjectCount: Object.keys(subjectMappings).length,
  emptyScopeBehavior: "deny",
  subjectMappings,
};
await writeFile(
  resolve(databaseRoot, "seed/contracts/authorization/authority/neon-admin/compiled/development-existing-user-group-manifest.v1.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(
  `mapped ${manifest.mappedSubjectCount}/${manifest.enabledSubjectCount} enabled managed subjects\n`,
);

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function group(authority: Authority, code: string): Record<string, unknown> {
  const value = authority.groups.find((candidate) => candidate.code === code);
  if (!value) throw new Error(`canonical group ${code} is missing`);
  return {
    id: value.id,
    code: value.code,
    roleIds: value.roleIds,
    zeroGrant: value.zeroGrant,
  };
}
function canonicalNeonAccessCode(username: string): string {
  const suffix = username.split(".").at(-1)?.toLowerCase();
  const allowed = new Set(["viewer", "reporter", "requester", "agent", "manager", "owner", "admin"]);
  return suffix && allowed.has(suffix)
    ? `neon.access.${suffix}`
    : "neon.access.quarantine";
}
function canonicalMeshGroupCode(username: string): string {
  const suffix = username.split(".").at(-1)?.toLowerCase();
  if (suffix === "owner" || suffix === "admin") return "mesh.account_owners";
  if (suffix === "manager") return "mesh.security_admins";
  return "mesh.participants";
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
