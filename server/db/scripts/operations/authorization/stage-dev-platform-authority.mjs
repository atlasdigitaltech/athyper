#!/usr/bin/env node
// Staging only: real MFA login and a separately reviewed cutover precede grants.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";

export const sourceRef = "dev:platform-control-authority:v1";
export const actors = Object.freeze([
  { username: "platform.admin", principalId: "df0159b0-2bdc-55e8-944b-efaa9ed9b8e5", permissions: [
    "studio.metadata.contract.view", "studio.metadata.contract_draft.create", "studio.metadata.contract.edit",
    "studio.metadata.contract.submit", "studio.metadata.publication_policy.create",
  ] },
  { username: "platform.owner", principalId: "41bf4855-6aa1-5e43-bc11-ee2cfa647693", permissions: [
    "studio.metadata.contract.view", "studio.metadata.contract.review", "studio.metadata.publication_policy.activate",
  ] },
]);
const issuer = "https://iam.dev.athyper.test/realms/platform-control";
const audience = "athyper-platform-control-api";
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

export function buildStageSql(subjects, commit = false) {
  if (!subjects || Object.keys(subjects).length !== actors.length || actors.some(a => !uuid(subjects[a.username]))
    || new Set(Object.values(subjects)).size !== actors.length) throw Error("Exact distinct control-realm subjects required");
  const plan = actors.map(actor => ({ ...actor, subject: subjects[actor.username] }));
  const hash = createHash("sha256").update(JSON.stringify({ sourceRef, plan, issuer, audience })).digest("hex");
  return `BEGIN;
SET LOCAL app.database_plane='studio';
SET LOCAL app.current_plane_key='studio';
DO $stage$
DECLARE tenant_uuid uuid; actor_uuid uuid; scope_uuid uuid; role_uuid uuid; group_uuid uuid; principal_uuid uuid;
  item jsonb; owned text; state text; expected uuid[]; actual uuid[];
BEGIN
  IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio only'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('${sourceRef}',0));
  SELECT id INTO STRICT tenant_uuid FROM master.tenant WHERE code='athyper' AND status='active';
  IF tenant_uuid<>'11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'DEV authority tenant drift'; END IF;
  SELECT id INTO STRICT actor_uuid FROM master.principal WHERE tenant_id=tenant_uuid AND code='seed.three-plane-provisioner' AND status='active';
  PERFORM set_config('app.current_tenant_id',tenant_uuid::text,true);
  PERFORM set_config('app.current_principal_id',actor_uuid::text,true);
  SELECT id INTO STRICT scope_uuid FROM authz.scope_target WHERE tenant_id=tenant_uuid AND scope_kind='tenant' AND target_id=tenant_uuid AND status='active';
  FOR item IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(plan))}::jsonb) LOOP
    SELECT id INTO STRICT principal_uuid FROM master.principal WHERE tenant_id=tenant_uuid AND code=item->>'username'
      AND id=(item->>'principalId')::uuid AND principal_type='user' AND status='active';
    -- Preserve historical principal IDs. Stop if the previous quarantine inventory has changed.
    IF EXISTS(SELECT 1 FROM authz.group_member gm JOIN authz.group_role gr ON gr.tenant_id=gm.tenant_id AND gr.group_id=gm.group_id
      WHERE gm.tenant_id=tenant_uuid AND gm.principal_id=principal_uuid AND gm.status='active' AND gr.status='active')
      OR EXISTS(SELECT 1 FROM authz.override WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid AND status='approved')
      OR EXISTS(SELECT 1 FROM authz.delegation WHERE tenant_id=tenant_uuid AND delegate_id=principal_uuid AND status='approved')
      OR EXISTS(SELECT 1 FROM authz.record_acl WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid AND status='active')
      THEN RAISE EXCEPTION 'Existing authority requires explicit review'; END IF;
    IF (SELECT count(*) FROM master.principal_identity_binding WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid AND realm_key='athyper' AND status='active')<>1
      THEN RAISE EXCEPTION 'Legacy identity inventory changed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM authz.plane_membership WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid AND status='active'
      AND effective_from<=now() AND effective_until IS NULL) THEN RAISE EXCEPTION 'Studio admission unavailable'; END IF;
    INSERT INTO master.principal_identity_binding(tenant_id,principal_id,provider_code,realm_key,subject_id,issuer,audience,username,is_primary,status,metadata,created_by)
    VALUES(tenant_uuid,principal_uuid,'keycloak','platform-control',item->>'subject','${issuer}','${audience}',item->>'username',false,'active',
      jsonb_build_object('sourceRef','${sourceRef}','migrationState','awaiting_mfa_cutover'),actor_uuid)
    ON CONFLICT(tenant_id,provider_code,realm_key,subject_id) DO NOTHING;
    IF (SELECT count(*) FROM master.principal_identity_binding WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid AND realm_key='platform-control')<>1
      OR NOT EXISTS(SELECT 1 FROM master.principal_identity_binding WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid
        AND realm_key='platform-control' AND subject_id=item->>'subject' AND issuer='${issuer}' AND audience='${audience}'
        AND status='active' AND NOT is_primary AND metadata->>'sourceRef'='${sourceRef}') THEN RAISE EXCEPTION 'Control binding drift'; END IF;
    SELECT array_agg(p.id ORDER BY p.id) INTO expected FROM authz.permission p WHERE p.canonical_code IN (SELECT jsonb_array_elements_text(item->'permissions'))
      AND p.status='published' AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.propagation_mode='exact');
    IF cardinality(expected) IS DISTINCT FROM jsonb_array_length(item->'permissions') THEN RAISE EXCEPTION 'Exact scoped permission unavailable'; END IF;
    INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
    VALUES(tenant_uuid,'platform.control.'||split_part(item->>'username','.',2),'Platform control '||split_part(item->>'username','.',2),'custom','manual','${sourceRef}','draft',actor_uuid)
    ON CONFLICT(tenant_id,code) DO NOTHING;
    SELECT id,source_ref,status INTO STRICT role_uuid,owned,state FROM authz.role WHERE tenant_id=tenant_uuid AND code='platform.control.'||split_part(item->>'username','.',2);
    IF owned IS DISTINCT FROM '${sourceRef}' OR state NOT IN ('draft','active') THEN RAISE EXCEPTION 'Unmanaged role'; END IF;
    IF state='draft' THEN
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT tenant_uuid,role_uuid,unnest(expected),actor_uuid;
      UPDATE authz.role SET status='active',updated_at=now(),updated_by=actor_uuid WHERE tenant_id=tenant_uuid AND id=role_uuid;
    END IF;
    SELECT array_agg(permission_id ORDER BY permission_id) INTO actual FROM authz.role_permission WHERE tenant_id=tenant_uuid AND role_id=role_uuid;
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Role permission drift'; END IF;
    INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
    VALUES(tenant_uuid,'platform.control.'||split_part(item->>'username','.',2),'Platform control '||split_part(item->>'username','.',2),'custom','manual','${sourceRef}','active',actor_uuid)
    ON CONFLICT(tenant_id,code) DO NOTHING;
    SELECT id,source_ref INTO STRICT group_uuid,owned FROM authz.principal_group WHERE tenant_id=tenant_uuid AND code='platform.control.'||split_part(item->>'username','.',2) AND status='active';
    IF owned IS DISTINCT FROM '${sourceRef}' THEN RAISE EXCEPTION 'Unmanaged group'; END IF;
    INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
    SELECT tenant_uuid,group_uuid,role_uuid,scope_uuid,'exact','manual','${sourceRef}','active',actor_uuid
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=tenant_uuid AND group_id=group_uuid);
    IF (SELECT count(*) FROM authz.group_role WHERE tenant_id=tenant_uuid AND group_id=group_uuid)<>1
      OR NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND role_id=role_uuid AND scope_target_id=scope_uuid
        AND propagation_mode='exact' AND status='active' AND source_ref='${sourceRef}' AND effective_until IS NULL) THEN RAISE EXCEPTION 'Group scope drift'; END IF;
    -- Suspended until a real new-realm login is verified and the old binding is retired.
    INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
    SELECT tenant_uuid,group_uuid,principal_uuid,'manual','${sourceRef}','suspended',actor_uuid
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=tenant_uuid AND group_id=group_uuid);
    IF (SELECT count(*) FROM authz.group_member WHERE tenant_id=tenant_uuid AND group_id=group_uuid)<>1
      OR NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND principal_id=principal_uuid
        AND status='suspended' AND source_ref='${sourceRef}' AND effective_until IS NULL) THEN RAISE EXCEPTION 'Staged membership drift'; END IF;
  END LOOP;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
  SELECT tenant_uuid,'studio.platform_authority.stage','${hash}','${hash}','succeeded',actor_uuid,'dev-maintenance',
    '{"realm":"platform-control","principalsPreserved":2,"newBindings":2,"stagedMemberships":2,"effectiveAuthority":false,"oldBindingsRetired":false}',now(),now(),actor_uuid
  WHERE NOT EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id=tenant_uuid AND command_code='studio.platform_authority.stage' AND idempotency_key='${hash}');
END $stage$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('mode','${commit ? "committed" : "rolled_back"}','authorityTenant','athyper','plane','studio','stagedMemberships',2,'effectiveAuthority',false,'oldBindingsRetired',false);
${commit ? "COMMIT" : "ROLLBACK"};`;
}

function inspect(name) {
  const result = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0];
  assertDevContainer(result); return result;
}
function database(sql) {
  return execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function keycloak() {
  const container = inspect("athyper-dev-iam-1");
  const env = Object.fromEntries(container.Config.Env.map(value => { const i=value.indexOf("="); return [value.slice(0,i),value.slice(i+1)]; }));
  const mount = container.Mounts.find(m => m.Destination === "/run/secrets/iam-admin-password");
  if (!mount?.Source.includes("/.athyper/instances/dev/secrets/")) throw Error("Wrong credential mount");
  const ip = Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error("Wrong DEV network");
  const base = `http://${ip}:${env.KC_HTTP_PORT || "8080"}`;
  const response = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: "POST", signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: env.KC_BOOTSTRAP_ADMIN_USERNAME, password: readFileSync(mount.Source,"utf8").trim() }) });
  if (!response.ok) throw Error(`DEV identity authentication failed: ${response.status}`);
  const { access_token } = await response.json();
  return async (path, method="GET", body) => {
    const response = await fetch(`${base}/admin/realms/platform-control${path}`, { method, signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw Error(`Control realm ${method} failed: ${response.status}`);
    return response.status === 204 || response.status === 201 ? undefined : response.json();
  };
}
export async function main(args=process.argv.slice(2)) {
  if (args.length!==1 || !["--check","--confirm=DEV-PLATFORM-AUTHORITY-STAGE"].includes(args[0])) throw Error("Use --check or --confirm=DEV-PLATFORM-AUTHORITY-STAGE");
  const commit=args[0].startsWith("--confirm=");
  const root=fileURLToPath(new URL("../../../../../",import.meta.url));
  const directory=resolve(root,".athyper/instances/dev/secrets/platform-control-onboarding");
  const identityPath=username=>resolve(directory,`${username}.identity.json`);
  const recordedIdentity=username=>{
    const path=identityPath(username);
    if(!existsSync(path)) return undefined;
    if((statSync(path).mode & 0o077)!==0) throw Error("Identity receipt must be private");
    const receipt=JSON.parse(readFileSync(path,"utf8"));
    if(receipt.realm!=="platform-control" || receipt.username!==username || receipt.sourceRef!==sourceRef || !uuid(receipt.subjectId)) throw Error("Identity receipt drift");
    return receipt;
  };
  inspect("athyper-dev-db-1");
  const kc=await keycloak(), realm=await kc(""), actions=await kc("/authentication/required-actions");
  if (!realm.enabled || realm.registrationAllowed || !realm.bruteForceProtected || !actions.some(a=>a.alias==="CONFIGURE_TOTP" && a.enabled)) throw Error("Control realm security prerequisites unavailable");
  const subjects={}, users={}, identityChecks={};
  for (const actor of actors) {
    const found=await kc(`/users?exact=true&username=${encodeURIComponent(actor.username)}`);
    if(found.length>1 || found.some(u=>recordedIdentity(actor.username)?.subjectId!==u.id || !u.enabled)) throw Error("Existing unmanaged control actor; inspect before adopting");
    users[actor.username]=found[0]; subjects[actor.username]=found[0]?.id ?? randomUUID();
    if(found[0]) {
      const credentials=await kc(`/users/${found[0].id}/credentials`);
      const mappings=await kc(`/users/${found[0].id}/role-mappings`);
      if(mappings.clientMappings?.["realm-management"]?.mappings?.length) throw Error("Control actor has unexpected Keycloak administration roles");
      identityChecks[actor.username]={requiredActions:found[0].requiredActions ?? [],otpEnrolled:credentials.some(c=>c.type==="otp")};
    }
  }
  // Exercise every DB constraint in a rollback before changing Keycloak.
  console.log(database(buildStageSql(subjects)));
  if(!commit) { console.log(JSON.stringify({ mode:"check", accounts:actors.map(a=>({username:a.username,exists:!!users[a.username],...identityChecks[a.username]})) })); return; }
  mkdirSync(directory,{recursive:true,mode:0o700});
  if ((statSync(directory).mode & 0o077)!==0) throw Error("Credential directory must be private");
  for(const actor of actors) {
    if(!users[actor.username]) {
      const path=resolve(directory,`${actor.username}.json`);
      if(existsSync(path)) throw Error("Existing onboarding credential file requires recovery review; never overwrite");
      const password=`Aa9!${randomBytes(30).toString("base64url")}`;
      writeFileSync(path,JSON.stringify({realm:"platform-control",username:actor.username,temporaryPassword:password,loginUrl:"https://iam.dev.athyper.test/realms/platform-control/account/"},null,2)+"\n",{mode:0o600,flag:"wx"});
      await kc("/users","POST",{username:actor.username,enabled:true,requiredActions:["UPDATE_PASSWORD","CONFIGURE_TOTP"],
        attributes:{"provisioning-source":[sourceRef]},credentials:[{type:"password",value:password,temporary:true}]});
      const found=await kc(`/users?exact=true&username=${encodeURIComponent(actor.username)}`);
      if(found.length!==1 || !found[0].enabled || !uuid(found[0].id)) throw Error("Created actor not confirmed");
      // Keycloak may discard unmanaged custom attributes. Pin its actual ID in a
      // private operational receipt, rather than relying on an unpersisted label.
      writeFileSync(identityPath(actor.username),JSON.stringify({sourceRef,realm:"platform-control",username:actor.username,subjectId:found[0].id},null,2)+"\n",{mode:0o600,flag:"wx"});
      users[actor.username]=found[0]; subjects[actor.username]=found[0].id;
    }
  }
  console.log(database(buildStageSql(subjects,true)));
  const receipt={schema:"athyper.dev-platform-authority-staging/1",occurredAt:new Date().toISOString(),realm:"platform-control",tenant:"athyper",plane:"studio",
    accounts:actors.map(a=>({username:a.username,principalId:a.principalId,subjectId:subjects[a.username]})),memberships:"suspended",mfaVerified:false,oldBindingsRetired:false};
  writeFileSync(resolve(directory,`receipt-${Date.now()}-${randomUUID()}.json`),JSON.stringify(receipt,null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({...receipt,credentialDirectory:directory}));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===fileURLToPath(pathToFileURL(process.argv[1])))
  main().catch(error=>{console.error(error.stderr?.toString() || error.message);process.exitCode=1;});
