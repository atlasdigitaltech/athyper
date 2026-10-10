import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Explicit disposable fixture container only; never run against the DEV database.
const container = process.env.RESTORATION_TEST_CONTAINER;
test(
  "retirement refuses retained links and rejects old activation formats",
  { skip: !container },
  () => {
    assert.match(container, /^athyper-restoration-cleanup-proof$/);
    const sql = (input) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-XqAt",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const migration = (name) =>
      readFileSync(
        new URL(`../../../migrations/${name}`, import.meta.url),
        "utf8",
      );
    const retirement = migration("20261010_runtime_restoration_retirement.sql");
    assert.throws(
      () =>
        sql(`BEGIN;
    CREATE SCHEMA publication;
    CREATE TABLE publication.entity_runtime_restoration_link(id integer);
    INSERT INTO publication.entity_runtime_restoration_link VALUES(1);
    ${retirement}
    ROLLBACK;`),
      /RUNTIME_RESTORATION_RETIREMENT_REQUIRES_EMPTY_TABLE/,
    );
    sql(`BEGIN;
    CREATE SCHEMA publication;
    CREATE TABLE publication.entity_runtime_restoration_link(id integer);
    ${retirement}
    ${retirement}
    DO $$ BEGIN IF to_regclass('publication.entity_runtime_restoration_link') IS NOT NULL THEN RAISE EXCEPTION 'table survived'; END IF; END $$;
    ROLLBACK;`);
    sql(`BEGIN;
    CREATE SCHEMA runtime_meta;
    CREATE TABLE runtime_meta.applied_release(id integer PRIMARY KEY, manifest jsonb);
    CREATE TABLE runtime_meta.release_activation_head(applied_release_id integer);
    ${migration("20261010_retired_baseline_activation.sql")}
    INSERT INTO runtime_meta.applied_release VALUES(1,'{}');
    INSERT INTO runtime_meta.release_activation_head VALUES(1);
    UPDATE runtime_meta.release_activation_head SET applied_release_id=1;
    DO $$ DECLARE marker jsonb; BEGIN
      FOREACH marker IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'{"kind":"reviewed_empty_target"}'::jsonb,'{"kind":"global_tenant_fork"}'::jsonb] LOOP
        UPDATE runtime_meta.applied_release SET manifest=jsonb_build_object('evidence',jsonb_build_object('importedBaseline',marker));
        BEGIN
          INSERT INTO runtime_meta.release_activation_head VALUES(1);
          RAISE EXCEPTION 'retired insert was accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM <> 'IMPORTED_BASELINE_ACTIVATION_RETIRED' THEN RAISE; END IF;
        END;
        BEGIN
          UPDATE runtime_meta.release_activation_head SET applied_release_id=1;
          RAISE EXCEPTION 'retired update was accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM <> 'IMPORTED_BASELINE_ACTIVATION_RETIRED' THEN RAISE; END IF;
        END;
      END LOOP;
    END $$;
    ROLLBACK;`);
  },
);
