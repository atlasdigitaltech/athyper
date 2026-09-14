import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, acquireLock, setOperationSignal } from "./runtime.mjs";
import { sourceIdentity } from "./evidence.mjs";
import { validateCatalog, overridePorts } from "./configuration.mjs";
import { readJson } from "./model.mjs";
import { processIdentity } from "./supervisor.mjs";

test("cancellation waits for command termination and releases the lifecycle lock", async () => {
  const root = mkdtempSync(join(tmpdir(), "athyper-cancel-"));
  const release = acquireLock(root);
  const controller = new AbortController();
  setOperationSignal(controller.signal);
  const pending = command(process.execPath, ["-e", "setInterval(()=>{},1000)"]);
  controller.abort();
  try {
    await assert.rejects(pending, /abort/i);
  } finally {
    setOperationSignal(undefined);
    release();
  }
  assert.equal(existsSync(join(root, "operation.lock")), false);
  rmSync(root, { recursive: true });
});

test("source evidence distinguishes dirty contents, deletions and new files without storing secrets", async () => {
  const root = mkdtempSync(join(tmpdir(), "athyper-source-"));
  try {
    await command("git", ["init", root]);
    writeFileSync(join(root, "tracked"), "first");
    await command("git", ["-C", root, "add", "."]);
    await command("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    const baseline = await sourceIdentity(root);
    writeFileSync(join(root, "tracked"), "private-content-never-in-evidence");
    const edited = await sourceIdentity(root);
    assert.notEqual(edited.treeSha256, baseline.treeSha256);
    assert.equal(JSON.stringify(edited).includes("private-content"), false);
    rmSync(join(root, "tracked"));
    assert.equal((await sourceIdentity(root)).files[0].deleted, true);
    writeFileSync(join(root, "new"), "added");
    assert.equal(
      (await sourceIdentity(root)).files.some((file) => file.path === "new"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("configuration rejects malformed nested budgets and duplicate or unknown ports", () => {
  const catalog = readJson(
    new URL("../../config/local-dev/presets.json", import.meta.url),
  );
  validateCatalog(catalog);
  catalog.presets.devfull.buildConcurrency = 0;
  assert.throws(() => validateCatalog(catalog), /budget/);
  assert.throws(
    () => overridePorts({ api: 3000, neon: 3001 }, { api: 3001 }),
    /distinct/,
  );
  assert.throws(
    () => overridePorts({ api: 3000 }, { unknown: 3001 }),
    /Invalid/,
  );
  assert.deepEqual(overridePorts({ api: 3000 }, { api: 3100 }), { api: 3100 });
});

test("supervisor identity distinguishes current and absent processes", () => {
  assert.ok(processIdentity(process.pid));
  assert.equal(processIdentity(2147483647), null);
});

test("stale lock recovery rejects live processes and accepts a dead operation", async () => {
  const { recoverLock } = await import("./runtime.mjs");
  const root = mkdtempSync(join(tmpdir(), "athyper-recovery-"));
  try {
    const path = join(root, "operation.lock");
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, pid: process.pid, children: [] }),
      { mode: 0o600 },
    );
    assert.throws(() => recoverLock(root), /still present/);
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        pid: 2147483647,
        children: [process.pid],
      }),
    );
    assert.throws(() => recoverLock(root), /still present/);
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        pid: 2147483647,
        children: [],
        at: "fixture",
      }),
    );
    assert.equal(recoverLock(root).recovered, true);
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("IAM gets read-only consumer copies beneath private host directories while canonical secrets stay owner-only", async () => {
  const { createPlan, projectCompose } = await import("./model.mjs");
  const { prepareFiles } = await import("./runtime.mjs");
  const { statSync, readFileSync } = await import("node:fs");
  const registry = mkdtempSync(join(tmpdir(), "athyper-iam-secrets-"));
  try {
    const plan = createPlan(
      new URL("../../../", import.meta.url).pathname,
      {},
      registry,
    );
    plan.services = ["iam"];
    const document = projectCompose(
      {
        services: {
          iam: {
            image: "keycloak:local",
            environment: {},
            networks: { app: {} },
            volumes: [],
            secrets: [{ source: "iam-db-password" }],
          },
        },
        networks: { app: {} },
        volumes: {},
        secrets: {},
      },
      plan,
    );
    prepareFiles(plan, document);
    const canonical = document.secrets["iam-db-password"].file;
    const copy = document.secrets["iam-copy-iam-db-password"].file;
    assert.equal(statSync(canonical).mode & 0o777, 0o600);
    assert.equal(statSync(copy).mode & 0o777, 0o444);
    assert.equal(
      statSync(join(plan.root, "consumer-secrets/iam")).mode & 0o777,
      0o700,
    );
    assert.equal(readFileSync(copy, "utf8"), readFileSync(canonical, "utf8"));
    assert.equal(document.services.iam.secrets[0].target, "iam-db-password");
    const inode = statSync(copy).ino;
    prepareFiles(plan, document);
    assert.equal(
      statSync(copy).ino,
      inode,
      "An unchanged secret keeps its bind-mounted inode",
    );
  } finally {
    rmSync(registry, { recursive: true });
  }
});
