// Executed inside the API container by assess-atlas-inference-reliability.mjs.
// Only inference is live: Meilisearch responses are stubbed; no records/documents are written.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  OllamaModelProvider,
  sharedAtlasInferenceQueue,
} from "/app/server/node_modules/@athyper/server-adapter-ai-ollama/dist/index.js";
import { createAtlasSemanticIndex } from "/app/server/dist/composition/atlas-semantic-index.js";
const [generation, semantic] = JSON.parse(process.argv[2]);
const diagnostics = [],
  requests = [],
  memory = [];
console.info = (line) => {
  const d = JSON.parse(line);
  if (d.event === "atlas.inference.diagnostic") diagnostics.push(d);
};
const endpoint = generation.endpoint;
let active = 0,
  peakActive = 0;
const fetcher = async (url, init) => {
  if (String(url).startsWith("http://synthetic-search/")) {
    const route = new URL(url).pathname;
    return Response.json(
      route.startsWith("/tasks/")
        ? { status: "succeeded" }
        : route.endsWith("/search")
          ? { hits: [] }
          : { taskUid: 1 },
    );
  }
  const route = new URL(url).pathname;
  if (!["/api/generate", "/api/chat", "/api/embed"].includes(route))
    return fetch(url, init);
  active++;
  peakActive = Math.max(peakActive, active);
  try {
    const r = await fetch(url, init);
    // Consume the small synthetic response so the counter covers backend execution,
    // including the complete streamed answer (no text goes into the receipt).
    return new Response(await r.arrayBuffer(), {
      status: r.status,
      headers: r.headers,
    });
  } finally {
    active--;
  }
};
const provider = new OllamaModelProvider({
  modelDigest: generation.model.digest,
  engineVersion: generation.engine.version,
  fetch: fetcher,
  observe: (d) => diagnostics.push(d),
});
const index = createAtlasSemanticIndex(
  {
    baseUrl: "http://synthetic-search",
    apiKey: "synthetic-only",
    fetch: fetcher,
  },
  semantic,
);
const scope = {
  tenantId: randomUUID(),
  entityCode: "business_partner",
  recordId: randomUUID(),
};
const binding = {
  bindingId: "atlas-re-1.0-local",
  bindingRevision: generation.model.digest,
  publicModelId: generation.model.publicId,
  providerId: "ollama",
  upstreamModelId: generation.model.upstream,
  modelDigest: generation.model.digest,
  adapterId: "ollama-native",
  adapterVersion: "1",
  displayTier: "balanced",
  exposure: "product",
  status: "available",
  capabilities: {
    streaming: true,
    tools: false,
    vision: false,
    structuredOutput: true,
    maxContextTokens: 4096,
    maxOutputTokens: 1024,
  },
  credentialPolicy: "local_transport",
  credentialOwnerId: "atlas-inference",
  providerRegion: "local",
  dataHandlingProfileId: "local-private-no-cloud-v1",
  routingPolicyId: "no-fallback-v1",
  allowedDataClasses: ["synthetic"],
  priceVersion: "local-zero-provider-fee-v1",
  inputPricePerMtokUsd: 0,
  outputPricePerMtokUsd: 0,
};
async function chat(scenario, signal) {
  const started = performance.now(),
    runId = randomUUID();
  let terminal,
    answer = "",
    authChecks = 0;
  for await (const e of provider.invoke({
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
              text: "Synthetic test only: what is 7 multiplied by 9? Reply with the integer only.",
            },
          ],
        },
      ],
      maxOutputTokens: 32,
    },
    trace: {
      runId,
      providerCallId: randomUUID(),
      tenantId: scope.tenantId,
      principalHash: "synthetic",
      safetyIdentifier: "synthetic",
      promptRevision: "synthetic",
      policyRevision: "synthetic",
    },
    reauthorize: async () => {
      authChecks++;
      return true;
    },
    signal,
  })) {
    if (e.kind === "text_delta") answer += e.text;
    if (["completed", "failed", "cancelled"].includes(e.kind)) terminal = e;
  }
  const own = diagnostics.filter((d) => d.runId === runId),
    final = own.at(-1);
  const result = {
    scenario,
    workload: "generation",
    runId,
    status: terminal?.kind ?? "missing-terminal",
    code: terminal?.error?.code,
    answerCorrect: /\b63\b/.test(answer),
    elapsedMs: Math.round(performance.now() - started),
    queueWaitMs: final?.queueWaitMs ?? 0,
    loadDurationMs: final?.loadDurationMs ?? 0,
    warmups: own.filter((d) => d.phase === "warmup_started").length,
    authChecks,
  };
  requests.push(result);
  return result;
}
async function embed(scenario, signal) {
  const started = performance.now();
  let status = "completed",
    code;
  try {
    await index.search(scope, "Synthetic reliability assessment", 1, signal);
  } catch (e) {
    status = signal?.aborted ? "cancelled" : "failed";
    code = typeof e.code === "string" ? e.code : e.name;
  }
  const result = {
    scenario,
    workload: "embedding",
    status,
    code,
    elapsedMs: Math.round(performance.now() - started),
  };
  requests.push(result);
  return result;
}
async function ps() {
  const r = await fetch(endpoint + "/api/ps");
  assert.equal(r.status, 200);
  return r.json();
}
async function sample() {
  try {
    const data = await ps();
    memory.push({
      observedAt: new Date().toISOString(),
      modelResidentBytes: data.models.reduce(
        (n, m) => n + (Number(m.size) || 0),
        0,
      ),
      modelVramBytes: data.models.reduce(
        (n, m) => n + (Number(m.size_vram) || 0),
        0,
      ),
    });
  } catch {
    /* reported as a missing sample */
  }
}
const timer = setInterval(() => void sample(), 250);
let report;
try {
  const tags = await (await fetch(endpoint + "/api/tags")).json();
  for (const [model, digest] of [
    [generation.model.upstream, generation.model.digest],
    [semantic.model, semantic.digest],
  ])
    assert.ok(
      tags.models.some(
        (m) =>
          m.name === model &&
          m.digest.replace(/^sha256:/, "") === digest.slice(7),
      ),
    );
  // Supported pilot experiment: one inference slot, <=2 simultaneous normal callers,
  // 4 callers only for overload characterization. One synthetic prompt, <=32 output tokens.
  for (const model of [generation.model.upstream, semantic.model]) {
    const r = await fetch(endpoint + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    assert.equal(r.status, 200);
    await r.arrayBuffer();
  }
  const coldResident = await ps();
  assert.ok(
    !coldResident.models.some((m) =>
      [generation.model.upstream, semantic.model].includes(m.name),
    ),
  );
  await chat("cold-start");
  for (let i = 0; i < 6; i++) await chat("warm");
  for (let i = 0; i < 4; i++)
    await Promise.all([embed("mixed-2"), chat("mixed-2")]);
  for (let i = 0; i < 2; i++)
    await Promise.all([
      embed("mixed-4"),
      chat("mixed-4"),
      embed("mixed-4"),
      chat("mixed-4"),
    ]);
  // Cancellation while genuinely queued, with the same shared generation/embedding lease.
  let release = await sharedAtlasInferenceQueue.acquire(
    new AbortController().signal,
  );
  const cancelled = new AbortController();
  const queued = [
    chat("queued-cancellation", cancelled.signal),
    embed("queued-cancellation", cancelled.signal),
  ];
  await new Promise((r) => setTimeout(r, 30));
  cancelled.abort();
  await Promise.all(queued);
  release();
  // Actual timeout and full queue, retaining each rejected attempt. No backend work dispatched.
  release = await sharedAtlasInferenceQueue.acquire(
    new AbortController().signal,
  );
  const saturation = Array.from({ length: 10 }, (_, i) =>
    i % 2 ? chat("saturation") : embed("saturation"),
  );
  await Promise.all(saturation);
  release();
  await chat("post-saturation");
  // An actual in-flight inference cancellation; longer bounded synthetic output avoids
  // confusing a request that already completed with a cancelled request.
  const controller = new AbortController();
  let reachedBackend = false;
  const cancelProvider = new OllamaModelProvider({
    modelDigest: generation.model.digest,
    engineVersion: generation.engine.version,
    fetch: async (url, init) => {
      if (String(url).endsWith("/api/chat")) {
        reachedBackend = true;
        setTimeout(() => controller.abort(), 20);
      }
      return fetch(url, init);
    },
    observe: (d) => diagnostics.push(d),
  });
  let terminal;
  const cancelStart = performance.now();
  for await (const e of cancelProvider.invoke({
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
              text: "List the integers from 1 to 200, separated by spaces. Synthetic test only.",
            },
          ],
        },
      ],
      maxOutputTokens: 1024,
    },
    trace: {
      runId: randomUUID(),
      providerCallId: randomUUID(),
      tenantId: scope.tenantId,
      principalHash: "synthetic",
      safetyIdentifier: "synthetic",
      promptRevision: "synthetic",
      policyRevision: "synthetic",
    },
    reauthorize: async () => true,
    signal: controller.signal,
  }))
    if (["completed", "failed", "cancelled"].includes(e.kind))
      terminal = e.kind;
  requests.push({
    scenario: "active-cancellation",
    workload: "generation",
    status: terminal,
    reachedBackend,
    elapsedMs: Math.round(performance.now() - cancelStart),
  });
  await chat("post-cancellation");
  await sample();
  const percentile = (a, p) =>
    a.length
      ? [...a].sort((a, b) => a - b)[Math.max(0, Math.ceil(a.length * p) - 1)]
      : null;
  const groups = Object.fromEntries(
    [...new Set(requests.map((r) => r.scenario))].map((name) => {
      const rows = requests.filter((r) => r.scenario === name);
      return [
        name,
        {
          requests: rows.length,
          completed: rows.filter((r) => r.status === "completed").length,
          failed: rows.filter((r) => r.status === "failed").length,
          cancelled: rows.filter((r) => r.status === "cancelled").length,
          latencyP50Ms: percentile(
            rows.map((r) => r.elapsedMs),
            0.5,
          ),
          latencyP95Ms: percentile(
            rows.map((r) => r.elapsedMs),
            0.95,
          ),
        },
      ];
    }),
  );
  const normal = requests.filter((r) =>
    [
      "cold-start",
      "warm",
      "mixed-2",
      "post-saturation",
      "post-cancellation",
    ].includes(r.scenario),
  );
  const coldGenerations = requests.filter(
    (r) => r.workload === "generation" && r.warmups > 0,
  );
  const checks = {
    coldStartUnloaded: true,
    pilotRequestsSucceeded: normal.every(
      (r) =>
        r.status === "completed" &&
        (r.workload !== "generation" || r.answerCorrect),
    ),
    oneConcurrentInference: peakActive === 1,
    queuedCancellation: requests
      .filter((r) => r.scenario === "queued-cancellation")
      .every((r) => r.status === "cancelled"),
    activeCancellation: terminal === "cancelled" && reachedBackend,
    queueFullReported: requests.some((r) => r.code === "local_queue_full"),
    queueTimeoutReported: requests.some(
      (r) => r.code === "local_queue_timeout",
    ),
    recoveryAfterSaturation:
      requests.find((r) => r.scenario === "post-saturation")?.status ===
      "completed",
    recoveryAfterCancellation:
      requests.find((r) => r.scenario === "post-cancellation")?.status ===
      "completed",
  };
  report = {
    observedAt: new Date().toISOString(),
    kind: "isolated-live-inference-assessment",
    authenticated: false,
    searchStorageStubbed: true,
    businessWrites: 0,
    load: {
      activeLimit: 1,
      waiterLimit: 8,
      queueTimeoutMs: 5000,
      pilotConcurrentCallers: 2,
      stressConcurrentCallers: 4,
      generationOutputTokenLimit: 32,
    },
    pins: {
      generation: generation.model,
      embedding: { model: semantic.model, digest: semantic.digest },
    },
    checks,
    passed: Object.values(checks).every(Boolean),
    groups,
    metrics: {
      peakConcurrentInference: peakActive,
      pilotFailureRate:
        normal.filter((r) => r.status !== "completed").length / normal.length,
      coldGenerationRequests: coldGenerations.length,
      coldGenerationRecovered: coldGenerations.filter(
        (r) => r.status === "completed",
      ).length,
      queueWaitP50Ms: percentile(
        diagnostics
          .filter((d) => d.phase === "admitted")
          .map((d) => d.queueWaitMs),
        0.5,
      ),
      queueWaitP95Ms: percentile(
        diagnostics
          .filter((d) => d.phase === "admitted")
          .map((d) => d.queueWaitMs),
        0.95,
      ),
      peakModelResidentBytes: Math.max(
        0,
        ...memory.map((m) => m.modelResidentBytes),
      ),
      peakModelVramBytes: Math.max(0, ...memory.map((m) => m.modelVramBytes)),
      memorySamples: memory.length,
    },
    requests,
    diagnostics,
    limitations: [
      "Independent Node process uses the deployed modules and live inference; it does not share admission with the HTTP API process.",
      "Meilisearch responses are stubbed. This is not authenticated retrieval or persona qualification.",
      "Process-local admission does not coordinate other API replicas, workers or external inference clients.",
      "Small synthetic pilot sample; percentiles are descriptive, not a production SLO.",
      "Model residency samples are not total device or host memory.",
    ],
  };
} catch (e) {
  report = {
    passed: false,
    errorName: e.name,
    errorCode: e.code ?? "assessment_failed",
    requests,
    diagnostics,
  };
} finally {
  clearInterval(timer);
}
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
