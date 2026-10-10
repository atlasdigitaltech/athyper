#!/usr/bin/env node
/**
 * Activates the staged platform-control identities after a clean local Studio
 * rebuild. This is a scoped reset correction: it retires only the seeded
 * three-plane-demo identity coordinates, never external accounts or arbitrary
 * legacy identities. It reuses the existing stage contract and requires fresh
 * elevated Admin and Owner login receipts before activating memberships.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { actors, buildStageSql, sourceRef } from "./stage-dev-platform-authority.mjs";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";

const tenant = "11111111-1111-4111-8111-111111111111";
const command = "studio.platform_authority.clean_foundation_activation";
const controlIssuer = "https://iam.dev.athyper.test/realms/platform-control";
const controlAudience = "athyper-platform-control-api";
const seededSource = "three-plane-demo:v1";
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// Seeded historical fixture IDs predate strict RFC-4122 variant validation.
const databaseUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function database(statement) {
  return execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function validateCoordinates(coordinates) {
  if (!coordinates || Object.keys(coordinates).length !== actors.length) throw Error("Exact staged authority coordinates required");
  for (const actor of actors) {
    const item = coordinates[actor.username];
    if (!item || item.principalId !== actor.principalId || !uuid(item.controlSubject) || !databaseUuid(item.legacySubject))
      throw Error("Clean foundation authority coordinate drift");
  }
  if (new Set(actors.map((actor) => coordinates[actor.username].controlSubject)).size !== actors.length
    || new Set(actors.map((actor) => coordinates[actor.username].legacySubject)).size !== actors.length)
    throw Error("Authority subjects must be distinct");
}

export function buildCleanActivationSql(coordinates, commit = false) {
  validateCoordinates(coordinates);
  const subjects = Object.fromEntries(actors.map((actor) => [actor.username, coordinates[actor.username].controlSubject]));
  const plan = actors.map((actor) => ({ ...actor, ...coordinates[actor.username] }));
  const hash = createHash("sha256").update(JSON.stringify({ command, sourceRef, seededSource, plan })).digest("hex");
  const stage = buildStageSql(subjects).replace(/SELECT json_build_object\('mode',[\s\S]*?ROLLBACK;\s*$/, "");
  return `${stage}
DO $activation$
DECLARE actor_uuid uuid; principal_uuid uuid; item jsonb; changed integer;
BEGIN
  IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio only'; END IF;
  SELECT id INTO STRICT actor_uuid FROM master.principal
    WHERE tenant_id=${literal(tenant)}::uuid AND code='seed.three-plane-provisioner' AND status='active';
  FOR item IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(plan))}::jsonb) LOOP
    principal_uuid := (item->>'principalId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM master.principal_identity_binding
      WHERE tenant_id=${literal(tenant)}::uuid AND principal_id=principal_uuid AND provider_code='keycloak'
        AND realm_key='athyper' AND subject_id=item->>'legacySubject' AND status='active' AND is_primary
        AND metadata#>>'{_seed,source}'=${literal(seededSource)}) THEN
      RAISE EXCEPTION 'Expected clean-reset legacy binding unavailable';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM master.principal_identity_binding
      WHERE tenant_id=${literal(tenant)}::uuid AND principal_id=principal_uuid AND provider_code='keycloak'
        AND realm_key='platform-control' AND subject_id=item->>'controlSubject' AND issuer=${literal(controlIssuer)}
        AND audience=${literal(controlAudience)} AND status='active' AND NOT is_primary
        AND metadata->>'sourceRef'=${literal(sourceRef)}) THEN
      RAISE EXCEPTION 'Expected staged control binding unavailable';
    END IF;
    UPDATE master.principal_identity_binding
      SET status='revoked', is_primary=false, status_changed_at=now(), status_changed_by=actor_uuid,
          updated_at=now(), updated_by=actor_uuid
      WHERE tenant_id=${literal(tenant)}::uuid AND principal_id=principal_uuid AND provider_code='keycloak'
        AND realm_key='athyper' AND subject_id=item->>'legacySubject' AND status='active' AND is_primary
        AND metadata#>>'{_seed,source}'=${literal(seededSource)};
    GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'Exact seeded binding retirement required'; END IF;
    UPDATE master.principal_identity_binding
      SET is_primary=true, metadata=metadata||jsonb_build_object('migrationState','clean_foundation_active'),
          updated_at=now(), updated_by=actor_uuid
      WHERE tenant_id=${literal(tenant)}::uuid AND principal_id=principal_uuid AND provider_code='keycloak'
        AND realm_key='platform-control' AND subject_id=item->>'controlSubject' AND status='active' AND NOT is_primary
        AND metadata->>'sourceRef'=${literal(sourceRef)};
    GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'Exact control binding activation required'; END IF;
    UPDATE authz.group_member AS gm SET status='active', status_changed_at=now(), status_changed_by=actor_uuid,
      updated_at=now(), updated_by=actor_uuid
      FROM authz.principal_group AS g
      WHERE gm.tenant_id=${literal(tenant)}::uuid AND gm.principal_id=principal_uuid AND gm.status='suspended'
        AND gm.source_ref=${literal(sourceRef)} AND g.tenant_id=gm.tenant_id AND g.id=gm.group_id
        AND g.code='platform.control.'||split_part(item->>'username','.',2) AND g.source_ref=${literal(sourceRef)};
    GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'Exact staged membership activation required'; END IF;
    UPDATE master.principal SET auth_epoch=auth_epoch+1, updated_at=now(), updated_by=actor_uuid
      WHERE tenant_id=${literal(tenant)}::uuid AND id=principal_uuid;
  END LOOP;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
  VALUES(${literal(tenant)}::uuid,${literal(command)},${literal(hash)},${literal(hash)},'succeeded',actor_uuid,'dev-maintenance',
    jsonb_build_object('principalIdsPreserved',true,'seededBindingsRetired',2,'controlBindingsActivated',2,
      'membershipsActivated',2,'externalAccountsChanged',0,'approvalBasis','verified elevated Admin and Owner control-realm sessions'),
    now(),now(),actor_uuid);
END $activation$;
SET CONSTRAINTS ALL IMMEDIATE;
${commit ? "COMMIT" : "ROLLBACK"};`;
}

function readCoordinates() {
  const raw = database(`SELECT coalesce(json_agg(json_build_object('username',p.code,'principalId',p.id::text,
    'controlSubject',control.subject_id,'legacySubject',legacy.subject_id) ORDER BY p.code),'[]'::json)::text
    FROM master.principal p
    JOIN master.principal_identity_binding control ON control.tenant_id=p.tenant_id AND control.principal_id=p.id
      AND control.provider_code='keycloak' AND control.realm_key='platform-control' AND control.status='active'
      AND control.issuer=${literal(controlIssuer)} AND control.audience=${literal(controlAudience)}
    JOIN master.principal_identity_binding legacy ON legacy.tenant_id=p.tenant_id AND legacy.principal_id=p.id
      AND legacy.provider_code='keycloak' AND legacy.realm_key='athyper' AND legacy.status='active' AND legacy.is_primary
      AND legacy.metadata#>>'{_seed,source}'=${literal(seededSource)}
    WHERE p.tenant_id=${literal(tenant)}::uuid AND p.code IN ('platform.admin','platform.owner') AND p.status='active';`);
  const rows = JSON.parse(raw);
  return Object.fromEntries(rows.map((row) => [row.username, row]));
}

async function verifyReceipts(coordinates) {
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-iam-1"], { encoding: "utf8" }))[0];
  assertDevContainer(container);
  const env = Object.fromEntries(container.Config.Env.map((value) => {
    const index = value.indexOf("="); return [value.slice(0, index), value.slice(index + 1)];
  }));
  const ip = Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error("DEV identity network missing");
  const jwksResponse = await fetch(`http://${ip}:${env.KC_HTTP_PORT || "8080"}/realms/platform-control/protocol/openid-connect/certs`, { signal: AbortSignal.timeout(10000) });
  if (!jwksResponse.ok) throw Error("Control signing keys unavailable");
  const require = createRequire(new URL("../../../../packages/adapters/auth-keycloak/package.json", import.meta.url));
  const { createLocalJWKSet, jwtVerify } = await import(pathToFileURL(require.resolve("jose")).href);
  const jwks = createLocalJWKSet(await jwksResponse.json());
  for (const actor of actors) {
    const path = `${homedir()}/.athyper/instances/dev/secrets/control-api/login/${actor.username}.json`;
    if ((statSync(path).mode & 0o077) !== 0) throw Error("Private MFA receipt required");
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    const verifiedAt = new Date(receipt.verifiedAt);
    if (!Number.isFinite(+verifiedAt) || Date.now() - +verifiedAt > 86400000 || +verifiedAt > Date.now()) throw Error("Recent verified login required");
    const { payload } = await jwtVerify(receipt.accessToken, jwks, {
      issuer: controlIssuer, audience: controlAudience, algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "amr", "azp", "plane"], currentDate: verifiedAt,
    });
    if (payload.sub !== coordinates[actor.username].controlSubject || payload.azp !== "athyper-platform-control-operator"
      || payload.plane !== "studio" || !Array.isArray(payload.amr) || !payload.amr.includes("pwd") || !payload.amr.includes("otp")
      || receipt.principalId !== actor.principalId || receipt.username !== actor.username
      || receipt.tenantId !== tenant || receipt.assurance !== "elevated") throw Error("Human MFA evidence mismatch");
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !["--check", "--confirm=DEV-CLEAN-FOUNDATION-AUTHORITY-ACTIVATION"].includes(args[0]))
    throw Error("Use --check or --confirm=DEV-CLEAN-FOUNDATION-AUTHORITY-ACTIVATION");
  const commit = args[0].startsWith("--confirm");
  assertDevContainer(JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0]);
  const coordinates = readCoordinates();
  validateCoordinates(coordinates);
  await verifyReceipts(coordinates);
  const sql = buildCleanActivationSql(coordinates, commit);
  const hash = createHash("sha256").update(JSON.stringify({ command, sourceRef, seededSource, plan: actors.map((actor) => ({ ...actor, ...coordinates[actor.username] })) })).digest("hex");
  const completed = database(`SELECT count(*) FROM event.command_execution WHERE tenant_id=${literal(tenant)}::uuid AND command_code=${literal(command)} AND idempotency_key=${literal(hash)} AND request_fingerprint=${literal(hash)} AND status='succeeded';`) === "1";
  if (!completed) database(sql);
  console.log(JSON.stringify({ mode: commit ? "committed" : "checked", authorityTenant: "athyper", principals: actors.length,
    membershipsActivated: commit && !completed ? actors.length : 0, existingActivation: completed, externalAccountsChanged: 0 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
