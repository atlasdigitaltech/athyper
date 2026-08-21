import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(repoRoot, "deploy/stackctl/package.json"));
const YAML = require("yaml");
const read = (relative) => YAML.parse(readFileSync(join(repoRoot, relative), "utf8"));

test("shared platform ingress exclusively owns workstation HTTP ports", () => {
  const platform = read("deploy/compose/platform/compose.yaml");
  const instance = read("deploy/compose/instance/compose.yaml");
  assert.deepEqual(platform.services.ingress.ports.sort(), ["127.0.0.1:443:8443", "127.0.0.1:80:8080"]);
  assert.equal(platform.services.ingress.user, "${ATHYPER_RUNTIME_UID:-1000}:${ATHYPER_RUNTIME_GID:-1000}");
  assert.deepEqual(platform.services.ingress.healthcheck.test, [
    "CMD", "traefik", "healthcheck", "--ping", "--ping.entrypoint=health", "--entrypoints.health.address=:8082",
  ]);
  assert.deepEqual(instance.services.gateway.ports ?? [], []);
  assert.equal(platform.networks["platform-ingress"].name, "athyper-platform-ingress");
  assert.equal(instance.networks["platform-ingress"].external, true);
  assert.equal(instance.networks["platform-ingress"].name, "athyper-platform-ingress");
});

test("instance gateway has a unique shared-network alias and no Docker socket", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const gateway = instance.services.gateway;
  assert.deepEqual(gateway.networks["platform-ingress"].aliases, ["gateway-${ATHYPER_INSTANCE:-dev}"]);
  assert.ok(!(gateway.volumes ?? []).some((volume) => String(volume).includes("docker.sock")));
  assert.equal(instance.networks.data.internal, true);
  assert.equal(instance.networks.ops.internal, true);
});

test("platform ingress routes each instance suffix to its isolated gateway", () => {
  const dynamic = read("deploy/compose/platform/ingress/dynamic.yaml");
  for (const id of ["dev", "qa", "stg"]) {
    assert.equal(dynamic.http.routers[id].service, `gateway-${id}`);
    assert.equal(
      dynamic.http.services[`gateway-${id}`].loadBalancer.servers[0].url,
      `http://gateway-${id}:8080`,
    );
  }
});

test("database role membership is granted only after foundation roles exist", () => {
  const init = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/init-postgres.sh"), "utf8");
  const foundation = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/run-foundation.sh"), "utf8");
  assert.doesNotMatch(init, /GRANT athyperapp TO athyper_runtime/u);
  assert.doesNotMatch(init, /GRANT athyper_trustiam_service TO athyper_runtime/u);
  assert.doesNotMatch(init, /GRANT athyper_jobs_service TO athyper_worker/u);
  assert.match(foundation, /apply_plane mesh[\s\S]*GRANT athyperapp TO athyper_runtime/u);
  assert.match(foundation, /apply_plane mesh[\s\S]*GRANT athyper_trustiam_service TO athyper_runtime/u);
  assert.match(foundation, /apply_plane mesh[\s\S]*GRANT athyper_jobs_service TO athyper_worker/u);
});

test("MinIO bootstrap has enough memory for concurrent full-stack startup", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const catalog = read("deploy/catalog/capabilities.yaml");
  const service = catalog.services.find(({ id }) => id === "objectstorage-init");
  assert.equal(instance.services["objectstorage-init"].mem_limit, "128m");
  assert.equal(service.resources.memoryMiB, 128);
});

test("DEV exposes only the MinIO console through the TLS gateway", () => {
  const dynamic = read("deploy/compose/instance/config/traefik/dev.yaml");
  assert.equal(dynamic.http.routers.minio.rule, "Host(`minio.dev.athyper.test`)");
  assert.equal(dynamic.http.services.minio.loadBalancer.servers[0].url, "http://objectstorage:9001");
  assert.equal(JSON.stringify(dynamic).includes("http://objectstorage:9000"), false);
  for (const environment of ["qa", "stg"]) {
    const routes = read(`deploy/compose/instance/config/traefik/${environment}.yaml`);
    assert.equal(routes.http.routers.minio, undefined);
    assert.equal(routes.http.services.minio, undefined);
  }
});

test("read-only Alloy stores runtime state only in tmpfs", () => {
  const operations = read("deploy/compose/operations/compose.yaml");
  const alloy = operations.services.logshipper;
  assert.equal(alloy.read_only, true);
  assert.ok(alloy.tmpfs.includes("/tmp"));
  assert.ok(alloy.command.includes("--storage.path=/tmp/data-alloy"));
  assert.deepEqual(alloy.volumes, ["./config/alloy.alloy:/etc/alloy/config.alloy:ro"]);
});

test("operations UIs and receiver use loopback ports through a non-internal network", () => {
  const operations = read("deploy/compose/operations/compose.yaml");
  assert.equal(operations.networks.operations.internal, true);
  assert.deepEqual(operations.networks["host-access"], {});
  for (const service of ["metrics", "logshipper", "telemetry"]) {
    assert.ok(operations.services[service].networks.includes("operations"));
    assert.ok(operations.services[service].networks.includes("host-access"));
    assert.ok(operations.services[service].ports.every((port) => port.startsWith("127.0.0.1:")));
  }
  assert.deepEqual(operations.services.logging.networks, ["operations"]);
});

test("web session storage reaches Redis without joining the data network", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const parity = read("deploy/compose/instance/compose.parity.yaml");
  assert.deepEqual(instance.services.memorycache.networks.sort(), ["app", "data"]);
  assert.deepEqual(parity["x-web-common"].networks.sort(), ["app", "edge"]);
  for (const service of ["studio-web", "neon-web", "mesh-web"]) {
    assert.ok(parity.services[service].secrets.includes("redis-password"));
  }
});

test("OIDC uses public HTTPS issuers with private backchannel endpoints", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const web = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/start-web.sh"), "utf8");
  const runtime = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/start-runtime.sh"), "utf8");
  assert.equal(instance.services.iam.environment.KC_HOSTNAME, "https://iam.${ATHYPER_DOMAIN_SUFFIX:-dev.athyper.test}");
  assert.match(web, /KEYCLOAK_BASE_URL="https:\/\/iam\.\$\{ATHYPER_DOMAIN_SUFFIX:-dev\.athyper\.test\}"/u);
  assert.match(web, /KEYCLOAK_INTERNAL_BASE_URL=http:\/\/iam:8080/u);
  assert.match(web, /PUBLIC_BASE_URL="https:\/\/\$\{ATHYPER_APP_DOMAIN\}"/u);
  assert.match(runtime, /IAM_ISSUER_URL="https:\/\/iam\.\$\{ATHYPER_DOMAIN_SUFFIX:-dev\.athyper\.test\}\/realms\/athyper"/u);
  assert.match(runtime, /export KEYCLOAK_REALM=athyper/u);
  assert.match(runtime, /KEYCLOAK_JWKS_URL=http:\/\/iam:8080\/realms\/athyper\/protocol\/openid-connect\/certs/u);
  const realm = read("stack/config/iam/realm-athyper-clean-slate.json");
  for (const plane of ["studio", "neon", "mesh"]) {
    const client = realm.clients.find(({ clientId }) => clientId === `${plane}-web`);
    const origin = `https://${plane}.dev.athyper.test`;
    assert.ok(client.redirectUris.includes(`${origin}/api/auth/callback`));
    assert.ok(client.webOrigins.includes(origin));
    assert.ok(client.attributes["post.logout.redirect.uris"].split("##").includes(`${origin}/api/auth/logout/callback`));
  }
});
