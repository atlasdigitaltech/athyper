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
  assert.deepEqual(platform.services["platform-outage"].ports ?? [], []);
  assert.equal(platform.services["platform-outage"].read_only, true);
  assert.ok(platform.services["platform-outage"].security_opt.includes("no-new-privileges:true"));
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
    assert.equal(dynamic.http.routers[id].service, `gateway-${id}-failover`);
    assert.deepEqual(dynamic.http.services[`gateway-${id}-failover`].failover, {
      healthCheck: {}, service: `gateway-${id}`, fallback: "platform-outage",
    });
    assert.equal(
      dynamic.http.services[`gateway-${id}`].loadBalancer.servers[0].url,
      `http://gateway-${id}:8080`,
    );
    assert.deepEqual(dynamic.http.services[`gateway-${id}`].loadBalancer.healthCheck, {
      path: "/ping", port: 8082, interval: "10s", timeout: "3s",
    });
  }
  assert.equal(dynamic.http.services["platform-outage"].loadBalancer.servers[0].url, "http://platform-outage:8080");
});

test("unhealthy browser planes fail over to branded HTML while APIs retain problem JSON", () => {
  for (const environment of ["dev", "qa", "stg"]) {
    const dynamic = read(`deploy/compose/instance/config/traefik/${environment}.yaml`);
    for (const plane of ["neon", "mesh", "studio"]) {
      assert.equal(dynamic.http.routers[plane].service, `${plane}-failover`);
      assert.deepEqual(dynamic.http.services[`${plane}-failover`].failover, {
        healthCheck: {}, service: plane, fallback: "outage",
      });
      assert.equal(dynamic.http.services[plane].loadBalancer.healthCheck.path, "/");
    }
    assert.equal(dynamic.http.routers.api.service, "api-failover");
    assert.equal(dynamic.http.services["api-failover"].failover.fallback, "problem");
    assert.equal(dynamic.http.services.api.loadBalancer.healthCheck.path, "/livez");
    assert.equal(dynamic.http.services.outage.loadBalancer.servers[0].url, "http://gateway-outage:8080");
    assert.equal(dynamic.http.services.maintenance.loadBalancer.servers[0].url, "http://gateway-outage:8081");
    assert.equal(dynamic.http.services.problem.loadBalancer.servers[0].url, "http://gateway-outage:8082");
    assert.ok(!Object.values(dynamic.http.routers).some(({ service }) => service === "maintenance"));
  }

  const nginx = readFileSync(join(repoRoot, "deploy/compose/instance/config/nginx/outage.conf"), "utf8");
  const page = readFileSync(join(repoRoot, "deploy/compose/instance/config/nginx/status.html"), "utf8");
  assert.match(nginx, /listen 8080;[\s\S]*sub_filter '__STATUS_MODE__' 'outage'/u);
  assert.match(nginx, /listen 8081;[\s\S]*sub_filter '__STATUS_MODE__' 'maintenance'/u);
  assert.match(nginx, /listen 8082;[\s\S]*default_type application\/problem\+json/u);
  assert.match(nginx, /Cache-Control "no-store" always/u);
  assert.match(nginx, /Retry-After "60" always/u);
  assert.match(page, /studio:"Studio"/u);
  assert.doesNotMatch(page, /admin:"Studio"/u);
  assert.match(page, /data-plane-brand="neon"/u);
  assert.match(page, /data-plane-brand="mesh"/u);
  assert.match(page, /data-plane-brand="studio"/u);
  assert.match(page, /--contrast: #151515/u);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(page, /@keyframes blocked-travel/u);
  assert.match(page, /const retrySeconds = 15/u);
});

test("platform outage page uses the same self-contained monochrome recovery design", () => {
  const page = readFileSync(join(repoRoot, "deploy/compose/platform/outage/status.html"), "utf8");
  assert.match(page, /aria-label="Athyper"/u);
  assert.match(page, /--contrast:#151515/u);
  assert.match(page, /Platform gateway online/u);
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)/u);
  assert.doesNotMatch(page, /https?:\/\//u);
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
  assert.match(foundation, /runtime-worker-grants-v1\.sql/u);
  const workerGrants = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/runtime-worker-grants-v1.sql"), "utf8");
  assert.match(workerGrants, /GRANT USAGE ON SCHEMA shared, event TO athyper_jobs_service/u);
  assert.match(workerGrants, /authorization_invalidation_jobs_service_access/u);
  assert.match(workerGrants, /descriptor_invalidation_jobs_service_access/u);
  assert.doesNotMatch(workerGrants, /GRANT athyperapp TO athyper_worker/u);
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
  const alloy = readFileSync(join(repoRoot, "deploy/compose/operations/config/alloy.alloy"), "utf8");
  for (const label of ["instance", "environment", "service", "container", "stream", "source_revision"]) {
    assert.match(alloy, new RegExp(`values = \\[.*\"${label}\"`));
  }
});

test("Grafana reads the owner-only secret only during privilege-dropping bootstrap", () => {
  const operations = read("deploy/compose/operations/compose.yaml");
  const grafana = operations.services.telemetry;
  const bootstrap = readFileSync(join(repoRoot, "deploy/compose/operations/scripts/start-grafana.sh"), "utf8");
  assert.equal(grafana.user, "0:0");
  assert.deepEqual(grafana.entrypoint, ["/bin/bash", "/athyper/bin/start-grafana.sh"]);
  assert.ok(grafana.volumes.includes("./scripts/start-grafana.sh:/athyper/bin/start-grafana.sh:ro"));
  assert.match(bootstrap, /GF_SECURITY_ADMIN_PASSWORD="\$\(<"\$\{secret_file\}"\)"/u);
  assert.match(bootstrap, /unset GF_SECURITY_ADMIN_PASSWORD__FILE/u);
  assert.match(bootstrap, /exec su -p -s \/bin\/bash grafana -c "exec \/run\.sh"/u);
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
