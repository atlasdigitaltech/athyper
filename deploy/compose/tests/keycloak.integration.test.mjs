import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
const require = createRequire(
  new URL("../../stackctl/package.json", import.meta.url),
);
const YAML = require("yaml");
test(
  "optimized Keycloak imports realms, authenticates, refreshes and restarts read-only",
  { skip: !process.env.ATHYPER_KEYCLOAK_TEST_IMAGE, timeout: 240000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "iam-optimized-"));
    chmodSync(directory, 0o755);
    const project = `iam-optimized-${randomBytes(6).toString("hex")}`;
    const source = YAML.parse(
      readFileSync("deploy/compose/instance/compose.yaml", "utf8"),
    );
    const iam = structuredClone(source.services.iam);
    iam.image = process.env.ATHYPER_KEYCLOAK_TEST_IMAGE;
    iam.restart = "no";
    iam.depends_on = { db: { condition: "service_started" } };
    iam.networks = ["test"];
    iam.ports = ["127.0.0.1::8080"];
    iam.environment = {
      ...iam.environment,
      KC_DB_URL: "jdbc:postgresql://db:5432/keycloak",
      KC_DB_USERNAME: "postgres",
      KC_HOSTNAME: "http://localhost:8080",
    };
    iam.volumes = iam.volumes.map((v) =>
      v.startsWith("./") ? resolve("deploy/compose/instance", v) : v,
    );
    const secrets = {};
    const password = randomBytes(20).toString("hex");
    for (const name of iam.secrets) {
      const file = join(directory, name);
      writeFileSync(file, password, { mode: 0o444 });
      secrets[name] = { file };
    }
    const db = {
      image: source.services.db.image,
      environment: { POSTGRES_PASSWORD: password, POSTGRES_DB: "keycloak" },
      networks: ["test"],
      tmpfs: ["/var/lib/postgresql/data"],
    };
    const file = join(directory, "compose.json");
    writeFileSync(
      file,
      JSON.stringify({
        services: { db, iam },
        secrets,
        networks: { test: {} },
        volumes: { "iam-data": {} },
      }),
    );
    const docker = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      assert.equal(
        r.status,
        0,
        (r.stderr ?? "").replaceAll(password, "[redacted]"),
      );
      return r.stdout.trim();
    };
    const compose = (...args) =>
      docker("compose", "-p", project, "-f", file, ...args);
    const ready = async () => {
      for (let i = 0; i < 120; i++) {
        const state = JSON.parse(
          docker("inspect", compose("ps", "-aq", "iam")),
        )[0].State;
        if (state.Health?.Status === "healthy") return;
        assert.notEqual(
          state.Status,
          "exited",
          "Keycloak exited during startup",
        );
        await new Promise((r) => setTimeout(r, 500));
      }
      assert.fail("Keycloak readiness timeout");
    };
    try {
      compose("up", "-d");
      await ready();
      let base = "http://" + compose("port", "iam", "8080");
      const request = (path, options) =>
        fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
      const token = async (body) => {
        const r = await request(
          "/realms/master/protocol/openid-connect/token",
          { method: "POST", body: new URLSearchParams(body) },
        );
        assert.equal(r.status, 200);
        return r.json();
      };
      const tokens = await token({
        grant_type: "password",
        client_id: "admin-cli",
        username: "athyper-admin",
        password,
      });
      assert.ok(tokens.access_token);
      const refreshed = await token({
        grant_type: "refresh_token",
        client_id: "admin-cli",
        refresh_token: tokens.refresh_token,
      });
      assert.ok(refreshed.access_token);
      for (const realm of ["athyper", "platform-control"]) {
        const response = await request(
          `/realms/${realm}/.well-known/openid-configuration`,
        );
        assert.equal(response.status, 200, realm);
      }
      const providers = await request(
        "/admin/realms/master/authentication/authenticator-providers",
        { headers: { Authorization: `Bearer ${refreshed.access_token}` } },
      );
      assert.equal(providers.status, 200);
      assert.ok(
        (await providers.json()).some(
          (p) => p.id === "athyper-iam-username-password-form",
        ),
      );
      const logout = await request(
        "/realms/master/protocol/openid-connect/logout",
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: "admin-cli",
            refresh_token: refreshed.refresh_token,
          }),
        },
      );
      assert.equal(logout.status, 204);
      const rejected = await request(
        "/realms/master/protocol/openid-connect/token",
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: "admin-cli",
            grant_type: "refresh_token",
            refresh_token: refreshed.refresh_token,
          }),
        },
      );
      assert.equal(rejected.status, 400);
      const inspect = JSON.parse(
        docker("inspect", compose("ps", "-q", "iam")),
      )[0];
      assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
      assert.deepEqual(inspect.HostConfig.CapDrop, ["ALL"]);
      compose("restart", "iam");
      await ready();
      base = "http://" + compose("port", "iam", "8080");
      await token({
        grant_type: "password",
        client_id: "admin-cli",
        username: "athyper-admin",
        password,
      });
      const logs = compose("logs", "iam");
      assert.doesNotMatch(
        logs,
        /Quarkus augmentation completed|Updating the configuration and installing your custom providers|Running the server in development mode/,
      );
    } finally {
      compose("down", "--volumes", "--timeout", "10");
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
