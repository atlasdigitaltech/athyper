import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRedisCacheAdapter } from "/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js";
import {
  OllamaModelProvider,
  configureSharedAtlasInferenceAdmission,
} from "/app/server/node_modules/@athyper/server-adapter-ai-ollama/dist/index.js";
import {
  RedisInferenceAdmission,
  ATLAS_INFERENCE_ADMISSION_KEY,
} from "/app/server/dist/composition/atlas-inference-admission.js";
import { createAtlasSemanticIndex } from "/app/server/dist/composition/atlas-semantic-index.js";
const [g, e] = JSON.parse(process.argv[2]),
  mode = process.argv[3],
  cache = createRedisCacheAdapter({
    url:
      "redis://:" +
      encodeURIComponent(
        readFileSync("/run/secrets/redis-password", "utf8").trim(),
      ) +
      "@memorycache:6379",
  });
await cache.connect();
const queue = new RedisInferenceAdmission(cache.client);
configureSharedAtlasInferenceAdmission(queue);
const diagnostics = [];
console.info = (line) => {
  const d = JSON.parse(line);
  if (d.event === "atlas.inference.diagnostic")
    diagnostics.push({ ...d, observedMs: Date.now() });
};
const report = {
  mode,
  processId: process.pid,
  observedAt: new Date().toISOString(),
  diagnostics,
};
try {
  if (mode === "state") {
    const state = await cache.client.hgetall(ATLAS_INFERENCE_ADMISSION_KEY);
    report.state = {
      initialized: !!state.epoch,
      occupied: !!state.owner,
      waiters: Object.keys(state).filter((k) => k.startsWith("w:")).length,
    };
  } else if (mode === "waiter") {
    const deadline = Date.now() + 3000;
    let seen = false;
    while (Date.now() < deadline) {
      seen = (await cache.client.hkeys(ATLAS_INFERENCE_ADMISSION_KEY)).some(
        (k) => k.startsWith("w:"),
      );
      if (seen) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    report.passed = seen;
    report.waiterObserved = seen;
  } else if (mode === "hold") {
    const release = await queue.acquire(new AbortController().signal);
    console.log(JSON.stringify({ admitted: true }));
    await new Promise((r) => setTimeout(r, 6000));
    await release();
    report.passed = true;
  } else if (mode === "unload") {
    const controller = new AbortController(),
      release = await queue.acquire(controller.signal, (err) =>
        controller.abort(err),
      );
    try {
      const r = await fetch(g.endpoint + "/api/generate", {
        signal: controller.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: e.model, keep_alive: 0 }),
      });
      if (!r.ok) throw Error("Unload failed");
      await r.arrayBuffer();
      report.passed = true;
    } finally {
      await release();
    }
  } else if (mode === "embedding") {
    const index = createAtlasSemanticIndex(
      {
        baseUrl: "http://synthetic-search",
        apiKey: "synthetic",
        fetch: async (url, init) =>
          String(url).startsWith("http://synthetic-search")
            ? Response.json(
                String(url).includes("/tasks/")
                  ? { status: "succeeded" }
                  : String(url).endsWith("/search")
                    ? { hits: [] }
                    : { taskUid: 1 },
              )
            : fetch(url, init),
      },
      e,
    );
    await index.search(
      {
        tenantId: randomUUID(),
        entityCode: "business_partner",
        recordId: randomUUID(),
      },
      "synthetic concurrency assessment",
      1,
    );
    report.passed = true;
  } else {
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
      observe: (d) => diagnostics.push({ ...d, observedMs: Date.now() }),
    });
    let text = "",
      terminal;
    for await (const event of provider.invoke({
      binding,
      credential: {
        authMode: "local_transport",
        endpoint: g.endpoint,
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
    })) {
      if (event.kind === "text_delta") text += event.text;
      if (["completed", "failed", "cancelled"].includes(event.kind))
        terminal = event;
    }
    report.passed = terminal?.kind === "completed" && /\b63\b/.test(text);
    report.terminal = terminal;
  }
} catch (error) {
  report.passed = false;
  report.errorCode = error.code ?? error.name;
} finally {
  await cache.close();
  console.log(JSON.stringify(report));
  if (report.passed === false) process.exitCode = 1;
}
