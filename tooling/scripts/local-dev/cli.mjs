#!/usr/bin/env node
import { homedir } from "node:os";
import {
  existsSync,
  readdirSync,
  rmSync,
  lstatSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPlan,
  projectCompose,
  readJson,
  hash,
  assertOwned,
} from "./model.mjs";
import {
  command,
  setOperationSignal,
  recoverLock,
  acquireLock,
  assertActiveCheckout,
  assertNoOtherEnvironment,
  inventory,
  checkPorts,
  prepareFiles,
  privateDirectory,
  composeArgs,
  doctor,
  measure,
  writeJson,
  probeInfrastructure,
} from "./runtime.mjs";

import {
  launchApplications,
  stopApplications,
  supervisorState,
  probeApplications,
} from "./supervisor.mjs";
import { configureIdentity } from "./identity.mjs";
import { foundation, provisionLocalSearchKey } from "./applications.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const usage = `Local source development

  pnpm devsimple
  pnpm devfull
  pnpm dev:local up --preset devsimple --apps neon --with search
  pnpm dev:local up --ports api=31000,neon=31001
  pnpm dev:local up --infrastructure-only
  pnpm dev:local plan|doctor|status|logs|measure|down|reset|recover
  pnpm dev:local foundation|identity|watch
  pnpm test:local-runner
  pnpm test:local-lifecycle --reset-disposable
  node tooling/scripts/local-dev/browser-smoke.mjs

up starts source API/worker/scheduler and selected frontends after foundation and
permission catalogs. Identity creates synthetic local personas with no product grants.
reset removes ONLY validated owned disposable volumes and rebuilds the foundation;
product fixtures and metadata publication are not yet part of that baseline.
recover refuses a lock whose recorded operation or child processes still exist.
No shared DEV/QA changes or release qualification are performed.`;

export function parseArgs(args) {
  const options = { command: "up", capabilities: [] };
  if (args[0] && !args[0].startsWith("--")) options.command = args.shift();
  if (
    ![
      "up",
      "plan",
      "doctor",
      "status",
      "logs",
      "measure",
      "down",
      "reset",
      "help",
      "foundation",
      "watch",
      "recover",
      "identity",
    ].includes(options.command)
  )
    throw new Error(`Unknown command: ${options.command}`);
  while (args.length) {
    const flag = args.shift();
    if (flag === "--infrastructure-only") options.infrastructureOnly = true;
    else if (flag === "--json") options.json = true;
    else if (flag === "--help") options.command = "help";
    else if (
      ["--preset", "--apps", "--with", "--iam-image", "--ports"].includes(flag)
    ) {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${flag}`);
      if (flag === "--ports") {
        options.ports = Object.fromEntries(
          value.split(",").map((binding) => {
            const parts = binding.split("=");
            if (parts.length !== 2)
              throw new Error("Use --ports api=31000,neon=31001");
            return [parts[0], Number(parts[1])];
          }),
        );
      }
      if (flag === "--preset") options.preset = value;
      if (flag === "--apps") options.apps = value.split(",");
      if (flag === "--with") options.capabilities.push(...value.split(","));
      if (flag === "--iam-image") options.iamImage = value;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

async function resolveCompose(plan) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(ATHYPER_|COMPOSE_|PUBLICATION_|ATLAS_|BUSINESS_PARTNER_)/.test(key),
    ),
  );
  Object.assign(env, {
    ATHYPER_RUNTIME_ROOT: plan.root,
    ATHYPER_INSTANCE: plan.id,
    ATHYPER_DOMAIN_SUFFIX: `${plan.id}.localhost`,
    ATHYPER_DDL_SHA256: "not-a-migration",
    ATHYPER_IMAGE_IAM: plan.iamImage,
    ATHYPER_POSTGRES_BIND: `127.0.0.1:${plan.ports.db}`,
  });
  const output = await command(
    "docker",
    [
      "compose",
      "--env-file",
      "/dev/null",
      "--project-name",
      plan.project,
      ...plan.composeFiles.flatMap((path) => ["--file", path]),
      "--profile",
      "*",
      "config",
      "--format",
      "json",
    ],
    { env },
  );
  return projectCompose(JSON.parse(output), plan);
}

function storedPlan(plan) {
  const path = join(plan.root, "manifest.json");
  if (!existsSync(path)) return null;
  const stored = readJson(path);
  for (const key of [
    "schemaVersion",
    "id",
    "project",
    "checkout",
    "root",
    "registryRoot",
  ])
    if (stored[key] !== plan[key])
      throw new Error(`Invalid stored environment identity: ${key}`);
  const composed = readJson(join(plan.root, "compose.json"));
  if (hash(JSON.stringify(composed)) !== stored.composeSha256)
    throw new Error(
      "Stored Compose model changed; refusing lifecycle mutation",
    );
  return stored;
}

async function checkNamedResources(document, plan) {
  for (const kind of ["volume", "network"]) {
    const names = new Set(
      (await command("docker", [kind, "ls", "--format", "{{.Name}}"])).split(
        "\n",
      ),
    );
    for (const resource of Object.values(document[`${kind}s`] ?? {})) {
      if (names.has(resource.name)) {
        const [existing] = JSON.parse(
          await command("docker", [kind, "inspect", resource.name]),
        );
        assertOwned(existing, plan, kind);
      }
    }
  }
}

async function preflight(plan) {
  const check = await doctor(plan);
  if (check.failures.length) throw new Error(check.failures.join("; "));
  if (
    check.host.availableBytes <
    (plan.resources.minimumAvailableMiB ?? 2048) * 1048576
  )
    throw new Error(
      `Insufficient available memory for ${plan.preset}: requires ${plan.resources.minimumAvailableMiB ?? 2048} MiB headroom`,
    );
  await assertNoOtherEnvironment(plan);
  const existing = await inventory(plan);
  const document = await resolveCompose(plan);
  await checkNamedResources(document, plan);
  await checkPorts(document, existing);
  privateDirectory(plan.root);
  privateDirectory(join(plan.root, "secrets"));
  privateDirectory(join(plan.root, "consumer-secrets"));
  privateDirectory(join(plan.root, "consumer-secrets", "iam"));
  const realmImport = join(plan.root, "realm-import");
  if (
    existsSync(realmImport) &&
    (lstatSync(realmImport).isSymbolicLink() ||
      !lstatSync(realmImport).isDirectory())
  )
    throw new Error("Invalid realm import directory");
  // Validate private inputs before any destructive reset operation.
  for (const [key, secret] of Object.entries(document.secrets ?? {})) {
    if (secret["x-local-source"]) continue;
    if (existsSync(secret.file)) {
      const stat = lstatSync(secret.file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.mode & 0o077 ||
        !readFileSync(secret.file).length
      )
        throw new Error(`Invalid private secret file: ${key}`);
      if (
        key === "infisical-encryption-key" &&
        readFileSync(secret.file).length !== 32
      )
        throw new Error("Invalid local Infisical encryption key length");
    }
  }
  // Build only the existing infrastructure IAM Dockerfile when its local image is absent.
  const images = await command("docker", ["image", "ls", "-q", plan.iamImage]);
  let matchingSource = false;
  if (images && plan.iamSourceHash) {
    const [image] = JSON.parse(
      await command("docker", ["image", "inspect", plan.iamImage]),
    );
    matchingSource =
      image.Config.Labels?.["io.athyper.local-dev.iam-source"] ===
      plan.iamSourceHash;
  }
  if (plan.iamSourceHash && !matchingSource) {
    process.stderr.write(
      "Building local identity infrastructure using deploy/docker-bake.hcl…\n",
    );
    await command(
      "docker",
      [
        "buildx",
        "bake",
        "--file",
        join(plan.checkout, "deploy/docker-bake.hcl"),
        "--set",
        `iam.tags=${plan.iamImage}`,
        "--set",
        `iam.labels.io.athyper.local-dev.iam-source=${plan.iamSourceHash}`,
        "iam",
      ],
      { inherit: true },
    );
  }
  // Resolve every image before reset can remove data; freeze local tags to image IDs.
  for (const service of Object.values(document.services)) {
    if (!service.image) continue;
    const present = await command("docker", [
      "image",
      "ls",
      "-q",
      service.image,
    ]);
    if (!present)
      await command("docker", ["pull", service.image], { inherit: true });
    const [image] = JSON.parse(
      await command("docker", ["image", "inspect", service.image]),
    );
    service.image = image.Id;
  }
  return { existing, document };
}

async function start(plan, prepared) {
  const { existing, document } = prepared ?? (await preflight(plan));
  await stopApplications(plan);
  prepareFiles(plan, document);
  writeJson(join(plan.registryRoot, "active.json"), {
    id: plan.id,
    checkout: plan.checkout,
    state: "starting",
  });
  try {
    // Stop deselected owned services without deleting their data or unrelated projects.
    const deselected = existing.container.filter(
      (item) =>
        !document.services[item.Config.Labels["com.docker.compose.service"]],
    );
    for (const item of deselected) {
      if (item.State.Running) await command("docker", ["stop", item.Id]);
      await command("docker", ["rm", item.Id]); // Named volumes are retained.
    }
    await command(
      "docker",
      [
        ...composeArgs(plan),
        "up",
        "--detach",
        "--wait",
        "--wait-timeout",
        "240",
        ...Object.keys(document.services).filter(
          (name) => !name.endsWith("-init"),
        ),
      ],
      { inherit: true },
    );
    // Unlike db-init, this initializer has no long-running dependent in the
    // infrastructure graph. Compose --wait treats its successful exit as failure
    // when it is a top-level target; run it explicitly after storage is healthy.
    if (document.services["objectstorage-init"])
      await command("docker", [
        ...composeArgs(plan),
        "run",
        "--rm",
        "--no-deps",
        "objectstorage-init",
      ]);
    if (document.services["searchcore-key-init"])
      await provisionLocalSearchKey(plan);
    const issuer = `${plan.origins.iam}/realms/${plan.realm}`;
    const discovery = await fetch(
      `${issuer}/.well-known/openid-configuration`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!discovery.ok || (await discovery.json()).issuer !== issuer)
      throw new Error(
        "The isolated identity realm is not discoverable with its expected issuer",
      );
    const probes = await probeInfrastructure(plan);
    writeJson(join(plan.registryRoot, "active.json"), {
      id: plan.id,
      checkout: plan.checkout,
      state: "infrastructure-ready",
    });
    return {
      environment: plan.id,
      preset: plan.preset,
      state: "infrastructure-ready",
      applicationReady: false,
      ports: plan.ports,
      pending: plan.pending,
      identityDiscoveryPassed: true,
      probes,
      servicesWithoutHealthchecks: Object.entries(document.services)
        .filter(
          ([name, service]) => !service.healthcheck && !name.endsWith("-init"),
        )
        .map(([name]) => name),
      measurement: await measure(plan),
    };
  } catch (error) {
    writeJson(join(plan.registryRoot, "active.json"), {
      id: plan.id,
      checkout: plan.checkout,
      state: "startup-failed",
    });
    throw error;
  }
}

async function startSource(plan, infrastructure, signal) {
  try {
    await configureIdentity(plan);
    await foundation(plan);
    const source = await launchApplications(plan, { signal });
    writeJson(join(plan.registryRoot, "active.json"), {
      id: plan.id,
      checkout: plan.checkout,
      state: "source-ready",
    });
    return {
      ...infrastructure,
      state: "source-ready",
      source,
      applicationReady: true,
      sourceHttpReady: true,
      scenarioQualified: false,
      pending: [
        "product-fixtures-and-grants",
        "metadata-preview-and-signing",
        "live-authorization-journeys",
        "candidate-qualification",
      ],
      measurement: await measure(plan),
    };
  } catch (error) {
    writeJson(join(plan.registryRoot, "active.json"), {
      id: plan.id,
      checkout: plan.checkout,
      state: "source-startup-failed",
    });
    throw error;
  }
}

async function stop(plan, reset = false) {
  // Operate by validated immutable Docker IDs; down must include dormant services
  // from an earlier full preset, without Compose's broad orphan/volume deletion.
  const resources = await inventory(plan);
  await stopApplications(plan);
  for (const item of resources.container) {
    if (item.State.Running) await command("docker", ["stop", item.Id]);
    await command("docker", ["rm", item.Id]);
  }
  for (const item of resources.network)
    await command("docker", ["network", "rm", item.Id]);
  if (reset)
    for (const item of resources.volume)
      await command("docker", ["volume", "rm", item.Name]);
  const activePath = join(plan.registryRoot, "active.json");
  if (existsSync(activePath)) rmSync(activePath);
  return { environment: plan.id, state: "stopped", dataPreserved: !reset };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs([...args]);
  if (options.command === "help") return usage;
  if (["up", "reset", "watch"].includes(options.command)) {
    const workspace = join(
      homedir(),
      ".athyper/instances/dev/workspace/mode.json",
    );
    if (
      existsSync(workspace) &&
      ["source", "container"].includes(readJson(workspace).mode)
    )
      throw new Error(
        "The shared DEV source workspace is active. Use pnpm devfull/devsimple; do not start a second isolated application workspace.",
      );
  }
  let plan = createPlan(repoRoot, options);
  if (options.command === "plan") {
    const document = await resolveCompose(plan);
    return {
      ...plan,
      resolvedServices: Object.keys(document.services),
      resolvedNetworks: Object.keys(document.networks),
      resolvedVolumeNames: Object.values(document.volumes).map(
        (item) => item.name,
      ),
    };
  }
  if (options.command === "doctor") {
    const result = await doctor(plan);
    if (result.failures.length) process.exitCode = 1;
    return result;
  }
  if (options.command === "status") {
    const directory = join(plan.registryRoot, "environments");
    const resources = await inventory(plan);
    const sourcePlan = storedPlan(plan);
    const sourceState = supervisorState(plan);
    const sourceReadiness =
      sourcePlan && sourceState?.alive
        ? await probeApplications(sourcePlan)
        : { ready: false, checks: [] };
    return {
      active: existsSync(join(plan.registryRoot, "active.json"))
        ? readJson(join(plan.registryRoot, "active.json"))
        : null,
      environments: existsSync(directory)
        ? readdirSync(directory)
            .filter((id) => /^[a-f0-9]{12}$/.test(id))
            .map((id) => join(directory, id, "manifest.json"))
            .filter(existsSync)
            .map((path) => {
              const item = readJson(path);
              return {
                id: item.id,
                checkout: item.checkout,
                preset: item.preset,
              };
            })
        : [],
      current: plan.id,
      containers: resources.container.map((item) => ({
        name: item.Name,
        status: item.State.Status,
        health: item.State.Health?.Status ?? "not-configured",
      })),
      source: sourceState,
      sourceReadiness,
      applicationReady: sourceReadiness.ready,
    };
  }
  if (["logs", "measure"].includes(options.command)) {
    plan = storedPlan(plan);
    if (!plan) throw new Error("No local environment has been initialized");
    if (options.command === "measure") return measure(plan);
    await inventory(plan);
    return command("docker", [...composeArgs(plan), "logs", "--tail", "100"]);
  }
  if (options.command === "recover") {
    assertActiveCheckout(plan);
    await inventory(plan);
    return recoverLock(plan.registryRoot);
  }
  const release = acquireLock(plan.registryRoot);
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(new Error("Local lifecycle operation interrupted"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  setOperationSignal(controller.signal);
  try {
    assertActiveCheckout(plan);
    const stored = storedPlan(plan);
    if (options.command === "up") {
      const infrastructure = await start(plan);
      if (options.infrastructureOnly) return infrastructure;
      return await startSource(plan, infrastructure, controller.signal);
    }
    if (!stored) throw new Error("No owned local environment to stop/reset");
    if (options.command === "identity")
      return await configureIdentity(stored, { personas: true });
    if (options.command === "watch")
      return await launchApplications(stored, { signal: controller.signal });
    if (options.command === "foundation") return await foundation(stored);
    if (options.command === "down") return await stop(stored);
    if (options.command === "reset") {
      const resetPlan = createPlan(repoRoot, {
        preset: stored.preset,
        iamImage: stored.iamSourceHash === null ? stored.iamImage : undefined,
        apps: stored.apps,
        capabilities: stored.capabilities,
        ports: stored.ports,
      });
      const prepared = await preflight(resetPlan);
      await stop(stored, true);
      const infrastructure = await start(resetPlan, {
        ...prepared,
        existing: { container: [], volume: [], network: [] },
      });
      if (options.infrastructureOnly) return infrastructure;
      return await startSource(resetPlan, infrastructure, controller.signal);
    }
  } finally {
    setOperationSignal(undefined);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    release();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((result) => {
      const summary =
        ["infrastructure-ready", "source-ready"].includes(result?.state) &&
        !process.argv.includes("--json")
          ? `Infrastructure ready: ${result.preset} (${result.environment})\nMemory snapshot: ${result.measurement.totalMiB} MiB / ${result.measurement.targetMiB} MiB target\nIdentity discovery: passed\nApplication HTTP readiness: ${result.applicationReady ? "passed" : "not started"}. BP scenario and release qualification: pending.\nUse pnpm dev:local status for service state; pnpm dev:local down to stop.`
          : typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
      process.stdout.write(`${summary}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
