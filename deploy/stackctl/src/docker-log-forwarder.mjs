#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_REFRESH_MS = 10_000;
const DEFAULT_FLUSH_MS = 500;
const MAX_QUEUE = 20_000;

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
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid option: ${key ?? "missing"}`);
    result[key.slice(2)] = value;
  }
  return result;
}

export function parseDockerLogLine(value, fallback = Date.now()) {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2}T\S+?Z)\s([\s\S]*)$/u);
  if (!match) return { timestampNs: String(BigInt(fallback) * 1_000_000n), line: String(value) };
  const milliseconds = Date.parse(match[1]);
  return {
    timestampNs: String(BigInt(Number.isFinite(milliseconds) ? milliseconds : fallback) * 1_000_000n),
    line: match[2],
  };
}

export function streamLabels(container, stream, defaults) {
  return {
    environment: defaults.environment,
    instance: defaults.instance,
    service: container.service,
    container: container.name,
    stream,
    source_revision: defaults.sourceRevision,
  };
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
  const listed = spawnSync("docker", ["ps", "--quiet", "--filter", `label=com.docker.compose.project=${project}`], { encoding: "utf8" });
  if (listed.status !== 0) throw new Error((listed.stderr || "docker ps failed").trim());
  const ids = listed.stdout.trim().split(/\s+/u).filter(Boolean);
  if (!ids.length) return [];
  const inspected = spawnSync("docker", ["inspect", ...ids], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (inspected.status !== 0) throw new Error((inspected.stderr || "docker inspect failed").trim());
  return JSON.parse(inspected.stdout).map((container) => ({
    id: container.Id,
    name: String(container.Name).replace(/^\//u, ""),
    service: container.Config.Labels?.["com.docker.compose.service"] ?? "unknown",
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
  stream.on("end", () => { if (pending) onLine(pending); });
}

export async function runDockerLogForwarder(configuration) {
  const children = new Map();
  const queue = [];
  let stopping = false;
  let flushing = false;
  const heartbeat = () => writeFileSync(configuration.heartbeatPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
  const enqueue = (container, stream, value) => {
    const parsed = parseDockerLogLine(value);
    queue.push({ ...parsed, labels: streamLabels(container, stream, configuration) });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  };
  const start = (container) => {
    const child = spawn("docker", ["logs", "--follow", "--timestamps", "--since", configuration.since, container.id], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.set(container.id, { child, container });
    lineReader(child.stdout, (line) => enqueue(container, "stdout", line));
    lineReader(child.stderr, (line) => enqueue(container, "stderr", line));
    child.on("exit", () => children.delete(container.id));
  };
  const discover = () => {
    try {
      const current = dockerContainers(configuration.project);
      const ids = new Set(current.map(({ id }) => id));
      for (const [id, entry] of children) if (!ids.has(id)) { entry.child.kill("SIGTERM"); children.delete(id); }
      for (const container of current) if (!children.has(container.id)) start(container);
      heartbeat();
    } catch (error) {
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
      if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
      process.stderr.write(`[forwarder] push failed: ${error.message}\n`);
    } finally { flushing = false; }
  };
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(discoveryTimer);
    clearInterval(flushTimer);
    for (const { child } of children.values()) child.kill("SIGTERM");
    await flush();
  };
  process.on("SIGTERM", () => { shutdown().finally(() => process.exit(0)); });
  process.on("SIGINT", () => { shutdown().finally(() => process.exit(0)); });
  discover();
  const discoveryTimer = setInterval(discover, configuration.refreshMs);
  const flushTimer = setInterval(flush, configuration.flushMs);
  await new Promise(() => {});
}

async function main(argv) {
  const parsed = options(argv);
  await runDockerLogForwarder({
    project: required(parsed, "project"), endpoint: required(parsed, "endpoint"),
    instance: required(parsed, "instance"), environment: required(parsed, "environment"),
    sourceRevision: required(parsed, "source-revision"), heartbeatPath: required(parsed, "heartbeat"),
    since: parsed.since ?? "5m", refreshMs: DEFAULT_REFRESH_MS, flushMs: DEFAULT_FLUSH_MS,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`docker-log-forwarder: ${error.message}\n`); process.exitCode = 1; });
}
