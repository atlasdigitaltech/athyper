import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createApprovedOperationBootstrap } from "../../../server/packages/planes/studio/meta-entity-authoring/src/native-operation-bootstrap.ts";
/** Explicit DEV operational installation of already owner-approved evidence.
 * No HTTP caller, command login or issuer can invoke this administrative tool.
 * The supplied hash/approval reference must come from the owner's actual decision.
 */
export function installationSql({
  sources,
  targets,
  approvedHash,
  approvalReference,
  apply = false,
}) {
  createApprovedOperationBootstrap({
    sources,
    targets,
    approvedSourceRowsHash: approvedHash,
  });
  assert.equal(typeof approvalReference, "string");
  assert.ok(
    approvalReference.trim().length > 0 && approvalReference.length <= 1000,
  );
  const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  const rows = targets.flatMap((t) =>
    sources
      .filter((s) => s.entity_id === t.entityId)
      .map((s) => ({
        ...s,
        target_change_set_id: t.changeSetId,
        source_rows_hash: approvedHash,
        approval_reference: approvalReference,
      })),
  );
  const data = literal(JSON.stringify(rows));
  return `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL standard_conforming_strings=on;
 CREATE TEMP TABLE expected_bootstrap ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(${data}::jsonb) AS x(entity_id uuid,entity_code text,source_change_set_id uuid,source_revision bigint,source_operation_id uuid,operation_key text,requires_mfa boolean,target_change_set_id uuid,source_rows_hash text,approval_reference text);
 SELECT pg_advisory_xact_lock(hashtextextended('entity-native-bootstrap:'||target_change_set_id::text,0)) FROM (SELECT DISTINCT target_change_set_id FROM expected_bootstrap ORDER BY target_change_set_id) locks;
 DO $$ DECLARE r record; matched boolean; BEGIN
 FOR r IN SELECT * FROM expected_bootstrap ORDER BY entity_id,source_operation_id LOOP
  SELECT true INTO matched FROM metadata.entity_change_set s JOIN metadata.entity e ON e.id=s.entity_id JOIN metadata.entity_operation o ON o.change_set_id=s.id
   WHERE s.id=r.source_change_set_id AND s.lock_version=r.source_revision AND s.tenant_id IS NULL AND s.source_kind='product' AND s.status='draft' AND s.native_core_layout_version IS NULL
   AND e.id=r.entity_id AND e.entity_code=r.entity_code AND e.tenant_id IS NULL AND e.ownership_model='system'
   AND o.id=r.source_operation_id AND o.entity_id=e.id AND o.tenant_id IS NULL AND o.operation_key=r.operation_key AND o.operation_kind='read' AND o.requires_mfa=r.requires_mfa
   FOR SHARE OF s,e,o;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOTSTRAP_APPROVED_SOURCE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM metadata.entity_change_set WHERE id=r.target_change_set_id) THEN RAISE EXCEPTION 'BOOTSTRAP_TARGET_ALREADY_EXISTS'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM entity_command_private.operation_bootstrap_source b WHERE b.target_change_set_id IN(SELECT target_change_set_id FROM expected_bootstrap)
   AND NOT EXISTS(SELECT 1 FROM expected_bootstrap x WHERE (x.target_change_set_id,x.source_rows_hash,x.entity_id,x.entity_code,x.source_change_set_id,x.source_revision,x.source_operation_id,x.operation_key,x.requires_mfa,x.approval_reference)
     IS NOT DISTINCT FROM (b.target_change_set_id,b.source_rows_hash,b.entity_id,b.entity_code,b.source_change_set_id,b.source_revision,b.source_operation_id,b.operation_key,b.requires_mfa,b.approval_reference))) THEN
  RAISE EXCEPTION 'BOOTSTRAP_INSTALLATION_CONFLICT'; END IF;
 END $$;
 INSERT INTO entity_command_private.operation_bootstrap_source(target_change_set_id,source_rows_hash,entity_id,entity_code,source_change_set_id,source_revision,source_operation_id,operation_key,requires_mfa,approval_reference)
 SELECT target_change_set_id,source_rows_hash,entity_id,entity_code,source_change_set_id,source_revision,source_operation_id,operation_key,requires_mfa,approval_reference FROM expected_bootstrap ON CONFLICT DO NOTHING;
 DO $$ BEGIN IF (SELECT count(*) FROM entity_command_private.operation_bootstrap_source WHERE target_change_set_id IN(SELECT target_change_set_id FROM expected_bootstrap))<>(SELECT count(*) FROM expected_bootstrap) THEN RAISE EXCEPTION 'BOOTSTRAP_INSTALLATION_READBACK_FAILED'; END IF; END $$;
 ${apply ? "COMMIT" : "ROLLBACK"};`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const options = {};
  for (let n = 2; n < process.argv.length; n++) {
    const flag = process.argv[n];
    if (flag === "--apply=DEV-APPROVED-INITIALIZER") {
      assert.equal(options.apply, undefined);
      options.apply = true;
    } else {
      assert.ok(
        [
          "--proposal",
          "--targets",
          "--approved-hash",
          "--approval-reference",
          "--output",
        ].includes(flag),
      );
      assert.equal(options[flag], undefined);
      options[flag] = process.argv[++n];
    }
  }
  for (const key of [
    "--proposal",
    "--targets",
    "--approved-hash",
    "--approval-reference",
    "--output",
  ])
    assert.ok(options[key], key + " required");
  const proposal = JSON.parse(readFileSync(options["--proposal"], "utf8"));
  assert.equal(proposal.schema, "entity.dev-native-bootstrap-owner-proposal/1");
  assert.equal(proposal.status, "owner-approved-implementation-not-installed");
  assert.ok(proposal.ownerDecision?.source);
  assert.equal(proposal.sourceRowsSha256, options["--approved-hash"]);
  const targets = JSON.parse(readFileSync(options["--targets"], "utf8"));
  const sql = installationSql({
    sources: proposal.sources,
    targets,
    approvedHash: options["--approved-hash"],
    approvalReference: options["--approval-reference"],
    apply: options.apply === true,
  });
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const receipt = {
    schema: "entity.operation-bootstrap-installation/1",
    database: "athyper_studio",
    installedAt: new Date().toISOString(),
    approvedHash: options["--approved-hash"],
    approvalReference: options["--approval-reference"],
    targets,
    sourceCount: proposal.sources.length,
    applied: options.apply === true,
    operationWrites: false,
    publicationReview: false,
  };
  writeFileSync(options["--output"], JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(JSON.stringify(receipt, null, 2));
}
