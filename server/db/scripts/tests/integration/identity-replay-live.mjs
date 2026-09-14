// Isolated real PostgreSQL/Keycloak verification. Never connects to dev/QA databases.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:http";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import {
  createIamService,
  createIamConfig,
  createIdentityReplayAuthorizer,
  createIamAuthenticationMiddleware,
  IdentityReplayApprovalService,
  KyselyIdentityReplayApprovalRepository,
  KyselyIdentitySagaRepository,
  KeycloakIdentityProviderAdapter,
  registerIdentityReplayRoutes,
  providerKey,
} from "@athyper/server-platform-iam";
import { createKeycloakAuthAdapter } from "@athyper/server-adapter-auth-keycloak";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { getRequestContext } from "@athyper/server-foundation/context";

const root = resolve(import.meta.dirname, "../../../..");
const tag = `iam-replay-${randomUUID().slice(0, 8)}`;
const temp = await mkdtemp(resolve(tmpdir(), tag));
const containers = [];
const pools = [];
let server;
const evidence = {
  schemaVersion: 1,
  suite: "durable-identity-replay",
  startedAt: new Date().toISOString(),
  checks: [],
  postgres: "16.13",
  keycloak: "26.7.2",
  isolatedDatabases: ["studio", "neon", "mesh"],
  realOtp: true,
};
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (name) => {
  evidence.checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
};
async function waitFor(test, label) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      if (await test()) return;
    } catch {}
    await pause(500);
  }
  throw new Error(`${label} unavailable`);
}
function totp(secret) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(secret)).update(bytes).digest();
  const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
const adminSecret = randomUUID();
const otpFlowId = randomUUID(),
  passwordFlowId = randomUUID();
const tenant = randomUUID(),
  otherTenant = randomUUID();
const users = ["maker", "checker", "outsider", "unprivileged"].map((name) => ({
  name,
  id: randomUUID(),
  password: randomUUID(),
  secret: "12345678901234567890",
  tenant: name === "outsider" ? otherTenant : tenant,
}));
try {
  const realm = {
    realm: tag,
    enabled: true,
    sslRequired: "none",
    roles: {
      client: {
        "studio-web": [{ name: "AUTHORIZED" }],
        "baseline-web": [{ name: "AUTHORIZED" }],
      },
    },
    authenticationFlows: [
      {
        id: otpFlowId,
        alias: "replay-direct-otp",
        description: "Test password plus real TOTP",
        providerId: "basic-flow",
        topLevel: true,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: "direct-grant-validate-username",
            requirement: "REQUIRED",
            priority: 10,
            authenticatorFlow: false,
          },
          {
            authenticator: "direct-grant-validate-password",
            requirement: "REQUIRED",
            priority: 20,
            authenticatorFlow: false,
          },
          {
            authenticator: "direct-grant-validate-otp",
            requirement: "REQUIRED",
            priority: 30,
            authenticatorFlow: false,
          },
        ],
      },
      {
        id: passwordFlowId,
        alias: "replay-direct-password",
        providerId: "basic-flow",
        topLevel: true,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: "direct-grant-validate-username",
            requirement: "REQUIRED",
            priority: 10,
            authenticatorFlow: false,
          },
          {
            authenticator: "direct-grant-validate-password",
            requirement: "REQUIRED",
            priority: 20,
            authenticatorFlow: false,
          },
        ],
      },
    ],
    clients: [true, false].map((mfa) => ({
      clientId: mfa ? "studio-web" : "baseline-web",
      enabled: true,
      publicClient: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      authenticationFlowBindingOverrides: {
        direct_grant: mfa ? otpFlowId : passwordFlowId,
      },
      protocolMappers: [
        {
          name: "audience",
          protocol: "openid-connect",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.custom.audience": "athyper-api",
            "access.token.claim": "true",
          },
        },
        {
          name: "plane",
          protocol: "openid-connect",
          protocolMapper: "oidc-hardcoded-claim-mapper",
          config: {
            "claim.name": "plane",
            "claim.value": "studio",
            "jsonType.label": "String",
            "access.token.claim": "true",
          },
        },
        // This client has no authentication flow that can skip OTP; the mapper describes that proven flow.
        {
          name: "amr",
          protocol: "openid-connect",
          protocolMapper: "oidc-hardcoded-claim-mapper",
          config: {
            "claim.name": "amr",
            "claim.value": mfa ? '["pwd","otp"]' : '["pwd"]',
            "jsonType.label": "JSON",
            "access.token.claim": "true",
          },
        },
      ],
    })),
    users: users.map((user) => ({
      id: user.id,
      username: user.name,
      enabled: true,
      emailVerified: true,
      firstName: user.name,
      lastName: "Replay",
      email: `${user.name}@example.test`,
      credentials: [
        { type: "password", value: user.password, temporary: false },
        {
          type: "otp",
          secretData: JSON.stringify({ value: user.secret }),
          credentialData: JSON.stringify({
            subType: "totp",
            digits: 6,
            counter: 0,
            period: 30,
            algorithm: "HmacSHA1",
          }),
          userLabel: "isolated-test-otp",
        },
      ],
      clientRoles: {
        "studio-web": ["AUTHORIZED"],
        "baseline-web": ["AUTHORIZED"],
      },
    })),
  };
  realm.clients.push({
    clientId: "replay-admin",
    enabled: true,
    publicClient: false,
    secret: adminSecret,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
  });
  realm.users.push({
    username: "service-account-replay-admin",
    enabled: true,
    serviceAccountClientId: "replay-admin",
    clientRoles: { "realm-management": ["manage-users", "view-users"] },
  });
  await writeFile(resolve(temp, "realm.json"), JSON.stringify(realm));
  containers.push(`${tag}-pg`);
  docker(
    "run",
    "-d",
    "--name",
    containers.at(-1),
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-p",
    "127.0.0.1::5432",
    "postgres:16.13-bookworm",
  );
  const pgPort = docker("port", containers.at(-1), "5432/tcp")
    .split(":")
    .at(-1);
  const admin = new pg.Pool({
    connectionString: `postgres://postgres@127.0.0.1:${pgPort}/postgres`,
    connectionTimeoutMillis: 3000,
    query_timeout: 10000,
  });
  pools.push(admin);
  await waitFor(async () => {
    await admin.query("SELECT 1");
    return true;
  }, "PostgreSQL");
  pass("isolated PostgreSQL ready");
  await admin.query("CREATE ROLE athyperapp NOLOGIN");
  for (const plane of ["studio", "neon", "mesh"])
    await admin.query(`CREATE DATABASE ${plane}`);
  const dbs = {};
  for (const plane of ["studio", "neon", "mesh"]) {
    const pool = new pg.Pool({
      connectionString: `postgres://postgres@127.0.0.1:${pgPort}/${plane}`,
      max: 12,
      connectionTimeoutMillis: 3000,
      query_timeout: 10000,
    });
    pools.push(pool);
    dbs[plane] = new Kysely({ dialect: new PostgresDialect({ pool }) });
  }
  containers.push(`${tag}-kc`);
  docker(
    "run",
    "-d",
    "--name",
    containers.at(-1),
    "-e",
    "KC_DB=dev-file",
    "-e",
    "KC_HEALTH_ENABLED=true",
    "-p",
    "127.0.0.1::8080",
    "-v",
    `${temp}/realm.json:/opt/keycloak/data/import/replay.json:ro`,
    process.env.IAM_TEST_KEYCLOAK_IMAGE ?? "athyper/keycloak:rebuild-20260906",
    "start-dev",
    "--import-realm",
  );
  pass("isolated Keycloak container started");
  const kcPort = docker("port", containers.at(-1), "8080/tcp")
    .split(":")
    .at(-1);
  const issuer = `http://127.0.0.1:${kcPort}/realms/${tag}`;
  await waitFor(
    async () => (await fetch(`${issuer}/.well-known/openid-configuration`)).ok,
    "Keycloak realm",
  );
  async function token(user, mfa = true, otp = totp(user.secret)) {
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: mfa ? "studio-web" : "baseline-web",
        username: user.name,
        password: user.password,
        ...(mfa ? { totp: otp } : {}),
      }),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        `Keycloak login ${response.status}: ${value.error_description ?? value.error}`,
      );
    return value.access_token;
  }
  await assert.rejects(() => token(users[0], true, "000000"));
  pass("Keycloak rejects an invalid real OTP");
  const tokens = Object.fromEntries(
    await Promise.all(
      users.map(async (user) => [user.name, await token(user)]),
    ),
  );
  // A separate password-only flow proves baseline tokens cannot authorize replay.
  const baselineToken = await token(users[0], false);
  const studio = dbs.studio;
  await sql
    .raw(
      `CREATE SCHEMA shared; CREATE SCHEMA master; CREATE SCHEMA trustiam;
    CREATE DOMAIN shared.application_plane_d AS text;
    CREATE DOMAIN trustiam.reconciliation_status_d AS text;
    CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
    CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid$$;
    CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('app.current_tenant_id')::uuid$$;
    CREATE FUNCTION shared.trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END$$;
    CREATE TABLE master.principal(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,status text NOT NULL DEFAULT 'active',auth_epoch int NOT NULL DEFAULT 0,subject text NOT NULL,can_replay boolean NOT NULL,UNIQUE(tenant_id,id));
    CREATE TABLE public.replay_audit(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,event_code text,actor_id uuid,entity_id uuid,metadata jsonb);
    GRANT USAGE ON SCHEMA shared,master,trustiam TO athyperapp;
    GRANT SELECT ON master.principal TO athyperapp;
    GRANT INSERT ON public.replay_audit TO athyperapp;`,
    )
    .execute(studio);
  const tables = await readFile(
    resolve(root, "db/ddl/planes/studio/trustiam/03_tables.sql"),
    "utf8",
  );
  for (const name of ["identity_projection", "identity_saga_attempt"]) {
    const begin = tables.indexOf(`CREATE TABLE trustiam.${name} (`);
    const end = tables.indexOf("\n);", begin) + 4;
    await sql.raw(tables.slice(begin, end)).execute(studio);
  }
  const triggers = await readFile(
    resolve(root, "db/ddl/planes/studio/trustiam/08_triggers.sql"),
    "utf8",
  );
  for (const name of [
    "trg_guard_identity_saga_attempt",
    "trg_guard_identity_desired_state",
  ]) {
    const begin = triggers.indexOf(`CREATE FUNCTION trustiam.${name}()`);
    const end = triggers.indexOf("$$;", begin) + 3;
    await sql.raw(triggers.slice(begin, end)).execute(studio);
  }
  await sql
    .raw(
      `CREATE TRIGGER identity_projection_saga_fence BEFORE UPDATE ON trustiam.identity_projection FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_desired_state();
    CREATE TRIGGER identity_saga_attempt_guard BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_saga_attempt();
    CREATE TRIGGER identity_saga_attempt_updated_at BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
    GRANT SELECT ON trustiam.identity_projection,trustiam.identity_saga_attempt TO athyperapp;
    GRANT UPDATE(replay_requested_at,replay_requested_by,replay_approved_by,updated_by) ON trustiam.identity_saga_attempt TO athyperapp;
    ALTER TABLE trustiam.identity_projection ENABLE ROW LEVEL SECURITY; ALTER TABLE trustiam.identity_saga_attempt ENABLE ROW LEVEL SECURITY;
    CREATE POLICY authority_access ON trustiam.identity_projection USING(authority_tenant_id=shared.current_tenant_id_soft());
    CREATE POLICY authority_access ON trustiam.identity_saga_attempt USING(authority_tenant_id=shared.current_tenant_id_soft());`,
    )
    .execute(studio);
  const replayDdl = await readFile(
    resolve(
      root,
      "db/ddl/planes/studio/trustiam/12_identity_replay_approval.sql",
    ),
    "utf8",
  );
  const replayMigration = await readFile(
    resolve(root, "db/scripts/operations/upgrades/legacy-baseline-20260914/20260906_identity_replay_approval.sql"),
    "utf8",
  );
  assert.ok(replayMigration.includes(replayDdl));
  await sql
    .raw("SET app.database_plane='studio';\n" + replayMigration)
    .execute(studio);
  pass("Studio forward migration installs the canonical approval schema");
  for (const user of users)
    await sql`INSERT INTO master.principal(id,tenant_id,subject,can_replay) VALUES(${user.id}::uuid,${user.tenant}::uuid,${user.id},${user.name !== "unprivileged"})`.execute(
      studio,
    );
  for (const plane of ["neon", "mesh"])
    await sql
      .raw(
        "CREATE TABLE plane_sentinel(value text); INSERT INTO plane_sentinel VALUES('unchanged');",
      )
      .execute(dbs[plane]);
  const audit = {
    async record(event, tx) {
      if (tx)
        await sql`INSERT INTO public.replay_audit(tenant_id,event_code,actor_id,entity_id,metadata) VALUES(${event.tenantId}::uuid,${event.eventCode},${event.actor.principalId}::uuid,${event.entityId}::uuid,${JSON.stringify(event.metadata)}::jsonb)`.execute(
          tx,
        );
      return {
        ...event,
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        severity: "info",
      };
    },
  };
  const verifier = createKeycloakAuthAdapter({
    defaultRealm: { issuerUrl: issuer, audience: "athyper-api" },
  });
  const iam = createIamService({
    tokenVerifier: verifier,
    audit,
    config: createIamConfig({
      environment: "production",
      defaultRealmKey: tag,
    }),
    async resolveIdentityContext(input) {
      const p = (
        await sql`SELECT * FROM master.principal WHERE subject=${input.subject} AND status='active'`.execute(
          studio,
        )
      ).rows[0];
      if (
        !p ||
        (input.requestedTenantId && p.tenant_id !== input.requestedTenantId)
      )
        return undefined;
      const allowed = p.can_replay
        ? [
            "studio.iam.application_projection.replay",
            "studio.iam.application_projection.read",
          ]
        : [];
      return {
        tenantId: p.tenant_id,
        principalId: p.id,
        authEpoch: p.auth_epoch,
        permissions: {
          planeKey: "studio",
          tenantId: p.tenant_id,
          principalId: p.id,
          principalFingerprint: p.id,
          profileHash: "live",
          schemaHash: "live",
          resolvedAt: Date.now(),
          allowed,
          denied: [],
          planLocked: [],
          planeExcluded: [],
          entries: [],
          authorizationScopes: [],
          requirements: allowed.map((permissionCode) => ({
            permissionCode,
            entitled: true,
            requiresMfa: true,
            requiresSod: true,
            riskTier: "high",
          })),
          evidence: allowed.map((permissionCode) => ({
            permissionCode,
            effect: "allow",
            proof: "role",
            scopeKind: "tenant",
            scopeTargetId: p.tenant_id,
            targetId: p.tenant_id,
            propagationMode: "exact",
          })),
        },
      };
    },
  });
  const repository = new KyselyIdentityReplayApprovalRepository(
    (work) =>
      studio.transaction().execute(async (tx) => {
        const context = getRequestContext();
        await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
        return work(tx);
      }),
    audit,
  );
  const service = new IdentityReplayApprovalService(
    repository,
    createIdentityReplayAuthorizer(),
    true,
  );
  const app = createHttpApplication({
    configure(app) {
      registerIdentityReplayRoutes(
        app,
        createIamAuthenticationMiddleware(iam),
        service,
      );
    },
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/iam`;
  async function call(path, body, who = "maker", headers = {}) {
    const response = await fetch(`${base}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${who === "baseline" ? baselineToken : tokens[who]}`,
        "x-plane": "studio",
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function fixture() {
    const projectionId = randomUUID(),
      attemptId = randomUUID();
    await sql`INSERT INTO trustiam.identity_projection(id,authority_tenant_id,source_plane,source_tenant_id,person_id,organization_id,relationship_kind,source_ref,realm_key,normalized_identifier,display_name,desired_version,desired_hash,desired_status,desired_applications,reconciliation_status,last_error_code,created_by) VALUES(${projectionId}::uuid,${tenant}::uuid,'neon',${tenant}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,'external_worker',${"worker_engagement:" + projectionId},${tag},${projectionId + "@example.test"},'Replay fixture',1,${"a".repeat(64)},'active','[{}]'::jsonb,'failed','TEST_DEAD_LETTER',${users[0].id}::uuid)`.execute(
      studio,
    );
    await sql`INSERT INTO trustiam.identity_saga_attempt(id,authority_tenant_id,identity_projection_id,desired_version,desired_hash,attempt_no,worker_id,claim_token_hash,fencing_token,status,failure_class,error_code,lease_expires_at,terminal_at,created_at,created_by) VALUES(${attemptId}::uuid,${tenant}::uuid,${projectionId}::uuid,1,${"a".repeat(64)},1,'live-test',${"b".repeat(64)},1,'dead_letter','permanent','TEST_DEAD_LETTER',clock_timestamp()+interval '1 minute',clock_timestamp(),statement_timestamp(),${users[0].id}::uuid)`.execute(
      studio,
    );
    return { projectionId, attemptId };
  }
  async function requested(f = undefined) {
    f ??= await fixture();
    const result = await call(
      `identity-saga-attempts/${f.attemptId}/replay-approvals`,
      { reason: "Investigated failure", ttlSeconds: 60 },
    );
    assert.equal(result.status, 201, JSON.stringify(result));
    return { ...f, approvalId: result.body.id };
  }
  const approve = (f) =>
    call(
      `identity-replay-approvals/${f.approvalId}/approve`,
      { reason: "Independent review complete" },
      "checker",
    );
  const replay = (f, who = "maker") =>
    call(
      `identity-saga-attempts/${f.attemptId}/replay`,
      { approvalId: f.approvalId },
      who,
    );
  const state = async (f) =>
    (
      await sql`SELECT a.status,s.replay_requested_at FROM trustiam.identity_replay_approval a JOIN trustiam.identity_saga_attempt s ON s.id=a.attempt_id WHERE a.id=${f.approvalId}::uuid`.execute(
        studio,
      )
    ).rows[0];
  const unicodeFixture = await fixture();
  const unicodeReason = "😀".repeat(1000);
  const unicodeApproval = await call(
    `identity-saga-attempts/${unicodeFixture.attemptId}/replay-approvals`,
    { reason: unicodeReason },
  );
  assert.equal(unicodeApproval.status, 201);
  assert.equal(unicodeApproval.body.reason, unicodeReason);
  for (const decision of ["approve", "revoke"]) {
    assert.equal(
      (
        await call(
          `identity-replay-approvals/${unicodeApproval.body.id}/${decision}`,
          { reason: unicodeReason },
          "checker",
        )
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await call(
        `identity-saga-attempts/${unicodeFixture.attemptId}/replay-approvals`,
        { reason: "invalid\0reason" },
      )
    ).status,
    400,
  );
  const unicodeRead = await call(
    `identity-replay-approvals/${unicodeApproval.body.id}`,
  );
  assert.equal(unicodeRead.status, 200);
  assert.equal(unicodeRead.body.status, "revoked");
  assert.equal(
    (
      await call(
        `identity-replay-approvals/${unicodeApproval.body.id}`,
        undefined,
        "outsider",
      )
    ).status,
    404,
  );
  pass(
    "all approval routes preserve Unicode reasons, reject NUL, and isolate tenant reads",
  );
  const expiryStart = Date.now();
  const expiresApproved = await requested(),
    expiresPending = await requested();
  assert.equal((await approve(expiresApproved)).status, 200);
  const f = await requested();
  assert.equal(
    (
      await call(`identity-replay-approvals/${f.approvalId}/approve`, {
        reason: "Self approval",
      })
    ).status,
    403,
  );
  assert.equal((await state(f)).status, "pending");
  pass("self-approval rejected without mutation");
  assert.equal(
    (
      await call(
        `identity-replay-approvals/${f.approvalId}/approve`,
        { reason: "Wrong tenant" },
        "outsider",
      )
    ).status,
    404,
  );
  pass("cross-tenant approval rejected");
  assert.equal(
    (
      await call(
        `identity-replay-approvals/${f.approvalId}/approve`,
        { reason: "Missing MFA" },
        "baseline",
      )
    ).status,
    403,
  );
  pass("baseline Keycloak token cannot approve");
  assert.equal(
    (
      await call(
        `identity-replay-approvals/${f.approvalId}/approve`,
        { reason: "No permission" },
        "unprivileged",
      )
    ).status,
    403,
  );
  pass("missing permission rejected");
  assert.equal((await replay(f)).status, 409);
  pass("unapproved replay rejected");
  assert.equal((await approve(f)).status, 200);
  assert.equal((await replay(f, "checker")).status, 409);
  pass("only the original requester can consume approval");
  const race = await Promise.all([replay(f), replay(f)]);
  assert.deepEqual(race.map((x) => x.status).sort(), [202, 409]);
  assert.equal((await state(f)).status, "consumed");
  assert.equal(
    Number(
      (
        await sql`SELECT count(*) n FROM public.replay_audit WHERE entity_id=${f.approvalId}::uuid AND event_code='iam.identity_replay.consumed'`.execute(
          studio,
        )
      ).rows[0].n,
    ),
    1,
  );
  pass("concurrent approved replay succeeds exactly once with one audit event");
  const makerTx = (work) =>
    studio.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${users[0].id},true)`.execute(
        tx,
      );
      await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
      return work(tx);
    });
  const unreviewed = await requested();
  await assert.rejects(
    () =>
      makerTx((tx) =>
        sql`UPDATE trustiam.identity_saga_attempt SET replay_requested_at=clock_timestamp(),replay_requested_by=${users[0].id}::uuid,replay_approved_by=${users[1].id}::uuid,updated_by=${users[0].id}::uuid WHERE id=${unreviewed.attemptId}::uuid`.execute(
          tx,
        ),
      ),
    /durable replay approval required/,
  );
  assert.equal((await state(unreviewed)).replay_requested_at, null);
  pass("database guard rejects forged direct replay updates");
  const abandoned = await requested();
  await approve(abandoned);
  await assert.rejects(
    () =>
      makerTx((tx) =>
        sql`UPDATE trustiam.identity_replay_approval SET status='consumed',consumed_at=clock_timestamp() WHERE id=${abandoned.approvalId}::uuid`.execute(
          tx,
        ),
      ),
    /atomic replay/,
  );
  assert.equal((await state(abandoned)).status, "approved");
  pass("database rejects non-atomic approval consumption");
  const workerRepository = new KyselyIdentitySagaRepository((work) =>
    studio.transaction().execute(work),
  );
  const claimed = await workerRepository.claim({
    workerId: "live-replay",
    claimTokenHash: "d".repeat(64),
    claimedAt: new Date().toISOString(),
    leaseExpiresAt: new Date(Date.now() + 120000).toISOString(),
  });
  assert.equal(claimed.identityId, f.projectionId);
  assert.equal(
    (
      await sql`SELECT manual_replay_of FROM trustiam.identity_saga_attempt WHERE id=${claimed.attemptId}::uuid`.execute(
        studio,
      )
    ).rows[0].manual_replay_of,
    f.attemptId,
  );
  const provider = new KeycloakIdentityProviderAdapter({
    baseUrl: `http://127.0.0.1:${kcPort}`,
    adminRealm: tag,
    clientId: "replay-admin",
    credentialReference: "isolated-test-only",
    secrets: {
      resolve: async () => ({
        bytes: Buffer.from(adminSecret),
        version: "test",
      }),
    },
  });
  const provision = {
    realmKey: tag,
    identifier: claimed.identifier,
    displayName: claimed.displayName,
    invite: false,
    idempotencyKey: providerKey(claimed, "identity"),
  };
  assert.equal(
    await workerRepository.claim({
      workerId: "duplicate-replay",
      claimTokenHash: "e".repeat(64),
      claimedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 120000).toISOString(),
    }),
    undefined,
  );
  const created = await provider.inviteOrCreate(provision);
  assert.ok(created.providerSubject);
  assert.deepEqual(await provider.inviteOrCreate(provision), created);
  pass(
    "worker claims the approved attempt and real Keycloak provisioning is idempotent",
  );
  const revokeRace = await requested();
  await approve(revokeRace);
  const contested = await Promise.all([
    replay(revokeRace),
    call(
      `identity-replay-approvals/${revokeRace.approvalId}/revoke`,
      { reason: "Concurrent withdrawal" },
      "checker",
    ),
  ]);
  const finalRace = await state(revokeRace);
  if (finalRace.status === "consumed")
    assert.deepEqual(
      contested.map((x) => x.status),
      [202, 409],
    );
  else {
    assert.deepEqual(
      contested.map((x) => x.status),
      [409, 200],
    );
    assert.equal(finalRace.replay_requested_at, null);
  }
  pass("concurrent revoke and consume produce one consistent outcome");
  const revoked = await requested();
  await approve(revoked);
  assert.equal(
    (
      await call(
        `identity-replay-approvals/${revoked.approvalId}/revoke`,
        { reason: "Evidence withdrawn" },
        "checker",
      )
    ).status,
    200,
  );
  assert.equal((await replay(revoked)).status, 409);
  assert.equal((await state(revoked)).replay_requested_at, null);
  pass("revoked approval cannot replay");
  const changed = await requested();
  await approve(changed);
  await sql`UPDATE trustiam.identity_projection SET desired_version=2,desired_hash=${"c".repeat(64)} WHERE id=${changed.projectionId}::uuid`.execute(
    studio,
  );
  assert.equal((await replay(changed)).status, 409);
  assert.equal((await state(changed)).status, "approved");
  pass("changed desired state rejects approval without consumption");
  const wrong = await requested();
  await approve(wrong);
  assert.equal(
    (await replay({ ...wrong, attemptId: unreviewed.attemptId })).status,
    409,
  );
  pass("approval is bound to the exact attempt");
  const rollback = await requested();
  await approve(rollback);
  await sql
    .raw(
      "CREATE FUNCTION public.fail_replay_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_code='iam.identity_replay.consumed' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END$$; CREATE TRIGGER fail_replay_audit BEFORE INSERT ON public.replay_audit FOR EACH ROW EXECUTE FUNCTION public.fail_replay_audit();",
    )
    .execute(studio);
  assert.equal((await replay(rollback)).status, 500);
  assert.deepEqual(await state(rollback), {
    status: "approved",
    replay_requested_at: null,
  });
  await sql
    .raw("DROP TRIGGER fail_replay_audit ON public.replay_audit")
    .execute(studio);
  assert.equal((await replay(rollback)).status, 202);
  pass("audit failure rolls back approval and replay; retry succeeds");
  // Force expiry after the UPDATE predicate succeeds but before the production
  // approval guard runs. The trigger exists only in this disposable database.
  const boundary = await requested();
  const boundaryRead = await call(
    `identity-replay-approvals/${boundary.approvalId}`,
  );
  // Wait outside the transaction so the deliberate trigger delay stays below
  // the test pool's query timeout.
  await pause(
    Math.max(0, Date.parse(boundaryRead.body.expiresAt) - Date.now() - 3000),
  );
  await sql
    .raw(
      `CREATE FUNCTION public.delay_replay_approval() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id='${boundary.approvalId}'::uuid AND NEW.status='approved' THEN
        PERFORM pg_sleep(greatest(0,extract(epoch FROM OLD.expires_at-clock_timestamp()))::double precision+0.05);
      END IF;
      RETURN NEW;
    END$$;
    CREATE TRIGGER aa_delay_replay_approval BEFORE UPDATE ON trustiam.identity_replay_approval
      FOR EACH ROW EXECUTE FUNCTION public.delay_replay_approval();`,
    )
    .execute(studio);
  try {
    assert.equal((await approve(boundary)).status, 409);
    assert.equal((await state(boundary)).status, "pending");
    assert.equal(
      Number(
        (
          await sql`SELECT count(*) n FROM public.replay_audit WHERE entity_id=${boundary.approvalId}::uuid AND event_code='iam.identity_replay.approved'`.execute(
            studio,
          )
        ).rows[0].n,
      ),
      0,
    );
    pass(
      "expiry between UPDATE predicate and database guard returns 409 without mutation or audit",
    );
  } finally {
    await sql
      .raw(
        "DROP TRIGGER aa_delay_replay_approval ON trustiam.identity_replay_approval; DROP FUNCTION public.delay_replay_approval()",
      )
      .execute(studio);
  }
  await pause(Math.max(0, expiryStart + 62000 - Date.now()));
  assert.equal((await replay(expiresApproved)).status, 409);
  assert.equal((await approve(expiresPending)).status, 409);
  assert.equal((await state(expiresApproved)).status, "approved");
  pass("real database-clock expiry rejects approval and replay");
  for (const plane of ["neon", "mesh"]) {
    assert.deepEqual(
      (await sql`SELECT value FROM plane_sentinel`.execute(dbs[plane])).rows,
      [{ value: "unchanged" }],
    );
    assert.equal(
      (
        await sql`SELECT to_regclass('trustiam.identity_replay_approval') relation`.execute(
          dbs[plane],
        )
      ).rows[0].relation,
      null,
    );
  }
  pass("approval authority remains Studio-only; Neon/Mesh unchanged");
  evidence.postgres = (
    await admin.query("SHOW server_version")
  ).rows[0].server_version;
  evidence.keycloak = docker(
    "exec",
    containers.at(-1),
    "/opt/keycloak/bin/kc.sh",
    "--version",
  ).split("\n")[0];
  evidence.images = containers.map((name) => ({
    component: name.endsWith("-pg") ? "postgres" : "keycloak",
    id: docker("inspect", name, "--format", "{{.Image}}"),
  }));
  evidence.sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        "db/ddl/planes/studio/trustiam/12_identity_replay_approval.sql",
        "packages/platform/iam/src/identity-replay-approval.ts",
        "packages/platform/iam/src/kysely-identity-replay-approval.ts",
        "packages/platform/iam/src/identity-replay-routes.ts",
        "packages/platform/iam/src/kysely-identity-saga.ts",
        "db/scripts/tests/integration/identity-replay-live.mjs",
      ].map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(resolve(root, path)))
          .digest("hex"),
      ]),
    ),
  );
  evidence.status = "passed";
  evidence.finishedAt = new Date().toISOString();
  const out =
    process.env.IAM_REPLAY_EVIDENCE_PATH ??
    resolve(root, "../docs/runbooks/identity-replay-live-evidence.json");
  await writeFile(out, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(`Evidence: ${out}\n`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const pool of pools) await pool.end().catch(() => {});
  for (const name of containers.reverse()) {
    try {
      docker("rm", "-f", name);
    } catch {}
  }
  await rm(temp, { recursive: true, force: true });
}
