import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMeilisearchIndex } from "../index.js";

// Regression guard for the credential change in provision-search-key.sh: proves the
// scoped runtime key can do everything the adapter needs, and nothing it does not grant.
// Requires a real, healthy Meilisearch instance reachable with its master key — start one
// with `docker compose -f deploy/compose/instance/compose.yaml -f deploy/compose/instance/compose.parity.yaml up searchcore`
// or any local `meilisearch` binary, then run with:
//   ATHYPER_SEARCH_INTEGRATION_TESTS=true SEARCHCORE_URL=http://127.0.0.1:7700 \
//   SEARCHCORE_MASTER_KEY=<master key> pnpm --filter @athyper/server-adapter-search-meilisearch test:integration

const enabled = process.env["ATHYPER_SEARCH_INTEGRATION_TESTS"] === "true";
const allowSkip =
  process.env["ATHYPER_SEARCH_INTEGRATION_LOCAL_SKIP"] === "true";

if (!enabled && !allowSkip) {
  throw new Error(
    "ATHYPER_SEARCH_INTEGRATION_TESTS=true is required; use test:integration:local for the explicit local skip path",
  );
}

const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("Meilisearch scoped key (real instance)", () => {
  const baseUrl = process.env["SEARCHCORE_URL"]?.trim() ?? "";
  const masterKey = process.env["SEARCHCORE_MASTER_KEY"]?.trim() ?? "";
  const indexUid = `it_scoped_${randomUUID().replace(/-/g, "")}`;
  const outOfScopeIndexUid = `it_out_of_scope_${randomUUID().replace(/-/g, "")}`;
  let scopedKey = "";
  let scopedKeyUid = "";

  async function master(path: string, init: RequestInit = {}) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${masterKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }
  async function waitTask(taskUid: number) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const response = await master(`/tasks/${taskUid}`);
      const task = (await response.json()) as { status?: string };
      if (task.status === "succeeded") return;
      if (task.status === "failed" || task.status === "canceled")
        throw new Error(`setup task ${taskUid} ${task.status}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`setup task ${taskUid} timed out`);
  }

  beforeAll(async () => {
    if (!baseUrl || !masterKey) {
      throw new Error(
        "SEARCHCORE_URL and SEARCHCORE_MASTER_KEY are required when ATHYPER_SEARCH_INTEGRATION_TESTS=true",
      );
    }
    // Out-of-scope index the scoped key must never be able to see.
    const outOfScope = await master("/indexes", {
      method: "POST",
      body: JSON.stringify({ uid: outOfScopeIndexUid, primaryKey: "id" }),
    });
    const outOfScopeTask = (await outOfScope.json()) as { taskUid: number };
    await waitTask(outOfScopeTask.taskUid);

    const created = await master("/keys", {
      method: "POST",
      body: JSON.stringify({
        description: `athyper-integration-test-${indexUid}`,
        actions: [
          "search",
          "documents.add",
          "documents.delete",
          "indexes.create",
          "indexes.get",
          "settings.update",
          "tasks.get",
        ],
        indexes: [indexUid],
        expiresAt: null,
      }),
    });
    expect(created.status).toBe(201);
    const key = (await created.json()) as { key: string; uid: string };
    scopedKey = key.key;
    scopedKeyUid = key.uid;
  });

  afterAll(async () => {
    if (scopedKeyUid)
      await master(`/keys/${scopedKeyUid}`, { method: "DELETE" });
    await master(`/indexes/${indexUid}`, { method: "DELETE" });
    await master(`/indexes/${outOfScopeIndexUid}`, { method: "DELETE" });
  });

  it("performs the adapter's full lifecycle with only the scoped key", async () => {
    const index = createMeilisearchIndex({
      baseUrl,
      apiKey: scopedKey,
      indexUid,
    });
    await index.initialize();
    await index.upsert({
      id: "doc-1",
      planeKey: "neon",
      tenantId: "tenant-1",
      attachmentId: "att-1",
      entityType: "invoice",
      entityId: "entity-1",
      title: "Integration test invoice",
      text: "scoped key regression coverage",
      contentType: "application/pdf",
      fileName: "invoice.pdf",
      piiTypes: [],
      updatedAt: new Date().toISOString(),
    });
    const result = await index.search({
      planeKey: "neon",
      tenantId: "tenant-1",
      text: "regression",
      limit: 10,
      offset: 0,
    });
    expect(result.hits.map((hit) => hit.attachmentId)).toContain("att-1");
    await index.remove("doc-1");
    const health = await index.health();
    expect(health.status).toBe("healthy");
    index.close();
  });

  it("is refused creating new keys — that stays master-key-only", async () => {
    const response = await fetch(`${baseUrl}/keys`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${scopedKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        description: "should-not-be-created",
        actions: ["*"],
        indexes: ["*"],
        expiresAt: null,
      }),
    });
    expect(response.status).toBe(403);
    await response.body?.cancel();
  });

  it("is refused reading an index outside its granted scope", async () => {
    const response = await fetch(`${baseUrl}/indexes/${outOfScopeIndexUid}`, {
      headers: { authorization: `Bearer ${scopedKey}` },
    });
    expect(response.status).toBe(403);
    await response.body?.cancel();
  });
});
