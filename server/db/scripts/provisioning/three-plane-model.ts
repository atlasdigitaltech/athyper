import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProvisionPlane } from "../safe-provision.js";

export const THREE_PLANE_MANIFEST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../seed/manifests/three-plane-demo.v1.json",
);

export interface TenantManifest {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayName: string;
  readonly keycloakOrganizationAlias: string;
}

export interface PlaneManifest {
  readonly databaseName: string;
  readonly databaseUrlEnvironment: string;
  readonly authorizationPack: string;
}

export interface ThreePlaneManifest {
  readonly contractVersion: "athyper.three-plane-provision.v1";
  readonly manifestVersion: string;
  readonly realmKey: string;
  readonly systemPrincipalId: string;
  readonly identitySource: string;
  readonly planes: Readonly<Record<ProvisionPlane, PlaneManifest>>;
  readonly tenants: readonly TenantManifest[];
  readonly keycloak: {
    readonly organizationModel: "tenant";
    readonly businessScopesRemainPlaneLocal: true;
    readonly reconcileCommand: string;
  };
}

export interface AuthorityRole {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly plane: ProvisionPlane;
  readonly permissionIds: readonly string[];
  readonly checksum: string;
}

export interface AuthorityGroup {
  readonly id: string;
  readonly code: string;
  readonly plane: ProvisionPlane;
  readonly roleIds: readonly string[];
  readonly scopeKind: string;
  readonly zeroGrant: boolean;
}

export interface PlaneAssignment {
  readonly plane: ProvisionPlane;
  readonly membershipStatus: "active";
  readonly group: AuthorityGroup;
  readonly scopedRoleAssignments: readonly {
    readonly scopeKind: string;
    readonly scopeKey: string;
    readonly groupCode: string;
  }[];
}

export interface SubjectAssignment {
  readonly keycloakSubject: string;
  readonly username: string;
  readonly principalId: string;
  readonly tenantCodes: readonly string[];
  readonly planes: readonly PlaneAssignment[];
}

export interface PermissionOperation {
  readonly permissionId: string;
  readonly canonicalPermissionCode: string;
  readonly operationKind: "read" | "mutation";
  readonly riskTier: "low" | "medium" | "high" | "critical";
  readonly requiresMfa: boolean;
  readonly requiresSod: boolean;
  readonly shareable: boolean;
  readonly delegable: boolean;
  readonly definitionSha256: string;
}

export interface AuthorizationPack {
  readonly contractVersion: string;
  readonly planePack: string;
  readonly authority: {
    readonly version: string;
    readonly roles: readonly AuthorityRole[];
    readonly groups: readonly AuthorityGroup[];
  };
  readonly permissionCatalog: {
    readonly operations?: readonly PermissionOperation[];
  };
  readonly subjectAssignments: readonly SubjectAssignment[];
}

interface IdentityOrganization {
  readonly alias?: string;
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
}

interface IdentitySource {
  readonly organizations?: readonly IdentityOrganization[];
}

export interface LegalEntityResource {
  readonly tenantCode: string;
  readonly scopeKey: string;
  readonly code: string;
  readonly name: string;
}

export interface NetworkAccountResource {
  readonly tenantCode: string;
  readonly scopeKey: string;
  readonly accountCode: string;
  readonly name: string;
  readonly networkRole: "buyer" | "supplier" | "both";
}

export interface ProvisionInputs {
  readonly manifestPath: string;
  readonly manifest: ThreePlaneManifest;
  readonly identitySourcePath: string;
  readonly identitySource: IdentitySource;
  readonly authorizationPackPaths: Readonly<Record<ProvisionPlane, string>>;
  readonly authorizationPacks: Readonly<Record<ProvisionPlane, AuthorizationPack>>;
  readonly manifestSha256: string;
}

export async function loadProvisionInputs(
  manifestPath = THREE_PLANE_MANIFEST,
): Promise<ProvisionInputs> {
  const absoluteManifestPath = resolve(manifestPath);
  const manifestSource = await readFile(absoluteManifestPath, "utf8");
  const manifest = parseJson<ThreePlaneManifest>(manifestSource);
  validateManifest(manifest);
  const root = dirname(absoluteManifestPath);
  const identitySourcePath = resolve(root, manifest.identitySource);
  const identitySource = parseJson<IdentitySource>(
    await readFile(identitySourcePath, "utf8"),
  );
  const authorizationPackPaths = Object.fromEntries(
    planeOrder().map((plane) => [
      plane,
      resolve(root, manifest.planes[plane].authorizationPack),
    ]),
  ) as Record<ProvisionPlane, string>;
  const authorizationPacks = Object.fromEntries(
    await Promise.all(planeOrder().map(async (plane) => [
      plane,
      parseJson<AuthorizationPack>(await readFile(authorizationPackPaths[plane], "utf8")),
    ])),
  ) as Record<ProvisionPlane, AuthorizationPack>;
  for (const plane of planeOrder()) validateAuthorizationPack(authorizationPacks[plane], plane);
  return {
    manifestPath: absoluteManifestPath,
    manifest,
    identitySourcePath,
    identitySource,
    authorizationPackPaths,
    authorizationPacks,
    manifestSha256: createHash("sha256").update(canonicalJson(manifest)).digest("hex"),
  };
}

export function planeOrder(): readonly ProvisionPlane[] {
  return ["studio", "neon", "mesh"];
}

export function planeAssignments(
  pack: AuthorizationPack,
  plane: ProvisionPlane,
  tenantCodes: ReadonlySet<string>,
): readonly { subject: SubjectAssignment; assignment: PlaneAssignment; tenantCode: string }[] {
  return pack.subjectAssignments.flatMap((subject) =>
    subject.tenantCodes
      .filter((tenantCode) => tenantCodes.has(tenantCode))
      .flatMap((tenantCode) => subject.planes
        .filter((assignment) => assignment.plane === plane)
        .map((assignment) => ({ subject, assignment, tenantCode })))
  );
}

export function legalEntityResources(inputs: ProvisionInputs): readonly LegalEntityResource[] {
  const tenants = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const required = new Set(planeAssignments(
    inputs.authorizationPacks.neon,
    "neon",
    tenants,
  ).flatMap(({ assignment }) => assignment.scopedRoleAssignments
    .filter((scope) => scope.scopeKind === "legal_entity")
    .map((scope) => scope.scopeKey)));
  const resources = (inputs.identitySource.organizations ?? []).flatMap((organization) => {
    const tenantCode = first(organization.attributes?.tenant_code);
    const externalCode = first(organization.attributes?.legal_entity_code);
    if (!tenantCode || !externalCode || !organization.alias || !required.has(organization.alias)) return [];
    if (!tenants.has(tenantCode)) return [];
    return [{
      tenantCode,
      scopeKey: organization.alias,
      code: normalizeBusinessCode(externalCode),
      name: organization.name?.trim() || externalCode,
    }];
  });
  assertUnique(resources, (resource) => `${resource.tenantCode}:${resource.scopeKey}`, "legal-entity scope");
  assertCovered(required, new Set(resources.map((resource) => resource.scopeKey)), "legal-entity scope");
  return resources.sort(compareResource);
}

export function networkAccountResources(inputs: ProvisionInputs): readonly NetworkAccountResource[] {
  const tenants = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const assignmentRows = planeAssignments(
    inputs.authorizationPacks.mesh,
    "mesh",
    tenants,
  );
  const required = new Set(assignmentRows.flatMap(({ assignment }) => assignment.scopedRoleAssignments
    .filter((scope) => scope.scopeKind === "account")
    .map((scope) => scope.scopeKey)));
  const requiredTenants = new Map<string, Set<string>>();
  for (const row of assignmentRows) {
    for (const scope of row.assignment.scopedRoleAssignments.filter((item) => item.scopeKind === "account")) {
      const values = requiredTenants.get(scope.scopeKey) ?? new Set<string>();
      values.add(row.tenantCode);
      requiredTenants.set(scope.scopeKey, values);
    }
  }
  const byAccount = new Map<string, NetworkAccountResource>();
  for (const organization of inputs.identitySource.organizations ?? []) {
    const buyer = first(organization.attributes?.buyer_account_code);
    const supplier = first(organization.attributes?.supplier_account_code);
    for (const scopeKey of new Set([buyer, supplier].filter(Boolean) as string[])) {
      if (!required.has(scopeKey)) continue;
      const declaredTenant = first(organization.attributes?.tenant_code);
      const assignmentTenants = [...(requiredTenants.get(scopeKey) ?? [])];
      const tenantCode = declaredTenant ?? (assignmentTenants.length === 1 ? assignmentTenants[0] : undefined);
      if (!tenantCode || !tenants.has(tenantCode)) {
        throw new Error(`network account ${scopeKey} has no unambiguous tenant`);
      }
      const networkRole = buyer === scopeKey && supplier === scopeKey
        ? "both"
        : buyer === scopeKey ? "buyer" : "supplier";
      const next = {
        tenantCode,
        scopeKey,
        accountCode: normalizeBusinessCode(scopeKey),
        name: organization.name?.trim() || scopeKey,
        networkRole,
      } satisfies NetworkAccountResource;
      const previous = byAccount.get(scopeKey);
      if (previous && canonicalJson(previous) !== canonicalJson(next)) {
        throw new Error(`conflicting network account definition: ${scopeKey}`);
      }
      byAccount.set(scopeKey, next);
    }
  }
  assertCovered(required, new Set(byAccount.keys()), "network-account scope");
  return [...byAccount.values()].sort(compareResource);
}

export function deterministicUuid(...coordinates: readonly string[]): string {
  const bytes = createHash("sha1")
    .update(`athyper:three-plane:v1:${coordinates.join(":")}`)
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateManifest(manifest: ThreePlaneManifest): void {
  if (manifest.contractVersion !== "athyper.three-plane-provision.v1") {
    throw new Error(`unsupported provision manifest: ${manifest.contractVersion}`);
  }
  if (!/^[a-z][a-z0-9_-]{1,62}$/.test(manifest.realmKey)) throw new Error("invalid realmKey");
  if (manifest.tenants.length !== 3) throw new Error("three-plane manifest requires exactly three tenants");
  assertUnique(manifest.tenants, (tenant) => tenant.code, "tenant code");
  assertUnique(manifest.tenants, (tenant) => tenant.id, "tenant id");
  for (const tenant of manifest.tenants) {
    if (!isUuid(tenant.id) || tenant.keycloakOrganizationAlias !== tenant.id) {
      throw new Error(`tenant organization alias must equal tenant UUID: ${tenant.code}`);
    }
  }
  for (const plane of planeOrder()) {
    if (manifest.planes[plane].databaseName !== `athyper_${plane}`) {
      throw new Error(`unexpected ${plane} database name`);
    }
  }
}

function validateAuthorizationPack(pack: AuthorizationPack, plane: ProvisionPlane): void {
  const available = new Set(pack.subjectAssignments.flatMap((subject) => subject.planes.map((item) => item.plane)));
  if (!available.has(plane)) throw new Error(`${plane} authorization pack has no assignments`);
  const roles = pack.authority.roles.filter((role) => role.plane === plane);
  const groups = pack.authority.groups.filter((group) => group.plane === plane);
  if (roles.length === 0 || groups.length === 0) throw new Error(`${plane} authorization authority is empty`);
}

function normalizeBusinessCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{1,62}$/.test(normalized)) throw new Error(`invalid business code: ${value}`);
  return normalized;
}

function first(values: readonly string[] | undefined): string | undefined {
  const value = values?.[0]?.trim();
  return value || undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const coordinate = key(value);
    if (seen.has(coordinate)) throw new Error(`duplicate ${label}: ${coordinate}`);
    seen.add(coordinate);
  }
}

function assertCovered(required: ReadonlySet<string>, actual: ReadonlySet<string>, label: string): void {
  const missing = [...required].filter((key) => !actual.has(key));
  if (missing.length > 0) throw new Error(`unresolved ${label}(s): ${missing.join(", ")}`);
}

function compareResource(left: { tenantCode: string; scopeKey: string }, right: { tenantCode: string; scopeKey: string }): number {
  return left.tenantCode.localeCompare(right.tenantCode) || left.scopeKey.localeCompare(right.scopeKey);
}

function parseJson<T>(source: string): T {
  return JSON.parse(source.replace(/^\uFEFF/, "")) as T;
}
