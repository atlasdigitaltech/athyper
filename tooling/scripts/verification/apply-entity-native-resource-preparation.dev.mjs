export const nativeFieldKeyUniquenessMigrationName =
  "20261008_entity_native_field_key_uniqueness.sql";
export const nativeFieldContractTriggerMigrationName =
  "20261008_entity_native_field_contract_trigger.sql";
export const nativeIdentityAdoptionMigrationName =
  "20261008_entity_native_identity_adoption.sql";
export const productCreationEntityReadMigrationName =
  "20261008_entity_product_creation_entity_read.sql";
export const liveReadResourceProjectionMigrationName =
  "20261008_entity_live_read_resource_projection.sql";
export const liveReadResourceReviewMigrationName =
  "20261008_entity_live_read_resource_review.sql";
export const authoringIdentityPolicyValidationMigrationName =
  "20261008_entity_authoring_identity_policy_validation.sql";
export const authoringIdentityGraphValidationMigrationName =
  "20261008_entity_authoring_identity_graph_validation.sql";
export const authoringIdentityConstraintExecutionMigrationName =
  "20261008_entity_authoring_identity_constraint_execution.sql";
export const authoringResourceEntitlementReadsMigrationName =
  "20261008_entity_authoring_resource_entitlement_reads.sql";
export const authoringResourceEntitlementEvaluationMigrationName =
  "20261008_entity_authoring_resource_entitlement_evaluation.sql";
export const authoringResourceScopeEvaluationMigrationName =
  "20261008_entity_authoring_resource_scope_evaluation.sql";
export const authoringResourceWorkerReadsMigrationName =
  "20261008_entity_authoring_resource_worker_reads.sql";
export const authoringResourceCurrentSourceMigrationName =
  "20261008_entity_authoring_resource_current_source.sql";
export const authoringResourceHistoryMigrationName =
  "20261008_entity_authoring_resource_history.sql";
export const authoringResourceReviewMigrationName =
  "20261008_entity_authoring_resource_review.sql";
export const referenceResourceReadsMigrationName =
  "20261008_entity_reference_resource_reads.sql";
export const authoringResourceProjectionMigrationName =
  "20261008_entity_authoring_resource_projection.sql";
export const referencePrivilegesMigrationName =
  "20261008_entity_reference_command_privileges.sql";
/** Bounded DEV schema preparation. No authoring conversion, grants or activation. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { migrationSourcePath } from "./migration-source.mjs";

export const ownershipInitializationMigrationName =
  "20261008_entity_legacy_ownership_initialization.sql";
export const componentCatalogueMigrationName =
  "20261007_entity_ui_component_catalogue.sql";
export const snapshotMigrationName =
  "20261007_entity_native_snapshot_guards.sql";
export const coreRootMigrationName =
  "20261007_entity_native_core_root_guards.sql";
export const constraintMigrationName =
  "20261007_entity_native_constraint_compatibility.sql";
export const typedRowMigrationName =
  "20261007_entity_native_typed_row_preparation.sql";
export const nativeBootstrapPrivilegesMigrationName =
  "20261008_entity_native_bootstrap_privileges.sql";
export const operationReservationMigrationName =
  "20261008_entity_operation_bootstrap_reservation.sql";
export const productDraftCreationMigrationName =
  "20261008_entity_product_draft_creation.sql";
export const operationBootstrapMigrationName =
  "20261008_entity_native_operation_bootstrap.sql";
export const migrationName = "20261007_entity_native_resource_preparation.sql";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export const legacyNullabilityMigrationName =
  "20261007_entity_native_legacy_nullability_preparation.sql";
export const rootMigrationName = "20261007_entity_native_root_preparation.sql";
export const revisionMigrationName =
  "20261007_entity_root_revision_protocol.sql";
export const revisionProvenanceMigrationName =
  "20261007_entity_root_revision_provenance.sql";
export function preparationSql(
  source,
  digest,
  apply,
  selectedMigration = migrationName,
) {
  assert.ok(
    [
      nativeFieldKeyUniquenessMigrationName,
      nativeFieldContractTriggerMigrationName,
      nativeIdentityAdoptionMigrationName,
      productCreationEntityReadMigrationName,
      nativeBootstrapPrivilegesMigrationName,
      operationReservationMigrationName,
      productDraftCreationMigrationName,
      operationBootstrapMigrationName,
      migrationName,
      rootMigrationName,
      revisionMigrationName,
      revisionProvenanceMigrationName,
      legacyNullabilityMigrationName,
      typedRowMigrationName,
      constraintMigrationName,
      coreRootMigrationName,
      snapshotMigrationName,
      componentCatalogueMigrationName,
      ownershipInitializationMigrationName,
      referencePrivilegesMigrationName,
      authoringResourceProjectionMigrationName,
      referenceResourceReadsMigrationName,
      authoringResourceReviewMigrationName,
      liveReadResourceReviewMigrationName,
      liveReadResourceProjectionMigrationName,
      authoringResourceHistoryMigrationName,
      authoringResourceCurrentSourceMigrationName,
      authoringResourceWorkerReadsMigrationName,
      authoringResourceScopeEvaluationMigrationName,
      authoringResourceEntitlementEvaluationMigrationName,
      authoringResourceEntitlementReadsMigrationName,
      authoringIdentityConstraintExecutionMigrationName,
      authoringIdentityGraphValidationMigrationName,
      authoringIdentityPolicyValidationMigrationName,
    ].includes(selectedMigration),
  );
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hash(source), digest);
  assert.ok(source.startsWith("BEGIN;\n") && source.endsWith("COMMIT;\n"));
  const ledger = `
  INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at)
  VALUES('${selectedMigration}','${digest}','applied','native-resource-preparation',transaction_timestamp(),clock_timestamp());
  `;
  return source
    .replace(
      "BEGIN;\n",
      () => `BEGIN;
  SELECT pg_advisory_xact_lock(hashtextextended('${selectedMigration}',0));
  DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${selectedMigration}') THEN
  RAISE EXCEPTION 'Native preparation ledger changed; recheck exact applied evidence'; END IF; END $$;
  `,
    )
    .replace(/COMMIT;\n$/, apply ? ledger + "COMMIT;\n" : "ROLLBACK;\n");
}
export function runPreparation(args) {
  const allowed = new Set([
    "--apply=DEV-NATIVE-RESOURCE-PREPARATION",
    "--root",
    "--revision",
    "--revision-provenance",
    "--legacy-nullability",
    "--typed-row-guards",
    "--constraint-compatibility",
    "--core-root-guards",
    "--snapshot-guards",
    "--component-catalogue",
    "--ownership-initialization",
    "--reference-command-privileges",
    "--authoring-resource-projection",
    "--reference-resource-reads",
    "--authoring-resource-review",
    "--live-read-resource-review",
    "--native-field-key-uniqueness",
    "--native-field-contract-trigger",
    "--native-identity-adoption",
    "--product-creation-entity-read",
    "--native-bootstrap-privileges",
    "--operation-reservation",
    "--product-draft-creation",
    "--operation-bootstrap",
    "--live-read-resource-projection",
    "--authoring-resource-history",
    "--authoring-resource-current-source",
    "--authoring-resource-worker-reads",
    "--authoring-resource-scope-evaluation",
    "--authoring-resource-entitlement-evaluation",
    "--authoring-resource-entitlement-reads",
    "--authoring-identity-constraint-execution",
    "--authoring-identity-graph-validation",
    "--authoring-identity-policy-validation",
  ]);
  let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") {
      assert.equal(output, undefined);
      output = args[++i];
    } else
      assert.ok(
        allowed.delete(args[i]),
        "Unknown or repeated preparation option",
      );
  }
  assert.ok(
    output,
    "Use --output to retain the exact schema-preparation receipt",
  );
  assert.ok(
    [
      "--root",
      "--revision",
      "--revision-provenance",
      "--legacy-nullability",
      "--typed-row-guards",
      "--constraint-compatibility",
      "--core-root-guards",
      "--snapshot-guards",
      "--component-catalogue",
      "--ownership-initialization",
      "--reference-command-privileges",
      "--authoring-resource-projection",
      "--reference-resource-reads",
      "--authoring-resource-review",
      "--live-read-resource-review",
      "--native-field-key-uniqueness",
      "--native-field-contract-trigger",
      "--native-identity-adoption",
      "--product-creation-entity-read",
      "--native-bootstrap-privileges",
      "--operation-reservation",
      "--product-draft-creation",
      "--operation-bootstrap",
      "--live-read-resource-projection",
      "--authoring-resource-history",
      "--authoring-resource-current-source",
      "--authoring-resource-worker-reads",
      "--authoring-resource-scope-evaluation",
      "--authoring-resource-entitlement-evaluation",
      "--authoring-resource-entitlement-reads",
      "--authoring-identity-constraint-execution",
      "--authoring-identity-graph-validation",
      "--authoring-identity-policy-validation",
    ].filter((option) => !allowed.has(option)).length <= 1,
    "Select one preparation kind",
  );
  const selectedMigration = !allowed.has("--native-field-key-uniqueness")
    ? nativeFieldKeyUniquenessMigrationName
    : !allowed.has("--native-field-contract-trigger")
      ? nativeFieldContractTriggerMigrationName
      : !allowed.has("--native-identity-adoption")
        ? nativeIdentityAdoptionMigrationName
        : !allowed.has("--product-creation-entity-read")
          ? productCreationEntityReadMigrationName
          : !allowed.has("--native-bootstrap-privileges")
            ? nativeBootstrapPrivilegesMigrationName
            : !allowed.has("--operation-reservation")
              ? operationReservationMigrationName
              : !allowed.has("--product-draft-creation")
                ? productDraftCreationMigrationName
                : !allowed.has("--operation-bootstrap")
                  ? operationBootstrapMigrationName
                  : !allowed.has("--live-read-resource-projection")
                    ? liveReadResourceProjectionMigrationName
                    : !allowed.has("--live-read-resource-review")
                      ? liveReadResourceReviewMigrationName
                      : !allowed.has("--authoring-identity-policy-validation")
                        ? authoringIdentityPolicyValidationMigrationName
                        : !allowed.has("--authoring-identity-graph-validation")
                          ? authoringIdentityGraphValidationMigrationName
                          : !allowed.has(
                                "--authoring-identity-constraint-execution",
                              )
                            ? authoringIdentityConstraintExecutionMigrationName
                            : !allowed.has(
                                  "--authoring-resource-entitlement-reads",
                                )
                              ? authoringResourceEntitlementReadsMigrationName
                              : !allowed.has(
                                    "--authoring-resource-entitlement-evaluation",
                                  )
                                ? authoringResourceEntitlementEvaluationMigrationName
                                : !allowed.has(
                                      "--authoring-resource-scope-evaluation",
                                    )
                                  ? authoringResourceScopeEvaluationMigrationName
                                  : !allowed.has(
                                        "--authoring-resource-worker-reads",
                                      )
                                    ? authoringResourceWorkerReadsMigrationName
                                    : !allowed.has(
                                          "--authoring-resource-current-source",
                                        )
                                      ? authoringResourceCurrentSourceMigrationName
                                      : !allowed.has(
                                            "--authoring-resource-history",
                                          )
                                        ? authoringResourceHistoryMigrationName
                                        : !allowed.has(
                                              "--authoring-resource-review",
                                            )
                                          ? authoringResourceReviewMigrationName
                                          : !allowed.has(
                                                "--reference-resource-reads",
                                              )
                                            ? referenceResourceReadsMigrationName
                                            : !allowed.has(
                                                  "--authoring-resource-projection",
                                                )
                                              ? authoringResourceProjectionMigrationName
                                              : !allowed.has(
                                                    "--reference-command-privileges",
                                                  )
                                                ? referencePrivilegesMigrationName
                                                : !allowed.has(
                                                      "--ownership-initialization",
                                                    )
                                                  ? ownershipInitializationMigrationName
                                                  : !allowed.has(
                                                        "--component-catalogue",
                                                      )
                                                    ? componentCatalogueMigrationName
                                                    : !allowed.has(
                                                          "--snapshot-guards",
                                                        )
                                                      ? snapshotMigrationName
                                                      : !allowed.has(
                                                            "--core-root-guards",
                                                          )
                                                        ? coreRootMigrationName
                                                        : !allowed.has(
                                                              "--constraint-compatibility",
                                                            )
                                                          ? constraintMigrationName
                                                          : !allowed.has(
                                                                "--typed-row-guards",
                                                              )
                                                            ? typedRowMigrationName
                                                            : !allowed.has(
                                                                  "--legacy-nullability",
                                                                )
                                                              ? legacyNullabilityMigrationName
                                                              : !allowed.has(
                                                                    "--revision-provenance",
                                                                  )
                                                                ? revisionProvenanceMigrationName
                                                                : !allowed.has(
                                                                      "--revision",
                                                                    )
                                                                  ? revisionMigrationName
                                                                  : allowed.has(
                                                                        "--root",
                                                                      )
                                                                    ? migrationName
                                                                    : rootMigrationName;
  const apply = !allowed.has("--apply=DEV-NATIVE-RESOURCE-PREPARATION");
  const file = migrationSourcePath(selectedMigration),
    source = readFileSync(file, "utf8"),
    digest = hash(source);
  const inventory = JSON.parse(
    readFileSync(
      new URL("../../../server/db/migrations/inventory.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    inventory.entries.find(
      (entry) => entry.originalPath === "migrations/" + selectedMigration,
    )?.sha256,
    digest,
  );
  const run = (sql) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_studio",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  assert.equal(run("SELECT current_database()").trim(), "athyper_studio");
  const prior = run(
    `SELECT status||'|'||sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${selectedMigration}'`,
  ).trim();
  const fingerprint = () =>
    hash(
      run(
        [
          ...[
            "role",
            "role_permission",
            "group_member",
            "group_role",
            "plane_membership",
            "delegation",
            "delegation_grant",
            "permission",
            "permission_scope_kind",
            "deny_rule",
            "record_acl",
            "override",
            "scope_target",
            "principal_group",
          ].map(
            (table) =>
              `SELECT '${table}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${table} r`,
          ),
          "SELECT 'heads',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head r",
        ].join(" UNION ALL "),
      ),
    );
  const before = fingerprint();
  const report = {
    schema: "entity.native-resource-preparation-evidence/1",
    inspectedAt: new Date().toISOString(),
    database: "athyper_studio",
    migration: selectedMigration,
    sha256: digest,
    rollbackRehearsed: false,
    applied: false,
    replay: false,
    authorizationAndHeadsUnchanged: false,
    qualification: "not-established",
    productionEnabled: false,
  };
  if (prior) {
    assert.equal(
      prior,
      "applied|" + digest,
      "Existing migration status/hash requires operator investigation",
    );
    report.applied = true;
    report.replay = true;
  } else {
    assert.ok(
      run(preparationSql(source, digest, false, selectedMigration))
        .trim()
        .endsWith("ROLLBACK"),
    );
    report.rollbackRehearsed = true;
    assert.equal(fingerprint(), before);
    assert.equal(hash(readFileSync(file)), digest);
    if (apply) {
      assert.ok(
        run(preparationSql(source, digest, true, selectedMigration))
          .trim()
          .endsWith("COMMIT"),
      );
      assert.equal(
        run(
          `SELECT status||'|'||sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${selectedMigration}'`,
        ).trim(),
        "applied|" + digest,
      );
      report.applied = true;
    }
  }
  assert.equal(fingerprint(), before);
  report.authorizationAndHeadsUnchanged = true;
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(runPreparation(process.argv.slice(2)), null, 2));
}
