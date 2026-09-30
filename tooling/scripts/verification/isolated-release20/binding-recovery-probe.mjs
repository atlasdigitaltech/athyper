import fs from "node:fs";
import assert from "node:assert/strict";

export const file = "server/db/ddl/common/authz/07_functions.sql";
export const sourceBytes = fs.readFileSync(
  new URL("../../../../" + file, import.meta.url),
  "utf8",
);
// Select only these two complete canonical PL/pgSQL definitions. The fixture has
// deliberately minimal tables; loading the entire authz foundation would be wrong.
export const bytes = ["retire", "restore"]
  .map((action) => {
    const name = `authz.fn_${action}_entity_operation_projection`;
    const escaped = name.replaceAll(".", "\\.");
    const matches = [
      ...sourceBytes.matchAll(
        new RegExp(
          `^CREATE OR REPLACE FUNCTION ${escaped}\\([\\s\\S]*?^END; \\$\\$;`,
          "gm",
        ),
      ),
    ];
    assert.equal(
      matches.length,
      1,
      `Expected exactly one canonical definition of ${name}`,
    );
    assert.match(
      matches[0][0],
      /LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS \$\$/,
    );
    return matches[0][0];
  })
  .join("\n\n");
const body = bytes
  .replaceAll("authz.", "bp_recovery_test.")
  .replaceAll("pg_catalog,authz", "pg_catalog,bp_recovery_test");
export const sql = `BEGIN;
CREATE SCHEMA bp_recovery_test;
CREATE TABLE bp_recovery_test.entity_operation_binding(applied_release_id uuid,status text,effective_until timestamptz,retired_at timestamptz,retired_by uuid,updated_at timestamptz,updated_by uuid);
${body}
INSERT INTO bp_recovery_test.entity_operation_binding(applied_release_id,status,effective_until) VALUES
 ('11111111-1111-4111-8111-111111111111','published','2026-01-01Z'),
 ('11111111-1111-4111-8111-111111111111','published',NULL),
 ('11111111-1111-4111-8111-111111111111','retired','2025-01-01Z');
DO $test$ DECLARE n integer;before_hash text;after_hash text; BEGIN
 n:=bp_recovery_test.fn_retire_entity_operation_projection('11111111-1111-4111-8111-111111111111','2026-09-11Z');
 IF n<>2 THEN RAISE EXCEPTION 'Retirement count mismatch';END IF;
 IF (SELECT count(*) FROM bp_recovery_test.entity_operation_binding WHERE effective_until='2026-01-01Z')<>1 THEN RAISE EXCEPTION 'Expiry extended';END IF;
 IF (SELECT count(*) FROM bp_recovery_test.entity_operation_binding WHERE effective_until='2025-01-01Z')<>1 THEN RAISE EXCEPTION 'Retired row changed';END IF;
 SELECT md5(jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text)::text) INTO before_hash FROM bp_recovery_test.entity_operation_binding b;
 BEGIN
  PERFORM bp_recovery_test.fn_restore_entity_operation_projection('11111111-1111-4111-8111-111111111111',clock_timestamp());
  RAISE EXCEPTION 'Unsafe restore permitted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'BINDING_RECOVERY_SUCCESSOR_REQUIRED' THEN RAISE;END IF;
 END;
 SELECT md5(jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text)::text) INTO after_hash FROM bp_recovery_test.entity_operation_binding b;
 IF before_hash<>after_hash THEN RAISE EXCEPTION 'Failed restore mutated rows';END IF;
 IF bp_recovery_test.fn_restore_entity_operation_projection('22222222-2222-4222-8222-222222222222',clock_timestamp())<>0 THEN RAISE EXCEPTION 'Empty release mismatch';END IF;
END $test$;
ROLLBACK;`;
