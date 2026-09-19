import { sourceIdentity } from "./evidence.mjs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  lstatSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { freemem, totalmem, cpus } from "node:os";
import {
  OWNER,
  MANAGER,
  MANAGER_VERSION,
  assertOwned,
  readJson,
  hash,
} from "./model.mjs";

let operationSignal;
let activeLock;
function recordChild(pid, remove = false) {
  if (!activeLock || !pid) return;
  activeLock.value.children = activeLock.value.children.filter(
    (child) => child !== pid,
  );
  if (!remove) activeLock.value.children.push(pid);
  writeJson(activeLock.path, activeLock.value);
}
export function setOperationSignal(signal) {
  operationSignal = signal;
}

export function command(
  binary,
  args,
  { env = process.env, inherit = false, cwd, signal = operationSignal } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      cwd,
      signal,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    recordChild(child.pid);
    child.once("close", () => recordChild(child.pid, true));
    let stdout = "",
      stderr = "";
    child.stdout?.on("data", (value) => {
      stdout += value;
    });
    child.stderr?.on("data", (value) => {
      stderr += value;
    });
    let failure;
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code, signal) =>
      failure
        ? reject(failure)
        : code === 0
          ? resolve(stdout.trim())
          : reject(
              new Error(
                `${binary} ${args.slice(0, 3).join(" ")} failed (${signal ?? code}): ${stderr.slice(-3000)}`,
              ),
            ),
    );
  });
}

export function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error(
      `Runtime directory must be private and not a symlink: ${path}`,
    );
}

export function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  renameSync(temporary, path);
}

export function acquireLock(registryRoot) {
  privateDirectory(registryRoot);
  const path = join(registryRoot, "operation.lock");
  const value = {
    schemaVersion: 1,
    pid: process.pid,
    children: [],
    at: new Date().toISOString(),
  };
  try {
    writeFileSync(path, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `A local lifecycle operation is locked (${path}); inspect its process before recovering a stale lock.`,
      );
    throw error;
  }
  activeLock = { path, value };
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeLock = undefined;
    rmSync(path, { force: true });
    process.removeListener("exit", release);
  };
  process.once("exit", release);
  return release;
}

export function assertActiveCheckout(plan) {
  const path = join(plan.registryRoot, "active.json");
  if (!existsSync(path)) return;
  const active = readJson(path);
  if (active.id !== plan.id || active.checkout !== plan.checkout)
    throw new Error(
      `Another checkout owns the active environment: ${active.checkout}. Run down from that checkout first.`,
    );
}

export async function assertLocalDocker() {
  const contextEndpoint = JSON.parse(
    await command("docker", [
      "context",
      "inspect",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  );
  const endpoint =
    !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
      ? process.env.DOCKER_HOST
      : contextEndpoint;
  if (
    typeof endpoint !== "string" ||
    (!endpoint.startsWith("unix://") &&
      !/^tcp:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(endpoint))
  )
    throw new Error(
      "Local development requires a local Docker socket or loopback endpoint",
    );
}

export async function inventory(plan) {
  await assertLocalDocker();
  const result = {};
  for (const kind of ["container", "volume", "network"]) {
    const args = kind === "container" ? ["ps", "-aq"] : [kind, "ls", "-q"];
    const names = await command("docker", [
      ...args,
      "--filter",
      `label=com.docker.compose.project=${plan.project}`,
    ]);
    result[kind] = names
      ? JSON.parse(
          await command("docker", [kind, "inspect", ...names.split(/\s+/)]),
        )
      : [];
    for (const resource of result[kind]) assertOwned(resource, plan, kind);
  }
  return result;
}

export async function assertNoOtherEnvironment(plan) {
  const names = await command("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=${MANAGER}=${MANAGER_VERSION}`,
  ]);
  if (!names) return;
  const containers = JSON.parse(
    await command("docker", ["inspect", ...names.split(/\s+/)]),
  );
  const other = containers.find(
    (item) => item.State?.Running && item.Config?.Labels?.[OWNER] !== plan.id,
  );
  if (other)
    throw new Error(
      `Another managed environment is running: ${other.Config.Labels[OWNER]}. Reconcile it before startup.`,
    );
}

export async function checkPorts(document, existing) {
  const occupiedByOwned = new Set(
    existing.container
      .filter((item) => item.State?.Running)
      .flatMap((item) =>
        Object.values(item.NetworkSettings?.Ports ?? {}).flatMap((values) =>
          (values ?? []).map((value) => Number(value.HostPort)),
        ),
      ),
  );
  for (const service of Object.values(document.services))
    for (const binding of service.ports ?? []) {
      const port = Number(binding.published);
      if (occupiedByOwned.has(port)) continue;
      await new Promise((resolve, reject) => {
        const server = createServer();
        server.once("error", () =>
          reject(
            new Error(
              `Local port ${port} is occupied; no services were started.`,
            ),
          ),
        );
        server.listen(port, "127.0.0.1", () => server.close(resolve));
      });
    }
}

export function prepareFiles(plan, document) {
  privateDirectory(plan.root);
  privateDirectory(join(plan.root, "secrets"));
  for (const [key, secret] of Object.entries(document.secrets)) {
    if (secret["x-local-source"]) continue;
    if (!existsSync(secret.file))
      writeFileSync(
        secret.file,
        randomBytes(
          key === "infisical-encryption-key"
            ? 16
            : key.endsWith("access-key")
              ? 10
              : 32,
        ).toString("hex"),
        { mode: 0o600, flag: "wx" },
      );
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
      throw new Error(
        "Local Infisical ENCRYPTION_KEY must contain exactly 32 UTF-8 bytes",
      );
  }
  for (const [key, secret] of Object.entries(document.secrets)) {
    if (!secret["x-local-source"]) continue;
    privateDirectory(join(plan.root, "consumer-secrets"));
    privateDirectory(join(plan.root, "consumer-secrets", "iam"));
    const canonical = document.secrets[secret["x-local-source"]];
    if (
      !canonical ||
      secret.file !==
        join(plan.root, "consumer-secrets", "iam", secret["x-local-source"])
    )
      throw new Error(`Invalid consumer secret mapping: ${key}`);
    if (
      existsSync(secret.file) &&
      (lstatSync(secret.file).isSymbolicLink() ||
        !lstatSync(secret.file).isFile())
    )
      throw new Error(`Invalid consumer secret file: ${key}`);
    if (
      existsSync(secret.file) &&
      (lstatSync(secret.file).mode & 0o777) === 0o444 &&
      hash(readFileSync(secret.file)) === hash(readFileSync(canonical.file))
    )
      continue;
    const temporary = `${secret.file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(temporary, readFileSync(canonical.file), {
      flag: "wx",
      mode: 0o444,
    });
    renameSync(temporary, secret.file);
  }
  mkdirSync(join(plan.root, "realm-import"), { recursive: true, mode: 0o755 });
  if (lstatSync(join(plan.root, "realm-import")).isSymbolicLink())
    throw new Error("Realm directory cannot be a symlink");
  const realm = readJson(
    join(plan.checkout, "deploy/config/iam/realm-athyper-clean-slate.json"),
  );
  if (plan.id === "dev") {
    realm.ssoSessionIdleTimeout = 7200;
    realm.ssoSessionMaxLifespan = 43200;
    for (const client of realm.clients ?? []) {
      if (["studio-web", "neon-web"].includes(client.clientId)) {
        client.attributes = { ...client.attributes, "client.session.idle.timeout": "7200", "client.session.max.lifespan": "43200" };
      }
    }
  }
  const originalRealm = realm.realm;
  realm.realm = plan.realm;
  delete realm.id;
  for (const client of realm.clients ?? []) {
    for (const field of ["rootUrl", "baseUrl", "adminUrl"])
      if (typeof client[field] === "string")
        client[field] = client[field]
          .replaceAll(`/realms/${originalRealm}/`, `/realms/${plan.realm}/`)
          .replaceAll(`/admin/${originalRealm}/`, `/admin/${plan.realm}/`);
    if (client.redirectUris)
      client.redirectUris = client.redirectUris.map((uri) =>
        uri
          .replaceAll(`/realms/${originalRealm}/`, `/realms/${plan.realm}/`)
          .replaceAll(`/admin/${originalRealm}/`, `/admin/${plan.realm}/`),
      );
    const app = ["studio", "neon", "mesh"].find(
      (name) => client.clientId === `${name}-web`,
    );
    if (app) {
      client.redirectUris = [`${plan.origins[app]}/api/auth/callback`];
      client.webOrigins = [plan.origins[app]];
      client.rootUrl = plan.origins[app];
      client.baseUrl = plan.origins[app];
    }
  }
  // Realm contains placeholders, not secret values; Keycloak's existing entrypoint supplies them.
  rmSync(join(plan.root, "realm-import", "local-realm.json"), { force: true });
  writeJson(join(plan.root, "realm-import", `${plan.realm}-realm.json`), realm);
  // Keycloak runs as a non-root image user. This file contains public realm configuration only.
  // Bind the directory with traversal access; secret files retain owner-only modes.
  chmodSync(join(plan.root, "realm-import"), 0o755);
  chmodSync(join(plan.root, "realm-import", `${plan.realm}-realm.json`), 0o644);
  writeJson(join(plan.root, "gateway.yaml"), {
    http: { routers: {}, services: {} },
  });
  // `docker compose config` retains Compose's $$ escaping for runtime shell expressions.
  writeJson(join(plan.root, "compose.json"), document);
  writeJson(join(plan.root, "manifest.json"), {
    ...plan,
    composeSha256: hash(JSON.stringify(document)),
  });
}

export function composeArgs(
  plan,
  documentPath = join(plan.root, "compose.json"),
) {
  return [
    "compose",
    "--project-name",
    plan.project,
    "--file",
    documentPath,
    ...plan.composeProfiles.flatMap((profile) => ["--profile", profile]),
  ];
}

export async function doctor(plan) {
  await assertLocalDocker();
  const pkg = readJson(join(plan.checkout, "package.json"));
  const pnpm = await command("pnpm", ["--version"]);
  const docker = JSON.parse(
    await command("docker", ["info", "--format", "{{json .}}"]),
  );
  const compose = await command("docker", ["compose", "version", "--short"]);
  const expectedPnpm = pkg.packageManager.split("@")[1].split("+")[0];
  const failures = [];
  if (process.platform !== "linux")
    failures.push(
      "The local source supervisor currently requires Linux/WSL process identity support",
    );
  if (process.versions.node !== pkg.engines.node)
    failures.push(
      `Node ${pkg.engines.node} required; found ${process.versions.node}`,
    );
  if (pnpm !== expectedPnpm)
    failures.push(`pnpm ${expectedPnpm} required; found ${pnpm}`);
  const available = existsSync("/proc/meminfo")
    ? Number(
        readFileSync("/proc/meminfo", "utf8").match(
          /^MemAvailable:\s+(\d+)/m,
        )?.[1],
      ) * 1024
    : freemem();
  return {
    node: process.versions.node,
    pnpm,
    compose,
    docker: {
      memoryBytes: docker.MemTotal,
      cpus: docker.NCPU,
      runningContainers: docker.ContainersRunning,
    },
    host: {
      memoryBytes: totalmem(),
      freeBytes: freemem(),
      availableBytes: available,
      logicalCpus: cpus().length,
    },
    failures,
    applicationReady: false,
  };
}

export async function measure(plan) {
  const resources = await inventory(plan);
  const ids = resources.container
    .filter((item) => item.State?.Running)
    .map((item) => item.Id);
  if (!ids.length)
    throw new Error("No running owned infrastructure to measure");
  const output = await command("docker", [
    "stats",
    "--no-stream",
    "--format",
    "{{json .}}",
    ...ids,
  ]);
  const samples = output.split("\n").map(JSON.parse);
  const memoryMiB = (usage) => {
    const match = usage.split(" / ")[0].match(/^([\d.]+)(B|KiB|MiB|GiB)$/);
    if (!match) throw new Error(`Unsupported Docker memory unit: ${usage}`);
    return (
      Number(match[1]) *
      { B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 }[match[2]]
    );
  };
  const totalMiB = samples.reduce(
    (sum, sample) => sum + memoryMiB(sample.MemUsage),
    0,
  );
  const { supervisorState } = await import("./supervisor.mjs");
  const supervisor = supervisorState(plan);
  let applicationProcesses = [];
  if (supervisor?.alive) {
    const rows = (await command("ps", ["-eo", "pid=,ppid=,rss="]))
      .split("\n")
      .map((line) => {
        const [pid, ppid, rssKiB] = line.trim().split(/\s+/).map(Number);
        return { pid, ppid, rssKiB };
      });
    const owned = new Set([supervisor.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows)
        if (owned.has(row.ppid) && !owned.has(row.pid)) {
          owned.add(row.pid);
          changed = true;
        }
    }
    applicationProcesses = rows.filter((row) => owned.has(row.pid));
  }
  const source = await sourceIdentity(plan.checkout);
  const sourcePath = join(plan.root, `source-${Date.now()}.json`);
  writeJson(sourcePath, source);
  const receipt = {
    schemaVersion: 1,
    evidenceType: "development-infrastructure-snapshot",
    at: new Date().toISOString(),
    environment: plan.id,
    preset: plan.preset,
    sourceRevision: await command("git", [
      "-C",
      plan.checkout,
      "rev-parse",
      "HEAD",
    ]),
    sourceDirty: Boolean(
      await command("git", ["-C", plan.checkout, "status", "--porcelain"]),
    ),
    source: {
      revision: source.revision,
      treeSha256: source.treeSha256,
      manifestPath: sourcePath,
    },
    containers: resources.container.map((item) => ({
      id: item.Id,
      service: item.Config.Labels["com.docker.compose.service"],
      imageId: item.Image,
      imageReference: item.Config.Image,
      startedAt: item.State.StartedAt,
    })),
    composeSha256: readJson(join(plan.root, "manifest.json")).composeSha256,
    machine: await doctor(plan),
    totalMiB: Math.round(totalMiB),
    applicationMemory: {
      metric: "sum-of-process-RSS-not-unique-working-set",
      totalMiB: Math.round(
        applicationProcesses.reduce((sum, item) => sum + item.rssKiB / 1024, 0),
      ),
      processes: applicationProcesses,
    },
    targetMiB: plan.resources.idleInfrastructureLimitMiB,
    withinTarget: totalMiB <= plan.resources.idleInfrastructureLimitMiB,
    samples,
    applicationReady: false,
    phase1Qualified: false,
  };
  writeJson(join(plan.root, `measurement-${Date.now()}.json`), receipt);
  return receipt;
}

export async function probeInfrastructure(plan) {
  const resources = await inventory(plan);
  for (const name of plan.services.filter(
    (service) => !service.endsWith("-init"),
  )) {
    const container = resources.container.find(
      (item) => item.Config.Labels["com.docker.compose.service"] === name,
    );
    if (!container?.State.Running)
      throw new Error(
        `Selected infrastructure service is not running: ${name}`,
      );
    for (const [target, bindings] of Object.entries(
      container.HostConfig.PortBindings ?? {},
    )) {
      if (
        bindings?.length &&
        !container.NetworkSettings.Ports?.[target]?.length
      )
        throw new Error(
          `Selected service did not publish its configured local port: ${name}`,
        );
    }
  }
  const paths = {
    telemetry: [3000, "/api/health"],
    secretstore: [8080, "/api/status"],
    metrics: [9090, "/-/ready"],
    logging: [3100, "/ready"],
    tracing: [3200, "/ready"],
    alertmanager: [9093, "/-/ready"],
    "memorycache-exporter": [9121, "/metrics"],
    dbconsole: [8081, "/"],
  };
  const results = await Promise.all(
    resources.container
      .filter(
        (item) =>
          item.State.Running &&
          paths[item.Config.Labels["com.docker.compose.service"]],
      )
      .map(async (item) => {
        const name = item.Config.Labels["com.docker.compose.service"];
        const [port, path] = paths[name];
        const address = Object.values(item.NetworkSettings.Networks).find(
          (network) => network.IPAddress,
        )?.IPAddress;
        if (!address)
          throw new Error(`Missing owned container address: ${name}`);
        for (let attempt = 0; attempt < 30; attempt++) {
          try {
            const response = await fetch(`http://${address}:${port}${path}`, {
              signal: AbortSignal.timeout(2000),
            });
            if (
              response.ok &&
              (name !== "memorycache-exporter" ||
                /^redis_up 1$/m.test(await response.text()))
            )
              return { service: name, ready: true };
          } catch {
            /* Retry startup-only readiness; no permission fallback. */
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error(`Infrastructure application probe failed: ${name}`);
      }),
  );
  if (plan.capabilities.includes("observability")) {
    const password = readFileSync(
      join(plan.root, "secrets/grafana-admin-password"),
      "utf8",
    );
    const response = await fetch(
      `http://127.0.0.1:${plan.ports.grafana}/api/user`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`athyper-admin:${password}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Grafana did not accept its configured local admin secret",
      );
    results.push({ service: "telemetry-configured-credential", ready: true });
  }
  return results;
}

export function recoverLock(registryRoot) {
  privateDirectory(registryRoot);
  const path = join(registryRoot, "operation.lock");
  if (!existsSync(path)) return { recovered: false };
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Invalid lifecycle lock");
  const lock = readJson(path);
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.children))
    throw new Error("Legacy lock requires manual process inspection");
  for (const pid of [lock.pid, ...lock.children]) {
    if (!Number.isInteger(pid) || pid < 1)
      throw new Error("Malformed lock process identity");
    try {
      process.kill(pid, 0);
      throw new Error(
        `Lifecycle process ${pid} is still present; recovery refused`,
      );
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  rmSync(path);
  return { recovered: true, previousOperationAt: lock.at };
}
