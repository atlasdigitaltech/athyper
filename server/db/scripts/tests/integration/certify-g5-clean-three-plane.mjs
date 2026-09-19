import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
const postgresContainer = "athyper-bs360-g5-combined",
  keycloakContainer = "athyper-g5-combined-keycloak";
const postgresPassword = randomBytes(24).toString("hex"),
  bootstrapUser = "g5admin",
  bootstrapPassword = randomBytes(24).toString("hex");
for (const container of [postgresContainer, keycloakContainer])
  if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
    throw new Error(`refusing to replace existing container ${container}`);

try {
  run("docker", [
    "run",
    "-d",
    "--name",
    postgresContainer,
    "--label",
    "athyper.environment=disposable_local",
    "--label",
    "athyper.purpose=business-partner-360-integration-baseline",
    "-p",
    "127.0.0.1::5432",
    "-e",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "postgres:16.13-bookworm",
  ]);
  run("docker", [
    "run",
    "-d",
    "--name",
    keycloakContainer,
    "--label",
    "athyper.environment=disposable_local",
    "--label",
    "athyper.purpose=governed-lifecycle-g5-combined",
    "-p",
    "127.0.0.1::8080",
    "-e",
    `KC_BOOTSTRAP_ADMIN_USERNAME=${bootstrapUser}`,
    "-e",
    `KC_BOOTSTRAP_ADMIN_PASSWORD=${bootstrapPassword}`,
    "--entrypoint",
    "/opt/keycloak/bin/kc.sh",
    "athyper/keycloak:26.7.2",
    "start-dev",
    "--features=organization",
    "--hostname-strict=false",
  ]);
  const postgresPort = publishedPort(postgresContainer, "5432/tcp"),
    keycloakPort = publishedPort(keycloakContainer, "8080/tcp"),
    keycloakBaseUrl = `http://127.0.0.1:${keycloakPort}`;
  await waitFor(
    () =>
      success("docker", [
        "exec",
        postgresContainer,
        "pg_isready",
        "-U",
        "postgres",
      ]),
    60_000,
    "PostgreSQL",
  );
  await waitFor(
    () =>
      fetch(`${keycloakBaseUrl}/realms/master/.well-known/openid-configuration`)
        .then((response) => response.ok)
        .catch(() => false),
    60_000,
    "Keycloak",
  );
  for (const plane of ["studio", "neon", "mesh"])
    run("docker", [
      "exec",
      postgresContainer,
      "createdb",
      "-U",
      "postgres",
      `athyper_${plane}`,
    ]);
  for (const plane of ["studio", "neon", "mesh"])
    run(
      "pnpm",
      [
        "--dir",
        "server/db",
        "exec",
        "tsx",
        "scripts/provisioning/apply-disposable-ddl-manifest.ts",
        `--plane=${plane}`,
        `--container=${postgresContainer}`,
        "--confirm=APPLY-BS360-DISPOSABLE-BASELINE",
      ],
      {},
      true,
    );

  const databaseUrl = (plane) =>
    `postgresql://postgres:${postgresPassword}@127.0.0.1:${postgresPort}/athyper_${plane}`;
  const databaseEnvironment = {
    ATHYPER_ENV: "local",
    ATHYPER_PLATFORM_DATABASE_ADMIN_URL: databaseUrl("studio"),
    ATHYPER_NEON_DATABASE_ADMIN_URL: databaseUrl("neon"),
    ATHYPER_MESH_DATABASE_ADMIN_URL: databaseUrl("mesh"),
  };
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/provisioning/provision-three-plane.ts",
      "--apply",
      "--skip-foundation",
      "--skip-keycloak",
    ],
    databaseEnvironment,
    true,
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/provisioning/provision-development-business-partner-fixtures.ts",
      "--confirm=LOCAL-NEON-BUSINESS-PARTNER-FIXTURES",
    ],
    databaseEnvironment,
    true,
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/tests/integration/run-sql-file.ts",
      "scripts/tests/integration/governed-entity-case-draft-command.sql",
    ],
    { DATABASE_URL: databaseUrl("neon") },
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/tests/integration/run-sql-file.ts",
      "scripts/tests/integration/governed-entity-case-lifecycle-command.sql",
    ],
    { DATABASE_URL: databaseUrl("neon") },
  );
  run(
    "node",
    [
      "server/db/scripts/tests/integration/governed-entity-case-concurrency.mjs",
    ],
    { DATABASE_URL: databaseUrl("neon"), DATABASE_PLANE: "neon" },
  );
  run(
    "node",
    [
      "--import",
      "tsx",
      "server/apps/platform-host/scripts/db-verification/tests/integration/governed-internal-business-partner-http.mjs",
    ],
    { DATABASE_URL: databaseUrl("neon") },
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/tests/integration/run-sql-file.ts",
      "scripts/tests/integration/governed-business-partner-request-case-backfill.sql",
    ],
    { DATABASE_URL: databaseUrl("neon") },
  );

  const fixture = await createKeycloakFixture(
    keycloakBaseUrl,
    bootstrapUser,
    bootstrapPassword,
  );
  const keycloakEnvironment = {
    ...databaseEnvironment,
    G5_KEYCLOAK_BASE_URL: keycloakBaseUrl,
    G5_KEYCLOAK_REALM: fixture.realm,
    G5_KEYCLOAK_CLIENT_ID: fixture.clientId,
    G5_KEYCLOAK_CLIENT_SECRET: fixture.clientSecret,
    G5_KEYCLOAK_ORGANIZATION_ID: fixture.organizationId,
  };
  run(
    "node",
    [
      "--import",
      "tsx",
      "server/db/scripts/tests/integration/external-worker-iam-cross-plane.mjs",
    ],
    keycloakEnvironment,
  );
  run(
    "node",
    [
      "--import",
      "tsx",
      "server/db/scripts/tests/integration/internal-workforce-iam-cross-plane.mjs",
    ],
    keycloakEnvironment,
  );
  run(
    "node",
    [
      "server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs",
      `--mesh-database-url=${databaseUrl("mesh")}`,
    ],
    keycloakEnvironment,
  );
  run(
    "node",
    [
      "server/db/scripts/tests/integration/certify-g4-data-protection.mjs",
      `--mesh-database-url=${databaseUrl("mesh")}`,
    ],
    keycloakEnvironment,
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "run",
      "test:integration:g5-business-partner-matrix",
    ],
    { ...keycloakEnvironment, DATABASE_URL: databaseUrl("neon") },
  );
  process.stdout.write("G5_COMBINED_CLEAN_KEYCLOAK_THREE_PLANE_OK\n");
} finally {
  for (const container of [keycloakContainer, postgresContainer])
    if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
      run("docker", ["rm", "-f", container], {}, true, false);
}

async function createKeycloakFixture(baseUrl, username, password) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
    fixtureRealm = `g5-${suffix}`,
    clientId = `g5-saga-${suffix}`,
    clientSecret = randomBytes(32).toString("hex");
  const masterToken = await token(baseUrl, "master", {
    grant_type: "password",
    client_id: "admin-cli",
    username,
    password,
  });
  await request(
    `${baseUrl}/admin/realms`,
    {
      method: "POST",
      body: JSON.stringify({
        realm: fixtureRealm,
        enabled: true,
        organizationsEnabled: true,
      }),
    },
    masterToken,
    [201],
  );
  await request(
    `${baseUrl}/admin/realms/${fixtureRealm}/clients`,
    {
      method: "POST",
      body: JSON.stringify({
        clientId,
        enabled: true,
        publicClient: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        secret: clientSecret,
      }),
    },
    masterToken,
    [201],
  );
  const clients = await body(
    await request(
      `${baseUrl}/admin/realms/${fixtureRealm}/clients?clientId=${clientId}`,
      {},
      masterToken,
      [200],
    ),
  );
  assert.equal(clients.length, 1);
  const service = await body(
    await request(
      `${baseUrl}/admin/realms/${fixtureRealm}/clients/${clients[0].id}/service-account-user`,
      {},
      masterToken,
      [200],
    ),
  );
  const management = await body(
    await request(
      `${baseUrl}/admin/realms/${fixtureRealm}/clients?clientId=realm-management`,
      {},
      masterToken,
      [200],
    ),
  );
  assert.equal(management.length, 1);
  const realmAdmin = await body(
    await request(
      `${baseUrl}/admin/realms/${fixtureRealm}/clients/${management[0].id}/roles/realm-admin`,
      {},
      masterToken,
      [200],
    ),
  );
  await request(
    `${baseUrl}/admin/realms/${fixtureRealm}/users/${service.id}/role-mappings/clients/${management[0].id}`,
    { method: "POST", body: JSON.stringify([realmAdmin]) },
    masterToken,
    [204],
  );
  const organization = await request(
    `${baseUrl}/admin/realms/${fixtureRealm}/organizations`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `G5 ${suffix}`,
        alias: `g5-${suffix}`,
        enabled: true,
      }),
    },
    masterToken,
    [201],
  );
  const organizationId = organization.headers
    .get("location")
    ?.split("/")
    .filter(Boolean)
    .at(-1);
  if (!organizationId)
    throw new Error("combined Keycloak organization receipt is missing");
  return { realm: fixtureRealm, clientId, clientSecret, organizationId };
}
async function token(baseUrl, tokenRealm, values) {
  const response = await fetch(
    `${baseUrl}/realms/${tokenRealm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
    },
  );
  if (!response.ok)
    throw new Error(`Keycloak token failed: ${response.status}`);
  return (await response.json()).access_token;
}
async function request(url, init, accessToken, accepted) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!accepted.includes(response.status))
    throw new Error(`Keycloak fixture request failed: ${response.status}`);
  return response;
}
async function body(response) {
  return response.json();
}
function publishedPort(container, port) {
  const value = capture("docker", ["port", container, port])
    .trim()
    .split("\n")[0];
  const found = value?.match(/:(\d+)$/);
  if (!found) throw new Error(`no published ${port} for ${container}`);
  return found[1];
}
function run(command, args, extraEnvironment = {}, quiet = false, fail = true) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 && fail)
    throw new Error(
      `${command} failed (${result.status ?? "unknown"}): ${String(result.stderr ?? "").slice(-4000)}`,
    );
  return result;
}
function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? "unknown"})`);
  return result.stdout;
}
function success(command, args) {
  return (
    spawnSync(command, args, { cwd: repositoryRoot, stdio: "ignore" })
      .status === 0
  );
}
async function waitFor(probe, timeoutMs, name) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`${name} did not become ready`);
}
