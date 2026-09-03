import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProvisionPlane } from "./safe-provision.js";
import type { TenantAuthorityProjection } from "../seed/tenant-authority-projection.js";

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
  readonly scenarioPack: string;
  readonly subscriptionPlans: Readonly<Record<ProvisionPlane, string>>;
}

export interface TenantScenarioPack {
  readonly contractVersion: "athyper.tenant-scenario.v1";
  readonly packVersion: string;
  readonly plane: "neon";
  readonly tenantCode: string;
  readonly complexity: "simple" | "medium" | "complex";
  readonly tenantProfile: {
    readonly countryCode: string;
    readonly localeCode: string;
    readonly timezoneCode: string;
    readonly languageCode: string;
    readonly dateFormat: string;
    readonly numberFormat: string;
    readonly weekStart: number;
    readonly weekendDays: readonly number[];
    readonly logoAssetRef?: string;
  };
  readonly legalEntities: readonly {
    readonly scopeKey: string;
    readonly code: string;
    readonly name: string;
    readonly legalName: string;
    readonly parentScopeKey?: string;
    readonly registrationCountryCode: string;
    readonly functionalCurrency: string;
    readonly reportingCurrency: string;
    readonly regionCode: string;
    readonly logoAssetRef?: string;
  }[];
  readonly companyCodes: readonly {
    readonly code: string;
    readonly legalEntityScopeKey: string;
    readonly name: string;
    readonly functionalCurrency: string;
    readonly countryCode: string;
    readonly fiscalYearStartMonth: number;
    readonly timezoneCode: string;
    readonly localeCode: string;
    readonly companyPurpose: "statutory" | "operations";
    readonly readinessProfile: "finance_baseline_v1";
    readonly logoAssetRef?: string;
  }[];
  readonly operatingOrganizations: readonly {
    readonly code: string;
    readonly name: string;
    readonly domain: string;
    readonly parentCode?: string;
    readonly regionCode?: string;
  }[];
  readonly operatingOrganizationCompanyAssignments: readonly {
    readonly organizationCode: string;
    readonly companyCode: string;
    readonly participationRole: string;
  }[];
  readonly orgUnitTypes: readonly {
    readonly code: string;
    readonly name: string;
    readonly levelOrder: number;
  }[];
  readonly orgUnits: readonly {
    readonly code: string;
    readonly name: string;
    readonly typeCode: string;
    readonly parentCode?: string;
    readonly sortOrder: number;
  }[];
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
  readonly permissionKind?: string;
  readonly moduleCode?: string;
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
  readonly permissionScopeCompatibility: {
    readonly scopeVersion: string;
    readonly defaultScopeBehavior: "deny_undeclared";
    readonly permissions: readonly {
      readonly permissionCode: string;
      readonly scopes: readonly {
        readonly kind: string;
        readonly propagation: string;
      }[];
    }[];
    readonly sha256: string;
  };
  readonly tenantAuthorityProjection: TenantAuthorityProjection;
  readonly subjectAssignments: readonly SubjectAssignment[];
}

export interface IdentityOrganization {
  readonly alias?: string;
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
  readonly members?: readonly { readonly id: string; readonly username: string }[];
}

export interface IdentityUser {
  readonly id: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly realmRoles?: readonly string[];
  readonly clientRoles?: Readonly<Record<string, readonly string[]>>;
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
}

export interface IdentitySource {
  readonly organizations?: readonly IdentityOrganization[];
  readonly users: readonly IdentityUser[];
  readonly studioTenantAdmins?: readonly {
    readonly tenantCode: string;
    readonly usernames: readonly string[];
  }[];
}

export interface LegalEntityResource {
  readonly tenantCode: string;
  readonly scopeKey: string;
  readonly code: string;
  readonly name: string;
  readonly legalName: string;
  readonly parentScopeKey?: string;
  readonly registrationCountryCode: string;
  readonly functionalCurrency: string;
  readonly reportingCurrency: string;
  readonly logoAssetRef?: string;
}

export interface NetworkAccountResource {
  readonly tenantCode: string;
  readonly scopeKey: string;
  readonly accountCode: string;
  readonly name: string;
  readonly networkRole: "buyer" | "supplier" | "both";
  readonly logoAssetRef?: string;
}

export interface ProvisionInputs {
  readonly manifestPath: string;
  readonly manifest: ThreePlaneManifest;
  readonly identitySourcePath: string;
  readonly identitySource: IdentitySource;
  readonly authorizationPackPaths: Readonly<Record<ProvisionPlane, string>>;
  readonly authorizationPacks: Readonly<Record<ProvisionPlane, AuthorizationPack>>;
  readonly scenarioPackPaths: Readonly<Record<string, string>>;
  readonly scenarioPacks: Readonly<Record<string, TenantScenarioPack>>;
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
  const scenarioPackPaths = Object.fromEntries(manifest.tenants.map((tenant) => [
    tenant.code,
    resolve(root, tenant.scenarioPack),
  ]));
  const scenarioPacks = Object.fromEntries(await Promise.all(manifest.tenants.map(async (tenant) => {
    const pack = parseJson<TenantScenarioPack>(await readFile(scenarioPackPaths[tenant.code]!, "utf8"));
    validateScenarioPack(pack, tenant.code);
    return [tenant.code, pack];
  })));
  return {
    manifestPath: absoluteManifestPath,
    manifest,
    identitySourcePath,
    identitySource,
    authorizationPackPaths,
    authorizationPacks,
    scenarioPackPaths,
    scenarioPacks,
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
  const required = new Set(Object.entries(inputs.scenarioPacks).flatMap(([tenantCode, pack]) =>
    pack.legalEntities.map((entity) => `${tenantCode}:${entity.scopeKey}`)));
  const scenarioLegalEntities = new Map(Object.values(inputs.scenarioPacks).flatMap((pack) =>
    pack.legalEntities.map((entity) => [`${pack.tenantCode}:${entity.scopeKey}`, entity] as const)));
  const resources = (inputs.identitySource.organizations ?? []).flatMap((organization) => {
    const tenantCode = first(organization.attributes?.tenant_code);
    const externalCode = first(organization.attributes?.legal_entity_code);
    if (!tenantCode || !externalCode || !organization.alias || !required.has(`${tenantCode}:${organization.alias}`)) return [];
    if (!tenants.has(tenantCode)) return [];
    const scenario = scenarioLegalEntities.get(`${tenantCode}:${organization.alias}`);
    if (!scenario) throw new Error(`missing scenario legal entity: ${tenantCode}/${organization.alias}`);
    const identityCode = normalizeBusinessCode(externalCode);
    if (identityCode !== scenario.code) {
      throw new Error(`scenario legal entity code mismatch: ${tenantCode}/${organization.alias}`);
    }
    return [{
      tenantCode,
      scopeKey: organization.alias,
      code: identityCode,
      name: scenario.name,
      legalName: scenario.legalName,
      parentScopeKey: scenario.parentScopeKey,
      registrationCountryCode: scenario.registrationCountryCode,
      functionalCurrency: scenario.functionalCurrency,
      reportingCurrency: scenario.reportingCurrency,
      ...(scenario.logoAssetRef ? { logoAssetRef: scenario.logoAssetRef } : {}),
    }];
  });
  assertUnique(resources, (resource) => `${resource.tenantCode}:${resource.scopeKey}`, "legal-entity scope");
  assertCovered(required, new Set(resources.map((resource) => `${resource.tenantCode}:${resource.scopeKey}`)), "scenario legal-entity scope");
  return resources.sort(compareResource);
}

export function networkAccountResources(inputs: ProvisionInputs): readonly NetworkAccountResource[] {
  const tenants = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const subjectTenants = new Map(inputs.authorizationPacks.mesh.subjectAssignments
    .map((subject) => [subject.keycloakSubject, new Set(subject.tenantCodes)] as const));
  const byAccount = new Map<string, NetworkAccountResource>();
  const legalEntityLogos = new Map(Object.values(inputs.scenarioPacks).flatMap((pack) =>
    pack.legalEntities.flatMap((entity) => entity.logoAssetRef
      ? [[`${pack.tenantCode}:${entity.scopeKey}`, entity.logoAssetRef] as const]
      : [])));
  for (const organization of inputs.identitySource.organizations ?? []) {
    const buyer = first(organization.attributes?.buyer_account_code);
    const supplier = first(organization.attributes?.supplier_account_code);
    for (const scopeKey of new Set([buyer, supplier].filter(Boolean) as string[])) {
      const declaredTenant = first(organization.attributes?.tenant_code);
      const inferredTenants = new Set((organization.members ?? []).flatMap((member) =>
        [...(subjectTenants.get(member.id) ?? [])]));
      const tenantCode = declaredTenant ?? (inferredTenants.size === 1 ? [...inferredTenants][0] : undefined);
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
        ...(organization.alias && legalEntityLogos.get(`${tenantCode}:${organization.alias}`)
          ? { logoAssetRef: legalEntityLogos.get(`${tenantCode}:${organization.alias}`)! }
          : {}),
      } satisfies NetworkAccountResource;
      const coordinate = `${tenantCode}:${scopeKey}`;
      const previous = byAccount.get(coordinate);
      if (previous && canonicalJson(previous) !== canonicalJson(next)) {
        throw new Error(`conflicting network account definition: ${coordinate}`);
      }
      byAccount.set(coordinate, next);
    }
  }
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

export function databaseManagedScopeUuid(
  tenantId: string,
  kind: "legal_entity" | "network_account",
  targetId: string,
): string {
  const value = `${tenantId}:scope:${kind.replaceAll("_", "-")}:${targetId}`;
  const hex = createHash("md5").update(value).digest("hex");
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
    if (!tenant.scenarioPack?.trim()) throw new Error(`tenant scenario pack is required: ${tenant.code}`);
    for (const plane of planeOrder()) {
      if (!tenant.subscriptionPlans?.[plane]?.trim()) {
        throw new Error(`tenant subscription plan is required: ${tenant.code}/${plane}`);
      }
    }
  }
  for (const plane of planeOrder()) {
    if (manifest.planes[plane].databaseName !== `athyper_${plane}`) {
      throw new Error(`unexpected ${plane} database name`);
    }
  }
}

function validateScenarioPack(pack: TenantScenarioPack, tenantCode: string): void {
  if (pack.contractVersion !== "athyper.tenant-scenario.v1" || pack.plane !== "neon") {
    throw new Error(`unsupported tenant scenario pack: ${tenantCode}`);
  }
  if (pack.tenantCode !== tenantCode) throw new Error(`tenant scenario pack mismatch: ${tenantCode}`);
  if (!pack.tenantProfile || pack.legalEntities.length === 0 || pack.companyCodes.length === 0) {
    throw new Error(`tenant scenario pack has no organization foundation: ${tenantCode}`);
  }
  const code = /^[a-z][a-z0-9_.-]{1,62}$/;
  const currency = /^[A-Z]{3}$/;
  const country = /^[A-Z]{2}$/;
  const logoAssetRef = /^\/[A-Za-z0-9][A-Za-z0-9_./-]{0,1022}$/;
  const assertLogoAssetRef = (value: string | undefined, label: string): void => {
    if (value && (!logoAssetRef.test(value) || /(^|\/)\.\.(\/|$)/.test(value))) {
      throw new Error(`invalid ${tenantCode} ${label} logo asset ref`);
    }
  };
  assertLogoAssetRef(pack.tenantProfile.logoAssetRef, "tenant profile");
  const assertCodes = (values: readonly { code: string }[], label: string): void => {
    assertUnique(values, (value) => value.code, `${tenantCode} ${label} code`);
    for (const value of values) if (!code.test(value.code)) throw new Error(`invalid ${tenantCode} ${label} code: ${value.code}`);
  };
  assertCodes(pack.legalEntities, "legal entity");
  assertCodes(pack.companyCodes, "company");
  assertCodes(pack.operatingOrganizations, "operating organization");
  assertCodes(pack.orgUnitTypes, "org unit type");
  assertCodes(pack.orgUnits, "org unit");
  assertUnique(pack.legalEntities, (value) => value.scopeKey, `${tenantCode} legal entity scope`);
  const legalScopes = new Set(pack.legalEntities.map((value) => value.scopeKey));
  const companies = new Set(pack.companyCodes.map((value) => value.code));
  const organizations = new Set(pack.operatingOrganizations.map((value) => value.code));
  const unitTypes = new Set(pack.orgUnitTypes.map((value) => value.code));
  const units = new Set(pack.orgUnits.map((value) => value.code));
  for (const entity of pack.legalEntities) {
    if (entity.parentScopeKey && !legalScopes.has(entity.parentScopeKey)) throw new Error(`unknown ${tenantCode} parent legal entity: ${entity.parentScopeKey}`);
    if (!code.test(entity.regionCode) || !country.test(entity.registrationCountryCode) || !currency.test(entity.functionalCurrency) || !currency.test(entity.reportingCurrency)) {
      throw new Error(`invalid ${tenantCode} legal entity localization: ${entity.code}`);
    }
    assertLogoAssetRef(entity.logoAssetRef, `legal entity ${entity.code}`);
  }
  for (const company of pack.companyCodes) {
    if (!legalScopes.has(company.legalEntityScopeKey)) throw new Error(`unknown ${tenantCode} company legal entity: ${company.legalEntityScopeKey}`);
    if (!country.test(company.countryCode) || !currency.test(company.functionalCurrency) || company.fiscalYearStartMonth < 1 || company.fiscalYearStartMonth > 12
      || !["statutory", "operations"].includes(company.companyPurpose) || company.readinessProfile !== "finance_baseline_v1") {
      throw new Error(`invalid ${tenantCode} company localization: ${company.code}`);
    }
    assertLogoAssetRef(company.logoAssetRef, `company ${company.code}`);
  }
  for (const organization of pack.operatingOrganizations) {
    if (organization.parentCode && !organizations.has(organization.parentCode)) throw new Error(`unknown ${tenantCode} parent operating organization: ${organization.parentCode}`);
  }
  assertUnique(pack.operatingOrganizationCompanyAssignments, (value) => `${value.organizationCode}:${value.companyCode}`, `${tenantCode} operating organization company assignment`);
  for (const assignment of pack.operatingOrganizationCompanyAssignments) {
    if (!organizations.has(assignment.organizationCode) || !companies.has(assignment.companyCode)) throw new Error(`invalid ${tenantCode} operating organization assignment`);
  }
  for (const unit of pack.orgUnits) {
    if (!unitTypes.has(unit.typeCode) || (unit.parentCode && !units.has(unit.parentCode)) || unit.sortOrder < 0) throw new Error(`invalid ${tenantCode} org unit: ${unit.code}`);
  }
}

function validateAuthorizationPack(pack: AuthorizationPack, plane: ProvisionPlane): void {
  const available = new Set(pack.subjectAssignments.flatMap((subject) => subject.planes.map((item) => item.plane)));
  if (!available.has(plane)) throw new Error(`${plane} authorization pack has no assignments`);
  const roles = pack.authority.roles.filter((role) => role.plane === plane);
  const groups = pack.authority.groups.filter((group) => group.plane === plane);
  const cleanSlate = pack.authority.version === "authorization.clean-slate.v1";
  if (cleanSlate) {
    if (roles.length !== 0 || groups.length !== 1 || groups[0]?.zeroGrant !== true) {
      throw new Error(`${plane} clean-slate authority must contain only one zero-grant quarantine group`);
    }
    if (pack.tenantAuthorityProjection.definitions.roles.length !== 0
        || pack.tenantAuthorityProjection.definitions.rolePermissions.length !== 0
        || pack.tenantAuthorityProjection.assignments.groupRoles.length !== 0) {
      throw new Error(`${plane} clean-slate authority contains an allow edge`);
    }
  } else if (roles.length === 0 || groups.length === 0) {
    throw new Error(`${plane} authorization authority is empty`);
  }
  if (pack.tenantAuthorityProjection?.plane !== plane) {
    throw new Error(`${plane} authorization pack has no matching tenant authority projection`);
  }
  const { sha256, ...projectionBody } = pack.tenantAuthorityProjection;
  const actualProjectionSha = createHash("sha256").update(canonicalJson(projectionBody)).digest("hex");
  if (sha256 !== actualProjectionSha) throw new Error(`${plane} tenant authority projection checksum mismatch`);
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
