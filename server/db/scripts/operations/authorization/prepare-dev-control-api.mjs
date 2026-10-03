#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";
import { controlPolicyRls } from "./control-policy-rls.mjs";

if (process.argv.slice(2).join() !== "--confirm=DEV-CONTROL-API") throw Error("Explicit DEV confirmation required");
const inspected = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
assertDevContainer(inspected);
const directory = join(homedir(), ".athyper/instances/dev/secrets/control-api");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const passwordPath = join(directory, "database-password");
if (!existsSync(passwordPath)) writeFileSync(passwordPath, randomBytes(40).toString("base64url"), { mode: 0o600, flag: "wx" });
const password = readFileSync(passwordPath, "utf8").trim();
if (!/^[a-zA-Z0-9_-]{50,60}$/.test(password)) throw Error("Invalid managed credential");
const sql = `BEGIN;
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
   CREATE ROLE athyper_control_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
   COMMENT ON ROLE athyper_control_api IS 'dev:platform-control-api:v1';
 ELSIF (SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname='athyper_control_api') IS DISTINCT FROM 'dev:platform-control-api:v1'
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='athyper_control_api'))
 THEN RAISE EXCEPTION 'Unmanaged or unsafe control role'; END IF;
END $$;
GRANT CONNECT ON DATABASE athyper_studio TO athyper_control_api;
GRANT USAGE ON SCHEMA master,shared,authz,control,metadata,audit,runtime_meta TO athyper_control_api;
GRANT SELECT ON master.principal,master.principal_identity_binding,master.tenant,
 authz.permission,authz.permission_scope_kind,authz.plane_membership,authz.scope_target,authz.group_member,authz.principal_group,
 authz.group_role,authz.role,authz.role_permission,authz.delegation,authz.delegation_grant,authz.record_acl,authz.override,authz.deny_rule,
 authz.entity_operation_binding,authz.entity_operation_scope_binding,runtime_meta.entity_descriptor,runtime_meta.entity_contract,
 runtime_meta.release_activation_head,control.module,metadata.entity_change_set TO athyper_control_api;
GRANT USAGE ON SCHEMA snapshot TO athyper_control_api;
GRANT SELECT ON control.subscription_plan,snapshot.subscription_plan_entitlement,control.tenant_usage_limit_override,
 control.usage_metric_catalog,control.tenant_module_entitlement_override TO athyper_control_api;
GRANT SELECT,INSERT,UPDATE ON control.policy_definition,control.policy_rule,control.policy_test_case,control.policy_test_result TO athyper_control_api;
GRANT EXECUTE ON FUNCTION master.fn_resolve_principal_identity(uuid,master.identity_provider_d,text,text) TO athyper_control_api;
GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft(),shared.current_tenant_id(),master.current_principal_id_soft() TO athyper_control_api;
GRANT EXECUTE ON FUNCTION shared.uuidv7() TO athyper_control_api;
DO $$ BEGIN
 IF to_regprocedure('publication.fn_entity_successor_enrollment_source(jsonb)') IS NOT NULL THEN
  GRANT USAGE ON SCHEMA publication TO athyper_control_api;
  GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) TO athyper_control_api;
 END IF;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='audit' AND p.proname='append_event') OR (n.nspname='control' AND p.proname IN ('effective_tenant_entitlement','entitlement_plan_at'))
     OR (n.nspname='authz' AND p.proname='fn_scope_assignment_covers_target') LOOP
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO athyper_control_api',f.signature);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='metadata' AND tablename='entity_change_set' AND policyname='control_api_source_read') THEN
   CREATE POLICY control_api_source_read ON metadata.entity_change_set FOR SELECT TO athyper_control_api
     USING (shared.current_tenant_id_soft()='11111111-1111-4111-8111-111111111111'::uuid AND (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft()));
 END IF;
END $$;
${controlPolicyRls("11111111-1111-4111-8111-111111111111")}
${readFileSync(new URL("../../../ddl/planes/studio/metadata/22_product_human_review.sql", import.meta.url), "utf8")}
${readFileSync(new URL("../../../ddl/planes/studio/control/14_publication_policy_replacement.sql", import.meta.url), "utf8")}
COMMIT;`;
try { execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -q -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'],
  { input: sql, stdio: ["pipe", "pipe", "pipe"] }); } catch { throw Error("Control database provisioning failed; no SQL/credential output is emitted"); }
writeFileSync(join(directory,"database-url"), `postgresql://athyper_control_api:${password}@db:5432/athyper_studio`, { mode: 0o600 });
const trust = JSON.parse(readFileSync(join(homedir(), ".athyper/instances/dev/secrets/publication-trust-v1/state.json"), "utf8"));
if (trust.keyId !== "athyper-publication-dev-signing-v1" || !/^sha256:[a-f0-9]{64}$/.test(trust.publicKeyFingerprint) || !trust.project?.id) throw Error("DEV trust coordinates missing");
writeFileSync(join(directory,"trust.json"), JSON.stringify({ schema:"athyper.dev-publication-trust/1", keys:[{
  keyId:trust.keyId,domain:"dev",publicKeyFingerprint:trust.publicKeyFingerprint }] }), { mode:0o600 });
writeFileSync(join(directory,"runtime.env"), `PLATFORM_CONTROL_INFISICAL_PROJECT_ID=${trust.project.id}\n`, { mode:0o600 });
console.log(JSON.stringify({ directory, databaseRole:"athyper_control_api", superuser:false, bypassRls:false, humanCutover:false }));
