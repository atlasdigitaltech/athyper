#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileTenantAuthorityProjection,
} from "./tenant-authority-projection.js";

interface ScopeCompatibility {
  scopeVersion: string;
  defaultScopeBehavior: "deny_undeclared";
  permissions: Array<{ permissionCode: string; scopes: Array<{ kind: string; propagation: string }> }>;
  sha256: string;
}
interface ProvisionManifest {
  realmKey: string;
  identitySource: string;
  tenants: Array<{ id: string; code: string; name: string }>;
}
interface IdentitySource {
  realm: string;
  users: Array<{
    id: string;
    username: string;
    enabled: boolean;
    attributes?: Record<string, string[]>;
    clientRoles?: Record<string, string[]>;
  }>;
  organizations?: Array<{
    attributes?: Record<string, string[]>;
    members?: Array<{ id: string }>;
  }>;
}
interface AdmissionOverrides {
  contractVersion: "athyper.authorization.admission-overrides.v1";
  unresolvedSubjectBehavior: "deny";
  tenantBySubject: Record<string, string[]>;
}
interface CanonicalCatalogV2 {
  catalogVersion: string;
  permissions: Array<{
    permissionId: string;
    canonicalCode: string;
    domain: string;
    entity: string;
    operation: string;
    permissionKind: string;
    riskTier: string;
    requiresMfa: boolean;
    requiresSod?: boolean;
    definitionSha256: string;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const outputRoot = resolve(databaseRoot, "seed/packs/authorization-v2");
const checkOnly = process.argv.includes("--check");
const semantic = await json<Record<string, unknown>>(resolve(
  databaseRoot,
  "seed/contracts/authorization/authorization-semantic-contract.v1.json",
));
const manifestPath = resolve(databaseRoot, "seed/manifests/three-plane-demo.v1.json");
const provisionManifest = await json<ProvisionManifest>(resolve(
  manifestPath,
));
const identitySourcePath = resolve(dirname(manifestPath), provisionManifest.identitySource);
const identitySourceText = await readFile(identitySourcePath, "utf8");
const identitySource = JSON.parse(identitySourceText.replace(/^\uFEFF/, "")) as IdentitySource;
const admissionOverrides = await json<AdmissionOverrides>(resolve(
  databaseRoot,
  "seed/contracts/authorization/admission/subject-tenant-overrides.v1.json",
));
const admissions = compileAdmissions(identitySource, admissionOverrides, new Set(provisionManifest.tenants.map((tenant) => tenant.code)));

const quarantineGroups = {
  studio: { id: "d574299c-6105-5f9c-8838-9456ee0aee28", code: "studio.access.quarantine", plane: "studio", roleIds: [], scopeKind: "tenant", zeroGrant: true },
  neon: { id: "d9257a3b-91bf-5051-a7fc-b0bedc5a0ca9", code: "neon.access.quarantine", plane: "neon", roleIds: [], scopeKind: "tenant", zeroGrant: true },
  mesh: { id: "c50b39d1-ee87-54aa-bd7f-b74c40302ba5", code: "mesh.access.quarantine", plane: "mesh", roleIds: [], scopeKind: "tenant", zeroGrant: true },
} as const;

const identitySourceSha256 = sha256(identitySourceText);
const admissionBody = {
  contractVersion: "athyper.authorization.keycloak-admission.v1",
  realm: identitySource.realm,
  source: provisionManifest.identitySource,
  sourceSha256: identitySourceSha256,
  enabledSubjectCount: identitySource.users.filter((user) => user.enabled).length,
  mappedSubjectCount: admissions.length,
  unresolvedSubjectBehavior: "deny",
  subjectMappings: Object.fromEntries(admissions.map((subject) => [subject.keycloakSubject, {
    username: subject.username,
    tenantCodes: subject.tenantCodes,
    disposition: subject.disposition,
    planes: subject.planes.map((plane) => ({
      plane,
      quarantineGroupCode: quarantineGroups[plane].code,
    })),
  }])),
};
await emit(resolve(
  databaseRoot,
  "seed/contracts/authorization/admission/compiled/keycloak-admission.v1.json",
), `${JSON.stringify({ ...admissionBody, sha256: sha256(canonical(admissionBody)) }, null, 2)}\n`);

const packs = [];
for (const target of ["studio", "neon", "mesh"] as const) {
  const catalog = await json<CanonicalCatalogV2>(resolve(
    databaseRoot,
    `seed/contracts/authorization/catalog/${target}/catalog.v2.json`,
  ));
  const scopeCompatibility = await json<ScopeCompatibility>(resolve(
    databaseRoot,
    `seed/contracts/authorization/catalog/${target}/scope-compatibility.v1.json`,
  ));
  const quarantineGroup = quarantineGroups[target];
  const subjectAssignments = admissions
    .filter((subject) => subject.planes.includes(target))
    .map((subject) => ({
      keycloakSubject: subject.keycloakSubject,
      username: subject.username,
      principalId: subject.principalId,
      tenantCodes: subject.tenantCodes,
      disposition: subject.disposition,
      planes: [{
        plane: target,
        membershipStatus: "active",
        group: quarantineGroup,
        scopedRoleAssignments: [],
      }],
    }))
    .sort((left, right) => left.keycloakSubject.localeCompare(right.keycloakSubject));
  const policy = target === "mesh"
    ? {
        accountEntitlement: {
          authority: "mesh.auth_account_entitlement",
          unavailableBehavior: "deny_before_role_or_override",
          neonPlanRead: "forbidden",
        },
      }
    : target === "neon" ? {
        adminPlatformManaged: {
          authority: "control.auth_permission.plane_code",
          required: true,
          unavailableBehavior: "deny",
        },
        neonEntitlement: {
          authority: "control.auth_entitlement_target_policy",
          unavailableBehavior: "deny_before_role_or_override",
        },
      } : {
        adminPlatformManaged: {
          authority: "control.auth_permission.plane_code",
          required: true,
          unavailableBehavior: "deny",
        },
      };
  const targetOperations = catalog.permissions.map((permission) => ({
    permissionId: permission.permissionId,
    canonicalPermissionCode: permission.canonicalCode,
    plane: target,
    entityCode: permission.entity,
    operationCode: permission.operation,
    operationKind: readOperation(permission.operation) ? "read" as const : "mutation" as const,
    riskTier: permission.riskTier,
    requiresMfa: permission.requiresMfa,
    requiresSod: permission.requiresSod ?? permission.riskTier === "critical",
    shareable: false,
    delegable: false,
    definitionSha256: permission.definitionSha256,
    permissionKind: permission.permissionKind,
    moduleCode: moduleCode(target, permission.domain),
  }));
  const tenantAuthorityProjection = compileTenantAuthorityProjection({
    plane: target,
    tenants: provisionManifest.tenants,
    roles: [],
    groups: [quarantineGroup] as never,
    operations: targetOperations,
    subjects: subjectAssignments as never,
  });
  const content = {
    contractVersion: "athyper.authorization.clean-slate-seed-pack.v1",
    planePack: target,
    semanticPermissionContract: semantic,
    permissionCatalog: {
      version: catalog.catalogVersion,
      operations: targetOperations,
    },
    permissionScopeCompatibility: scopeCompatibility,
    authority: {
      version: "authorization.clean-slate.v1",
      permissionSets: [],
      roles: [],
      groups: [quarantineGroup],
      proofEdges: [],
    },
    tenantAuthorityProjection,
    subjectAssignments,
    policy,
    identityContract: {
      realm: identitySource.realm,
      sourceSha256: identitySourceSha256,
      enabledSubjectCount: identitySource.users.filter((user) => user.enabled).length,
      mappedSubjectCount: admissions.length,
      unmanagedKeycloakUsers: "deny",
      fieldConflictBehavior: "fail",
    },
    mutationPolicy: {
      truncate: "forbidden",
      authorizationWideDelete: "forbidden",
      apply: "idempotent_upsert_seed_owned_rows_only",
    },
  };
  const canonicalContent = canonical(content);
  const contentSha256 = sha256(canonicalContent);
  const output = resolve(outputRoot, target);
  await mkdir(output, { recursive: true });
  await emit(resolve(output, "seed-pack.v1.json"), `${JSON.stringify(content, null, 2)}\n`);
  await emit(resolve(output, "seed-pack.sha256"), `${contentSha256}\n`);
  packs.push({
    target,
    path: `seed/packs/authorization-v2/${target}/seed-pack.v1.json`,
    contentSha256,
    permissionCount: catalog.permissions.length,
    roleCount: 0,
    groupCount: 1,
    mappedSubjectCount: subjectAssignments.length,
    materializedRoleCount: tenantAuthorityProjection.definitions.roles.length,
    materializedRolePermissionCount: tenantAuthorityProjection.definitions.rolePermissions.length,
    materializedGroupCount: tenantAuthorityProjection.definitions.principalGroups.length,
    assignmentRowCount: Object.values(tenantAuthorityProjection.assignments)
      .reduce((count, rows) => count + rows.length, 0),
  });
}

function compileAdmissions(
  source: IdentitySource,
  overrides: AdmissionOverrides,
  tenantCodes: ReadonlySet<string>,
): Array<{
  keycloakSubject: string;
  username: string;
  principalId: string;
  tenantCodes: string[];
  disposition: "clean_slate_quarantine";
  planes: Array<"studio" | "neon" | "mesh">;
}> {
  if (overrides.contractVersion !== "athyper.authorization.admission-overrides.v1"
      || overrides.unresolvedSubjectBehavior !== "deny") {
    throw new Error("invalid clean-slate admission override contract");
  }
  const membershipTenants = new Map<string, Set<string>>();
  for (const organization of source.organizations ?? []) {
    const tenantCode = organization.attributes?.tenant_code?.[0]?.trim();
    if (!tenantCode) continue;
    for (const member of organization.members ?? []) {
      const values = membershipTenants.get(member.id) ?? new Set<string>();
      values.add(tenantCode);
      membershipTenants.set(member.id, values);
    }
  }
  const clientPlanes = {
    "studio-web": "studio",
    "neon-web": "neon",
    "mesh-web": "mesh",
  } as const;
  return source.users.filter((user) => user.enabled).map((user) => {
    const inferredTenants = new Set([
      ...(user.attributes?.tenant_code ?? []),
      ...(membershipTenants.get(user.id) ?? []),
      ...(overrides.tenantBySubject[user.id] ?? []),
    ].map((value) => value.trim()).filter(Boolean));
    const unknownTenants = [...inferredTenants].filter((tenantCode) => !tenantCodes.has(tenantCode));
    if (unknownTenants.length > 0) throw new Error(`${user.username} references unknown tenant(s): ${unknownTenants.join(", ")}`);
    if (inferredTenants.size === 0) throw new Error(`${user.username} has no explicit tenant admission coordinate`);
    const planes = Object.entries(clientPlanes)
      .filter(([client]) => user.clientRoles?.[client]?.includes("AUTHORIZED"))
      .map(([, plane]) => plane);
    if (planes.length === 0) throw new Error(`${user.username} has no explicit plane admission role`);
    return {
      keycloakSubject: user.id,
      username: user.username,
      principalId: user.id,
      tenantCodes: [...inferredTenants].sort(),
      disposition: "clean_slate_quarantine" as const,
      planes,
    };
  }).sort((left, right) => left.keycloakSubject.localeCompare(right.keycloakSubject));
}

function moduleCode(plane: "studio" | "neon" | "mesh", domain: string): string {
  if (plane !== "studio") return "fnd";
  const moduleByDomain: Readonly<Record<string, string>> = {
    iam: "iam",
    jobs: "job",
    metadata: "meta",
    platform: "meta",
  };
  const moduleCode = moduleByDomain[domain];
  if (!moduleCode) throw new Error(`Studio catalog domain has no master.module mapping: ${domain}`);
  return moduleCode;
}

function readOperation(operation: string): boolean {
  return ["read", "view", "list", "search", "export", "download"].includes(operation);
}

const ledger = {
  contractVersion: "athyper.authorization.clean-slate-seed-ledger.v1",
  generatedFrom: "canonical_json_sorted_keys",
  immutableContentDrift: "fail",
  packs,
  ledgerSha256: sha256(canonical(packs)),
};
await emit(
  resolve(outputRoot, "seed-ledger.v1.json"),
  `${JSON.stringify(ledger, null, 2)}\n`,
);
process.stdout.write(
  `${packs.map((pack) => `${pack.target}:${pack.contentSha256}`).join("\n")}\n`,
);

async function json<T>(path: string): Promise<T> {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
async function emit(path: string, content: string): Promise<void> {
  if (checkOnly) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`authorization seed-pack drift: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
