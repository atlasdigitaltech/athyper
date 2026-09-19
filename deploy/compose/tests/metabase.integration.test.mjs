import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "Metabase runs as UID 2000 on a read-only root with PostgreSQL and survives restart",
  { skip: process.env.ATHYPER_METABASE_TESTS !== "true", timeout: 300000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "metabase-audit-"));
    chmodSync(dir, 0o755);
    const project = "metabase-audit-" + Date.now(),
      file = join(dir, "compose.json");
    const docker = (...args) => {
      const r = spawnSync("docker", args, {
        encoding: "utf8",
        timeout: 180000,
      });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const compose = (...args) =>
      docker("compose", "-p", project, "-f", file, ...args);
    const sourceDir = join(root, "deploy/compose/instance");
    const optional = YAML.parse(
      readFileSync(join(sourceDir, "compose.optional.yaml"), "utf8"),
    );
    const base = YAML.parse(
      readFileSync(join(sourceDir, "compose.yaml"), "utf8"),
    );
    const services = {},
      secrets = {};
    try {
      for (const name of ["postgres-password", "analytics-db-password"]) {
        writeFileSync(join(dir, name), " Synthetic:/?@ password ", {
          mode: 0o600,
        });
        secrets[name] = { file: join(dir, name) };
      }
      for (const name of ["db", "analytics-db-init", "analyticsboard"]) {
        const service = structuredClone(
          (name === "db" ? base : optional).services[name],
        );
        delete service.profiles;
        delete service.build;
        delete service.ports;
        service.restart = "no";
        service.networks = ["test"];
        service.volumes = (service.volumes ?? []).map((v) =>
          v.startsWith(".") ? resolve(sourceDir, v) : v,
        );
        services[name] = service;
      }
      services.analyticsboard.ports = ["127.0.0.1::3000"];
      writeFileSync(
        file,
        JSON.stringify({
          services,
          secrets,
          volumes: { "db-data": {} },
          networks: { test: {} },
        }),
      );
      compose("up", "-d", "--wait", "--wait-timeout", "180");
      for (const round of [0, 1]) {
        if (round) compose("restart", "analyticsboard");
        const url = `http://${compose("port", "analyticsboard", "3000")}/api/health`;
        let ready = false;
        for (let i = 0; i < 120; i++) {
          try {
            if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) {
              ready = true;
              break;
            }
          } catch {}
          await pause(1000);
        }
        assert.ok(ready, "Metabase must become ready");
        const proc = compose(
          "exec",
          "-T",
          "analyticsboard",
          "sh",
          "-c",
          'for p in /proc/[0-9]*/comm; do if [ "$(cat "$p")" = java ]; then cat "${p%comm}status"; fi; done',
        );
        assert.match(proc, /Uid:\s+2000\s+2000/);
        assert.match(proc, /CapEff:\s+0+\b/);
        const info = JSON.parse(
          docker("inspect", compose("ps", "-q", "analyticsboard")),
        )[0];
        assert.equal(info.HostConfig.ReadonlyRootfs, true);
        assert.match(
          compose(
            "exec",
            "-T",
            "db",
            "psql",
            "-U",
            "postgres",
            "-d",
            "athyper_analytics",
            "-Atc",
            "select count(*) > 0 from information_schema.tables where table_schema='public'",
          ),
          /^t$/,
        );
      }
    } catch (error) {
      console.error(compose("logs", "--tail", "50", "analyticsboard"));
      throw error;
    } finally {
      try {
        compose("down", "--volumes", "--timeout", "5");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  },
);
