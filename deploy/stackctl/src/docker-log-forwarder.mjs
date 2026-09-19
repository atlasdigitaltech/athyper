#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REFRESH_MS = 10_000;
const DEFAULT_FLUSH_MS = 500;
const MAX_QUEUE = 20_000;

export function retainNewest(entries, maximum = MAX_QUEUE) {
  if (entries.length > maximum) entries.splice(0, entries.length - maximum);
}

function required(options, name) {
  const value = options[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--"))
      throw new Error(`invalid option: ${key ?? "missing"}`);
    result[key.slice(2)] = value;
  }
  return result;
}

export function parseDockerLogLine(value, fallback = Date.now()) {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2}T\S+?Z)\s([\s\S]*)$/u);
  if (!match)
    return {
      timestampNs: String(BigInt(fallback) * 1_000_000n),
      line: String(value),
    };
  const milliseconds = Date.parse(match[1]);
  return {
    timestampNs: String(
      BigInt(Number.isFinite(milliseconds) ? milliseconds : fallback) *
        1_000_000n,
    ),
    line: match[2],
  };
}

export function streamLabels(container, stream, defaults) {
  defaults = container.labels ?? defaults;
  return {
    environment: defaults.environment,
    instance: defaults.instance,
    service: container.service,
    container: container.name,
    stream,
    source_revision: defaults.sourceRevision,
  };
}

// Only collect controller-owned, running instances. Re-read receipts on every
// discovery pass so up/down and project replacements need no forwarder restart.
export function readLogSources(path) {
  const document = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(document.instances))
    throw new Error("log sources must declare an instances array");
  const seen = new Set();
  for (const source of document.instances) {
    if (
      !source ||
      !["dev", "qa", "stg"].includes(source.instance) ||
      !["development", "testing", "staging", "local"].includes(
        source.environment,
      ) ||
      seen.has(source.instance)
    ) {
      throw new Error(
        "log sources require unique DEV/QA/STG instances and non-production environments",
      );
    }
    seen.add(source.instance);
  }
  return document.instances;
}

export function managedProjects(root, sources) {
  const directory = join(root, "instances");
  if (!existsSync(directory)) return [];
  const projects = [];
  for (const source of sources) {
    const instance = source.instance;
    const path = join(directory, instance, "receipts", "active.json");
    if (!existsSync(path)) continue;
    try {
      const receipt = JSON.parse(readFileSync(path, "utf8"));
      if (
        receipt.kind !== "ActiveInstanceReceipt" ||
        receipt.metadata?.instance !== instance ||
        receipt.spec?.state !== "running"
      )
        continue;
      const project = receipt.spec.project;
      if (
        typeof project !== "string" ||
        !/^[a-z0-9][a-z0-9_-]*$/u.test(project)
      )
        continue;
      let environment = source.environment;
      const targetsPath = join(
        root,
        "operations",
        "prometheus-targets",
        `${instance}.json`,
      );
      if (existsSync(targetsPath)) {
        const target = JSON.parse(readFileSync(targetsPath, "utf8")).find(
          (item) => item.labels?.instance === instance,
        );
        environment = target?.labels?.environment ?? environment;
      }
      if (!["development", "testing", "staging", "local"].includes(environment))
        continue;
      projects.push({
        project,
        instance,
        environment,
        sourceRevision: receipt.spec.sourceRevision ?? "unknown",
      });
    } catch {
      // Invalid/partially replaced ownership evidence never grants collection.
      process.stderr.write(
        `[forwarder] skipping invalid receipt for ${instance}\n`,
      );
    }
  }
  return projects;
}

export function lokiPayload(entries) {
  const streams = new Map();
  for (const entry of entries) {
    const key = JSON.stringify(entry.labels);
    const current = streams.get(key) ?? { stream: entry.labels, values: [] };
    current.values.push([entry.timestampNs, entry.line]);
    streams.set(key, current);
  }
  return { streams: [...streams.values()] };
}

function dockerContainers(project) {
  const listed = spawnSync(
    "docker",
    [
      "ps",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ],
    { encoding: "utf8" },
  );
  if (listed.status !== 0)
    throw new Error((listed.stderr || "docker ps failed").trim());
  const ids = listed.stdout.trim().split(/\s+/u).filter(Boolean);
  if (!ids.length) return [];
  const inspected = spawnSync("docker", ["inspect", ...ids], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (inspected.status !== 0)
    throw new Error((inspected.stderr || "docker inspect failed").trim());
  return JSON.parse(inspected.stdout).map((container) => ({
    id: container.Id,
    name: String(container.Name).replace(/^\//u, ""),
    service:
      container.Config.Labels?.["com.docker.compose.service"] ?? "unknown",
  }));
}

function lineReader(stream, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) if (line) onLine(line);
  });
  stream.on("end", () => {
    if (pending) onLine(pending);
  });
}

export async function runDockerLogForwarder(configuration) {
  const children = new Map();
  const queue = [];
  let stopping = false;
  let flushing = false;
  const heartbeat = () =>
    writeFileSync(
      configuration.heartbeatPath,
      `${new Date().toISOString()}\n`,
      { mode: 0o600 },
    );
  const enqueue = (container, stream, value) => {
    const parsed = parseDockerLogLine(value);
    queue.push({
      ...parsed,
      labels: streamLabels(container, stream, configuration),
    });
    retainNewest(queue);
  };
  const start = (container) => {
    const child = spawn(
      "docker",
      [
        "logs",
        "--follow",
        "--timestamps",
        "--since",
        configuration.since,
        container.id,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.set(container.id, { child, container });
    lineReader(child.stdout, (line) => enqueue(container, "stdout", line));
    lineReader(child.stderr, (line) => enqueue(container, "stderr", line));
    child.on("exit", () => children.delete(container.id));
  };
  const discover = () => {
    try {
      const projects = configuration.runtimeRoot
        ? managedProjects(
            configuration.runtimeRoot,
            readLogSources(configuration.sourcesPath),
          )
        : [configuration];
      const current = projects.flatMap((project) =>
        dockerContainers(project.project).map((container) => ({
          ...container,
          labels: project,
        })),
      );
      const ids = new Set(current.map(({ id }) => id));
      const instances = new Set(projects.map((project) => project.instance));
      for (let index = queue.length - 1; index >= 0; index--)
        if (!instances.has(queue[index].labels.instance))
          queue.splice(index, 1);
      for (const [id, entry] of children)
        if (!ids.has(id)) {
          entry.child.kill("SIGTERM");
          children.delete(id);
        }
      for (const container of current) {
        const existing = children.get(container.id);
        if (!existing) start(container);
        else existing.container.labels = container.labels;
      }
      heartbeat();
    } catch (error) {
      // Revoked/invalid configuration must not leave previous projects streaming.
      for (const { child } of children.values()) child.kill("SIGTERM");
      children.clear();
      queue.length = 0;
      process.stderr.write(`[forwarder] discovery failed: ${error.message}\n`);
    }
  };
  const flush = async () => {
    if (flushing || !queue.length) return;
    flushing = true;
    const batch = queue.splice(0, 500);
    try {
      const response = await fetch(configuration.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lokiPayload(batch)),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      heartbeat();
    } catch (error) {
      queue.unshift(...batch);
      retainNewest(queue);
      process.stderr.write(`[forwarder] push failed: ${error.message}\n`);
    } finally {
      flushing = false;
    }
  };
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(discoveryTimer);
    clearInterval(flushTimer);
    for (const { child } of children.values()) child.kill("SIGTERM");
    await flush();
  };
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  discover();
  const discoveryTimer = setInterval(discover, configuration.refreshMs);
  const flushTimer = setInterval(flush, configuration.flushMs);
  await new Promise(() => {});
}

async function main(argv) {
  const parsed = options(argv);
  await runDockerLogForwarder({
    ...(parsed["runtime-root"]
      ? {
          runtimeRoot: parsed["runtime-root"],
          sourcesPath: required(parsed, "sources"),
        }
      : {
          project: required(parsed, "project"),
          instance: required(parsed, "instance"),
          environment: required(parsed, "environment"),
          sourceRevision: required(parsed, "source-revision"),
        }),
    endpoint: required(parsed, "endpoint"),
    heartbeatPath: required(parsed, "heartbeat"),
    since: parsed.since ?? "5m",
    refreshMs: DEFAULT_REFRESH_MS,
    flushMs: DEFAULT_FLUSH_MS,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`docker-log-forwarder: ${error.message}\n`);
    process.exitCode = 1;
  });
}
