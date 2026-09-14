import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
test(
  "application OpenTelemetry adapter exports a searchable trace to Tempo",
  { skip: process.env.ATHYPER_TRACING_TESTS !== "true", timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "tracing-audit-")),
      project = "trace-audit-" + Date.now(),
      file = join(dir, "compose.json");
    const docker = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const compose = (...args) =>
      docker("compose", "-p", project, "-f", file, ...args);
    try {
      const base = join(root, "deploy/compose/instance");
      const tracing = YAML.parse(
        readFileSync(join(base, "compose.optional.yaml"), "utf8"),
      ).services.tracing;
      delete tracing.profiles;
      delete tracing.build;
      tracing.networks = ["test"];
      tracing.restart = "no";
      tracing.ports = ["127.0.0.1::4317", "127.0.0.1::3200"];
      tracing.volumes = tracing.volumes.map((v) =>
        v.startsWith(".") ? resolve(base, v) : v,
      );
      writeFileSync(
        file,
        JSON.stringify({
          services: { tracing },
          volumes: { "tracing-data": {} },
          networks: { test: {} },
        }),
      );
      compose("up", "-d", "--wait", "--wait-timeout", "60");
      const result = spawnSync(
        "pnpm",
        ["exec", "tsx", "deploy/compose/tests/fixtures/export-trace.ts"],
        {
          cwd: root,
          env: {
            ...process.env,
            AUDIT_OTLP_ENDPOINT: `http://${compose("port", "tracing", "4317")}`,
          },
          encoding: "utf8",
          timeout: 30000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      let found = false;
      for (let i = 0; i < 30; i++) {
        const response = await fetch(
          `http://${compose("port", "tracing", "3200")}/api/search?tags=${encodeURIComponent("service.name=wiring-audit-api")}`,
        );
        assert.equal(response.status, 200);
        const data = await response.json();
        if (
          data.traces?.some(
            (trace) => trace.rootTraceName === "wiring-audit-span",
          )
        ) {
          found = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      assert.ok(
        found,
        "trace emitted by the real application adapter must be searchable",
      );
    } finally {
      try {
        compose("down", "--volumes", "--timeout", "5");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  },
);
