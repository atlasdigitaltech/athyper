import { randomUUID } from "node:crypto";
import {
  sharedAtlasInferenceQueue,
  recordInferenceDiagnostic,
} from "@athyper/server-adapter-ai-ollama";
import type { MeilisearchIndexConfig } from "@athyper/server-adapter-search-meilisearch";
import type { AtlasKnowledgeCitation } from "@athyper/server-contract-ai";

/** Search normalization changes retrieval terms only; the model receives the exact user question. */
export function atlasDocumentSearchTerms(query: string): string {
  const stop = new Set(
    "a an the and or to of in on from for with according attached attachment attachments document documents file files this that these those partner record please tell me us what which who when where how is are was were be its it their my your our as about cite identify explain summarize name facts provided".split(
      " ",
    ),
  );
  const words = [
    ...new Set(
      (query.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (w) => !stop.has(w),
      ),
    ),
  ].slice(0, 16);
  return words.join(" ") || query.slice(0, 256);
}
export interface AtlasSemanticConfig {
  endpoint: string;
  model: string;
  digest: string;
  dimensions: number;
  indexUid: string;
  semanticRatio: number;
  scoreThreshold: number;
}
export function parseAtlasSemanticConfig(value: unknown): AtlasSemanticConfig {
  const c = value as AtlasSemanticConfig;
  if (
    !c ||
    typeof c.endpoint !== "string" ||
    !/^https?:\/\//.test(c.endpoint) ||
    c.model !== "nomic-embed-text:v1.5" ||
    !/^sha256:[a-f0-9]{64}$/.test(c.digest) ||
    c.dimensions !== 768 ||
    !/^atlas_attachment_passages_[a-z0-9_]+$/.test(c.indexUid) ||
    !Number.isFinite(c.semanticRatio) ||
    c.semanticRatio <= 0 ||
    c.semanticRatio > 1 ||
    !Number.isFinite(c.scoreThreshold) ||
    c.scoreThreshold < 0 ||
    c.scoreThreshold > 1
  ) {
    throw new Error("Invalid pinned Atlas semantic retrieval configuration");
  }
  return c;
}
interface Passage {
  citation: AtlasKnowledgeCitation;
  permissionCode: string;
  text: string;
}
/** Search storage is never an authority. Callers must canonically admit every returned locator. */
export function createAtlasSemanticIndex(
  search: MeilisearchIndexConfig,
  config: AtlasSemanticConfig,
) {
  parseAtlasSemanticConfig(config);
  const fetcher = search.fetch ?? fetch;
  const path = "/indexes/" + config.indexUid;
  async function request(
    base: string,
    route: string,
    body?: unknown,
    method = "POST",
    key?: string,
    signal?: AbortSignal,
  ) {
    const response = await fetcher(base.replace(/\/$/, "") + route, {
      method,
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ?? AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error("Atlas retrieval provider unavailable"), {
        status: 503,
        code: `inference_http_${response.status}`,
      });
    }
    return await response.json();
  }
  const meili = (route: string, body?: unknown, method = "POST") =>
    request(search.baseUrl, route, body, method, search.apiKey);
  async function task(
    route: string,
    body: unknown,
    method = "POST",
    allowExists = false,
  ) {
    const receipt = await meili(route, body, method);
    if (!Number.isInteger(receipt.taskUid))
      throw new Error("Invalid retrieval task receipt");
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const result = await meili("/tasks/" + receipt.taskUid, undefined, "GET");
      if (
        result.status === "succeeded" ||
        (allowExists && result.error?.code === "index_already_exists")
      )
        return;
      if (result.status === "failed" || result.status === "canceled")
        throw new Error("Atlas passage indexing failed");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Atlas passage indexing timed out");
  }
  let ready: Promise<void> | undefined;
  const initialize = () =>
    (ready ??= (async () => {
      await task(
        "/indexes",
        { uid: config.indexUid, primaryKey: "id" },
        "POST",
        true,
      );
      await task(
        path + "/settings",
        {
          searchableAttributes: ["text"],
          filterableAttributes: [
            "tenantId",
            "entityCode",
            "recordId",
            "modelDigest",
          ],
          displayedAttributes: [
            "id",
            "citation",
            "permissionCode",
            "tenantId",
            "entityCode",
            "recordId",
            "modelDigest",
          ],
          embedders: {
            atlas: { source: "userProvided", dimensions: config.dimensions },
          },
        },
        "PATCH",
      );
    })().catch((error) => {
      ready = undefined;
      throw error;
    }));
  async function embed(
    texts: string[],
    query: boolean,
    inputSignal?: AbortSignal,
  ) {
    const leaseAbort = new AbortController();
    const operationId = randomUUID();
    const started = Date.now(),
      signal = inputSignal
        ? AbortSignal.any([
            inputSignal,
            leaseAbort.signal,
            AbortSignal.timeout(60_000),
          ])
        : AbortSignal.any([leaseAbort.signal, AbortSignal.timeout(60_000)]);
    let release: (() => void | Promise<void>) | undefined,
      queueWaitMs = 0,
      loadDurationMs: number | null = null;
    const diagnostic = (phase: string, code?: string) => {
      try {
        recordInferenceDiagnostic({
          workload: "embedding",
          operationId,
          phase,
          model: config.model,
          modelDigest: config.digest,
          attempt: 1,
          queueWaitMs,
          loadDurationMs,
          elapsedMs: Date.now() - started,
          ...(code ? { code } : {}),
        });
      } catch {
        /* Diagnostics cannot alter inference admission. */
      }
    };
    try {
      release = await sharedAtlasInferenceQueue.acquire(signal, (error) =>
        leaseAbort.abort(error),
      );
      queueWaitMs = Date.now() - started;
      diagnostic("admitted");
      if (
        !texts.length ||
        texts.length > 16 ||
        texts.some((t) => t.length > 4096)
      )
        throw new Error("Embedding batch exceeds bounds");
      const tags = await request(
        config.endpoint,
        "/api/tags",
        undefined,
        "GET",
        undefined,
        signal,
      );
      if (
        !tags.models?.some(
          (m: { name: string; digest: string }) =>
            m.name === config.model &&
            m.digest.replace(/^sha256:/, "") === config.digest.slice(7),
        )
      ) {
        throw Object.assign(
          new Error("Pinned Atlas embedding model unavailable"),
          { status: 503, code: "embedding_digest_mismatch" },
        );
      }
      const result = await request(
        config.endpoint,
        "/api/embed",
        {
          model: config.model,
          input: texts.map(
            (t) => (query ? "search_query: " : "search_document: ") + t,
          ),
          truncate: false,
          keep_alive: "5m",
        },
        "POST",
        undefined,
        signal,
      );
      if (
        result.model !== config.model ||
        !Array.isArray(result.embeddings) ||
        result.embeddings.length !== texts.length ||
        result.embeddings.some(
          (v: unknown) =>
            !Array.isArray(v) ||
            v.length !== config.dimensions ||
            v.some((x) => typeof x !== "number" || !Number.isFinite(x)) ||
            !v.some((x) => x !== 0),
        )
      ) {
        throw Object.assign(new Error("Invalid Atlas embedding response"), {
          code: "embedding_response_invalid",
        });
      }
      loadDurationMs = Number.isFinite(result.load_duration)
        ? Math.max(0, result.load_duration / 1e6)
        : null;
      diagnostic("completed");
      return result.embeddings as number[][];
    } catch (error) {
      if (!release) queueWaitMs = Date.now() - started;
      const raw = (error as { code?: unknown })?.code;
      const code =
        typeof raw === "string" &&
        /^(embedding_digest_mismatch|embedding_response_invalid|local_queue_full|local_queue_timeout|inference_admission_(?:unavailable|uninitialized|abandoned|lost|deadline)|inference_http_[0-9]{3})$/.test(
          raw,
        )
          ? raw
          : "embedding_unavailable";
      diagnostic(
        "failed",
        leaseAbort.signal.aborted
          ? "inference_admission_lost"
          : inputSignal?.aborted
          ? "embedding_cancelled"
          : signal.aborted
            ? "embedding_timeout"
            : code,
      );
      throw error;
    } finally {
      try {
        await release?.();
        diagnostic("released");
      } catch {
        diagnostic("release_failed", "inference_admission_unavailable");
      }
    }
  }
  return {
    async index(
      scope: { tenantId: string; entityCode: string; recordId: string },
      passages: Passage[],
      signal?: AbortSignal,
    ) {
      await initialize();
      for (let offset = 0; offset < passages.length; offset += 16) {
        const batch = passages.slice(offset, offset + 16);
        const vectors = await embed(
          batch.map((p) => p.text),
          false,
          signal,
        );
        await task(
          path + "/documents",
          batch.map((p, i) => ({
            id: p.citation.chunkId,
            ...scope,
            modelDigest: config.digest,
            citation: p.citation,
            permissionCode: p.permissionCode,
            text: p.text,
            _vectors: { atlas: vectors[i] },
          })),
        );
      }
    },
    async search(
      scope: { tenantId: string; entityCode: string; recordId: string },
      query: string,
      limit: number,
      signal?: AbortSignal,
    ) {
      await initialize();
      const [vector] = await embed([query], true, signal);
      const result = await meili(path + "/search", {
        q: atlasDocumentSearchTerms(query),
        vector,
        hybrid: { embedder: "atlas", semanticRatio: config.semanticRatio },
        rankingScoreThreshold: config.scoreThreshold,
        showRankingScore: true,
        filter: Object.entries({ ...scope, modelDigest: config.digest }).map(
          ([k, v]) => `${k} = ${JSON.stringify(v)}`,
        ),
        limit,
        attributesToRetrieve: [
          "citation",
          "permissionCode",
          "tenantId",
          "entityCode",
          "recordId",
          "modelDigest",
        ],
      });
      // Recheck scope even if a malformed or compromised provider ignores its filter.
      return (result.hits ?? [])
        .filter(
          (h: Record<string, unknown>) =>
            Object.entries({ ...scope, modelDigest: config.digest }).every(
              ([k, v]) => h[k] === v,
            ) &&
            Number.isFinite(h._rankingScore) &&
            Number(h._rankingScore) >= config.scoreThreshold,
        )
        .map(
          (h: {
            citation: AtlasKnowledgeCitation;
            permissionCode: string;
            _rankingScore: number;
          }) => ({
            citation: h.citation,
            permissionCode: h.permissionCode,
            score: h._rankingScore,
          }),
        );
    },
  };
}
