import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
test(
  "job-store exhaustion and restart leave session and secret stores writable",
  { skip: process.env.ATHYPER_REDIS_TESTS !== "true", timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "athyper-redis-isolation-")),
      project = "redis-isolation-" + Date.now();
    const run = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const compose = (...args) =>
      run("compose", "-p", project, "-f", join(dir, "compose.json"), ...args);
    const base = YAML.parse(
      readFileSync(join(root, "deploy/compose/instance/compose.yaml"), "utf8"),
    );
    const services = {},
      volumes = {};
    for (const name of ["memorycache", "jobqueue", "secretstore-cache"]) {
      const s = structuredClone(base.services[name]);
      delete s.profiles;
      delete s.build;
      s.image = process.env.ATHYPER_IMAGE_REDIS || "athyper/valkey:8.1.10";
      s.environment = { REDIS_MAXMEMORY_MB: "16" };
      s.mem_limit = "64m";
      s.networks = ["test"];
      s.restart = "no";
      s.volumes = [
        `${name}-data:/data`,
        `${root}/deploy/compose/instance/scripts/start-redis.sh:/athyper/bin/start-redis.sh:ro`,
      ];
      volumes[`${name}-data`] = {};
      services[name] = s;
    }
    const runtimeImage = process.env.ATHYPER_RUNTIME_TEST_IMAGE;
    if (runtimeImage) {
      const probe = `import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire("${root}/packages/platform/iam/session-store/package.json");
const Redis = require("ioredis");
const redis = new Redis({host:"jobqueue",password:readFileSync("/run/secrets/redis-password","utf8"),maxRetriesPerRequest:1});
try { await redis.set("scheduler-probe", "ready", "EX", 60); writeFileSync("/tmp/ready", "ok"); }
catch { console.error("[fatal] boot_failed Redis unavailable"); process.exit(1); }
setInterval(()=>{},1000);
`;
      writeFileSync(join(dir, "probe.mjs"), probe);
      services["scheduler-probe"] = {
        profiles: ["recovery"],
        image: runtimeImage,
        restart: "on-failure",
        working_dir: root,
        entrypoint: ["node", "--input-type=module", "-e"],
        command: [
          `import { watchRuntime } from "./tooling/scripts/local-dev/watch-runtime.mjs"; process.exitCode = await watchRuntime(process.execPath,["node_modules/tsx/dist/cli.mjs","watch","/probe.mjs"]);`,
        ],
        volumes: [`${root}:${root}:ro`, `${dir}/probe.mjs:/probe.mjs:ro`],
        secrets: ["redis-password"],
        networks: ["test"],
        tmpfs: ["/tmp"],
        mem_limit: "512m",
      };
    }
    writeFileSync(join(dir, "password"), "isolation-test-only", {
      mode: 0o600,
    });
    writeFileSync(
      join(dir, "compose.json"),
      JSON.stringify({
        services,
        volumes,
        networks: { test: {} },
        secrets: { "redis-password": { file: join(dir, "password") } },
      }),
    );
    const redis = (name, ...args) =>
      compose(
        "exec",
        "-T",
        name,
        "sh",
        "-c",
        'REDISCLI_AUTH="$(cat /run/secrets/redis-password)" exec redis-cli "$@"',
        "sh",
        ...args,
      );
    try {
      compose("up", "-d", "--wait", "--wait-timeout", "30");
      assert.equal(redis("jobqueue", "SET", "pending-work", "preserved"), "OK");
      assert.equal(redis("jobqueue", "CONFIG", "SET", "maxmemory", "1"), "OK");
      assert.match(redis("jobqueue", "SET", "new-job", "rejected"), /OOM/);
      assert.equal(
        redis("memorycache", "SET", "session", "works", "EX", "60"),
        "OK",
      );
      assert.equal(
        redis("secretstore-cache", "SET", "secret-cache", "works", "EX", "60"),
        "OK",
      );
      assert.equal(redis("jobqueue", "GET", "pending-work"), "preserved");
      if (runtimeImage) {
        compose("up", "-d", "scheduler-probe");
        for (let attempt = 0; ; attempt++) {
          const id = compose("ps", "-aq", "scheduler-probe");
          const state = JSON.parse(run("inspect", id))[0];
          if (state.RestartCount > 0) break;
          assert.ok(attempt < 50, "fatal boot did not trigger Docker restart");
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      compose("restart", "jobqueue");
      for (let attempt = 0; ; attempt++) {
        try {
          if (redis("jobqueue", "SET", "new-job", "recovered") === "OK") break;
        } catch {}
        assert.ok(attempt < 30, "job store did not recover");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.equal(redis("jobqueue", "GET", "pending-work"), "preserved");
      if (runtimeImage) {
        for (let attempt = 0; ; attempt++) {
          if (redis("jobqueue", "GET", "scheduler-probe") === "ready") break;
          assert.ok(
            attempt < 50,
            "watcher did not recover after Redis restart",
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } finally {
      compose("down", "--volumes", "--timeout", "5");
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
