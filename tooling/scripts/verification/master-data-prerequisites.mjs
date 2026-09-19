#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const defaultRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const routes = [
  { method: "POST", path: "/api/master/addresses/{addressLinkId}/deactivate", permissions: ["master.address.pii.write"], resource: ["addressLinkId"], intent: "owner aggregate address closure plus sensitive-write capability" },
  { method: "POST", path: "/api/master/contacts/{contactId}/deactivate", permissions: ["master.contact.pii.write"], resource: ["contactId"], intent: "owner aggregate contact closure plus sensitive-write capability" },
  { method: "PATCH", path: "/api/master/contacts/{contactId}/verification", permissions: ["master.contact.verify"], resource: ["contactId"], intent: "contact verification capability with trusted owner scope" },
  { method: "POST", path: "/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/addresses", permissions: ["master.address.pii.write"], resource: ["tenantId", "ownerEntityCode", "ownerTypeId", "ownerId"], intent: "owner aggregate address attachment plus sensitive-write capability" },
  { method: "POST", path: "/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/contacts", permissions: ["master.contact.pii.write"], resource: ["tenantId", "ownerEntityCode", "ownerTypeId", "ownerId"], intent: "owner aggregate contact creation plus sensitive-write capability" },
  { method: "GET", path: "/api/master/owners/{entityCode}/{ownerTypeId}/{ownerId}/profile", permissions: ["master.profile.read", "master.contact.pii.read", "master.address.pii.read"], resource: ["tenantId", "ownerEntityCode", "ownerTypeId", "ownerId"], intent: "owner aggregate read plus contact/address sensitive-read capabilities" },
];
const planes = ["studio", "neon", "mesh"];
const tables = ["master.address", "master.address_link", "master.contact_link"];
export function assessPrerequisites({ root = defaultRoot, scope } = {}) {
  const inputs = [];
  function read(path) {
    const bytes = readFileSync(resolve(root, path));
    inputs.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
    return bytes.toString("utf8");
  }
  const launch = scope ?? JSON.parse(read("docs/runbooks/master-data-phase1/launch-scope.json"));
  const blockers = [];
  const block = (code, detail) => blockers.push({ code, detail });
  if (launch.schema !== "athyper.master-data.launch-scope.v1") throw new Error("Unsupported launch-scope schema");
  const missing = [
    ...(["scope_confirmed", "confirmed"].includes(launch.decisionStatus) ? [] : ["decisionStatus"]),
    ...(["staging", "production"].includes(launch.environment) ? [] : ["environment"]),
    ...(Array.isArray(launch.planes) && launch.planes.length && launch.planes.every(p => planes.includes(p)) ? [] : ["planes"]),
    ...(Array.isArray(launch.tenantIds) && launch.tenantIds.length && launch.tenantIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) ? [] : ["tenantIds"]),
    ...(Array.isArray(launch.channels) && launch.channels.length && launch.channels.every(c => ["email", "phone", "fax", "sms", "whatsapp", "website"].includes(c)) ? [] : ["channels"]),
    ...(typeof launch.provider === "string" && launch.provider.trim() ? [] : ["provider"]),
    ...(Array.isArray(launch.ownerTypes) && launch.ownerTypes.length && launch.ownerTypes.every(v=>typeof v==="string" && v.trim()) ? [] : ["ownerTypes"]),
    ...["domain", "integration", "iam", "database", "release"].filter(role => typeof launch.accountableOwners?.[role] !== "string" || !launch.accountableOwners[role].trim()).map(role => `accountableOwners.${role}`),
  ];
  if (missing.length) block("LAUNCH_DECISIONS_PENDING", `Resolve: ${missing.join(", ")}`);
  if (launch.pilot) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    const { primaryTenantId, negativeTestTenantId } = launch.pilot;
    if (typeof primaryTenantId !== "string" || !uuid.test(primaryTenantId) || typeof negativeTestTenantId !== "string" || !uuid.test(negativeTestTenantId) || primaryTenantId.toLowerCase() === negativeTestTenantId.toLowerCase()
        || !launch.tenantIds?.includes(primaryTenantId) || !launch.tenantIds?.includes(negativeTestTenantId)) {
      block("PILOT_TENANT_ISOLATION_PENDING", "Select distinct primary and negative-test tenant IDs and include both in the fixture scope; verification trust remains primary-tenant only");
    }
  }
  const service = read("server/packages/services/master-data/src/services.ts");
  const routeSource = read("server/packages/services/master-data/src/master-data-routes.ts");
  const actualPermissions = [...new Set([...service.matchAll(/requirePermission\([^\n]*?"(master\.[^"]+)"/g)].map(m=>m[1]))].sort();
  const expectedPermissions = [...new Set(routes.flatMap(r=>r.permissions))].sort();
  if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) block("ROUTE_PERMISSION_INVENTORY_DRIFT", "Service permission calls differ from the reviewed route matrix");
  const actualRoutes = [...routeSource.matchAll(/app\.(get|post|patch)\("([^"]+)"/g)].map(m=>`${m[1].toUpperCase()} ${m[2].replace(/:([A-Za-z][A-Za-z0-9]*)/g,"{$1}")}`).sort();
  if (JSON.stringify(actualRoutes) !== JSON.stringify(routes.map(r=>`${r.method} ${r.path}`).sort())) block("ROUTE_INVENTORY_DRIFT", "Route definitions differ from the prerequisite inventory");
  const registries = planes.map(plane => {
    const catalog = JSON.parse(read(`server/db/seed/contracts/authorization/catalog/${plane}/catalog.v2.json`));
    const bindings = JSON.parse(read(`server/db/seed/contracts/authorization/catalog/${plane}/operation-bindings.v1.json`));
    const scopeCompatibility = JSON.parse(read(`server/db/seed/contracts/authorization/catalog/${plane}/scope-compatibility.v1.json`));
    const exact = catalog.permissions.filter(p=>expectedPermissions.includes(p.canonicalCode));
    const related = catalog.permissions.filter(p=>/address_contact|contact|address/.test(p.canonicalCode));
    return { plane, permissionCount: catalog.permissions.length, lifecycleCounts: Object.fromEntries([...new Set(catalog.permissions.map(p=>p.lifecycle))].map(l=>[l,catalog.permissions.filter(p=>p.lifecycle===l).length])), operationBindingCount: bindings.authzEntityOperationBindings.length,
      exactLegacyMatches: exact.map(p=>p.canonicalCode), relatedCandidates: related.map(p=>({code:p.canonicalCode,kind:p.permissionKind,lifecycle:p.lifecycle,scopes:scopeCompatibility.permissions.find(s=>s.permissionCode===p.canonicalCode)?.scopes ?? []})) };
  });
  if (registries.some(r=>r.exactLegacyMatches.length < expectedPermissions.length)) block("CANONICAL_PERMISSION_MAPPING_REQUIRED", "Legacy service permission strings lack complete exact catalog matches; related proposed/manage permissions are not replacements");
  // This is an inventory tool, not a publisher or an authority-release verifier.
  block("RELEASED_AUTHORITY_NOT_QUALIFIED", "Obtain released typed mappings, scope bindings, role/grant evidence, and real-IAM acceptance per launch plane; catalog presence or candidate promotion does not certify these");
  const inventory = JSON.parse(read("server/db/seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json"));
  const coverage = tables.map(table=>{
    const row = inventory.tables.find(t=>t.table===table);
    return { table, reviewStatus: row?.reviewStatus ?? "missing", classification: row?.classification ?? null, writerOwner: row?.writerOwner ?? null, requiredScopeKinds: row?.requiredScopeKinds ?? [] };
  });
  if (coverage.some(t=>t.reviewStatus==="pending_review" || t.reviewStatus==="missing")) block("MASTER_TABLE_REVIEW_PENDING", "Complete master address/contact ownership and sensitive-scope review in the authorization inventory");
  read("server/packages/platform/iam/src/permission-authorizer.ts");
  block("TRUSTED_OWNER_SCOPE_RESOLUTION_REQUIRED", "Current resources expose owner IDs or child IDs, not the IAM legalEntityId/companyCodeId/operatingOrganizationId/resourceId/recordId coordinates; qualify trusted owner-to-scope resolution and same-tenant negative tests");
  const compose = read("deploy/compose/instance/compose.parity.yaml");
  const verifierEnvironmentDeclared = /^\s+MASTER_DATA_VERIFICATION_KEYS_JSON:/m.test(compose);
  if (!verifierEnvironmentDeclared) block("VERIFIER_DEPLOYMENT_PLUMBING_PENDING", "The checked Compose parity file does not declare MASTER_DATA_VERIFICATION_KEYS_JSON; verify any selected override separately");
  for (const file of ["server/packages/services/master-data/src/kysely-master-data-repository.ts", "server/packages/services/master-data/src/provider-evidence-verifier.ts", "server/apps/platform-host/src/composition/register-services.ts", "server/db/ddl/common/master/03_platform_tables.sql", "server/db/seed/contracts/authorization/AUTHORIZATION-REBUILD-PLAN.md"]) read(file);
  const ddl = planes.map(plane=>({plane,sources:["control/03_tables.sql","master/05_constraints.sql","master/06_indexes.sql","master/07_functions.sql","master/08_triggers.sql","master/10_rls.sql","master/11_grants.sql"].map(suffix=>{
    const path=`server/db/ddl/planes/${plane}/${suffix}`; read(path); return path;
  })}));
  block("LIVE_COMPATIBILITY_UNASSESSED", "Run the read-only compatibility probe against each explicitly selected database with the application role; compare definitions and classify forward migrations. No live receipt was consumed");
  read("tooling/scripts/verification/master-data-prerequisites.mjs");
  read("docs/runbooks/master-data-phase1/database-compatibility.sql");
  read("docs/runbooks/master-data-phase1/pilot-authorization-design.md");
  const head = execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  const changes = execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim();
  return { schema:"athyper.master-data.phase1-assessment.v1", generatedAt:new Date().toISOString(), baseline:{head,dirty:!!changes,changedEntryCount:changes?changes.split("\n").length:0,sourceFingerprint:createHash("sha256").update(JSON.stringify(inputs)).digest("hex")},
    phase1Complete:false, productionQualified:false, assessmentOnly:true, launch, routes:routes.map(r=>({...r,canonicalMapping:null,mappingStatus:"requires_owner_and_IAM_review"})), registries, neonTableCoverage:coverage, deployment:{verifierEnvironmentDeclared}, databaseSources:ddl, blockers, inputs };
}
export function assessmentExitCode(report, strict) { return strict && (!report.phase1Complete || report.blockers.length) ? 1 : 0; }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2); let output;
  for(let i=0;i<args.length;i++) {if(args[i]==="--output") {output=args[++i];if(!output)throw new Error("--output requires a path");} else if(args[i]!=="--check")throw new Error(`Unknown argument: ${args[i]}`);}
  const report=assessPrerequisites();
  const json=JSON.stringify(report,null,2)+"\n";
  if(output)writeFileSync(resolve(output),json);else process.stdout.write(json);
  process.exitCode=assessmentExitCode(report,args.includes("--check"));
}
