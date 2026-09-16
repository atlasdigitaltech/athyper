import {
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { inventory, command, writeJson, composeArgs } from "./runtime.mjs";
import { treeHash } from "./model.mjs";

export async function foundation(plan) {
  const resources = await inventory(plan);
  const db = resources.container.find(
    (item) => item.Config.Labels["com.docker.compose.service"] === "db",
  );
  if (!db?.State.Running)
    throw new Error("Owned local database must be running");
  const ddl = join(plan.checkout, "server/db/ddl");
  const scripts = join(plan.checkout, "deploy/compose/instance/scripts");
  const checksum = treeHash(ddl);
  await command("docker", [
    "exec",
    db.Id,
    "mkdir",
    "-p",
    "/athyper/reconciliation",
  ]);
  await command("docker", ["cp", ddl, `${db.Id}:/athyper/`]);
  for (const file of ["run-foundation.sh", "runtime-worker-grants-v1.sql"])
    await command("docker", [
      "cp",
      join(scripts, file),
      `${db.Id}:/athyper/reconciliation/${file}`,
    ]);
  await command("docker", [
    "exec",
    "-e",
    "PGUSER=postgres",
    "-e",
    `ATHYPER_DDL_SHA256=${checksum}`,
    db.Id,
    "sh",
    "/athyper/reconciliation/run-foundation.sh",
  ]);
  await command(
    join(plan.checkout, "node_modules/.bin/tsx"),
    [
      join(plan.checkout, "tooling/scripts/local-dev/catalog.mts"),
      join(plan.root, "manifest.json"),
    ],
    { cwd: plan.root },
  );
  const receipt = {
    schemaVersion: 1,
    evidenceType: "development-foundation",
    environment: plan.id,
    ddlSha256: checksum,
    at: new Date().toISOString(),
    planes: ["studio", "neon", "mesh"],
    productFixturesReady: false,
  };
  writeJson(join(plan.root, "foundation.json"), receipt);
  return receipt;
}

// Copy only the scoped credential from the owned initializer volume to the private
// checkout directory. Source processes use this file, never the master secret.
export async function provisionLocalSearchKey(plan) {
  await command("docker", [
    ...composeArgs(plan),
    "run",
    "--rm",
    "--no-deps",
    "searchcore-key-init",
  ]);
  const key = await command("docker", [
    ...composeArgs(plan),
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "cat",
    "searchcore-key-init",
    "/run/searchcore/search-api-key",
  ]);
  if (!key) throw new Error("Provisioned search API key is empty");
  const destination = join(plan.root, "secrets", "search-api-key");
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, key, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
}

export function applicationEnvironment(plan, mode) {
  // Do not inherit shared DEV endpoints, tokens, feature overrides or NODE_OPTIONS.
  const env = Object.fromEntries(
    ["PATH", "HOME", "USER", "LANG", "TMPDIR", "SystemRoot"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  const secret = (name) =>
    readFileSync(join(plan.root, "secrets", name), "utf8").trim();
  const database = (plane, worker = false) =>
    `postgresql://athyper_${worker ? "worker" : "runtime"}:${encodeURIComponent(secret(`${worker ? "worker" : "runtime"}-db-password`))}@127.0.0.1:${worker ? plan.ports.sessionPool : plan.ports.pool}/athyper_${plane}`;
  Object.assign(env, {
    LOCAL_DEVELOPMENT_MANAGED: "1",
    ...(plan.id === "dev" && ["studio", "neon"].includes(mode) ? { AUTH_SESSION_IDLE_TTL_SECONDS: "7200", AUTH_SESSION_ABSOLUTE_TTL_SECONDS: "43200" } : {}),
    NODE_ENV: "development",
    ATHYPER_ENV: "local",
    ENVIRONMENT: "local",
    PROCESS_METRICS_HOST: "127.0.0.1",
    PROCESS_METRICS_PORT: String(
      mode === "scheduler"
        ? (plan.ports.schedulerMetrics ?? plan.ports.gateway + 15)
        : (plan.ports.workerMetrics ?? plan.ports.gateway + 14),
    ),
    MODE: mode,
    PORT: String(plan.ports.api),
    HOST: "127.0.0.1",
    DATABASE_URL: database("neon"),
    STUDIO_DATABASE_URL: database("studio"),
    MESH_DATABASE_URL: database("mesh"),
    NEON_WORKER_DATABASE_URL: database("neon", true),
    STUDIO_WORKER_DATABASE_URL: database("studio", true),
    MESH_WORKER_DATABASE_URL: database("mesh", true),
    REDIS_URL: `redis://:${encodeURIComponent(secret("redis-password"))}@127.0.0.1:${plan.ports.redis}`,
    ALLOW_SHARED_BULLMQ_REDIS: "false",
    JOB_WORKER_CONCURRENCY: String(plan.resources.buildConcurrency),
    IAM_ISSUER_URL: `${plan.origins.iam}/realms/${plan.realm}`,
    IAM_CLIENT_ID: "athyper-api-runtime",
    IAM_CLIENT_SECRET: secret("runtime-iam-client-secret"),
    KEYCLOAK_REALM: plan.realm,
    KEYCLOAK_JWKS_URL: `${plan.origins.iam}/realms/${plan.realm}/protocol/openid-connect/certs`,
    S3_ENDPOINT: `http://127.0.0.1:${plan.ports.objectstorage}`,
    S3_REGION: "us-east-1",
    S3_USE_SSL: "false",
    S3_BUCKET_DOCUMENTS: "athyper-documents",
    S3_BUCKET_ARTIFACTS: "athyper-artifacts",
    S3_BUCKET_TRANSFERS: "athyper-transfers",
    APP_S3_ACCESS_KEY: secret("objectstorage-app-access-key"),
    APP_S3_SECRET_KEY: secret("objectstorage-app-secret-key"),
    ARTIFACTS_WRITER_S3_ACCESS_KEY: secret(
      "objectstorage-artifacts-writer-access-key",
    ),
    ARTIFACTS_WRITER_S3_SECRET_KEY: secret(
      "objectstorage-artifacts-writer-secret-key",
    ),
    NODE_OPTIONS: `--max-old-space-size=${plan.preset === "devsimple" ? 1536 : 3072}`,
  });
  if (plan.capabilities.includes("search"))
    Object.assign(env, {
      SEARCHCORE_URL: `http://127.0.0.1:${plan.ports.search}`,
      SEARCHCORE_API_KEY: secret("search-api-key"),
      SEARCHCORE_DOCUMENT_INDEX: "documents",
    });
  if (plan.capabilities.includes("documents"))
    Object.assign(env, {
      DOCRENDER_BASE_URL: `http://127.0.0.1:${plan.ports.docrender}`,
      DOCPARSER_URL: `http://127.0.0.1:${plan.ports.docparser}`,
      CLAMD_HOST: "127.0.0.1",
      CLAMD_PORT: String(plan.ports.clamd),
      CLAMD_ON_UNAVAILABLE: "fail-closed",
    });
  if (plan.capabilities.includes("mail"))
    Object.assign(env, {
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(plan.ports.smtp),
      SMTP_SECURE: "false",
      SMTP_FROM: "local@athyper.invalid",
    });
  if (plan.capabilities.includes("observability"))
    Object.assign(env, {
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${plan.ports.otlp}`,
      OTEL_SERVICE_NAME: `athyper-local-${mode}`,
    });
  env.REDIS_BULLMQ_URL = `redis://:${encodeURIComponent(secret("redis-password"))}@127.0.0.1:${plan.ports.jobsRedis ?? plan.ports.gateway + 17}`;
  if (plan.apps.includes(mode)) {
    const key = join(plan.root, "secrets/session-token-encryption-key");
    if (!existsSync(key))
      writeFileSync(key, randomBytes(32).toString("base64"), {
        flag: "wx",
        mode: 0o600,
      });
    const existingKey = readFileSync(key, "utf8").trim();
    if (/^[a-f0-9]{64}$/.test(existingKey))
      writeFileSync(key, Buffer.from(existingKey, "hex").toString("base64"), {
        mode: 0o600,
      });
    Object.assign(env, {
      LOCAL_DEV_ALLOWED_ORIGIN: new URL(plan.origins[mode]).hostname,
      PORT: String(plan.ports[mode]),
      KEYCLOAK_BASE_URL: plan.origins.iam,
      KEYCLOAK_INTERNAL_BASE_URL: plan.origins.iam,
      KEYCLOAK_CLIENT_ID: `${mode}-web`,
      KEYCLOAK_CLIENT_SECRET: secret(`${mode}-iam-client-secret`),
      SESSION_TOKEN_ENCRYPTION_KEY: secret("session-token-encryption-key"),
      RUNTIME_API_URL: plan.origins.api,
      PUBLIC_BASE_URL: plan.origins[mode],
      PUBLIC_WEB_URL: plan.origins[mode],
      APP_ORIGIN: plan.origins[mode],
      ALLOWED_HOSTS: new URL(plan.origins[mode]).host,
    });
  }
  return env;
}
