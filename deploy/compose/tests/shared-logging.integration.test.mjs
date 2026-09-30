import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { stopForwarder } from "../../stackctl/src/operations-execution.mjs";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "shared push-only collection ingests each configured instance and honors revocation",
  { skip: process.env.ATHYPER_LOGGING_TESTS !== "true", timeout: 180000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-logs-")),
      project = "logs-audit-" + Date.now(),
      file = join(dir, "compose.json");
    const docker = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const compose = (...args) =>
      docker("compose", "-p", project, "-f", file, ...args);
    const base = join(root, "deploy/compose/operations"),
      source = YAML.parse(readFileSync(join(base, "compose.yaml"), "utf8"));
    const sourcesPath = join(dir, "sources.json"),
      configured = [
        { instance: "dev", environment: "development" },
        { instance: "qa", environment: "testing" },
      ];
    let forwarder;
    const containers = [];
    try {
      const services = {};
      for (const name of ["logging", "logshipper"]) {
        const s = structuredClone(source.services[name]);
        delete s.build;
        s.restart = "no";
        s.networks = ["test"];
        s.ports = [`127.0.0.1::${name === "logging" ? 3100 : 3500}`];
        s.volumes = s.volumes.map((v) =>
          v.startsWith(".") ? resolve(base, v) : v,
        );
        services[name] = s;
      }
      writeFileSync(
        file,
        JSON.stringify({
          services,
          volumes: { "logging-data": {} },
          networks: { test: {} },
        }),
      );
      compose("up", "-d", "--wait", "--wait-timeout", "60");
      for (const instance of ["dev", "qa", "stg"]) {
        const target = project + "-" + instance;
        containers.push(target);
        const receiptDir = join(dir, "instances", instance, "receipts");
        mkdirSync(receiptDir, { recursive: true });
        writeFileSync(
          join(receiptDir, "active.json"),
          JSON.stringify({
            kind: "ActiveInstanceReceipt",
            metadata: { instance },
            spec: {
              state: "running",
              project: target,
              sourceRevision: instance + "-revision",
            },
          }),
        );
        docker(
          "run",
          "-d",
          "--name",
          target,
          "--network",
          "none",
          "--label",
          `com.docker.compose.project=${target}`,
          "--label",
          "com.docker.compose.service=api",
          "busybox:1.36",
          "sh",
          "-c",
          "while true; do echo initial-audit; sleep 1; done",
        );
      }
      writeFileSync(sourcesPath, JSON.stringify({ instances: configured }));
      forwarder = spawn(
        process.execPath,
        [
          join(root, "deploy/stackctl/src/docker-log-forwarder.mjs"),
          "--runtime-root",
          dir,
          "--sources",
          sourcesPath,
          "--endpoint",
          `http://${compose("port", "logshipper", "3500")}/loki/api/v1/push`,
          "--heartbeat",
          join(dir, "heartbeat"),
        ],
        { stdio: "ignore" },
      );
      const query = async (instance, token) => {
        const expr = `{instance="${instance}"} |= "${token}"`;
        const response = await fetch(
          `http://${compose("port", "logging", "3100")}/loki/api/v1/query_range?query=${encodeURIComponent(expr)}`,
        );
        assert.equal(response.status, 200);
        return (await response.json()).data.result;
      };
      for (const instance of ["dev", "qa"]) {
        let entries = [];
        for (let i = 0; i < 45; i++) {
          entries = await query(instance, "initial-audit");
          if (entries.length) break;
          await pause(1000);
        }
        assert.ok(
          entries.length,
          `${instance} log must reach Loki through Alloy`,
        );
        assert.equal(entries[0].stream.source_revision, instance + "-revision");
        assert.equal(entries[0].stream.service, "api");
      }
      assert.deepEqual(
        await query("stg", "initial-audit"),
        [],
        "unconfigured managed instance must be excluded",
      );
      writeFileSync(
        sourcesPath,
        JSON.stringify({ instances: [configured[0]] }),
      );
      await pause(12000);
      for (const instance of ["dev", "qa"])
        docker(
          "exec",
          project + "-" + instance,
          "sh",
          "-c",
          "echo after-revocation > /proc/1/fd/1",
        );
      let entries = [];
      for (let i = 0; i < 15; i++) {
        entries = await query("dev", "after-revocation");
        if (entries.length) break;
        await pause(1000);
      }
      assert.ok(entries.length);
      assert.deepEqual(await query("qa", "after-revocation"), []);
    } finally {
      if (forwarder) {
        const pidPath = join(dir, "forwarder.pid");
        writeFileSync(pidPath, `${forwarder.pid}\n`);
        stopForwarder(pidPath);
        await Promise.race([
          new Promise((r) => forwarder.once("exit", r)),
          pause(6000),
        ]);
        if (forwarder.exitCode === null) forwarder.kill("SIGKILL");
      }
      for (const name of containers)
        spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
      try {
        compose("down", "--volumes", "--timeout", "5");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  },
);
