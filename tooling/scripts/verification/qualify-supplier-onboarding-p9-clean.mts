import { qualifyNativeForm } from "./supplier-onboarding-p9-native-form.mjs";
/** Isolated empty-database build; canonical manifests only, no live data or migrations. */
import { applyFoundation } from "../../../server/db/scripts/provisioning/foundation-runner.js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { applyAuthorizationSeedPack } from "../../../server/db/scripts/provisioning/apply-authorization-seed-pack.js";
import { provisionDevelopmentBusinessPartnerRuntime } from "../../../server/db/scripts/provisioning/provision-development-business-partner-runtime.js";
import { setTimeout as delay } from "node:timers/promises";
const docker = (args: string[], input?: string) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
const name = `athyper-bs360-supplier-p9-${randomUUID()}`;
const report: any = {
  at: new Date().toISOString(),
  container: name,
  isolated: true,
  passed: false,
  planes: {},
};
const socket = mkdtempSync("/tmp/athyper-p9-socket-");
chmodSync(socket, 0o777);
let created = false;
try {
  const image = docker([
    "inspect",
    "--format",
    "{{.Image}}",
    "athyper-dev-db-1",
  ]).trim();
  report.image = image;
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--mount",
    `type=bind,source=${socket},target=/var/run/postgresql`,
    "--label",
    "athyper.environment=disposable_local",
    "--label",
    "athyper.purpose=business-partner-360-integration-baseline",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=athyper_neon",
    image,
  ]);
  created = true;
  for (let n = 0; n < 60; n++) {
    try {
      docker(["exec", name, "pg_isready", "-U", "postgres"]);
      break;
    } catch {
      if (n === 59) throw Error("Isolated PostgreSQL did not become ready");
      await delay(500);
    }
  }
  for (const plane of ["studio", "neon"] as const) {
    console.log(`Building ${plane} from the canonical empty-database manifest`);
    report.planes[plane] = await applyFoundation({
      plane,
      dockerContainer: name,
      databaseUser: "postgres",
    });
  }
  const databaseUrl = (plane: string) =>
    `postgresql://postgres@localhost/athyper_${plane}?host=${encodeURIComponent(socket)}`;
  report.authorization = {};
  for (const plane of ["studio", "neon"] as const) {
    console.log(
      `Provisioning canonical ${plane} authorization and tenant seeds`,
    );
    report.authorization[plane] = await applyAuthorizationSeedPack({
      plane,
      databaseUrl: databaseUrl(plane),
    });
  }
  // This canonical seed contains tenant-owned domains; apply it after tenant creation too.
  const tenantReference =
    "server/db/ddl/planes/neon/control/12_reference_seed.sql";
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
    ],
    "BEGIN; SELECT set_config('app.database_plane','neon',true),set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',true);\n" +
      readFileSync(tenantReference, "utf8") +
      "\nCOMMIT;",
  );
  report.tenantReference = tenantReference;
  report.nativeForm = await qualifyNativeForm(socket);
  console.log("Publishing canonical business partner runtime");
  report.runtime = await provisionDevelopmentBusinessPartnerRuntime({
    databaseUrl: databaseUrl("neon"),
    studioDatabaseUrl: databaseUrl("studio"),
    confirmation: "LOCAL-NEON-BUSINESS-PARTNER-RUNTIME",
  });
  report.runtimeReplay = await provisionDevelopmentBusinessPartnerRuntime({
    databaseUrl: databaseUrl("neon"),
    studioDatabaseUrl: databaseUrl("studio"),
    confirmation: "LOCAL-NEON-BUSINESS-PARTNER-RUNTIME",
  });
  // A named catalog role is canonical pilot configuration, with no grants on any live database.
  docker([
    "exec",
    name,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-c",
    `BEGIN; SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true); INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES('98377871-282c-4f42-b034-6ee892a55b9f','44444444-4444-4444-8444-444444444444','dev.bp.approvers.operating_organization','Local supplier profile reviewer','system','seed','supplier-onboarding-p9-clean','draft','cca94907-7519-5871-8e3c-6b11aa545c93'); INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT '44444444-4444-4444-8444-444444444444','98377871-282c-4f42-b034-6ee892a55b9f',id,'cca94907-7519-5871-8e3c-6b11aa545c93' FROM authz.permission WHERE canonical_code='neon.relationship.entity_case.decide' AND status='published'; UPDATE authz.role SET status='active' WHERE id='98377871-282c-4f42-b034-6ee892a55b9f'; INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) SELECT owner_group.tenant_id,owner_group.group_id,'98377871-282c-4f42-b034-6ee892a55b9f',scope.id,'subtree','manual','supplier-onboarding-p9-clean','active','cca94907-7519-5871-8e3c-6b11aa545c93' FROM (SELECT gm.tenant_id,gm.group_id FROM authz.group_member gm JOIN master.principal p ON p.tenant_id=gm.tenant_id AND p.id=gm.principal_id WHERE p.tenant_id='44444444-4444-4444-8444-444444444444' AND p.code='catl.owner' AND gm.status='active' ORDER BY gm.group_id LIMIT 1) owner_group JOIN authz.scope_target scope ON scope.tenant_id=owner_group.tenant_id AND scope.scope_kind='operating_organization' AND scope.target_id='a478f9c0-8226-5d22-9599-b8fb27a45180'; COMMIT;`,
  ]);
  for (let pass = 0; pass < 2; pass++) {
    console.log(`Authoring canonical supplier catalogs, pass ${pass + 1}`);
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "tooling/scripts/verification/publish-supplier-process-catalog-live.mts",
        `--disposable-container=${name}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const catalog = JSON.parse(
      readFileSync(
        "governance/policy/reports/supplier-onboarding-p9-clean-catalog.dev.json",
        "utf8",
      ),
    );
    if (
      !catalog.passed ||
      catalog.result !== (pass === 0 ? "published" : "replayed")
    )
      throw Error("Catalog publication replay failed");
    report[pass === 0 ? "catalog" : "catalogReplay"] = catalog;
  }
  const query =
    "SELECT json_build_object('reviewerAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref='supplier-onboarding-p9-clean' AND status='active'),'templates',(SELECT count(*) FROM control.notification_template WHERE template_key LIKE 'supplier.onboarding.%'),'routes',(SELECT count(*) FROM control.notification_routing_rule WHERE code LIKE 'supplier.onboarding.%'),'attemptTable',to_regclass('governance.process_attempt')::text,'documentJobs',to_regclass('governance.process_document_job')::text,'pinGuard',to_regprocedure('governance.trg_supplier_onboarding_completion()')::text,'lifecycle',to_regprocedure('document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid)')::text)";
  report.inventory = JSON.parse(
    docker([
      "exec",
      name,
      "psql",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-Atc",
      query,
    ]),
  );
  if (
    report.inventory.reviewerAssignments !== 1 ||
    report.inventory.templates !== 16 ||
    report.inventory.routes !== 13 ||
    !report.inventory.attemptTable ||
    !report.inventory.documentJobs ||
    !report.inventory.pinGuard ||
    !report.inventory.lifecycle
  )
    throw Error("Fresh supplier foundation inventory incomplete");
  report.passed = true;
} catch (error) {
  const parts = [];
  for (let cause: any = error; cause; cause = cause.cause)
    parts.push(cause.message ?? String(cause));
  report.error = parts.join("\n").slice(0, 6000);
  throw error;
} finally {
  if (
    created &&
    (report.passed || !process.argv.includes("--retain-on-failure"))
  ) {
    docker([
      "exec",
      "-u",
      "0",
      name,
      "chown",
      `${process.getuid!()}:${process.getgid!()}`,
      "/var/run/postgresql",
    ]);
    docker(["rm", "-f", "-v", name]);
    report.removed = true;
  }
  if (report.removed) rmSync(socket, { recursive: true, force: true });
  else if (created) report.retainedSocket = socket;
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-p9-clean.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      error: report.error,
      removed: report.removed,
    }),
  );
}
