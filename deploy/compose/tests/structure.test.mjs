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

test("web session storage reaches Redis without joining the data network", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const parity = read("deploy/compose/instance/compose.parity.yaml");
  assert.deepEqual(instance.services.memorycache.networks.sort(), ["app", "data"]);
  assert.deepEqual(parity["x-web-common"].networks.sort(), ["app", "edge"]);
  for (const service of ["studio-web", "neon-web", "mesh-web"]) {
    assert.ok(parity.services[service].secrets.includes("redis-password"));
  }
});
