/** Existing DEV only; all synthetic records and evidence are rolled back. */
import { execFileSync } from "node:child_process";
const container = process.argv[2];
if (!container || process.argv.length !== 3) throw Error("Specify existing DEV container");
const info = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
if (info.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("Existing DEV required");
const sql = `BEGIN;
SET LOCAL statement_timeout='10s';
DO $$ DECLARE actor uuid; tenant uuid; target uuid:=gen_random_uuid(); r record; v bigint; BEGIN
 SELECT id,tenant_id INTO STRICT actor,tenant FROM master.principal WHERE status='active' AND tenant_id IS NOT NULL ORDER BY id LIMIT 1;
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 INSERT INTO master.business_partner(id,tenant_id,code,name,status,created_by,category_locked_by)
 VALUES(target,tenant,'CAP-'||upper(substr(target::text,1,8)),'Capability rollback fixture','active',actor,actor);
 SELECT * INTO r FROM control.command_business_partner_capability(tenant,target,'supplier',true,1,'Fixture enable','fixture-'||target::text||'-1',actor);
 IF r.enabled IS DISTINCT FROM true OR r.record_version<>2 OR r.replayed THEN RAISE EXCEPTION 'Supplier enable failed'; END IF;
 SELECT * INTO r FROM control.command_business_partner_capability(tenant,target,'supplier',true,1,'Fixture enable','fixture-'||target::text||'-1',actor);
 IF NOT r.replayed OR r.record_version<>2 THEN RAISE EXCEPTION 'Replay failed'; END IF;
 SELECT * INTO r FROM control.command_business_partner_capability(tenant,target,'customer',true,2,'Fixture enable','fixture-'||target::text||'-2',actor);
 IF r.record_version<>3 THEN RAISE EXCEPTION 'Customer enable failed'; END IF;
 SELECT * INTO r FROM control.command_business_partner_capability(tenant,target,'supplier',false,3,'Fixture disable','fixture-'||target::text||'-3',actor);
 IF r.enabled IS DISTINCT FROM false OR r.record_version<>4 THEN RAISE EXCEPTION 'Supplier disable failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=target AND NOT supplier_enabled AND customer_enabled AND status='active') THEN RAISE EXCEPTION 'Capability isolation failed'; END IF;
 BEGIN
  PERFORM control.command_business_partner_capability(tenant,target,'customer',false,2,'Stale','fixture-'||target::text||'-4',actor);
  RAISE EXCEPTION 'Stale command accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM control.command_business_partner_capability(gen_random_uuid(),target,'customer',false,4,'Wrong tenant','fixture-'||target::text||'-5',actor);
  RAISE EXCEPTION 'Wrong tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT count(*) INTO v FROM control.business_partner_mutation_evidence WHERE tenant_id=tenant AND aggregate_id=target;
 IF v<>3 THEN RAISE EXCEPTION 'Unexpected evidence count'; END IF;
END $$;
ROLLBACK;`;
execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "athyper_neon", "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
console.log("Capability command enable/disable, isolation, replay, version and tenant checks passed; all fixture data rolled back. This is not application-role or human-approval evidence.");
