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
  assert.equal(platform.networks["platform-observability"].name,"athyper-platform-observability");
  assert.equal(instance.networks["platform-observability"].name,"athyper-platform-observability");
  assert.deepEqual(platform.services["platform-outage"].ports ?? [], []);
  assert.equal(platform.services["platform-outage"].read_only, true);
  assert.ok(platform.services["platform-outage"].security_opt.includes("no-new-privileges:true"));
});

test("worker and scheduler metrics use private cross-project discovery",()=>{
  const parity=read("deploy/compose/instance/compose.parity.yaml"),operations=read("deploy/compose/operations/compose.yaml"),prometheus=readFileSync(join(repoRoot,"deploy/compose/operations/config/prometheus.yaml"),"utf8");
  assert.deepEqual(parity.services.worker.networks["platform-observability"].aliases,["worker-${ATHYPER_INSTANCE:-dev}"]);
  assert.deepEqual(parity.services.scheduler.networks["platform-observability"].aliases,["scheduler-${ATHYPER_INSTANCE:-dev}"]);
  assert.equal(operations.services.metrics.networks.includes("platform-observability"),true);
  assert.match(operations.services.metrics.volumes.join("\n"),/operations\/prometheus-targets/u);
  assert.match(prometheus,/file_sd_configs/u);
});

test("instance gateway has a unique shared-network alias and no Docker socket", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const gateway = instance.services.gateway;
  assert.deepEqual(gateway.networks["platform-ingress"].aliases, ["gateway-${ATHYPER_INSTANCE:-dev}"]);
  assert.ok(!(gateway.volumes ?? []).some((volume) => String(volume).includes("docker.sock")));
  assert.equal(instance.networks.data.internal, true);
  assert.equal(instance.networks.ops.internal, true);
});

test("platform ingress routes DEV, QA, and staging through isolated gateways", () => {
  const dynamic = read("deploy/compose/platform/ingress/dynamic.yaml");
  for (const environment of ["dev", "qa", "stg"]) {
    assert.equal(dynamic.http.routers[environment].service, `gateway-${environment}-failover`);
    assert.deepEqual(dynamic.http.services[`gateway-${environment}-failover`].failover, {
      healthCheck: {}, service: `gateway-${environment}`, fallback: "platform-outage",
    });
    assert.equal(dynamic.http.services[`gateway-${environment}`].loadBalancer.servers[0].url, `http://gateway-${environment}:8080`);
    assert.deepEqual(dynamic.http.services[`gateway-${environment}`].loadBalancer.healthCheck, {
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
    const maintenanceRouters = Object.entries(dynamic.http.routers)
      .filter(([, { service }]) => service === "maintenance")
      .map(([name]) => name);
    assert.deepEqual(maintenanceRouters, environment === "dev" ? ["neon-maintenance-preview"] : []);
  }

  const nginx = readFileSync(join(repoRoot, "deploy/compose/instance/config/nginx/outage.conf"), "utf8");
  const page = readFileSync(join(repoRoot, "deploy/compose/instance/config/nginx/status.html"), "utf8");
  const favicon = readFileSync(join(repoRoot, "packages/platform/foundation/brand/assets/master-marks/athyper-favicon.svg")).toString("base64");
  assert.match(nginx, /listen 8080;[\s\S]*sub_filter '__STATUS_MODE__' 'outage'/u);
  assert.match(nginx, /listen 8081;[\s\S]*sub_filter '__STATUS_MODE__' 'maintenance'/u);
  assert.match(nginx, /listen 8082;[\s\S]*default_type application\/problem\+json/u);
  assert.match(nginx, /Cache-Control "no-store" always/u);
  assert.match(nginx, /Retry-After "60" always/u);
  assert.match(page, /studio: \{ label: "Studio", description: "Business Technology Platform" \}/u);
  assert.match(page, /neon: \{ label: "Neon", description: "Business Operating Platform" \}/u);
  assert.match(page, /mesh: \{ label: "Mesh", description: "Business Collaboration Network" \}/u);
  assert.doesNotMatch(page, /admin: \{ label: "Studio"/u);
  assert.match(page, /data-plane-brand="neon"/u);
  assert.match(page, /data-plane-brand="mesh"/u);
  assert.match(page, /data-plane-brand="studio"/u);
  assert.equal((page.match(/src="data:image\/svg\+xml;base64,/gu) ?? []).length, 3);
  for (const plane of ["neon", "mesh", "studio"]) {
    const lockup = readFileSync(join(repoRoot, `packages/platform/foundation/brand/assets/plane-lockups/${plane}.svg`)).toString("base64");
    assert.ok(page.includes(`data-plane-brand="${plane}" src="data:image/svg+xml;base64,${lockup}"`));
  }
  assert.doesNotMatch(page, /<text[^>]*>\s*(?:NEON|MESH|STUDIO)\s*<\/text>/u);
  assert.match(page, /--contrast: #151515/u);
  assert.match(page, /--brand: #234B84/u);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(page, /@keyframes blocked-travel/u);
  assert.match(page, /const retrySeconds = 15/u);
  assert.match(page, /\.countdown span \{ grid-area: 1\/1;/u);
  assert.match(page, /id="maintenance-plane"/u);
  assert.match(page, /id="maintenance-window"/u);
  assert.match(page, /new URLSearchParams\(location\.search\)/u);
  assert.match(page, /end > start/u);
  assert.match(page, /timeZoneName: "short"/u);
  assert.match(page, /\[hidden\] \{ display: none !important; \}/u);
  assert.ok(page.includes(`href="data:image/svg+xml;base64,${favicon}"`));
  assert.equal((page.match(/data-universal-favicon/gu) ?? []).length, 3);
  assert.match(page, /querySelectorAll\("\[data-universal-favicon\]"\)/u);
  assert.match(page, /`\$\{label\} - Maintenance`/u);
  assert.match(page, /`\$\{label\} - Service unavailable`/u);
});

test("DEV exposes explicit Neon maintenance and outage previews without replacing the live plane", () => {
  const dynamic = read("deploy/compose/instance/config/traefik/dev.yaml");
  assert.equal(dynamic.http.routers.neon.service, "neon-failover");
  assert.equal(dynamic.http.routers["neon-maintenance-preview"].service, "maintenance");
  assert.equal(dynamic.http.routers["neon-outage-preview"].service, "outage");
  assert.equal(dynamic.http.routers["neon-maintenance-preview"].priority, 10000);
  assert.equal(dynamic.http.routers["neon-outage-preview"].priority, 10000);
  assert.match(dynamic.http.routers["neon-maintenance-preview"].rule, /PathPrefix\(`\/__maintenance-preview`\)/u);
  assert.match(dynamic.http.routers["neon-outage-preview"].rule, /PathPrefix\(`\/__outage-preview`\)/u);
});

test("platform outage page uses the same self-contained monochrome recovery design", () => {
  const page = readFileSync(join(repoRoot, "deploy/compose/platform/outage/status.html"), "utf8");
  const favicon = readFileSync(join(repoRoot, "packages/platform/foundation/brand/assets/master-marks/athyper-favicon.svg")).toString("base64");
  assert.match(page, /aria-label="Athyper Neon"/u);
  for (const plane of ["neon", "mesh", "studio"]) assert.match(page, new RegExp(`data-plane-brand="${plane}"`, "u"));
  assert.match(page, /--contrast:#151515/u);
  assert.match(page, /--brand:#234B84/u);
  assert.match(page, /Platform gateway online/u);
  assert.match(page, /<title>Athyper Platform unavailable<\/title>/u);
  assert.match(page, /document\.title = `\$\{label\} - Platform unavailable`/u);
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)/u);
  assert.doesNotMatch(page, /https?:\/\//u);
  assert.ok(page.includes(`href="data:image/svg+xml;base64,${favicon}"`));
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

test("release instances use an image-contained fail-closed forward migration runner", () => {
  const parity = read("deploy/compose/instance/compose.parity.yaml");
  const catalog = read("deploy/catalog/applications.yaml");
  const dockerfile = readFileSync(join(repoRoot, "server/Dockerfile.prod"), "utf8");
  const runner = readFileSync(join(repoRoot, "server/db/runtime/run-forward-migrations.sh"), "utf8");
  const service = parity.services["db-forward-migration"];
  assert.deepEqual(service.entrypoint, ["/bin/sh", "/app/bin/run-forward-migrations.sh"]);
  assert.deepEqual(service.volumes, []);
  assert.equal(service.read_only, true);
  assert.deepEqual(service.secrets, ["postgres-password"]);
  assert.deepEqual(
    catalog.services.find(({ id }) => id === "db-forward-migration").presets.sort(),
    ["qa-standard", "stg-standard", "validation-full"],
  );
  assert.match(dockerfile, /server\/db\/migrations \/app\/migrations/u);
  assert.match(dockerfile, /run-forward-migrations\.sh \/app\/bin\/run-forward-migrations\.sh/u);
  assert.match(runner, /athyper_schema_migration_v1/u);
  assert.match(runner, /checksum differs from the migration ledger/u);
  assert.match(runner, /operator resolution is required/u);
  for (const plane of ["studio", "neon", "mesh"]) {
    const manifest = readFileSync(join(repoRoot, `server/db/migrations/manifests/${plane}.txt`), "utf8");
    const names = manifest.split(/\r?\n/u).filter(line => line && !line.startsWith("#"));
    assert.deepEqual(names, []);
    for (const name of names) assert.ok(readFileSync(join(repoRoot, "server/db/migrations", name), "utf8").includes("BEGIN;"));
  }
});

test("QA has a fail-closed one-time migration baseline initializer", () => {
  const parity = read("deploy/compose/instance/compose.parity.yaml");
  const catalog = read("deploy/catalog/applications.yaml");
  const service = parity.services["db-migration-baseline"];
  const runner = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/baseline-forward-migrations.sh"), "utf8");
  assert.deepEqual(service.entrypoint, ["/bin/sh", "/athyper/bin/baseline-forward-migrations.sh"]);
  assert.equal(service.read_only, true);
  assert.deepEqual(service.secrets, ["postgres-password"]);
  assert.deepEqual(catalog.services.find(({ id }) => id === "db-migration-baseline").presets, ["qa-standard"]);
  assert.match(runner, /foundation receipt does not match the approved DDL/u);
  assert.match(runner, /already has a migration ledger; refusing baseline adoption/u);
  assert.match(runner, /sha256sum/u);
});

test("MinIO bootstrap has enough memory for concurrent full-stack startup", () => {
  const instance = read("deploy/compose/instance/compose.yaml");
  const catalog = read("deploy/catalog/capabilities.yaml");
  const service = catalog.services.find(({ id }) => id === "objectstorage-init");
  assert.equal(instance.services["objectstorage-init"].mem_limit, "128m");
  assert.equal(service.resources.memoryMiB, 128);
});

test("DEV exposes the MinIO console and governed presigned-object endpoint through TLS", () => {
  const dynamic = read("deploy/compose/instance/config/traefik/dev.yaml");
  assert.equal(dynamic.http.routers.minio.rule, "Host(`minio.dev.athyper.test`)");
  assert.equal(dynamic.http.services.minio.loadBalancer.servers[0].url, "http://objectstorage:9001");
  assert.equal(dynamic.http.routers.objects.rule, "Host(`objects.dev.athyper.test`)");
  assert.equal(dynamic.http.services.objects.loadBalancer.servers[0].url, "http://objectstorage:9000");
  for (const environment of ["qa", "stg"]) {
    const routes = read(`deploy/compose/instance/config/traefik/${environment}.yaml`);
    assert.equal(routes.http.routers.minio, undefined);
    assert.equal(routes.http.services.minio, undefined);
    assert.equal(routes.http.routers.objects, undefined);
    assert.equal(routes.http.services.objects, undefined);
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
  const realm = read("deploy/config/iam/realm-athyper-clean-slate.json");
  for (const plane of ["studio", "neon", "mesh"]) {
    const client = realm.clients.find(({ clientId }) => clientId === `${plane}-web`);
    const origin = `https://${plane}.dev.athyper.test`;
    assert.ok(client.redirectUris.includes(`${origin}/api/auth/callback`));
    assert.ok(client.webOrigins.includes(origin));
    assert.ok(client.attributes["post.logout.redirect.uris"].split("##").includes(`${origin}/api/auth/logout/callback`));
  }
});

test("runtime communication providers preserve overrides and support secret files", () => {
  const runtime = readFileSync(join(repoRoot, "deploy/compose/instance/scripts/start-runtime.sh"), "utf8");
  const providers = read("deploy/compose/instance/compose.notification-providers.yaml");
  const smtpRollback = read("deploy/compose/instance/compose.notification-smtp-rollback.yaml");
  assert.match(runtime, /SMTP_HOST="\$\{SMTP_HOST:-mailtrap\}"/u);
  assert.match(runtime, /SMTP_FROM="\$\{SMTP_FROM:-noreply@\$\{ATHYPER_DOMAIN_SUFFIX:-dev\.athyper\.test\}\}"/u);
  assert.doesNotMatch(runtime, /export SMTP_HOST=mailtrap/u);
  for (const variable of [
    "SMTP_USER", "SMTP_PASS",
    "PUSH_FCM_PROJECT_ID", "PUSH_FCM_CLIENT_EMAIL", "PUSH_FCM_PRIVATE_KEY",
    "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
  ]) {
    assert.match(runtime, new RegExp(`(?:^|\\s)${variable}(?:\\s|;|\\\\|$)`, "u"));
  }
  assert.match(runtime, /Secret file configured by \$\{variable\}_FILE is unavailable/u);
  assert.match(runtime, /Secret file configured by \$\{variable\}_FILE is empty/u);
  const expectedSecrets = [
    "vapid-subject", "vapid-public-key", "vapid-private-key",
  ];
  assert.deepEqual(providers.services.api.secrets, expectedSecrets);
  assert.deepEqual(providers.services.worker.secrets, expectedSecrets);
  assert.equal(providers.services.scheduler, undefined);
  assert.equal(providers.services.api.environment.EMAIL_PROVIDER, "${EMAIL_PROVIDER:-ses}");
  assert.equal(providers.services.api.environment.ATHYPER_ENV, "staging");
  assert.equal(smtpRollback.services.api.environment.EMAIL_PROVIDER, "smtp");
  assert.equal(smtpRollback.services.api.environment.SMTP_PASS_FILE, "/run/secrets/smtp-password");
  assert.deepEqual(smtpRollback.services.api.secrets, [
    "smtp-host", "smtp-port", "smtp-secure", "smtp-from", "smtp-user", "smtp-password",
  ]);
  assert.equal(providers.services.worker.environment.VAPID_PRIVATE_KEY_FILE, "/run/secrets/vapid-private-key");
  assert.match(runtime, /ATHYPER_ENV="\$\{ATHYPER_ENV:-local\}"/u);
});
