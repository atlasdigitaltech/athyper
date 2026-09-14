import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 600_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// Opt in: builds an image and creates disposable Docker resources. Never uses a deployed instance.
test(
  "search bootstrap works without egress, reconciles, and issues a usable restricted key",
  {
    skip: process.env.ATHYPER_SEARCH_BOOTSTRAP_TESTS !== "true",
    timeout: 720_000,
  },
  async () => {
    // Loaded lazily: this file is imported under plain `node --test` (no TS loader), and this
    // opt-in test's own source has sibling ".ts" files, which a static top-level import would fail
    // to resolve even when skipped, since ES module imports are resolved at load time.
    const { createMeilisearchIndex } =
      await import("../../../server/packages/adapters/search-meilisearch/src/meilisearch-index.ts");
    const id = `search-test-${randomUUID().slice(0, 8)}`;
    const directory = mkdtempSync(join(tmpdir(), id));
    const master = randomUUID();
    let server;
    let adapter;
    let networkCreated = false;
    let volumeCreated = false;
    try {
      writeFileSync(join(directory, "search-master-key"), master, {
        mode: 0o600,
      });
      // Resolve the real service definitions, including the pinned images and build context.
      const config = JSON.parse(
        execFileSync(
          "docker",
          [
            "compose",
            "-f",
            "deploy/compose/instance/compose.yaml",
            "-f",
            "deploy/compose/instance/compose.parity.yaml",
            "config",
            "--format",
            "json",
          ],
          {
            cwd: root,
            encoding: "utf8",
            env: {
              ...process.env,
              ATHYPER_RUNTIME_ROOT: directory,
              ATHYPER_INSTANCE: "dev",
              ATHYPER_DDL_SHA256: "search-bootstrap-test",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
      const initializer = config.services["searchcore-key-init"];
      docker("build", "-t", initializer.image, initializer.build.context);
      docker("network", "create", "--internal", id);
      networkCreated = true;
      docker("volume", "create", id);
      volumeCreated = true;
      const service = config.services.searchcore;
      server = docker(
        "run",
        "-d",
        "-v",
        "/meili_data",
        "-p",
        "127.0.0.1::7700",
        ...(service.read_only ? ["--read-only"] : []),
        ...(service.tmpfs ?? []).flatMap((mount) => ["--tmpfs", mount]),
        ...service.cap_drop.flatMap((cap) => ["--cap-drop", cap]),
        ...(service.cap_add ?? []).flatMap((cap) => ["--cap-add", cap]),
        "--security-opt",
        "no-new-privileges:true",
        "--init",
        ...Object.entries(service.environment).flatMap(([key, value]) => [
          "-e",
          `${key}=${value}`,
        ]),
        "-v",
        `${join(directory, "search-master-key")}:/run/secrets/search-master-key:ro`,
        "-v",
        `${resolve(root, "deploy/compose/instance/scripts/start-search.sh")}:/start-search.sh:ro`,
        "--entrypoint",
        "/bin/sh",
        service.image,
        "/start-search.sh",
      );
      docker("network", "connect", "--alias", "searchcore", id, server);
      const port = JSON.parse(docker("inspect", server))[0].NetworkSettings
        .Ports["7700/tcp"][0].HostPort;
      let baseUrl = `http://127.0.0.1:${port}`;
      const api = (path, init = {}) =>
        fetch(baseUrl + path, {
          ...init,
          headers: {
            authorization: `Bearer ${master}`,
            "content-type": "application/json",
            ...init.headers,
          },
          signal: AbortSignal.timeout(10_000),
        });
      for (let attempt = 0; ; attempt++) {
        try {
          if ((await api("/health")).ok) break;
        } catch {}
        if (attempt === 50) throw new Error("Meilisearch startup timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const bootstrap = (replace = false) =>
        docker(
          "run",
          "--rm",
          "--network",
          id,
          "--security-opt",
          "no-new-privileges:true",
          "-e",
          `SEARCHCORE_REPLACE_KEY=${replace}`,
          "-v",
          `${join(directory, "search-master-key")}:/run/secrets/search-master-key:ro`,
          "-v",
          `${id}:/run/searchcore`,
          "-v",
          `${resolve(root, "deploy/compose/instance/scripts/provision-search-key.sh")}:/provision.sh:ro`,
          initializer.image,
          "sh",
          "/provision.sh",
        );
      const readKey = () =>
        docker(
          "run",
          "--rm",
          "--network",
          "none",
          "-v",
          `${id}:/run/searchcore:ro`,
          initializer.image,
          "cat",
          "/run/searchcore/search-api-key",
        );
      const keys = async () =>
        (await (await api("/keys?limit=100")).json()).results.filter(
          (k) => k.description === "athyper-runtime-scoped-key",
        );
      bootstrap();
      const key = readKey();
      bootstrap();
      assert.equal(readKey(), key, "second run must retain credential");
      assert.equal(
        (await keys()).length,
        1,
        "second run must not create a duplicate",
      );
      adapter = createMeilisearchIndex({ baseUrl, apiKey: key });
      await adapter.initialize();
      await adapter.upsert({
        id: "doc1",
        planeKey: "neon",
        tenantId: "tenant1",
        attachmentId: "attachment1",
        entityType: "invoice",
        entityId: "entity1",
        title: "Invoice",
        text: "regression",
        contentType: "text/plain",
        fileName: "invoice.txt",
        piiTypes: [],
        updatedAt: new Date().toISOString(),
      });
      const query = {
        planeKey: "neon",
        tenantId: "tenant1",
        text: "regression",
        limit: 10,
        offset: 0,
      };
      assert.equal((await adapter.search(query)).hits.length, 1);
      docker("restart", server);
      const restartedPort = JSON.parse(docker("inspect", server))[0]
        .NetworkSettings.Ports["7700/tcp"][0].HostPort;
      baseUrl = `http://127.0.0.1:${restartedPort}`;
      adapter.close();
      adapter = createMeilisearchIndex({ baseUrl, apiKey: key });
      for (let attempt = 0; ; attempt++) {
        try {
          if ((await api("/health")).ok) break;
        } catch {}
        if (attempt === 50) throw new Error("Meilisearch restart timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        (await adapter.search(query)).hits.length,
        1,
        "indexed data must survive restart",
      );
      await adapter.remove("doc1");
      assert.equal((await adapter.search(query)).hits.length, 0);
      const restricted = (path, init = {}) =>
        api(path, { ...init, headers: { authorization: `Bearer ${key}` } });
      assert.equal(
        (
          await restricted("/keys", {
            method: "POST",
            body: JSON.stringify({
              actions: ["*"],
              indexes: ["*"],
              expiresAt: null,
            }),
          })
        ).status,
        403,
      );
      assert.equal((await restricted("/indexes/out_of_scope")).status, 403);
      // Test the actual configured semantic index, rather than copying its UID into this test.
      const semantic = JSON.parse(
        readFileSync(
          resolve(root, "deploy/config/atlas/semantic-retrieval.json"),
          "utf8",
        ),
      );
      const semanticAdapter = createMeilisearchIndex({
        baseUrl,
        apiKey: key,
        indexUid: semantic.indexUid,
      });
      try {
        await semanticAdapter.initialize();
      } finally {
        semanticAdapter.close();
      }
      // Emulate an older/wider policy and verify fail-closed reconciliation and explicit replacement.
      const existing = (await keys())[0];
      assert.equal(
        (await api(`/keys/${existing.uid}`, { method: "DELETE" })).status,
        204,
      );
      assert.equal(
        (
          await api("/keys", {
            method: "POST",
            body: JSON.stringify({
              description: existing.description,
              actions: ["*"],
              indexes: ["*"],
              expiresAt: null,
            }),
          })
        ).status,
        201,
      );
      assert.throws(() => bootstrap(), /failed/);
      assert.equal(
        readKey(),
        key,
        "a refused replacement must not overwrite the published key",
      );
      bootstrap(true);
      assert.equal((await keys()).length, 1);
      bootstrap();
      const replacement = readKey();
      assert.equal(
        (
          await api("/keys", {
            headers: { authorization: `Bearer ${replacement}` },
          })
        ).status,
        403,
      );
      console.log(
        "Verified first/repeat bootstrap, scoped lifecycle, semantic index scope, denial checks, and explicit policy replacement",
      );
    } finally {
      adapter?.close();
      if (server) docker("rm", "-f", "-v", server);
      if (volumeCreated) docker("volume", "rm", id);
      if (networkCreated) docker("network", "rm", id);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
