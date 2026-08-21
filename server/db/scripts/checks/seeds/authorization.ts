#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface Pack {
  planePack: string;
  identityContract: {
    enabledSubjectCount: number;
    mappedSubjectCount: number;
    unmanagedKeycloakUsers: string;
    fieldConflictBehavior: string;
  };
  subjectAssignments: Array<{
    keycloakSubject: string;
    planes: Array<{ plane: string }>;
  }>;
  mutationPolicy: {
    truncate: string;
    authorizationWideDelete: string;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const strict = process.argv.includes("--strict");
const failures: string[] = [];
const beforeInventoryPath = option("--identity-before");
const afterInventoryPath = option("--identity-after");
const packs: Record<string, { hash: string; subjects: number }> = {};
for (const target of ["studio", "neon", "mesh"]) {
  const root = resolve(databaseRoot, `seed/packs/authorization-v2/${target}`);
  const pack = await readJson<Pack>(resolve(root, "seed-pack.v1.json"));
  const expected = (await readFile(resolve(root, "seed-pack.sha256"), "utf8")).trim();
  const actual = sha256(canonical(pack));
  if (pack.planePack !== target) failures.push(`${target}: plane pack identity mismatch`);
  if (expected !== actual) failures.push(`${target}: deterministic content hash mismatch`);
  if (
    pack.identityContract.unmanagedKeycloakUsers !== "deny"
    || pack.identityContract.fieldConflictBehavior !== "fail"
  ) failures.push(`${target}: identity preservation policy mismatch`);
  if (
    pack.mutationPolicy.truncate !== "forbidden"
    || pack.mutationPolicy.authorizationWideDelete !== "forbidden"
  ) failures.push(`${target}: destructive seed mutation policy`);
  if (pack.subjectAssignments.some((subject) =>
    !subject.keycloakSubject
    || subject.planes.length === 0
    || subject.planes.some((assignment) => assignment.plane !== target)
  )) failures.push(`${target}: incomplete subject assignment`);
  packs[target] = { hash: actual, subjects: pack.subjectAssignments.length };
}

const seedSql = (await walk(resolve(databaseRoot, "seed")))
  .filter((path) => extname(path) === ".sql");
const allSeedSources = await Promise.all(seedSql.map(async (path) => ({
  path,
  relativePath: path.replace(`${databaseRoot}\\`, "").replace(/\\/g, "/"),
  sql: stripComments(await readFile(path, "utf8")),
})));
const seedSources = allSeedSources;
const sql = seedSources.map((source) => source.sql).join("\n");
const destructive = [
  /\bTRUNCATE(?:\s+TABLE)?\s+(?:master|mesh)\.(?:auth_|principal|access_grant)/i,
  /\bDELETE\s+FROM\s+(?:master|mesh)\.(?:auth_|principal|access_grant)/i,
].filter((pattern) => pattern.test(stripComments(sql)));
if (destructive.length > 0) failures.push("authorization-wide truncate/delete remains in seeds");
const legacyAuthorityWrite = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:shared\.(?:permission(?:_category|_scope_policy)?|persona|persona_permission|role|enterprise_feature|plan_(?:feature|module)_access)|master\.(?:principal_persona|access_grant|company_code_access|(?:group|principal)_feature_grant|tenant_admin_grant|delegation_grant|attachment_acl|content_item_access_grant|business_network(?:_membership(?:_role)?)?|auth_(?:scope_target|role(?:_permission)?|group(?:_role|_member)?|plane_membership|delegation(?:_grant)?))|mesh\.(?:principal(?:_identity_binding)?|account_grant|attachment_acl|content_item_access_grant)|control\.permission_alias)\b/gi;
const legacyAuthoritySeedWrites = seedSources.flatMap((source) =>
  [...source.sql.matchAll(legacyAuthorityWrite)].map((match) => ({
    path: source.path.replace(`${databaseRoot}\\`, "").replace(/\\/g, "/"),
    statement: match[0].replace(/\s+/g, " "),
  }))
);
if (legacyAuthoritySeedWrites.length > 0) {
  failures.push(`${legacyAuthoritySeedWrites.length} legacy authorization seed write(s) remain`);
}
const prohibitedIdentityToken = /\b(?:idp_enabled|idp_email_verified|principal_source|is_service_account|keycloak_id|keycloak_username|keycloak_sync_status)\b/gi;
const prohibitedIdentitySeedReferences = seedSources.flatMap((source) =>
  [...source.sql.matchAll(prohibitedIdentityToken)].map((match) => ({
    path: source.path.replace(`${databaseRoot}\\`, "").replace(/\\/g, "/"),
    identifier: match[0],
  }))
);
if (prohibitedIdentitySeedReferences.length > 0) {
  failures.push(`${prohibitedIdentitySeedReferences.length} prohibited identity seed reference(s) remain`);
}

const keycloakSetup = await readJson<{
  tenantOrganizations?: Array<{
    alias?: string;
    attributes?: { context_kind?: string[] };
  }>;
}>(resolve(
  repositoryRoot,
  "stack/config/iam/realm-athyper-demosetup.json",
));
const invalidOrganizationAliases = (keycloakSetup.tenantOrganizations ?? [])
  .filter((organization) => organization.attributes?.context_kind?.includes("tenant"))
  .map((organization) => organization.alias ?? "")
  .filter((alias) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alias));
if (invalidOrganizationAliases.length > 0) {
  failures.push(`${invalidOrganizationAliases.length} Keycloak organization alias(es) are not tenant UUIDs`);
}

const userManifest = await readJson<{
  contractVersion: string;
  enabledSubjectCount: number;
  mappedSubjectCount: number;
  unresolvedSubjectBehavior: string;
}>(resolve(
  databaseRoot,
  "seed/contracts/authorization/admission/compiled/keycloak-admission.v1.json",
));
if (
  userManifest.contractVersion !== "athyper.authorization.keycloak-admission.v1"
  || userManifest.unresolvedSubjectBehavior !== "deny"
  ||
  userManifest.enabledSubjectCount !== userManifest.mappedSubjectCount
) failures.push("development enabled-subject mapping is incomplete");
const identityConservation = beforeInventoryPath && afterInventoryPath
  ? await compareIdentityInventories(beforeInventoryPath, afterInventoryPath)
  : "requires_before_and_after_export_from_live_local_keycloak";

const report = {
  contractVersion: "authorization-v2.phase5-seed-and-identity-gate.v1",
  generatedAt: new Date().toISOString(),
  packs,
  gates: {
    deterministicSeedHashes: failures.every((value) => !value.includes("hash mismatch")),
    noAuthorizationWideTruncateDelete:
      failures.every((value) => !value.includes("truncate/delete")),
    unmanagedKeycloakUsersUntouched:
      failures.every((value) => !value.includes("identity preservation")),
    allActiveDevelopmentUsersMapped:
      failures.every((value) => !value.includes("enabled-subject")),
    canonicalPacksAreOnlyAuthorizationSeeds:
      failures.every((value) => !value.includes("legacy authorization seed write")),
    prohibitedIdentitySeedReferencesZero:
      prohibitedIdentitySeedReferences.length === 0,
    keycloakOrganizationAliasesAreTenantUuids:
      invalidOrganizationAliases.length === 0,
    keycloakIdentityCountAndHashUnchanged: identityConservation,
  },
  staticReady: failures.length === 0,
  ready: failures.length === 0 && identityConservation === true,
  failures,
  legacyAuthoritySeedWrites,
  prohibitedIdentitySeedReferences,
  invalidOrganizationAliases,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && failures.length > 0) process.exitCode = 1;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
function stripComments(value: string): string {
  return value.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
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
function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
async function compareIdentityInventories(
  beforePath: string,
  afterPath: string,
): Promise<boolean> {
  const before = JSON.parse(await readFile(beforePath, "utf8")) as {
    enabledSubjectCount: number;
    totalSubjectCount: number;
    canonicalIdentitySha256: string;
  };
  const after = JSON.parse(await readFile(afterPath, "utf8")) as typeof before;
  const unchanged =
    before.enabledSubjectCount !== after.enabledSubjectCount
    || before.totalSubjectCount !== after.totalSubjectCount
    || before.canonicalIdentitySha256 !== after.canonicalIdentitySha256;
  if (unchanged) {
    failures.push("Keycloak identity count or canonical hash changed");
  }
  return !unchanged;
}
