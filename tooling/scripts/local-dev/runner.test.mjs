import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPlan,
  dependencyClosure,
  projectCompose,
  assertOwned,
  OWNER,
  MANAGER,
  MANAGER_VERSION,
} from "./model.mjs";
import { acquireLock, assertActiveCheckout, prepareFiles } from "./runtime.mjs";
import { parseArgs } from "./cli.mjs";

const root = resolve(import.meta.dirname, "../../..");
test("presets share checkout identity/storage while selecting different apps and capabilities", () => {
  const simple = createPlan(root);
  const full = createPlan(root, { preset: "devfull" });
  assert.equal(simple.id, full.id);
  assert.deepEqual(simple.ports, full.ports);
  assert.equal(simple.root, full.root);
  assert.deepEqual(simple.apps, ["neon"]);
  assert.deepEqual(full.apps, ["studio", "neon", "mesh"]);
  assert.ok(full.services.includes("secretstore"));
  assert.ok(!simple.services.includes("secretstore"));
  assert.equal(full.applicationReady, false);
});

test("unknown presets, apps and capabilities fail before lifecycle mutation", () => {
  assert.throws(() => createPlan(root, { preset: "prod" }), /Unknown preset/);
  assert.throws(() => createPlan(root, { apps: ["admin"] }), /Apps must/);
  assert.throws(
    () => createPlan(root, { capabilities: ["all"] }),
    /Unsupported capability/,
  );
  assert.throws(() => parseArgs(["down", "--force"]), /Unknown argument/);
  assert.throws(() => parseArgs(["up", "--apps", "--with"]), /Missing value/);
});

test("dependency selection cannot pull application images or migrations into infrastructure", () => {
  assert.deepEqual(
    dependencyClosure(
      {
        iam: { depends_on: { init: {} } },
        init: { depends_on: { db: {} } },
        db: {},
      },
      ["iam"],
    ),
    ["db", "iam", "init"],
  );
  assert.throws(
    () =>
      dependencyClosure({ iam: { depends_on: { api: {} } }, api: {} }, ["iam"]),
    /must not start/,
  );
  assert.throws(
    () => dependencyClosure({ iam: { depends_on: { missing: {} } } }, ["iam"]),
    /Missing Compose/,
  );
});

test("projection removes external networks and pins volume ownership and loopback ports", () => {
  const plan = { ...createPlan(root), services: ["gateway", "db"] };
  const original = {
    services: {
      gateway: { networks: { app: {}, "platform-ingress": {} }, volumes: [] },
      db: {
        networks: { data: {} },
        volumes: [{ type: "volume", source: "db-data", target: "/data" }],
      },
      api: {},
    },
    networks: {
      app: {},
      data: { internal: true },
      "platform-ingress": { external: true, name: "shared" },
    },
    volumes: { "db-data": { name: "shared-db" } },
  };
  const document = projectCompose(original, plan);
  assert.deepEqual(Object.keys(document.services), ["db", "gateway"]);
  assert.ok(!document.networks["platform-ingress"]);
  assert.equal(document.volumes["db-data"].name, `${plan.project}_db-data`);
  assert.equal(document.volumes["db-data"].labels[OWNER], plan.id);
  assert.equal(document.services.db.ports[0].host_ip, "127.0.0.1");
  assert.equal(original.volumes["db-data"].name, "shared-db");
  original.volumes["db-data"].external = true;
  assert.throws(() => projectCompose(original, plan), /Unowned volume/);
});

test("matching project names alone do not authorize resource destruction", () => {
  const plan = createPlan(root);
  const labels = {
    "com.docker.compose.project": plan.project,
    [OWNER]: plan.id,
    [MANAGER]: MANAGER_VERSION,
  };
  assert.doesNotThrow(() => assertOwned({ Config: { Labels: labels } }, plan));
  assert.throws(
    () =>
      assertOwned(
        { Config: { Labels: { "com.docker.compose.project": plan.project } } },
        plan,
      ),
    /Refusing container/,
  );
  assert.throws(
    () =>
      assertOwned(
        { Labels: { ...labels, [OWNER]: "another-checkout" } },
        plan,
        "volume",
      ),
    /Refusing volume/,
  );
});

test("lifecycle lock serializes changes and a different checkout cannot replace the active one", () => {
  const registry = mkdtempSync(join(tmpdir(), "athyper-local-test-"));
  try {
    const plan = createPlan(root, {}, registry);
    const release = acquireLock(registry);
    assert.throws(() => acquireLock(registry), /locked/);
    release();
    const releaseAgain = acquireLock(registry);
    releaseAgain();
    writeFileSync(
      join(registry, "active.json"),
      JSON.stringify({ id: "foreign", checkout: "/other" }),
    );
    assert.throws(() => assertActiveCheckout(plan), /Another checkout/);
    writeFileSync(
      join(registry, "active.json"),
      JSON.stringify({ id: plan.id, checkout: plan.checkout }),
    );
    assert.doesNotThrow(() => assertActiveCheckout(plan));
  } finally {
    rmSync(registry, { recursive: true, force: true });
  }
});

test("different checkout paths get independent identities", () => {
  const checkout = mkdtempSync(join(tmpdir(), "athyper-checkout-test-"));
  try {
    mkdirSync(join(checkout, "tooling/config/local-dev"), { recursive: true });
    writeFileSync(
      join(checkout, "tooling/config/local-dev/presets.json"),
      readFileSync(join(root, "tooling/config/local-dev/presets.json"), "utf8"),
    );
    assert.notEqual(
      createPlan(checkout, { iamImage: `sha256:${"a".repeat(64)}` }).id,
      createPlan(root).id,
    );
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
});

test("generated realm uses Keycloak filename contract, isolated callbacks and stable private secrets", () => {
  const registry = mkdtempSync(join(tmpdir(), "athyper-realm-test-"));
  try {
    const plan = createPlan(root, {}, registry);
    const document = {
      services: {},
      secrets: {
        "redis-password": { file: join(plan.root, "secrets/redis-password") },
      },
    };
    prepareFiles(plan, document);
    const realm = JSON.parse(
      readFileSync(join(plan.root, "realm-import", `${plan.realm}-realm.json`)),
    );
    assert.equal(realm.realm, plan.realm);
    assert.equal(realm.ssoSessionIdleTimeout, 1800);
    assert.equal(realm.ssoSessionMaxLifespan, 36000);
    assert.equal(realm.users.length, 0);
    assert.deepEqual(
      realm.clients.find((c) => c.clientId === "studio-web").redirectUris,
      [`${plan.origins.studio}/api/auth/callback`],
    );
    const secretPath = document.secrets["redis-password"].file;
    const initial = readFileSync(secretPath, "utf8");
    assert.equal(statSync(secretPath).mode & 0o777, 0o600);
    prepareFiles(plan, document);
    assert.equal(readFileSync(secretPath, "utf8"), initial);
    assert.ok(
      !readFileSync(join(plan.root, "compose.json"), "utf8").includes(initial),
    );
    prepareFiles({ ...plan, id: "dev" }, document);
    const devRealm = JSON.parse(readFileSync(join(plan.root, "realm-import", `${plan.realm}-realm.json`)));
    assert.equal(devRealm.ssoSessionIdleTimeout, 7200);
    assert.equal(devRealm.ssoSessionMaxLifespan, 43200);
    for (const id of ["studio-web", "neon-web"]) {
      const client = devRealm.clients.find(c => c.clientId === id);
      assert.equal(client.attributes["client.session.idle.timeout"], "7200");
      assert.equal(client.attributes["client.session.max.lifespan"], "43200");
    }

  } finally {
    rmSync(registry, { recursive: true, force: true });
  }
});

test("source search runtimes require the provisioned scoped key and never fall back to master", async () => {
  const { applicationEnvironment } = await import("./applications.mjs");
  const directory = mkdtempSync(join(tmpdir(), "local-search-key-"));
  try {
    const plan = {
      ...createPlan(root, { capabilities: ["search"] }),
      root: directory,
    };
    assert.ok(plan.services.includes("searchcore-key-init"));
    mkdirSync(join(directory, "secrets"));
    for (const name of [
      "runtime-db-password",
      "worker-db-password",
      "redis-password",
      "runtime-iam-client-secret",
      "objectstorage-app-access-key",
      "objectstorage-app-secret-key",
      "objectstorage-artifacts-writer-access-key",
      "objectstorage-artifacts-writer-secret-key",
      "search-master-key",
    ])
      writeFileSync(join(directory, "secrets", name), "master-or-other-secret");
    assert.throws(() => applicationEnvironment(plan, "api"), /search-api-key/);
    writeFileSync(
      join(directory, "secrets", "search-api-key"),
      "scoped-runtime-key",
    );
    for (const mode of ["api", "worker", "scheduler"])
      assert.equal(
        applicationEnvironment(plan, mode).SEARCHCORE_API_KEY,
        "scoped-runtime-key",
      );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
