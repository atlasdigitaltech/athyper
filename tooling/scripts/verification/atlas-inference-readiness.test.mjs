import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkInference,
  localChatRequest,
} from "./atlas-inference-readiness.mjs";
const digest = "sha256:" + "a".repeat(64);
const config = {
  endpoint: "http://atlas-inference:11434",
  engine: { version: "0.33.3" },
  model: {
    upstream: "qwen3:8b",
    publicId: "atlas-re-1.0-local",
    displayName: "Atlas RE 1.0 Local",
    digest,
  },
  request: { num_ctx: 4096, num_predict: 1024, think: false },
};
const fetcher =
  (
    models,
    answer = { done: true, model: "qwen3:8b", message: { content: "OK" } },
  ) =>
  async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/api/version")
        ? { version: "0.33.3" }
        : url.endsWith("/api/tags")
          ? { models }
          : answer,
  });
test("running empty engine is not generation ready", async () =>
  assert.deepEqual(await checkInference(config, fetcher([])), {
    processReady: true,
    generationReady: false,
    publicModelId: "atlas-re-1.0-local",
    displayName: "Atlas RE 1.0 Local",
    reason: "model_not_installed",
  }));
test("unpinned and wrong model digests cannot pass", async () => {
  assert.equal(
    (
      await checkInference(
        { ...config, model: { ...config.model, digest: null } },
        fetcher([{ name: "qwen3:8b", digest }]),
      )
    ).reason,
    "model_not_pinned",
  );
  assert.equal(
    (
      await checkInference(
        config,
        fetcher([{ name: "qwen3:8b", digest: "wrong" }]),
      )
    ).reason,
    "model_digest_mismatch",
  );
});
test("matching artifact requires successful inference", async () => {
  assert.equal(
    (
      await checkInference(
        config,
        fetcher([{ name: "qwen3:8b", digest }], { done: false }),
      )
    ).generationReady,
    false,
  );
  assert.equal(
    (await checkInference(config, fetcher([{ name: "qwen3:8b", digest }])))
      .generationReady,
    true,
  );
});
test("unreachable service is distinct from missing model", async () =>
  assert.equal(
    (
      await checkInference(config, async () => {
        throw Error("offline");
      })
    ).processReady,
    false,
  ));
test("request settings bound output and disable thinking", () => {
  assert.deepEqual(localChatRequest(config, []).options, {
    num_ctx: 4096,
    num_predict: 1024,
  });
  assert.equal(localChatRequest(config, []).think, false);
  assert.throws(() => localChatRequest(config, [], 1025));
});

test("model-list API bare SHA-256 is normalized to the canonical lock digest", async () => {
  const result = await checkInference(
    config,
    fetcher([{ name: "qwen3:8b", digest: digest.slice(7) }]),
  );
  assert.equal(result.generationReady, true);
  assert.equal(result.modelDigest, digest);
});
