import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// Explicit local image only; a disposable, network-isolated cluster. No dev DB writes.
const image = process.env.ATHYPER_ACTIVITY_DDL_IMAGE;
test("Activity catalog and authoring migrations execute idempotently and reject conflicts", { skip: !image, timeout: 60000 }, () => {
  const seed = readFileSync(new URL("../../../ddl/common/authz/19_common_activity_permissions.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../operations/upgrades/post-baseline-20260929/20260928_entity_activity_permissions.sql", import.meta.url), "utf8");
  const authoring = readFileSync(new URL("../../operations/upgrades/post-baseline-20260929/20260928_entity_activity_authoring.sql", import.meta.url), "utf8");
  const sql = [
    `CREATE SCHEMA control; CREATE SCHEMA authz; CREATE SCHEMA metadata;
     CREATE DOMAIN authz.risk_tier_d AS text CHECK(VALUE IN ('low','medium','high','critical'));
     CREATE TABLE control.module(id uuid PRIMARY KEY,code text UNIQUE,status text);
     INSERT INTO control.module VALUES('00000000-0000-0000-0000-000000000001','fnd','active');
     CREATE TABLE authz.permission(id uuid PRIMARY KEY, canonical_code text UNIQUE, permission_kind text,module_id uuid,risk_tier authz.risk_tier_d,
       requires_mfa boolean, requires_sod boolean, is_shareable boolean,is_delegable boolean,is_overridable boolean, metadata jsonb,status text,created_by uuid);
     CREATE TABLE authz.permission_scope_kind(permission_id uuid REFERENCES authz.permission(id), scope_kind text, propagation_mode text,status text,created_by uuid,
       UNIQUE(permission_id,scope_kind,propagation_mode));
     CREATE TABLE metadata.entity_capability(capability_key text CONSTRAINT entity_capability_capability_key_check CHECK(capability_key IN ('comments','attachments')));
     INSERT INTO metadata.entity_capability VALUES('comments'),('attachments');`,
    ...["studio", "neon", "mesh"].flatMap(plane => [
      `SET app.database_plane='${plane}';`, seed, seed, migration,
      `DO $$ BEGIN IF (SELECT count(*) FROM authz.permission)<>3 OR (SELECT count(*) FROM authz.permission_scope_kind)<>3 THEN RAISE EXCEPTION 'catalog mismatch'; END IF; END $$;`,
    ]),
    `UPDATE authz.permission SET risk_tier='low' WHERE canonical_code='common.records.snapshot.capture';`,
    expectFailure(seed, "Common activity catalog conflict"),
    `UPDATE authz.permission SET risk_tier='medium' WHERE canonical_code='common.records.snapshot.capture';
     INSERT INTO authz.permission_scope_kind SELECT id,'resource','exact','active',created_by FROM authz.permission WHERE canonical_code='common.audit.event.query';`,
    expectFailure(seed, "Common activity catalog conflict"),
    `DELETE FROM authz.permission_scope_kind WHERE scope_kind='resource'; SET app.database_plane='invalid';`,
    expectFailure(seed, "requires an exact local plane"),
    `SET app.database_plane='studio';`, authoring, authoring,
    `INSERT INTO metadata.entity_capability VALUES('activity');`,
    expectFailure(`INSERT INTO metadata.entity_capability VALUES('revisions')`, "entity_capability_capability_key_check"),
    `DO $$ BEGIN IF (SELECT count(*) FROM metadata.entity_capability)<>3 THEN RAISE EXCEPTION 'authoring mismatch'; END IF; END $$;`,
  ].join("\n");
  const result = spawnSync("docker", ["run", "--rm", "--network", "none", "--user", "postgres", "-i", "--entrypoint", "sh", image!, "-c",
    "set -eu\n/usr/lib/postgresql/16/bin/initdb -D /tmp/activity-pg -A trust >/dev/null\n/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/activity-pg -l /tmp/activity-pg.log -o '-k /tmp -h \"\"' -w start >/dev/null\ntrap '/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/activity-pg -m immediate stop >/dev/null' EXIT\npsql -X -v ON_ERROR_STOP=1 -h /tmp -d postgres"],
    { input: sql, encoding: "utf8", timeout: 55000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
});
function expectFailure(sql: string, message: string): string {
  return `DO $check$ DECLARE rejected boolean := false; BEGIN
    BEGIN EXECUTE $statement$${sql}$statement$;
    EXCEPTION WHEN OTHERS THEN IF position('${message}' in SQLERRM)=0 THEN RAISE; END IF; rejected := true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'expected conflict was accepted'; END IF;
  END $check$;`;
}
