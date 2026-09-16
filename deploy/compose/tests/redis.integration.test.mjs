import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(root, "deploy/stackctl/package.json"));
const YAML = require("yaml");
const enabled = process.env.ATHYPER_REDIS_TESTS === "true";

test(
  "Shared Redis keeps credentials out of argv and persists sessions and jobs",
  { skip: !enabled },
  async () => {
    const project = `redis-secret-test-${randomBytes(6).toString("hex")}`;
    const directory = mkdtempSync(join(tmpdir(), `${project}-`));
    const file = join(directory, "compose.json");
    const password = `quoted " slash \\ space # café\nport 1\n${randomBytes(16).toString("hex")}`;
    const secretName = "redis-password";
    const secret = join(directory, "password");
    const serviceName = "memorycache";
    const source = "compose.yaml";
    const service = YAML.parse(
      readFileSync(join(root, "deploy/compose/instance", source), "utf8"),
    ).services[serviceName];
    const ceilingMb = 512;
    delete service.profiles;
    delete service.build;
    service.ports = ["127.0.0.1::6379"];
    service.restart = "no";
    service.networks = ["test"];
    service.volumes = service.volumes.map((volume) =>
      volume.startsWith("./")
        ? `${join(root, "deploy/compose/instance", volume)}`
        : "data:/data",
    );
    writeFileSync(secret, password, { mode: 0o600 });
    const exporter = YAML.parse(
      readFileSync(
        join(root, "deploy/compose/instance/compose.optional.yaml"),
        "utf8",
      ),
    ).services["memorycache-exporter"];
    delete exporter.profiles;
    delete exporter.depends_on;
    exporter.user = `${process.getuid()}:${process.getgid()}`;
    exporter.networks = ["test"];
    exporter.volumes = exporter.volumes.map(
      (volume) => `${join(root, "deploy/compose/instance", volume)}`,
    );
    writeFileSync(
      file,
      JSON.stringify({
        services: { [serviceName]: service, exporter },
        secrets: { [secretName]: { file: secret } },
        networks: { test: { internal: false } },
        volumes: { data: {} },
      }),
    );
    const run = (...args) => {
      const result = spawnSync("docker", args, {
        encoding: "utf8",
        timeout: 60000,
      });
      if (result.status !== 0)
        throw new Error(
          `Docker test command failed: ${(result.stderr || result.error?.message || "").replaceAll(password, "[redacted]")}`,
        );
      return result.stdout.trim();
    };
    const compose = (...args) =>
      run("compose", "-p", project, "-f", file, ...args);
    const exec = (...args) => compose("exec", "-T", serviceName, ...args);
    const redis = (...args) =>
      exec(
        "sh",
        "-c",
        `REDISCLI_AUTH="$(cat /run/secrets/${secretName})" exec redis-cli "$@"`,
        "sh",
        ...args,
      );
    const ready = async () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const id = compose("ps", "-aq", serviceName);
        const state = JSON.parse(run("inspect", id))[0].State;
        if (state.Status === "exited")
          throw new Error(
            compose("logs", serviceName).replaceAll(password, "[redacted]"),
          );
        try {
          if (redis("PING") === "PONG") return;
        } catch {
          /* Retry startup. */
        }
        await new Promise((done) => setTimeout(done, 200));
      }
      throw new Error("Redis failed authenticated readiness");
    };
    try {
      compose("up", "-d");
      await ready();
      {
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            if (
              /redis_up 1/.test(
                compose(
                  "exec",
                  "-T",
                  "exporter",
                  "wget",
                  "-qO-",
                  "http://127.0.0.1:9121/metrics",
                ),
              )
            )
              break;
          } catch {
            /* Wait for the exporter HTTP listener. */
          }
          await new Promise((done) => setTimeout(done, 200));
        }
        assert.match(
          compose(
            "exec",
            "-T",
            "exporter",
            "wget",
            "-qO-",
            "http://127.0.0.1:9121/metrics",
          ),
          /redis_up 1/,
        );
        assert.ok(
          !run("inspect", compose("ps", "-q", "exporter")).includes(password),
        );
        assert.ok(
          !compose("exec", "-T", "exporter", "cat", "/proc/1/cmdline").includes(
            password,
          ),
        );
      }
      assert.match(exec("redis-cli", "PING"), /NOAUTH/u);
      assert.equal(
        redis("CONFIG", "GET", "maxmemory"),
        `maxmemory\n${ceilingMb * 1024 * 1024}`,
      );
      assert.equal(
        redis("CONFIG", "GET", "maxmemory-policy"),
        "maxmemory-policy\nnoeviction",
      );
      assert.equal(redis("SET", "persistence-probe", "kept"), "OK");
      assert.match(exec("cat", "/proc/1/status"), /Uid:\s+999\s+999/u);
      assert.equal(
        exec("sh", "-c", "stat -c '%a:%u' /tmp/redis.conf.*"),
        "600:999",
      );
      assert.ok(!exec("cat", "/proc/1/cmdline").includes(password));
      const metadata = JSON.parse(
        run("inspect", compose("ps", "-q", serviceName)),
      )[0].Config;
      assert.ok(!JSON.stringify(metadata).includes(password));
      {
        const health = service.healthcheck.test[1].replaceAll("$$", "$");
        assert.doesNotMatch(health, /redis-cli[^|]*\s-a\s/u);
        exec("sh", "-c", health);
      }
      {
        const { Queue, Worker } = createRequire(
          join(root, "server/packages/runtime/jobs/package.json"),
        )("bullmq");
        const port = Number(
          compose("port", serviceName, "6379").split(":").at(-1),
        );
        const connection = {
          host: "127.0.0.1",
          port,
          password,
          maxRetriesPerRequest: null,
        };
        const queue = new Queue(project, { connection });
        const worker = new Worker(project, async (job) => job.data.value * 2, {
          connection,
        });
        try {
          await worker.waitUntilReady();
          const done = new Promise((resolve, reject) => {
            worker.once("completed", (_job, result) => resolve(result));
            worker.once("failed", (_job, error) => reject(error));
          });
          await queue.add("probe", { value: 21 });
          assert.equal(
            await Promise.race([
              done,
              new Promise((_, reject) => {
                const timer = setTimeout(
                  () => reject(new Error("BullMQ processing timed out")),
                  10000,
                );
                timer.unref();
              }),
            ]),
            42,
          );
          assert.equal(
            redis("SET", "session-probe", "session", "EX", "60"),
            "OK",
          );
          assert.ok(Number(redis("TTL", "session-probe")) > 0);
        } finally {
          await worker.close();
          await queue.close();
        }
      }
      // Force pressure without risking the host: existing sessions/jobs survive,
      // allocating writes and write-readiness fail while reads remain available.
      assert.equal(redis("CONFIG", "SET", "maxmemory", "1"), "OK");
      assert.match(redis("SET", "capacity-probe", "rejected"), /OOM/u);
      assert.match(
        compose(
          "exec",
          "-T",
          "exporter",
          "wget",
          "-qO-",
          "http://127.0.0.1:9121/metrics",
        ),
        /redis_errors_total\{err="OOM"\} [1-9]/,
      );
      assert.equal(redis("GET", "persistence-probe"), "kept");
      assert.equal(redis("PING"), "PONG");
      assert.match(redis("SET", "athyper:health:memorycache", "ok", "EX", "30"), /OOM/u);
      assert.match(redis("INFO", "stats"), /evicted_keys:0/u);
      assert.equal(
        redis("CONFIG", "SET", "maxmemory", String(ceilingMb * 1024 * 1024)),
        "OK",
      );
      compose("restart", serviceName);
      await ready();
      assert.equal(redis("GET", "persistence-probe"), "kept");
      compose("stop", serviceName);
      writeFileSync(secret, "");
      compose("start", serviceName);
      const id = compose("ps", "-aq", serviceName);
      for (let attempt = 0; attempt < 50; attempt++) {
        const state = JSON.parse(run("inspect", id))[0].State;
        if (state.Status === "exited") {
          assert.notEqual(state.ExitCode, 0);
          return;
        }
        await new Promise((done) => setTimeout(done, 200));
      }
      assert.fail("Empty password must fail closed");
    } finally {
      try {
        compose("down", "--volumes", "--timeout", "5");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);

for (const value of ["0", "-1", "allkeys-lru", "256\nport 1"]) {
  test(`Redis rejects invalid memory ceiling ${JSON.stringify(value)}`, () => {
    const result = spawnSync(
      "sh",
      [join(root, "deploy/compose/instance/scripts/start-redis.sh")],
      {
        encoding: "utf8",
        env: { ...process.env, REDIS_MAXMEMORY_MB: value },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /REDIS_MAXMEMORY_MB must be/);
  });
}
