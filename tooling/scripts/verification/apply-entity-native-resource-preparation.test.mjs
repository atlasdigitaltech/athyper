import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  preparationSql,
  nativeBootstrapAiPrivilegesMigrationName,
  productComponentResourceReadMigrationName,
  componentResourceReviewMigrationName,
  componentCatalogueInstallationMigrationName,
  productComponentValidationReadMigrationName,
  nativeFieldKeyUniquenessMigrationName,
  nativeFieldContractTriggerMigrationName,
  nativeIdentityAdoptionMigrationName,
  productCreationEntityReadMigrationName,
  nativeBootstrapPrivilegesMigrationName,
  operationReservationMigrationName,
  productDraftCreationMigrationName,
  operationBootstrapMigrationName,
  liveReadResourceReviewMigrationName,
  cleanFoundationCompatibilityMigrationName,
  cleanFoundationResourceCompatibilityMigrationName,
  ownershipInitializationMigrationName,
  referencePrivilegesMigrationName,
  snapshotMigrationName,
  componentCatalogueMigrationName,
  rootMigrationName,
  revisionMigrationName,
  legacyNullabilityMigrationName,
  typedRowMigrationName,
  constraintMigrationName,
  coreRootMigrationName,
} from "./apply-entity-native-resource-preparation.dev.mjs";
const source = readFileSync(
  new URL(
    "../../../server/db/migrations/20261007_entity_native_resource_preparation.sql",
    import.meta.url,
  ),
  "utf8",
);
const digest = createHash("sha256").update(source).digest("hex");
test("core/root guard preparation preserves original rows, pending gates and protected-state scope", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + coreRootMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    coreRootMigrationName,
  );
  assert.match(statement, /NATIVE_CORE_ROOT_REQUIRES_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_CORE_ROOT_ORIGINAL_ROWS_CHANGED/);
  assert.match(statement, /NATIVE_CORE_ROOT_GUARD_ALREADY_EXISTS/);
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|SECURITY DEFINER|requires_mfa|\bGRANT\b/,
  );
  for (const name of [
    "37_native_core_graph_guard.sql",
    "38_native_root_guard.sql",
    "39_reference_predicate_native_types.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + name,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
});
test("constraint compatibility pins predecessor definitions and retains cutover/authority protections", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + constraintMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    constraintMigrationName,
  );
  assert.match(statement, /NATIVE_CONSTRAINT_PREDECESSOR_MISMATCH/);
  assert.match(statement, /NATIVE_COMPATIBILITY_REQUIRES_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_COMPATIBILITY_ORIGINAL_ROWS_CHANGED/);
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT \w+_native_pending_ck|SECURITY DEFINER|requires_mfa|\bGRANT\b/,
  );
  for (const file of [
    "35_native_constraint_compatibility.sql",
    "36_native_layout_graph_guard.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + file,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
});
test("typed row preparation preserves pending guards, data and legacy binding requiredness", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + typedRowMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const statement = preparationSql(source, digest, true, typedRowMigrationName);
  assert.match(statement, /NATIVE_ROW_GUARDS_REQUIRE_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_ROW_GUARDS_ORIGINAL_ROWS_CHANGED/);
  assert.match(statement, /SECURITY INVOKER/);
  assert.ok(
    statement.indexOf("ADD CONSTRAINT entity_binding_legacy_required_ck") <
      statement.indexOf("ALTER COLUMN display_config DROP NOT NULL"),
  );
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|SECURITY DEFINER|requires_mfa|\bGRANT\b|\bUPDATE\b|\bDELETE\b/,
  );
  // The applied predecessor is immutable; the forward correction carries the
  // current generated body, which intentionally differs from this historical one.
  assert.equal(
    digest,
    "a56e79e3fc4353b8a704a9bbadd7ca04abe45ec009b8a9119ac87fd0a04a97f3",
  );
});
test("keeps dollar-quoted guards intact and records the ledger inside the application transaction", () => {
  const sql = preparationSql(source, digest, true);
  assert.match(sql, /DO \$\$ BEGIN IF EXISTS/);
  assert.ok(
    sql.indexOf("pg_advisory_xact_lock") <
      sql.indexOf("CREATE TABLE metadata.entity_ai_profile"),
  );
  assert.ok(
    sql.indexOf("-- Compare only the exact pre-installation") <
      sql.indexOf("INSERT INTO public.athyper_schema_migration_v1"),
  );
  assert.ok(sql.endsWith("COMMIT;\n"));
  assert.equal((sql.match(/BEGIN;/g) ?? []).length, 1);
  assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
});
test("rehearsal rolls back without writing an applied ledger receipt", () => {
  const sql = preparationSql(source, digest, false);
  assert.ok(sql.endsWith("ROLLBACK;\n"));
  assert.doesNotMatch(sql, /INSERT INTO public.athyper_schema_migration_v1/);
});
test("rejects changed bytes before producing application SQL", () => {
  assert.throws(() => preparationSql(source + "\n", digest, true));
});

test("root preparation pins its own ledger identity and rejects unknown migrations", () => {
  const rootSource = readFileSync(
    new URL(
      "../../../server/db/migrations/" + rootMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const rootDigest = createHash("sha256").update(rootSource).digest("hex");
  const sql = preparationSql(rootSource, rootDigest, true, rootMigrationName);
  assert.match(sql, /ADD COLUMN native_core_layout_version integer/);
  assert.match(sql, /entity_change_set_native_pending_ck/);
  assert.match(
    sql,
    /migration_name='20261007_entity_native_root_preparation.sql'/,
  );
  assert.doesNotMatch(
    sql,
    /migration_name='20261007_entity_native_resource_preparation.sql'/,
  );
  assert.throws(() =>
    preparationSql(rootSource, rootDigest, true, "unregistered.sql"),
  );
});

test("revision correction pins known guard bodies and its own immutable receipt", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + revisionMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const sql = preparationSql(source, digest, true, revisionMigrationName);
  assert.match(sql, /ENTITY_ROOT_REVISION_GUARD_UNKNOWN/);
  assert.match(sql, /entity_root_patch_keeps_revision/);
  assert.match(
    sql,
    /migration_name='20261007_entity_root_revision_protocol.sql'/,
  );
  assert.doesNotMatch(sql, /DROP CONSTRAINT|requires_mfa|GRANT /);
});

test("nullability preparation installs equivalent legacy checks before relaxing physical nullability", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + legacyNullabilityMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const hash = createHash("sha256").update(source).digest("hex");
  const statement = preparationSql(
    source,
    hash,
    true,
    legacyNullabilityMigrationName,
  );
  assert.equal((statement.match(/DROP NOT NULL/g) ?? []).length, 6);
  assert.ok(
    statement.indexOf("ADD CONSTRAINT entity_field_legacy_required_ck") <
      statement.indexOf("ALTER COLUMN field_key DROP NOT NULL"),
  );
  assert.match(
    statement,
    /NATIVE_NULLABILITY_PREPARATION_REQUIRES_PENDING_GUARDS/,
  );
  assert.match(statement, /NATIVE_NULLABILITY_ORIGINAL_ROWS_CHANGED/);
  assert.match(
    statement,
    /migration_name='20261007_entity_native_legacy_nullability_preparation.sql'/,
  );
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|requires_mfa|\bGRANT\b|\bUPDATE\b|\bDELETE\b/,
  );
});

test("snapshot preparation composes real guards without retiring cutover or rewriting history", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + snapshotMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const applied = preparationSql(source, digest, true, snapshotMigrationName);
  assert.equal(
    digest,
    "6c555f7fc63d11b66b90aa58e02c2ff28327c09ba8519e842093646189942eb4",
  );
  assert.match(applied, /NATIVE_SNAPSHOT_PREDECESSOR_UNKNOWN/);
  assert.match(applied, /PERFORM metadata.fn_assert_native_typed_rows/);
  assert.match(applied, /PERFORM metadata.validate_reference_members/);
  assert.match(
    applied,
    /CREATE CONSTRAINT TRIGGER native_snapshot_final_guard/,
  );
  assert.doesNotMatch(applied, /DROP CONSTRAINT|requires_mfa|GRANT /);
  assert.doesNotMatch(applied, /r\."field_keys"|r\."id_field_key"/);
});

test("component catalogue preparation preserves original rows and installs canonical guards", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + componentCatalogueMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const applied = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    componentCatalogueMigrationName,
  );
  for (const name of [
    "41_ui_component_catalogue.generated.sql",
    "33_native_typed_row_guards.generated.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + name,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
  assert.match(applied, /UI_COMPONENT_PREDECESSOR_UNKNOWN/);
  assert.match(applied, /ORIGINAL_ROWS_CHANGED/);
  assert.doesNotMatch(applied, /DROP CONSTRAINT|requires_mfa|GRANT /);
});

test("ownership preparation preserves rows and requires exact predecessor guards", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        ownershipInitializationMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const applied = preparationSql(
    source,
    digest,
    true,
    ownershipInitializationMigrationName,
  );
  assert.match(applied, /OWNERSHIP_PREPARATION_CHANGED_DATA/);
  assert.match(applied, /native_core_layout_version IS NULL/);
  assert.match(applied, /guard_legacy_ownership_initialization/);
  assert.doesNotMatch(applied, /\bGRANT\b|requires_mfa|SECURITY DEFINER/);
  assert.ok(
    source.includes(
      readFileSync(
        new URL(
          "../../../server/db/ddl/planes/studio/metadata/43_legacy_ownership_initialization.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  assert.ok(
    preparationSql(
      source,
      digest,
      false,
      ownershipInitializationMigrationName,
    ).endsWith("ROLLBACK;\n"),
  );
});

test("reference grants remain bounded and migration replay is ledger-owned", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        referencePrivilegesMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const applied = preparationSql(
    source,
    digest,
    true,
    referencePrivilegesMigrationName,
  );
  assert.match(applied, /REFERENCE_COMMAND_FORCED_RLS_REQUIRED/);
  assert.match(applied, /AS RESTRICTIVE FOR UPDATE/);
  assert.match(
    applied,
    /GRANT UPDATE\(field_identity_id,updated_by,updated_at\)/,
  );
  assert.doesNotMatch(
    applied,
    /GRANT (ALL|DELETE)|GRANT UPDATE ON|requires_mfa|CREATE ROLE/,
  );
  assert.match(applied, /OWNERSHIP_PREPARATION_CHANGED_DATA/);
  assert.ok(
    preparationSql(
      source,
      digest,
      false,
      referencePrivilegesMigrationName,
    ).endsWith("ROLLBACK;\n"),
  );
});

test("live-read lifecycle upgrade is forward-only and rehearses without changing authoring or activation", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        liveReadResourceReviewMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const rollback = preparationSql(
    source,
    digest,
    false,
    liveReadResourceReviewMigrationName,
  );
  const apply = preparationSql(
    source,
    digest,
    true,
    liveReadResourceReviewMigrationName,
  );
  assert.match(rollback, /ROLLBACK;/);
  assert.match(apply, /20261008_entity_live_read_resource_review.sql/);
  assert.match(source, /OWNERSHIP_PREPARATION_CHANGED_DATA/);
  assert.match(source, /RESOURCE_REVIEW_CONFLICT/);
  assert.doesNotMatch(
    source,
    /DROP CONSTRAINT|requires_mfa|UPDATE metadata\.|INSERT INTO metadata\.|fn_activate_release/,
  );
  assert.throws(() =>
    preparationSql(
      source,
      "0".repeat(64),
      true,
      liveReadResourceReviewMigrationName,
    ),
  );
});

test("operation bootstrap migration is canonical, bounded and ledger-replayed", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        operationBootstrapMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/46_native_operation_bootstrap.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    source,
    "BEGIN;\nSET LOCAL lock_timeout='5s';\n" + canonical + "COMMIT;\n",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(source, digest, false, operationBootstrapMigrationName),
    /ROLLBACK;\n$/,
  );
  assert.match(
    preparationSql(source, digest, true, operationBootstrapMigrationName),
    /athyper_schema_migration_v1/,
  );
  assert.match(canonical, /entity_command_private.admitted\(p_target\)/);
  assert.match(canonical, /FOR SHARE OF b,t,s,e,o/);
  assert.doesNotMatch(
    canonical,
    /INSERT INTO|GRANT (?:SELECT|UPDATE|INSERT|DELETE)/,
  );
});

test("product creation migration pins entity intent and leaves native/protected grants separate", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        productDraftCreationMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/47_product_draft_creation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    source,
    "BEGIN;\nSET LOCAL lock_timeout='5s';\n" + canonical + "\nCOMMIT;\n",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(source, digest, false, productDraftCreationMigrationName),
    /ROLLBACK;\n$/,
  );
  assert.match(
    preparationSql(source, digest, true, productDraftCreationMigrationName),
    /athyper_schema_migration_v1/,
  );
  assert.match(canonical, /creation_entity_id=p_entity/);
  assert.match(canonical, /AS RESTRICTIVE/);
  assert.doesNotMatch(
    canonical,
    /DROP CONSTRAINT|requires_mfa|INSERT INTO metadata|GRANT UPDATE/,
  );
});

test("reservation migration preserves private source evidence and guards final target identity", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        operationReservationMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/48_operation_bootstrap_reservation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    source,
    "BEGIN;\nSET LOCAL lock_timeout='5s';\n" + canonical + "COMMIT;\n",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(source, digest, false, operationReservationMigrationName),
    /ROLLBACK;\n$/,
  );
  assert.match(canonical, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(canonical, /OPERATION_BOOTSTRAP_TARGET_REFERENCED/);
  assert.doesNotMatch(canonical, /INSERT INTO|GRANT|requires_mfa/);
});

test("native insert privileges retain pending cutover and canonical source checks", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        nativeBootstrapPrivilegesMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/49_native_bootstrap_privileges.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    source,
    "BEGIN;\nSET LOCAL lock_timeout='5s';\n" + canonical + "COMMIT;\n",
  );
  assert.match(
    preparationSql(
      source,
      createHash("sha256").update(source).digest("hex"),
      false,
      nativeBootstrapPrivilegesMigrationName,
    ),
    /ROLLBACK;\n$/,
  );
  assert.doesNotMatch(
    canonical,
    /DROP CONSTRAINT|INSERT INTO metadata|GRANT ALL|GRANT DELETE/,
  );
});

test("fresh-root Entity reads preserve transaction scope and grant no AI writes or cutover", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/50_product_creation_entity_read.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        productCreationEntityReadMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  for (const required of [
    "transaction_id=pg_current_xact_id()",
    "backend_pid=pg_backend_pid()",
    "login_role=session_user",
    "NOT revoked",
    "expires_at>clock_timestamp()",
    "app.current_principal_id",
    "app.current_tenant_id",
    "creation_entity_id=p_entity",
  ])
    assert.ok(canonical.includes(required));
  assert.doesNotMatch(
    canonical,
    /DROP CONSTRAINT|GRANT ALL|GRANT INSERT|GRANT UPDATE|GRANT DELETE|requires_mfa/,
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      productCreationEntityReadMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      productCreationEntityReadMigrationName,
    ),
    /COMMIT;/,
  );
});

test("identity adoption retains introduction/history and all cutover checks", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/51_native_identity_adoption.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        nativeIdentityAdoptionMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  assert.doesNotMatch(
    canonical,
    /UPDATE metadata.entity_field_identity SET|DROP CONSTRAINT|requires_mfa|GRANT INSERT|GRANT UPDATE|GRANT DELETE/,
  );
  for (const text of [
    "native_bootstrap_writable",
    "c.lock_version=p_revision",
    "graph_hash=p_source_hash",
    "source_snapshot->'fieldIdentities'",
    "IDENTITY_ADOPTION_GUARD_PREDECESSOR_CHANGED",
    "s.graph_hash=NEW.proposal_hash",
    "DEFERRABLE INITIALLY DEFERRED",
    "IDENTITY_ADOPTION_IMMUTABLE",
  ])
    assert.ok(canonical.includes(text));
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(source, digest, false, nativeIdentityAdoptionMigrationName),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(source, digest, true, nativeIdentityAdoptionMigrationName),
    /COMMIT;/,
  );
});

test("native field trigger replaces legacy payload validation only behind typed guards", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/52_native_field_contract_trigger.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        nativeFieldContractTriggerMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  for (const guard of [
    "NATIVE_FIELD_CONTRACT_PREDECESSOR_CHANGED",
    "NATIVE_FIELD_TYPED_GUARDS_REQUIRED",
    "NATIVE_FIELD_LEGACY_PAYLOAD_FORBIDDEN",
    "c.native_core_layout_version IN (1,2)",
    "c.tenant_id IS NOT DISTINCT FROM NEW.tenant_id",
    "tgdeferrable AND tginitdeferred",
  ])
    assert.ok(canonical.includes(guard));
  assert.doesNotMatch(
    canonical,
    /DROP CONSTRAINT|DISABLE TRIGGER|GRANT|requires_mfa/,
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      nativeFieldContractTriggerMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      nativeFieldContractTriggerMigrationName,
    ),
    /COMMIT;/,
  );
});

test("field-key replacement preserves legacy NULL-tenant uniqueness and native identity uniqueness", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/53_native_field_key_uniqueness.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        nativeFieldKeyUniquenessMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  for (const text of [
    "NATIVE_FIELD_KEY_PREDECESSOR_CHANGED",
    "NATIVE_FIELD_KEY_IDENTITY_GUARDS_REQUIRED",
    "NULLS NOT DISTINCT WHERE field_key IS NOT NULL",
    "(change_set_id,field_identity_id) WHERE field_identity_id IS NOT NULL",
  ])
    assert.ok(canonical.includes(text));
  assert.doesNotMatch(
    canonical,
    /CASCADE|GRANT|DISABLE TRIGGER|requires_mfa|UPDATE metadata/,
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      nativeFieldKeyUniquenessMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(source, digest, true, nativeFieldKeyUniquenessMigrationName),
    /COMMIT;/,
  );
});

test("component catalogue reads require referenced active product resources and admitted draft scope", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/54_product_component_validation_read.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        productComponentValidationReadMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  for (const text of [
    "AS RESTRICTIVE",
    "tenant_id IS NULL AND status='active'",
    "entity_command_private.admitted",
    "component_format_id",
    "relforcerowsecurity",
  ])
    assert.ok(canonical.includes(text));
  assert.doesNotMatch(
    canonical,
    /GRANT (INSERT|UPDATE|DELETE|ALL)|SECURITY DEFINER|DISABLE|DROP CONSTRAINT/,
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      productComponentValidationReadMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      productComponentValidationReadMigrationName,
    ),
    /COMMIT;/,
  );
});

test("component resource migration extends pinned kind lists without installation authority", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/publication/34_component_resource_review.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        componentResourceReviewMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  assert.match(canonical, /COMPONENT_RESOURCE_PREDECESSOR_CHANGED/);
  assert.match(canonical, /md5\(body\)<>r.expected_hash/);
  assert.doesNotMatch(canonical, /GRANT|INSERT INTO|UPDATE .* SET|DROP/);
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(source, digest, false, componentResourceReviewMigrationName),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(source, digest, true, componentResourceReviewMigrationName),
    /COMMIT;/,
  );
});

test("component installation grants only reviewed active-source routines", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/publication/35_component_catalogue_installation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        componentCatalogueInstallationMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  assert.match(canonical, /FOR SHARE OF h,r,p,s,d,a/);
  assert.match(canonical, /s.approved_by<>s.created_by/);
  assert.match(canonical, /s.tenant_id=shared.current_tenant_id_soft\(\)/);
  assert.match(canonical, /UI_COMPONENT_INSTALLATION_CONFLICT/);
  assert.doesNotMatch(canonical, /GRANT (?:INSERT|UPDATE|DELETE|SELECT|ALL)/);
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      componentCatalogueInstallationMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      componentCatalogueInstallationMigrationName,
    ),
    /COMMIT;/,
  );
});

test("component evidence preparation remains command-scoped and grants only routine execution", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/55_product_component_resource_read.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        productComponentResourceReadMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.includes(canonical));
  assert.match(canonical, /admitted\(p_target\) IS NOT TRUE/);
  assert.match(canonical, /publication.read_active_ui_component\(applied\)/);
  assert.match(canonical, /FOR SHARE OF c,h,p/);
  assert.doesNotMatch(canonical, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)/);
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      productComponentResourceReadMigrationName,
    ),
    /ROLLBACK;/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      productComponentResourceReadMigrationName,
    ),
    /COMMIT;/,
  );
});

test("AI bootstrap forward migration preserves existing applied sources and rehearses transactionally", () => {
  const canonical = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/56_native_bootstrap_ai_privileges.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const source = readFileSync(
    new URL(
      "../../../server/db/scripts/operations/upgrades/entity-product-command/" +
        nativeBootstrapAiPrivilegesMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    source,
    "BEGIN;\nSET LOCAL lock_timeout='5s';\n" + canonical + "COMMIT;\n",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  assert.match(
    preparationSql(
      source,
      digest,
      false,
      nativeBootstrapAiPrivilegesMigrationName,
    ),
    /ROLLBACK;\n$/,
  );
  assert.match(
    preparationSql(
      source,
      digest,
      true,
      nativeBootstrapAiPrivilegesMigrationName,
    ),
    /athyper_schema_migration_v1/,
  );
});

test("clean foundation compatibility bridge is bounded to the canonical empty Studio root", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + cleanFoundationCompatibilityMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    cleanFoundationCompatibilityMigrationName,
  cleanFoundationResourceCompatibilityMigrationName,
  );
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_ENTITY_HISTORY_PRESENT/);
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_ROOT_GUARD_UNKNOWN/);
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_PENDING_GUARD_UNKNOWN/);
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_PROTOCOL_HELPER_DRIFT/);
  assert.doesNotMatch(statement, /requires_mfa|\bGRANT\b|DROP CONSTRAINT/);
});

test("clean foundation resource bridge accepts only the maintained resource transition", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + cleanFoundationResourceCompatibilityMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    cleanFoundationResourceCompatibilityMigrationName,
  );
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_RESOURCE_PREDECESSOR_UNKNOWN/);
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_RESOURCE_PROTOCOL_DRIFT/);
  assert.match(statement, /NATIVE_CLEAN_FOUNDATION_ENTITY_HISTORY_PRESENT/);
  assert.doesNotMatch(statement, /requires_mfa|DROP CONSTRAINT/);
});
