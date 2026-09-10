import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { OllamaModelProvider } from "/app/server/node_modules/@athyper/server-adapter-ai-ollama/dist/index.js";
const [g, e] = JSON.parse(process.argv[2]),
  corrected = process.argv[3] === "corrected",
  endpoint = g.endpoint;
let cache, queue, key;
const report = {
  observedAt: new Date().toISOString(),
  mode: corrected ? "corrected-shared-admission" : "historical-adapter",
  schedule:
    "Start a live embedding after generation warmup and before the next readiness observation",
  observations: [],
  chatCalls: 0,
  embeddingAdmitted: false,
};
if (corrected) {
  const { createRedisCacheAdapter } =
    await import("/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js");
  const { RedisInferenceAdmission } =
    await import("/app/server/dist/composition/atlas-inference-admission.js");
  cache = createRedisCacheAdapter({
    url:
      "redis://:" +
      encodeURIComponent(
        readFileSync("/run/secrets/redis-password", "utf8").trim(),
      ) +
      "@memorycache:6379",
  });
  await cache.connect();
  key = "atlas:inference:reproduction:" + randomUUID();
  await cache.client.hset(key, "epoch", randomUUID());
  queue = new RedisInferenceAdmission(cache.client, key);
}
const ps = async (label) => {
  const d = await (await fetch(endpoint + "/api/ps")).json();
  const models = d.models.map((m) => ({
    name: m.name,
    digest: m.digest,
    contextLength: m.context_length,
    size: m.size,
    sizeVram: m.size_vram,
  }));
  report.observations.push({ label, at: new Date().toISOString(), models });
  return models;
};
let embedding;
try {
  for (const model of [g.model.upstream, e.model]) {
    const r = await fetch(endpoint + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    assert.equal(r.status, 200);
    await r.arrayBuffer();
  }
  const fetcher = async (url, init) => {
    if (String(url).endsWith("/api/chat")) report.chatCalls++;
    const r = await fetch(url, init);
    if (String(url).endsWith("/api/generate")) {
      const bytes = await r.arrayBuffer();
      await ps("generation-warmup-finished");
      embedding = (async () => {
        const controller = new AbortController();
        const release = queue
          ? await queue.acquire(controller.signal, (err) =>
              controller.abort(err),
            )
          : undefined;
        report.embeddingAdmitted = true;
        try {
          const started = Date.now();
          const response = await fetch(e.endpoint + "/api/embed", {
            signal: controller.signal,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: e.model,
              input: ["search_query: synthetic eviction reproduction"],
              keep_alive: "5m",
            }),
          });
          assert.equal(response.status, 200);
          const body = await response.json();
          report.embedding = {
            elapsedMs: Date.now() - started,
            model: body.model,
            loadDurationMs: body.load_duration / 1e6,
          };
          await ps("embedding-finished");
        } finally {
          await release?.();
        }
      })();
      if (corrected) {
        await new Promise((r) => setTimeout(r, 50));
        report.embeddingBlockedDuringGeneration = !report.embeddingAdmitted;
      } else await embedding;
      return new Response(bytes, { status: r.status, headers: r.headers });
    }
    if (String(url).endsWith("/api/ps")) {
      const body = await r.json();
      report.observations.push({
        label: "adapter-readiness-observation",
        at: new Date().toISOString(),
        models: body.models.map((m) => ({
          name: m.name,
          digest: m.digest,
          contextLength: m.context_length,
          size: m.size,
          sizeVram: m.size_vram,
        })),
      });
      return Response.json(body);
    }
    return r;
  };
  const binding = {
    bindingId: "atlas-re-1.0-local",
    bindingRevision: g.model.digest,
    publicModelId: g.model.publicId,
    providerId: "ollama",
    upstreamModelId: g.model.upstream,
    modelDigest: g.model.digest,
    adapterId: "ollama-native",
    adapterVersion: "1",
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      maxContextTokens: 4096,
      maxOutputTokens: 1024,
    },
    credentialPolicy: "local_transport",
    credentialOwnerId: "atlas-inference",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["synthetic"],
  };
  const provider = new OllamaModelProvider({
    modelDigest: g.model.digest,
    engineVersion: g.engine.version,
    fetch: fetcher,
    ...(queue
      ? {
          queue,
          observe: (d) => {
            report.diagnostics ??= [];
            report.diagnostics.push(d);
          },
        }
      : {}),
  });
  const started = Date.now();
  let terminal;
  for await (const event of provider.invoke({
    binding,
    credential: {
      authMode: "local_transport",
      endpoint,
      ownerId: "atlas-inference",
      credentialId: null,
      credentialRevision: null,
    },
    prompt: {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What is 7 multiplied by 9? Reply with the integer only.",
            },
          ],
        },
      ],
      maxOutputTokens: 32,
    },
    trace: {
      runId: randomUUID(),
      providerCallId: randomUUID(),
      tenantId: randomUUID(),
      principalHash: "synthetic",
      safetyIdentifier: "synthetic",
      promptRevision: "synthetic",
      policyRevision: "synthetic",
    },
    reauthorize: async () => true,
  }))
    if (["completed", "failed", "cancelled"].includes(event.kind))
      terminal = event;
  report.elapsedMs = Date.now() - started;
  report.terminal = terminal;
  await embedding;
  if (corrected) {
    assert.equal(terminal.kind, "completed");
    assert.equal(report.embeddingBlockedDuringGeneration, true);
    assert.equal(report.chatCalls, 1);
  } else {
    assert.equal(terminal.kind, "failed");
    assert.equal(terminal.error.errorClass, "model_unavailable");
    assert.equal(terminal.error.code, "gpu_offload_required");
    assert.equal(report.chatCalls, 0);
    const last = report.observations
      .filter((o) => o.label === "adapter-readiness-observation")
      .at(-1);
    assert.ok(!last.models.some((m) => m.name === g.model.upstream));
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failureCode = error.code ?? error.name;
} finally {
  if (cache) {
    await cache.client.del(key);
    await cache.close();
  }
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
