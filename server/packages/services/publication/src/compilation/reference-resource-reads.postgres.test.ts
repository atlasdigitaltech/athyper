import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it.skipIf(process.env.ENTITY_RESOURCE_DEV_POSTGRES !== "1")(
  "restricts resource reads to active command admissions without table grants",
  () => {
    const info = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    expect(info.Config.Labels["com.docker.compose.project"]).toBe(
      "athyper-dev",
    );
    const ddl = readFileSync(
      new URL(
        "../../../../../db/ddl/planes/studio/metadata/45_reference_resource_reads.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const sql = `BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
 ${ddl.replaceAll("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")}
 SET SESSION AUTHORIZATION athyper_dev_product_command;
 DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ((n.nspname='publication' AND c.relname IN ('release','artifact')) OR (n.nspname='runtime_meta' AND c.relname='applied_release')) AND has_table_privilege(current_user,c.oid,'SELECT')) THEN RAISE EXCEPTION 'BROAD_READ_GRANT'; END IF;
 BEGIN PERFORM * FROM entity_command_private.read_reference_resource(gen_random_uuid(),'fixture',repeat('a',64),repeat('b',64),'entity_authoring_descriptor',10000); RAISE EXCEPTION 'ADMISSION_BYPASS'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REFERENCE_RESOURCE_ADMISSION_REQUIRED' THEN RAISE; END IF; END;
 PERFORM set_config('app.current_tenant_id',gen_random_uuid()::text,true);
 PERFORM set_config('app.current_principal_id',gen_random_uuid()::text,true);
 BEGIN PERFORM * FROM entity_command_private.find_identity_review(gen_random_uuid(),gen_random_uuid(),repeat('a',64)); RAISE EXCEPTION 'FORGED_SCOPE_ALLOWED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REFERENCE_RESOURCE_ADMISSION_REQUIRED' THEN RAISE; END IF; END;
 END $$;
 RESET SESSION AUTHORIZATION;
 -- Fixture admission only: proves the restricted read reaches no unrelated row;
 -- it does not attest human approval or authenticated command issuance.
 DO $$ DECLARE d uuid; t uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); BEGIN
 SELECT id INTO STRICT d FROM metadata.entity_change_set WHERE tenant_id IS NULL LIMIT 1;
 INSERT INTO entity_command_private.admission(token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at,transaction_id,backend_pid)
 VALUES(decode(repeat('a',64),'hex'),'athyper_dev_product_command',t,p,d,repeat('b',64),clock_timestamp()+interval '30 seconds',pg_current_xact_id(),pg_backend_pid());
 PERFORM set_config('app.current_tenant_id',t::text,true);PERFORM set_config('app.current_principal_id',p::text,true);
 END $$;
 SET SESSION AUTHORIZATION athyper_dev_product_command;
 DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM entity_command_private.read_reference_resource(gen_random_uuid(),'absent',repeat('a',64),repeat('b',64),'entity_authoring_descriptor',10000)) THEN RAISE EXCEPTION 'FOREIGN_RESOURCE_VISIBLE'; END IF;
 END $$;
 RESET SESSION AUTHORIZATION; ROLLBACK;`;
    expect(() =>
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
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ),
    ).not.toThrow();
  },
);
