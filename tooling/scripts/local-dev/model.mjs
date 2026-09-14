import { validateCatalog, overridePorts } from "./configuration.mjs";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const OWNER = "io.athyper.local-dev.environment";
export const MANAGER = "io.athyper.local-dev.manager";
export const MANAGER_VERSION = "local-dev-v1";
const APPS = ["studio", "neon", "mesh"];
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function treeHash(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return hash(
    entries
      .map(
        (entry) =>
          `${entry.name}:${entry.isDirectory() ? treeHash(join(directory, entry.name)) : hash(readFileSync(join(directory, entry.name)))}`,
      )
      .join("\n"),
  );
}

export function createPlan(
  repoRoot,
  {
    preset = "devsimple",
    apps,
    capabilities = [],
    iamImage,
    ports: portOverrides,
  } = {},
  registryRoot = join(homedir(), ".athyper", "local-dev"),
) {
  const checkout = realpathSync(repoRoot);
  const catalog = readJson(
    join(checkout, "tooling/config/local-dev/presets.json"),
  );
  validateCatalog(catalog);
  const config = catalog.presets[preset];
  if (!config) throw new Error(`Unknown preset: ${preset}`);
  if (
    iamImage &&
    !/^(?:sha256:|[a-zA-Z0-9./:_-]+@sha256:)[a-f0-9]{64}$/.test(iamImage)
  )
    throw new Error("--iam-image must be an immutable SHA-256 image reference");
  const selectedApps = [...new Set(apps ?? config.apps)];
  if (!selectedApps.length || selectedApps.some((app) => !APPS.includes(app)))
    throw new Error("Apps must be studio, neon or mesh");
  const selectedCapabilities = [
    ...new Set([...config.capabilities, ...capabilities]),
  ];
  for (const name of selectedCapabilities)
    if (!catalog.capabilities[name])
      throw new Error(`Unsupported capability: ${name}`);
  const id = hash(checkout).slice(0, 12);
  const project = `athyper-local-${id}`;
  const root = join(registryRoot, "environments", id);
  const portBase = 20000 + (parseInt(id.slice(0, 6), 16) % 1000) * 20;
  const ports = overridePorts(
    Object.fromEntries(
      [
        "gateway",
        "db",
        "redis",
        "objectstorage",
        "iam",
        "pool",
        "sessionPool",
        "neon",
        "mesh",
        "studio",
        "api",
        "grafana",
        "secretstore",
        "dbconsole",
        "workerMetrics",
        "schedulerMetrics",
        "queueconsole",
        // Reserved slot keeps existing checkout port assignments stable.
        null,
        "analytics",
        "search",
        "docrender",
        "docparser",
        "clamd",
        "smtp",
        "otlp",
      ]
        .map((key, offset) => [key, portBase + offset])
        .filter(([key]) => key !== null),
    ),
    portOverrides,
  );
  const services = [
    ...new Set([
      ...catalog.coreServices,
      ...selectedCapabilities.flatMap(
        (name) => catalog.capabilities[name].services,
      ),
    ]),
  ];
  const composeProfiles = [
    ...new Set(
      selectedCapabilities.flatMap(
        (name) => catalog.capabilities[name].profiles,
      ),
    ),
  ];
  return {
    schemaVersion: 1,
    id,
    project,
    checkout,
    root,
    registryRoot,
    preset,
    iamImage: iamImage ?? "athyper/keycloak:local-dev",
    iamSourceHash: iamImage
      ? null
      : treeHash(join(checkout, "deploy/config/iam")),
    apps: selectedApps,
    capabilities: selectedCapabilities,
    ports,
    origins: Object.fromEntries(
      ["neon", "mesh", "studio", "api", "iam"].map((key) => [
        key,
        `http://${APPS.includes(key) ? `${key}.${id}.localhost` : "127.0.0.1"}:${ports[key]}`,
      ]),
    ),
    realm: `local-${id}`,
    services,
    composeProfiles,
    composeFiles: [
      "compose.yaml",
      "compose.parity.yaml",
      "compose.optional.yaml",
    ].map((file) => join(checkout, "deploy/compose/instance", file)),
    resources: {
      idleInfrastructureLimitMiB: config.idleInfrastructureLimitMiB,
      buildConcurrency: config.buildConcurrency,
      minimumAvailableMiB: config.minimumAvailableMiB,
      serviceMemoryMiB: config.serviceMemoryMiB,
    },
    readinessScope: "infrastructure-only",
    applicationReady: false,
    pending: [
      "application-watch",
      "database-foundation-and-fixtures",
      "metadata-preview-and-signing",
      "live-authorization-journeys",
    ],
  };
}

export function dependencyClosure(services, selected) {
  const result = new Set();
  function visit(name) {
    if (result.has(name)) return;
    const service = services[name];
    if (!service) throw new Error(`Missing Compose service: ${name}`);
    if (
      [
        "api",
        "worker",
        "scheduler",
        "neon-web",
        "mesh-web",
        "studio-web",
      ].includes(name) ||
      name.startsWith("db-migration") ||
      name === "db-forward-migration"
    ) {
      throw new Error(
        `Infrastructure must not start application/migration service: ${name}`,
      );
    }
    result.add(name);
    for (const dependency of Object.keys(service.depends_on ?? {}))
      visit(dependency);
  }
  selected.forEach(visit);
  return [...result].sort();
}

export function assertOwned(resource, plan, kind = "container") {
  const labels =
    kind === "container" ? resource.Config?.Labels : resource.Labels;
  if (
    labels?.[OWNER] !== plan.id ||
    labels?.[MANAGER] !== MANAGER_VERSION ||
    labels?.["com.docker.compose.project"] !== plan.project
  ) {
    throw new Error(
      `Refusing ${kind} without exact local ownership: ${resource.Name ?? resource.Id ?? "unknown"}`,
    );
  }
}

// Projection follows Docker's own overlay/anchor/interpolation resolution.
// It removes unselected services and shared networks, never duplicates definitions.
export function projectCompose(resolved, plan) {
  const labels = { [OWNER]: plan.id, [MANAGER]: MANAGER_VERSION };
  const document = {
    name: plan.project,
    services: {},
    networks: {},
    volumes: {},
    secrets: {},
  };
  for (const name of dependencyClosure(resolved.services, plan.services)) {
    const service = structuredClone(resolved.services[name]);
    if (
      service.container_name ||
      service.network_mode ||
      service.privileged ||
      service.pid === "host"
    )
      throw new Error(`Unsafe infrastructure definition: ${name}`);
    service.labels = { ...service.labels, ...labels };
    if (plan.resources?.serviceMemoryMiB?.[name])
      service.mem_limit = `${plan.resources.serviceMemoryMiB[name]}m`;
    service.restart = "no"; // No machine-wide restart resurrects dormant checkout infrastructure.
    if (["telemetry", "memorycache-exporter"].includes(name)) {
      service.user = "0:0";
      service.entrypoint = [
        "/bin/sh",
        "/athyper/local/start-secret-consumer.sh",
        name,
      ];
      service.volumes ??= [];
      service.volumes.push({
        type: "bind",
        source: join(
          plan.checkout,
          "tooling/scripts/local-dev/start-secret-consumer.sh",
        ),
        target: "/athyper/local/start-secret-consumer.sh",
        read_only: true,
      });
    }
    service.networks = Object.fromEntries(
      Object.entries(service.networks ?? {}).filter(
        ([key]) => !key.startsWith("platform-"),
      ),
    );
    if (name === "gateway") {
      service.ports = [
        {
          target: 8080,
          published: String(plan.ports.gateway),
          host_ip: "127.0.0.1",
          protocol: "tcp",
        },
      ];
      service.volumes = [
        {
          type: "bind",
          source: join(plan.root, "gateway.yaml"),
          target: "/etc/traefik/dynamic.yaml",
          read_only: true,
        },
      ];
    }
    const bindings = {
      db: ["db", 5432],
      memorycache: ["redis", 6379],
      objectstorage: ["objectstorage", 9000],
      iam: ["iam", 8080],
      "dbpool-apps": ["pool", 5432],
      "dbpool-session": ["sessionPool", 5432],
      telemetry: ["grafana", 3000],
      secretstore: ["secretstore", 8080],
      dbconsole: ["dbconsole", 8081],
      queueconsole: ["queueconsole", 3000],
      analyticsboard: ["analytics", 3000],
      searchcore: ["search", 7700],
      docrender: ["docrender", 3000],
      docparser: ["docparser", 9998],
      virusscan: ["clamd", 3310],
      mailtrap: ["smtp", 1025],
      tracing: ["otlp", 4318],
    };
    if (bindings[name]) {
      const [key, target] = bindings[name];
      service.ports = [
        {
          target,
          published: String(plan.ports[key]),
          host_ip: "127.0.0.1",
          protocol: "tcp",
        },
      ];
    } else if (name !== "gateway") delete service.ports;
    // Docker does not publish ports for containers attached only to internal
    // networks. Keep data/ops private and add a checkout-owned host-access bridge.
    if (service.ports?.length) service.networks["local-host"] = {};
    if (name === "iam") {
      service.environment.KC_HOSTNAME = plan.origins.iam;
      service.volumes.push({
        type: "bind",
        source: join(plan.root, "realm-import"),
        target: "/opt/keycloak/data/import",
        read_only: true,
      });
    }
    if (name === "secretstore")
      service.environment.SITE_URL = `http://127.0.0.1:${plan.ports.secretstore}`;
    for (const key of Object.keys(service.networks)) {
      const original = resolved.networks[key] ?? {};
      if (original.external)
        throw new Error(`External network is not allowed: ${key}`);
      document.networks[key] = {
        ...original,
        name: `${plan.project}_${key}`,
        labels,
      };
    }
    for (const mount of service.volumes ?? []) {
      if (mount.type === "volume") {
        const original = resolved.volumes[mount.source];
        if (!original || original.external || original.driver_opts)
          throw new Error(`Unowned volume definition: ${mount.source}`);
        document.volumes[mount.source] = {
          ...original,
          name: `${plan.project}_${mount.source}`,
          labels,
        };
      } else if (mount.type === "bind") {
        if (!mount.read_only)
          throw new Error(`Writable repository bind refused: ${name}`);
      } else throw new Error(`Unsupported mount: ${name}`);
    }
    for (const ref of service.secrets ?? []) {
      const key = typeof ref === "string" ? ref : ref.source;
      document.secrets[key] = { file: join(plan.root, "secrets", key) };
    }
    if (name === "iam")
      service.secrets = (service.secrets ?? []).map((ref) => {
        const key = typeof ref === "string" ? ref : ref.source;
        const copyKey = `iam-copy-${key}`;
        document.secrets[copyKey] = {
          file: join(plan.root, "consumer-secrets", "iam", key),
          "x-local-source": key,
        };
        return {
          ...(typeof ref === "string" ? {} : ref),
          source: copyKey,
          target: typeof ref === "string" ? key : (ref.target ?? key),
        };
      });
    document.services[name] = service;
  }
  return document;
}
