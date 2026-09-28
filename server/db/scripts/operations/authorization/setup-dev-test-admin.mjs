#!/usr/bin/env node
// Operational DEV provisioning only. No runtime authorization bypass or wildcard.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const sourceRef = "dev:test-full-admin:v1";
export const members = {
  athyper: ["athyper.admin", "athyper.owner"],
  cirrusatlantic: ["catl.admin", "catl.owner"],
};
const planes = ["studio", "neon", "mesh"];
const confirmation = "DEV-TEST-FULL-ADMIN-NO-EXPIRY";
const databaseContainer = "athyper-dev-db-1";
const identityContainer = "athyper-dev-iam-1";

export function assertDevContainer(container) {
  if (container.Config?.Labels?.["com.docker.compose.project"] !== "athyper-dev"
    || container.State?.Running !== true) throw Error("Expected a running athyper-dev container");
}
function inspect(name) {
  const container = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0];
  assertDevContainer(container);
  return container;
}
function literal(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function query(plane, sql) {
  if (!planes.includes(plane)) throw Error("Invalid DEV database plane");
  return execFileSync("docker", ["exec", "-i", databaseContainer, "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1', "sh", `athyper_${plane}`],
  { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function identity() {
  const container = inspect(identityContainer);
  const env = Object.fromEntries(container.Config.Env.map(value => {
    const i = value.indexOf("="); return [value.slice(0, i), value.slice(i + 1)];
  }));
  const ip = Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error("Missing DEV identity network");
  const mount = container.Mounts.find(m => m.Destination === "/run/secrets/iam-admin-password");
  if (!mount?.Source.includes("/.athyper/instances/dev/secrets/")) throw Error("Wrong identity credential mount");
  const base = `http://${ip}:${env.KC_HTTP_PORT || "8080"}`;
  const response = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: "POST", signal: AbortSignal.timeout(10000), body: new URLSearchParams({
      grant_type: "password", client_id: "admin-cli", username: env.KC_BOOTSTRAP_ADMIN_USERNAME,
      password: readFileSync(mount.Source, "utf8").trim(),
    }),
  });
  if (!response.ok) throw Error(`DEV identity authentication failed: ${response.status}`);
  const { access_token } = await response.json();
  return async (path, method = "GET", body) => {
    const response = await fetch(`${base}/admin/realms/athyper${path}`, {
      method, signal: AbortSignal.timeout(10000), headers: {
        authorization: `Bearer ${access_token}`, "content-type": "application/json",
      }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw Error(`DEV identity ${method} failed: ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  };
}

export function buildProvisionSql(plane, ownerSubject, commit = false) {
  if (!planes.includes(plane) || !/^[0-9a-f-]{36}$/.test(ownerSubject)) throw Error("Invalid provisioning coordinates");
  const desired = literal(JSON.stringify(members));
  return `BEGIN;
SET LOCAL app.database_plane=${literal(plane)};
SET LOCAL app.current_plane_key=${literal(plane)};
DO $provision$
DECLARE
  tenant_row record; user_row record; binding_row record; scope_pair record; target_row record;
  tenant_uuid uuid; actor_uuid uuid; group_uuid uuid; role_uuid uuid; principal_uuid uuid;
  role_code text; role_status text; owned_by text; permission_ids uuid[]; existing_permissions uuid[];
  username_value text; owner_subject text := ${literal(ownerSubject)};
BEGIN
  IF current_database() <> ${literal(`athyper_${plane}`)} THEN RAISE EXCEPTION 'wrong database'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(${literal(sourceRef)},0));
  FOR tenant_row IN SELECT key AS code,value AS usernames FROM jsonb_each(${desired}::jsonb) LOOP
    SELECT id INTO STRICT tenant_uuid FROM master.tenant WHERE code=tenant_row.code AND status='active';
    SELECT id INTO STRICT actor_uuid FROM master.principal WHERE tenant_id=tenant_uuid
      AND code='seed.three-plane-provisioner' AND status='active';
    PERFORM set_config('app.current_tenant_id',tenant_uuid::text,true);
    PERFORM set_config('app.current_principal_id',actor_uuid::text,true);

    -- Only this explicitly requested identity may be newly projected into Studio.
    IF ${literal(plane)}='studio' AND tenant_row.code='athyper' THEN
      IF NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id=tenant_uuid AND code='athyper.owner') THEN
        INSERT INTO master.principal(tenant_id,code,name,principal_type,provisioning_source,status,metadata,created_by)
        VALUES(tenant_uuid,'athyper.owner','Athyper Owner','user','sync','active',
          jsonb_build_object('managedBy',${literal(sourceRef)},'environment','dev'),actor_uuid);
      END IF;
      SELECT id INTO STRICT principal_uuid FROM master.principal WHERE tenant_id=tenant_uuid
        AND code='athyper.owner' AND principal_type='user' AND status='active';
      IF NOT EXISTS (SELECT 1 FROM master.principal_identity_binding WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid) THEN
        INSERT INTO master.principal_identity_binding(tenant_id,principal_id,provider_code,realm_key,subject_id,username,
          is_primary,status,last_verified_at,synced_at,sync_status,metadata,created_by)
        VALUES(tenant_uuid,principal_uuid,'keycloak','athyper',owner_subject,'athyper.owner',true,'active',now(),now(),'synced',
          jsonb_build_object('managedBy',${literal(sourceRef)},'environment','dev'),actor_uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM master.principal_identity_binding WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid
        AND provider_code='keycloak' AND realm_key='athyper' AND subject_id=owner_subject AND username='athyper.owner' AND status='active')
        THEN RAISE EXCEPTION 'Studio owner identity conflict'; END IF;
      IF NOT EXISTS (SELECT 1 FROM authz.plane_membership WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid) THEN
        INSERT INTO authz.plane_membership(tenant_id,principal_id,membership_kind,source_type,source_ref,status,metadata,created_by)
        VALUES(tenant_uuid,principal_uuid,'standard','manual',${literal(sourceRef)},'active',
          jsonb_build_object('managedBy',${literal(sourceRef)},'environment','dev'),actor_uuid);
      END IF;
    END IF;

    INSERT INTO authz.principal_group(tenant_id,code,name,description,group_kind,source_type,source_ref,metadata,status,created_by)
    VALUES(tenant_uuid,'test.full_admin','Test Full Admin Group','DEV testing only; explicit tenant-local scopes; no expiry',
      'custom','manual',${literal(sourceRef)},jsonb_build_object('environment','dev','managedBy',${literal(sourceRef)}),'active',actor_uuid)
    ON CONFLICT(tenant_id,code) DO NOTHING;
    SELECT id,source_ref INTO STRICT group_uuid,owned_by FROM authz.principal_group
      WHERE tenant_id=tenant_uuid AND code='test.full_admin' AND status='active';
    IF owned_by IS DISTINCT FROM ${literal(sourceRef)} THEN RAISE EXCEPTION 'Unmanaged group collision'; END IF;

    FOR user_row IN SELECT value AS username FROM jsonb_array_elements_text(tenant_row.usernames) LOOP
      username_value := user_row.username;
      SELECT p.id INTO STRICT principal_uuid FROM master.principal_identity_binding b JOIN master.principal p
        ON p.tenant_id=b.tenant_id AND p.id=b.principal_id
        WHERE b.tenant_id=tenant_uuid AND b.username=username_value AND b.provider_code='keycloak' AND b.realm_key='athyper'
          AND b.status='active' AND p.status='active' AND p.principal_type='user';
      IF NOT EXISTS (SELECT 1 FROM authz.plane_membership WHERE tenant_id=tenant_uuid AND principal_id=principal_uuid
        AND status='active' AND effective_from<=now() AND effective_until IS NULL)
        THEN RAISE EXCEPTION 'Missing non-expiring plane membership for %',username_value; END IF;
      INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,metadata,created_by)
      SELECT tenant_uuid,group_uuid,principal_uuid,'manual',${literal(sourceRef)},'active',NULL,
        jsonb_build_object('environment','dev','managedBy',${literal(sourceRef)}),actor_uuid
      WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND principal_id=principal_uuid);
      IF NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND principal_id=principal_uuid
        AND source_ref=${literal(sourceRef)} AND status='active' AND effective_from<=now() AND effective_until IS NULL)
        THEN RAISE EXCEPTION 'Existing group membership differs from requested policy'; END IF;
    END LOOP;

    -- Materialize explicit permission lists. No wildcard and no automatic future grants.
    FOR scope_pair IN SELECT DISTINCT s.scope_kind,s.propagation_mode FROM authz.permission_scope_kind s
      JOIN authz.permission p ON p.id=s.permission_id WHERE s.status='active' AND p.status='published'
      ORDER BY s.scope_kind,s.propagation_mode LOOP
      SELECT array_agg(p.id ORDER BY p.id) INTO permission_ids FROM authz.permission p
        JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.status='published' AND s.status='active'
        AND s.scope_kind=scope_pair.scope_kind AND s.propagation_mode=scope_pair.propagation_mode;
      role_code := CASE WHEN scope_pair.scope_kind='tenant' AND scope_pair.propagation_mode='exact' THEN 'test.full_admin'
        ELSE 'test.full_admin.'||scope_pair.scope_kind||'.'||scope_pair.propagation_mode END;
      INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
      VALUES(tenant_uuid,role_code,CASE WHEN role_code='test.full_admin' THEN 'Test Full Admin Role'
        ELSE 'Test Full Admin Role - '||scope_pair.scope_kind||' / '||scope_pair.propagation_mode END,
        'DEV published-permission snapshot; tenant isolation and security checks retained','custom','manual',${literal(sourceRef)},
        jsonb_build_object('environment','dev','managedBy',${literal(sourceRef)}),'draft',actor_uuid)
      ON CONFLICT(tenant_id,code) DO NOTHING;
      SELECT id,source_ref,status INTO STRICT role_uuid,owned_by,role_status FROM authz.role WHERE tenant_id=tenant_uuid AND code=role_code;
      IF owned_by IS DISTINCT FROM ${literal(sourceRef)} THEN RAISE EXCEPTION 'Unmanaged role collision'; END IF;
      IF role_status='draft' THEN
        INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
          SELECT tenant_uuid,role_uuid,unnest(permission_ids),actor_uuid ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
        UPDATE authz.role SET status='active',updated_by=actor_uuid WHERE tenant_id=tenant_uuid AND id=role_uuid;
      ELSIF role_status<>'active' THEN RAISE EXCEPTION 'Existing role is not active'; END IF;
      SELECT array_agg(permission_id ORDER BY permission_id) INTO existing_permissions FROM authz.role_permission
        WHERE tenant_id=tenant_uuid AND role_id=role_uuid;
      IF existing_permissions IS DISTINCT FROM permission_ids THEN RAISE EXCEPTION 'Permission snapshot drift requires explicit review'; END IF;
      FOR target_row IN SELECT id FROM authz.scope_target WHERE tenant_id=tenant_uuid AND status='active' AND scope_kind=scope_pair.scope_kind LOOP
        INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,metadata,created_by)
        SELECT tenant_uuid,group_uuid,role_uuid,target_row.id,scope_pair.propagation_mode,'manual',${literal(sourceRef)},'active',NULL,
          jsonb_build_object('environment','dev','managedBy',${literal(sourceRef)}),actor_uuid
        WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND role_id=role_uuid
          AND scope_target_id=target_row.id AND propagation_mode=scope_pair.propagation_mode);
        IF NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=tenant_uuid AND group_id=group_uuid AND role_id=role_uuid
          AND scope_target_id=target_row.id AND propagation_mode=scope_pair.propagation_mode AND source_ref=${literal(sourceRef)}
          AND status='active' AND effective_from<=now() AND effective_until IS NULL)
          THEN RAISE EXCEPTION 'Existing role assignment differs from requested policy'; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$provision$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('plane',${literal(plane)},'groups',(SELECT count(*) FROM authz.principal_group WHERE source_ref=${literal(sourceRef)}),
 'roles',(SELECT count(*) FROM authz.role WHERE source_ref=${literal(sourceRef)}),
 'members',(SELECT count(*) FROM authz.group_member WHERE source_ref=${literal(sourceRef)}),
 'assignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${literal(sourceRef)}));
${commit ? "COMMIT" : "ROLLBACK"};`;
}

async function main() {
  const apply = process.argv.includes(`--confirm=${confirmation}`);
  if (process.argv.slice(2).some(a => a !== "--check" && a !== `--confirm=${confirmation}`)) throw Error("Unexpected argument");
  inspect(databaseContainer);
  const request = await identity();
  const users = await request("/users?username=athyper.owner&exact=true");
  if (users.length !== 1 || users[0].enabled !== true) throw Error("Missing unique enabled Studio owner identity");
  const owner = users[0];
  const baseline = JSON.parse(query("neon", `BEGIN READ ONLY; SELECT json_agg(subject_id) FROM master.principal_identity_binding
    WHERE username='athyper.owner' AND provider_code='keycloak' AND realm_key='athyper' AND status='active'; COMMIT;`));
  if (baseline?.length !== 1 || baseline[0] !== owner.id) throw Error("Live identity does not match Neon principal");
  const clients = await request("/clients?clientId=studio-web");
  if (clients.length !== 1) throw Error("Missing unique Studio identity client");
  const realmRole = await request("/roles/STUDIO_USER");
  const clientRole = await request(`/clients/${clients[0].id}/roles/AUTHORIZED`);
  // Exercise actual constraints/audit hooks in rollback transactions on every plane first.
  for (const plane of planes) console.log(JSON.stringify({ stage: "rollback-check", ...JSON.parse(query(plane, buildProvisionSql(plane, owner.id))) }));
  if (!apply) { console.log("No changes committed. Use --confirm=" + confirmation); return; }
  // Authentication admission only. Authorization stays in each plane's tenant-local tables.
  const realmMappings = await request(`/users/${owner.id}/role-mappings/realm`);
  if (!realmMappings.some(r => r.id === realmRole.id)) await request(`/users/${owner.id}/role-mappings/realm`, "POST", [realmRole]);
  const clientMappings = await request(`/users/${owner.id}/role-mappings/clients/${clients[0].id}`);
  if (!clientMappings.some(r => r.id === clientRole.id)) await request(`/users/${owner.id}/role-mappings/clients/${clients[0].id}`, "POST", [clientRole]);
  for (const plane of planes) console.log(JSON.stringify({ stage: "committed", ...JSON.parse(query(plane, buildProvisionSql(plane, owner.id, true))) }));
  const finalMappings = await request(`/users/${owner.id}/role-mappings`);
  if (!finalMappings.realmMappings?.some(r => r.name === "STUDIO_USER")
    || !finalMappings.clientMappings?.["studio-web"]?.mappings?.some(r => r.name === "AUTHORIZED")) throw Error("Studio identity admission verification failed");
  console.log(JSON.stringify({ studioOwnerAdmission: "verified", expiry: null, scope: "DEV only", sourceRef }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
}
