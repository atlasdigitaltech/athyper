// Opt-in: ATHYPER_TEST_IAM_IMAGE=<optimized-image> node deploy/compose/tests/hardening.integration.mjs
// Uses only uniquely named disposable containers, networks, volumes and secrets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  chownSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(root, "deploy/stackctl/package.json"));
const YAML = require("yaml");
const base = YAML.parse(
  readFileSync(join(root, "deploy/compose/instance/compose.yaml"), "utf8"),
);
const iamImage = process.env.ATHYPER_TEST_IAM_IMAGE;
if (!iamImage)
  throw new Error(
    "Set ATHYPER_TEST_IAM_IMAGE to an optimized IAM image built from deploy/config/iam with health support",
  );
const project = `hardening-${randomBytes(6).toString("hex")}`;
const directory = mkdtempSync(join(tmpdir(), `${project}-`));
const file = join(directory, "compose.json");
const password = randomBytes(24).toString("hex");
const secrets = {};
let servicesCreated = false;
function command(args, input, env = process.env) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    env,
    timeout: 180000,
  });
  if (result.status !== 0)
    throw new Error(
      `docker ${args.slice(0, 2).join(" ")} failed: ${(result.stderr || result.error?.message || "").replaceAll(password, "[redacted]")}`,
    );
  return result.stdout.trim();
}
const compose = (...args) =>
  command(["compose", "-p", project, "-f", file, ...args]);
const exec = (service, ...args) => compose("exec", "-T", service, ...args);
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));
async function healthy(service) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const id = compose("ps", "-aq", service);
    if (id) {
      const state = JSON.parse(command(["inspect", id]))[0].State;
      if (state.Health?.Status === "healthy") return;
      if (state.Status === "exited") break;
    }
    await pause();
  }
  throw new Error(
    `${service} failed readiness: ${compose("logs", "--tail", "30", service).replaceAll(password, "[redacted]")}`,
  );
}
// Render all checked-in overlays with their required predecessors, without
// starting any real instance or loading its secrets.
const composeDirectory = join(root, "deploy/compose/instance");
const overlays = readdirSync(composeDirectory).filter((name) =>
  /^compose.*\.yaml$/u.test(name),
);
const configEnv = { ...process.env, ATHYPER_RUNTIME_ROOT: directory };
for (const name of overlays) {
  for (const match of readFileSync(
    join(composeDirectory, name),
    "utf8",
  ).matchAll(/\$\{([A-Z_0-9]+):\?[^}]*\}/gu)) {
    configEnv[match[1]] = directory;
  }
}
// Observability/admin services (metrics, telemetry, dbconsole, etc.) sit
// behind profiles and are otherwise omitted from rendered config entirely.
const HARDENED_SERVICES = {
  db: {
    capDrop: ["ALL"],
    capAdd: ["CHOWN", "FOWNER", "DAC_READ_SEARCH", "SETUID", "SETGID"],
    readOnly: true,
  },
  memorycache: {
    capDrop: ["ALL"],
    capAdd: ["CHOWN", "DAC_READ_SEARCH", "SETUID", "SETGID"],
    readOnly: true,
  },
  objectstorage: { capDrop: ["ALL"], readOnly: true },
  "objectstorage-init": { capDrop: ["ALL"], readOnly: true },
  iam: { capDrop: ["ALL"] },
  metrics: { capDrop: ["ALL"], readOnly: true },
  logging: { capDrop: ["ALL"], readOnly: true },
  tracing: { capDrop: ["ALL"], readOnly: true },
  alertmanager: { capDrop: ["ALL"], readOnly: true },
  telemetry: {
    capDrop: ["ALL"],
    capAdd: ["DAC_READ_SEARCH", "SETUID", "SETGID"],
    readOnly: true,
  },
  analyticsboard: {
    capDrop: ["ALL"],
    capAdd: ["DAC_READ_SEARCH", "SETUID", "SETGID"],
    readOnly: true,
  },
  "secretstore-db-init": {
    capDrop: ["ALL"],
    capAdd: ["DAC_READ_SEARCH"],
    readOnly: true,
  },
  "analytics-db-init": {
    capDrop: ["ALL"],
    capAdd: ["DAC_READ_SEARCH"],
    readOnly: true,
  },
  dbconsole: { capDrop: ["ALL"], readOnly: true },
  queueconsole: { capDrop: ["ALL"], readOnly: true },
  statuswatch: {
    capDrop: ["ALL"],
    capAdd: ["CHOWN", "SETUID", "SETGID"],
    readOnly: true,
  },
};
function assertHardened(config, label) {
  for (const [name, expected] of Object.entries(HARDENED_SERVICES)) {
    const service = config.services[name];
    if (!service) continue; // not every service exists in every stack/overlay
    assert.deepEqual(
      [...(service.cap_drop ?? [])].sort(),
      [...expected.capDrop].sort(),
      `${label}/${name}: cap_drop`,
    );
    assert.deepEqual(
      [...(service.cap_add ?? [])].sort(),
      [...(expected.capAdd ?? [])].sort(),
      `${label}/${name}: cap_add`,
    );
    if (expected.readOnly)
      assert.equal(
        service.read_only,
        true,
        `${label}/${name}: root filesystem`,
      );
  }
}
try {
  for (const instance of ["dev", "qa", "stg"]) {
    for (const overlay of [
      null,
      ...overlays.filter(
        (name) => !["compose.yaml", "compose.parity.yaml"].includes(name),
      ),
    ]) {
      const inputs = ["compose.yaml", "compose.parity.yaml"];
      if (
        [
          "compose.publication-secretstore.yaml",
          "compose.observability.yaml",
        ].includes(overlay)
      )
        inputs.push("compose.optional.yaml");
      if (overlay === "compose.publication-authoring.yaml")
        inputs.push("compose.publication.yaml");
      if (overlay) inputs.push(overlay);
      const config = JSON.parse(
        command(
          [
            "compose",
            "--profile",
            "*",
            ...inputs.flatMap((name) => ["-f", join(composeDirectory, name)]),
            "config",
            "--format",
            "json",
          ],
          undefined,
          { ...configEnv, ATHYPER_INSTANCE: instance },
        ),
      );
      assertHardened(config, `${instance}/${overlay}`);
    }
  }
  console.log("DEV/QA/STG rendered overlays preserve hardening");
  {
    const operationsDirectory = join(root, "deploy/compose/operations");
    const opsEnv = { ...process.env, ATHYPER_RUNTIME_ROOT: directory };
    for (const match of readFileSync(
      join(operationsDirectory, "compose.yaml"),
      "utf8",
    ).matchAll(/\$\{([A-Z_0-9]+):\?[^}]*\}/gu)) {
      opsEnv[match[1]] = directory;
    }
    const opsConfig = JSON.parse(
      command(
        [
          "compose",
          "--profile",
          "*",
          "-f",
          join(operationsDirectory, "compose.yaml"),
          "config",
          "--format",
          "json",
        ],
        undefined,
        opsEnv,
      ),
    );
    assertHardened(opsConfig, "operations");
  }
  console.log("Operations rendered config preserves hardening");
  const services = {};
  for (const name of [
    "db",
    "memorycache",
    "objectstorage",
    "objectstorage-init",
    "iam",
  ]) {
    const service = structuredClone(base.services[name]);
    delete service.depends_on;
    delete service.ports;
    service.restart = "no";
    service.networks = ["test"];
    service.volumes = (service.volumes ?? []).map((value) =>
      value.startsWith("./")
        ? `${root}/deploy/compose/instance/${value.slice(2)}`
        : value,
    );
    if (name === "iam") {
      service.image = iamImage;
      service.environment.KC_HOSTNAME = "http://localhost:8080";
      service.ports = ["127.0.0.1::8080"];
      service.networks.push("client");
    }
    if (service.healthcheck) {
      service.healthcheck.interval = "1s";
      service.healthcheck.retries = 150;
    }
    for (const secret of service.secrets) {
      if (secrets[secret]) continue;
      const path = join(directory, secret);
      writeFileSync(path, password, { mode: 0o600 });
      // Match generated host-owned secrets, including Keycloak's UID 1000.
      if (process.getuid() === 0) chownSync(path, 1000, 1000);
      else
        assert.equal(
          process.getuid(),
          1000,
          "Run as the secret owner UID 1000 or root",
        );
      chmodSync(path, 0o600);
      secrets[secret] = { file: path };
    }
    services[name] = service;
  }
  // Distinct access keys, shared disposable password for the secret values.
  writeFileSync(secrets["objectstorage-app-access-key"].file, "hardening-app");
  writeFileSync(
    secrets["objectstorage-artifacts-writer-access-key"].file,
    "hardening-writer",
  );
  writeFileSync(
    file,
    JSON.stringify({
      services,
      secrets,
      networks: { test: { internal: true }, client: {} },
      volumes: Object.fromEntries(
        ["db-data", "valkey-data", "seaweedfs-data", "iam-data"].map((name) => [
          name,
          {},
        ]),
      ),
    }),
  );
  compose("config", "--quiet");
  servicesCreated = true;
  compose("up", "-d", "db", "memorycache", "objectstorage");
  for (const service of ["db", "memorycache", "objectstorage"])
    await healthy(service);
  console.log("Fresh PostgreSQL, Valkey and SeaweedFS volumes are healthy");
  exec(
    "db",
    "psql",
    "-U",
    "postgres",
    "-c",
    `CREATE USER athyper_iam PASSWORD '${password}';`,
  );
  exec("db", "createdb", "-U", "postgres", "-O", "athyper_iam", "athyper_iam");
  compose("up", "-d", "iam");
  await healthy("iam");
  compose("run", "--rm", "objectstorage-init");
  const redis = (...args) =>
    exec(
      "memorycache",
      "sh",
      "-c",
      'export REDISCLI_AUTH="$(cat /run/secrets/redis-password)"; exec redis-cli "$@"',
      "sh",
      ...args,
    );
  assert.equal(redis("SET", "hardening-probe", "persisted"), "OK");
  assert.match(
    exec("memorycache", "sh", "-c", "cat /proc/1/status"),
    /Uid:\s+999\s+999/,
  );
  const sql = (query) =>
    exec(
      "db",
      "sh",
      "-c",
      'export PGPASSWORD="$(cat /run/secrets/postgres-password)"; exec psql -h 127.0.0.1 -U postgres -Atc "$1"',
      "sh",
      query,
    );
  sql(
    "CREATE TABLE hardening_probe(value text); INSERT INTO hardening_probe VALUES ('persisted');",
  );
  const s3 = (script) =>
    compose(
      "run",
      "--rm",
      "--entrypoint",
      "node",
      "objectstorage-init",
      "--input-type=module",
      "-e",
      `import { client } from '/app/client.mjs';
       import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
       const writer = client('writer');
       const object = { Bucket: 'athyper-artifacts', Key: 'hardening-probe' };
       try { ${script} } finally { writer.destroy(); }`,
    );
  s3(
    "await writer.send(new PutObjectCommand({ ...object, Body: 'persisted' }));",
  );
  const login = async () => {
    const address = compose("port", "iam", "8080");
    const response = await fetch(
      `http://${address}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: "athyper-admin",
          password,
        }),
      },
    );
    assert.equal(response.status, 200, "Keycloak admin authentication");
    assert.ok((await response.json()).access_token);
  };
  await login();
  console.log(
    "Authenticated database, Redis, object writes and Keycloak login pass",
  );
  compose("restart", "db", "memorycache", "objectstorage", "iam");
  for (const service of ["db", "memorycache", "objectstorage", "iam"])
    await healthy(service);
  assert.equal(sql("SELECT value FROM hardening_probe"), "persisted");
  assert.equal(redis("GET", "hardening-probe"), "persisted");
  assert.equal(
    s3(
      "const result = await writer.send(new GetObjectCommand(object)); console.log(await result.Body.transformToString());",
    ),
    "persisted",
  );
  await login();
  compose("run", "--rm", "objectstorage-init");
  for (const service of ["db", "memorycache", "objectstorage"]) {
    assert.equal(
      exec(
        service,
        "sh",
        "-c",
        "if touch /hardening-root-probe 2>/dev/null; then rm /hardening-root-probe; echo writable; else echo readonly; fi",
      ),
      "readonly",
    );
  }
  console.log(
    "Restart, persistence, repeat bootstrap and read-only roots pass",
  );
} finally {
  try {
    if (servicesCreated) compose("down", "--volumes", "--remove-orphans");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
