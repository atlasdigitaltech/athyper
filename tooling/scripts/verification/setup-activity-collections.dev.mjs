/** Configure only through authenticated authoring and reviewed publication APIs. */
import { request } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((x) => x !== "--check"))
  throw Error(
    "Usage: node tooling/scripts/verification/setup-activity-collections.dev.mjs [--check]",
  );
const receiptPath =
  process.env.COLLECTION_RECEIPT ?? "/tmp/athyper-collections-phase1.dev.json";
const receipt = existsSync(receiptPath)
  ? JSON.parse(readFileSync(receiptPath, "utf8"))
  : { schemaVersion: 1, samples: [] };
assert.equal(receipt.schemaVersion, 1);
const record = () =>
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
const contexts = [];
async function client(plane, user, envKey) {
  const origin = `https://${plane}.dev.athyper.test`;
  const context = await request.newContext({
    ignoreHTTPSErrors: true,
    storageState:
      process.env[envKey] ?? `tests/e2e/.auth/dev/${plane}/${user}.json`,
  });
  contexts.push(context);
  async function invoke(
    path,
    method = "GET",
    body,
    extra = {},
    expected = 200,
  ) {
    const cookie = (await context.storageState()).cookies.find(
      (c) =>
        c.domain === new URL(origin).hostname &&
        /^(?:__Host-)?athyper-csrf$/.test(c.name),
    );
    const response = await context.fetch(origin + path, {
      method,
      headers: {
        origin,
        ...(cookie ? { "x-csrf-token": decodeURIComponent(cookie.value) } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { data: body }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      result = { detail: "Non-JSON response" };
    }
    if (expected === 200 ? !response.ok() : response.status() !== expected)
      throw Error(
        `${plane}/${user} ${method} ${path}: HTTP ${response.status()} ${result.code ?? result.error ?? ""} ${result.detail ?? ""}`,
      );
    return result;
  }
  const session = await invoke("/api/auth/session");
  assert.equal(
    session.state,
    "authenticated",
    `Refresh saved ${plane}/${user} session`,
  );
  return {
    session,
    call: (path, method, body, extra, expected) =>
      invoke("/api/relay" + path, method, body, extra, expected),
  };
}
const base = "/meta-entity-authoring/change-sets";
try {
  // Preflight every plane before any configuration write. Never reuse another plane's cookies.
  const author = await client(
    "studio",
    "catl.admin",
    "COLLECTION_STUDIO_AUTHOR_STATE",
  );
  const reviewer = await client(
    "studio",
    "catl.owner",
    "COLLECTION_STUDIO_REVIEWER_STATE",
  );
  const readers = {
    studio: reviewer,
    neon: await client("neon", "catl.owner", "COLLECTION_NEON_READER_STATE"),
    mesh: await client("mesh", "catl.owner", "COLLECTION_MESH_READER_STATE"),
  };
  assert.notEqual(
    author.session.principalId,
    reviewer.session.principalId,
    "Independent reviewer required",
  );
  for (const reader of Object.values(readers))
    assert.equal(
      reader.session.tenantId,
      author.session.tenantId,
      "Fixture readers must use the same tenant",
    );
  const providers = await author.call(
    "/meta-entity-authoring/collection-providers",
  );
  assert.equal(providers.providers.length, 2);
  const catalog = await author.call(base);
  assert.ok(Array.isArray(catalog));
  if (checkOnly) {
    console.log(
      "All plane sessions and Studio collection API verified; no configuration changed.",
    );
  } else {
    async function verify(item, configuration) {
      for (const [plane, reader] of Object.entries(readers)) {
        const deadline = Date.now() + 120000;
        let value;
        while (Date.now() < deadline) {
          try {
            value = await reader.call(
              `/collections/${configuration.collectionKey}/configuration`,
            );
          } catch (e) {
            if (
              !/COLLECTION_CONFIGURATION_NOT_PUBLISHED|HTTP 50[234]/.test(
                String(e),
              )
            )
              throw e;
          }
          if (value?.releaseId === item.releaseId) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        assert.equal(
          value?.releaseId,
          item.releaseId,
          `${plane}: expected published revision; inspect publication jobs`,
        );
        assert.equal(value.plane, plane);
        assert.deepEqual(
          value.configuration.defaultState,
          configuration.defaultState,
        );
      }
      item.status = "verified";
      record();
      console.log(`${item.name}: active in Neon, Mesh and Studio`);
    }
    async function publish(name, kind, changed = false) {
      const graph = JSON.parse(
        readFileSync(
          new URL(`../../fixtures/collections/${kind}.json`, import.meta.url),
          "utf8",
        ),
      );
      const configuration =
        graph.surfaces[0].layoutConfig.collectionConfiguration;
      if (changed) configuration.defaultState.density = "compact";
      let item = receipt.samples.find((x) => x.name === name);
      if (item?.status === "verified") return;
      if (!item) {
        const existing = (await author.call(base)).find(
          (x) => x.entityCode === graph.entity.entityCode,
        );
        const draft = await author.call(base, "POST", {
          entityId: existing?.entityId ?? randomUUID(),
          entityCode: graph.entity.entityCode,
          branchCode: `collections_${Date.now().toString(36)}_${name}`,
          title: `Collection fixture: ${name}`,
          ...(existing
            ? {}
            : {
                registration: {
                  schemaVersion: 1,
                  moduleCode: "fnd",
                  entityClass: "configuration",
                  ownershipModel: "tenant",
                },
              }),
        });
        item = { name, changeSetId: draft.id, status: "created" };
        receipt.samples.push(item);
        record();
      }
      const path = `${base}/${item.changeSetId}`;
      let state = await author.call(path + "/graph");
      if (state.changeSet.status === "draft") {
        if (item.status === "created") {
          // Native row IDs belong to a draft, not the reusable fixture.
          graph.surfaces[0].id = state.graph.surfaces?.[0]?.id ?? randomUUID();
          // Fixture graph establishes the native configuration identity and catalog-only profile.
          await author.call(path + "/graph", "PUT", graph, {
            "if-match": String(state.changeSet.revision),
          });
          item.status = "draft";
          record();
        }
        state = await author.call(path + "/graph");
        const revision = state.changeSet.revision;
        await author.call(path + "/collection", "PUT", {
          expectedRevision: revision,
          configuration,
        });
        await author.call(
          path + "/collection",
          "PUT",
          { expectedRevision: revision, configuration },
          {},
          409,
        );
        const saved = await author.call(path + "/collection");
        assert.deepEqual(
          saved.configuration.defaultState,
          configuration.defaultState,
        );
        await author.call(
          path + "/collection",
          "PUT",
          {
            expectedRevision: saved.revision,
            configuration: {
              ...configuration,
              providerKey: "unsupported.provider",
            },
          },
          {},
          422,
        );
        const preview = await author.call(
          path + "/collection/preview",
          "POST",
          {},
        );
        assert.equal(preview.synthetic, true);
        assert.equal(preview.sent, false);
        assert.equal(preview.actionsExecuted, false);
        assert.equal(
          (await author.call(path + "/collection/validate", "POST", {})).valid,
          true,
        );
        assert.deepEqual(
          (await author.call(path + "/validate", "POST", {})).issues,
          [],
        );
        assert.equal(
          (await author.call(path + "/test", "POST", {})).passed,
          true,
        );
        state = await author.call(path + "/graph");
        await author.call(path + "/submit", "POST", {
          expectedRevision: state.changeSet.revision,
        });
      }
      state = await reviewer.call(path + "/graph");
      if (state.changeSet.status === "in_review")
        await reviewer.call(path + "/approve", "POST", {
          expectedRevision: state.changeSet.revision,
        });
      state = await author.call(path + "/graph");
      if (item.releaseId) {
        await author.call(path + "/publish", "POST", {
          releaseId: item.releaseId,
          targetPlanes: configuration.targetPlanes,
        });
      } else {
        const result = await author.call(path + "/publish", "POST", {
          expectedRevision: state.changeSet.revision,
          targetPlanes: configuration.targetPlanes,
        });
        item.releaseId = result.release.id;
        item.status = "published";
        record();
      }
      await verify(item, configuration);
    }
    await publish("notifications", "notifications");
    await publish("inbox", "inbox");
    await publish("inbox_updated", "inbox", true);
    for (const [name, kind] of [
      ["notifications", "notifications"],
      ["inbox_updated", "inbox"],
    ]) {
      const configuration = JSON.parse(
        readFileSync(
          new URL(`../../fixtures/collections/${kind}.json`, import.meta.url),
          "utf8",
        ),
      ).surfaces[0].layoutConfig.collectionConfiguration;
      if (kind === "inbox") configuration.defaultState.density = "compact";
      await verify(
        receipt.samples.find((sample) => sample.name === name),
        configuration,
      );
    }
    console.log(`Phase 1 local walkthrough complete. Receipt: ${receiptPath}`);
  }
} finally {
  await Promise.all(contexts.map((c) => c.dispose()));
}
