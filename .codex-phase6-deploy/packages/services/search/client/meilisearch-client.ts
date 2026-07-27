/**
 * MeilisearchClient — thin HTTP wrapper over the Meilisearch REST API.
 *
 * Scope kept deliberately minimal for Slice A: the operations the search
 * service and indexing worker actually need. Full SDK capabilities
 * (analytics, multi-index batch, federated search) can be added when a
 * concrete caller needs them.
 *
 * Authentication:
 *   - Master key (admin operations: index config, key management)
 *   - Tenant tokens (search queries) — minted by tenant-token.ts,
 *     never generated here
 *
 * All methods throw on non-2xx responses with the response body in the
 * error message. Callers decide whether to catch, log, or escalate.
 */

import type {
  SearchDocument,
} from "./index-schema.js";

export interface MeilisearchIndexSettings {
  searchableAttributes?: readonly string[];
  filterableAttributes?: readonly string[];
  sortableAttributes?:   readonly string[];
  rankingRules?:         readonly string[];
  stopWords?:            readonly string[];
  /** Primary key attribute — once set, cannot change without re-creating index. */
  primaryKey?:           string;
}

export interface MeilisearchSearchRequest {
  q:                string;
  filter?:          string | string[];
  sort?:            string[];
  limit?:           number;
  offset?:          number;
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
}

export interface MeilisearchSearchHit {
  id:           string;
  _formatted?:  Record<string, unknown>;
  [key: string]: unknown;
}

export interface MeilisearchSearchResponse {
  hits:             MeilisearchSearchHit[];
  query:            string;
  processingTimeMs: number;
  limit:            number;
  offset:           number;
  estimatedTotalHits?: number;
}

export interface MeilisearchTaskResponse {
  taskUid:    number;
  indexUid:   string;
  status:     "enqueued" | "processing" | "succeeded" | "failed";
  type:       string;
  enqueuedAt: string;
}

/**
 * Meilisearch API key — subset of fields we actually consume. Meili returns
 * more (createdAt, updatedAt, expiresAt, indexes, actions) but the two we
 * care about are the UID (identifier, used in tenant tokens) and `key`
 * (the raw value used as the HS256 signing secret).
 */
export interface MeilisearchKey {
  uid:         string;
  key:         string;
  name:        string | null;
  description: string | null;
  actions:     string[];
  indexes:     string[];
  expiresAt:   string | null;
}

export interface MeilisearchCreateKeyInput {
  /** Deterministic client-supplied UID so idempotent re-boot can look it up. */
  uid:         string;
  name?:       string;
  description: string;
  /** Meili actions, e.g. ["search"]. */
  actions:     readonly string[];
  /** Index UIDs this key may operate on, or ["*"]. */
  indexes:     readonly string[];
  /** ISO timestamp or null for no expiry. */
  expiresAt:   string | null;
}

export class MeilisearchClient {
  private readonly host:      string;
  private readonly apiKey:    string;
  private readonly timeoutMs: number;
  private readonly logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };

  constructor(config: {
    host:       string;
    apiKey:     string;
    timeoutMs?: number;
    logger?: {
      error(event: string, fields?: Record<string, unknown>): void;
      warn(event: string, fields?: Record<string, unknown>): void;
    };
  }) {
    this.host      = config.host.replace(/\/$/, "");
    this.apiKey    = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger    = config.logger;
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.request("GET", "/health");
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Index management (master-key operations) ──────────────────────────────

  /**
   * Create an index if absent. Idempotent — a 4xx on re-create (already
   * exists) is swallowed. Throws on other failures.
   */
  async ensureIndex(indexUid: string, primaryKey: string): Promise<void> {
    const res = await this.request("POST", "/indexes", { uid: indexUid, primaryKey });
    if (res.ok) return;
    if (res.status === 409) return; // already exists
    const body = await res.text().catch(() => "");
    // Meilisearch returns 202 Accepted for async index creation — treat as OK.
    if (res.status === 202) return;
    // Some versions return 400 with code `index_already_exists`.
    if (body.includes("index_already_exists")) return;
    throw new Error(`ensureIndex(${indexUid}) failed: ${res.status} ${body}`);
  }

  async updateIndexSettings(indexUid: string, settings: MeilisearchIndexSettings): Promise<void> {
    const res = await this.request("PATCH", `/indexes/${indexUid}/settings`, settings);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`updateIndexSettings(${indexUid}) failed: ${res.status} ${body}`);
    }
  }

  // ─── Document operations (master-key, used by indexer) ─────────────────────

  async addDocuments(indexUid: string, documents: SearchDocument[]): Promise<MeilisearchTaskResponse> {
    const res = await this.request(
      "POST",
      `/indexes/${indexUid}/documents`,
      documents,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`addDocuments(${indexUid}, ${documents.length}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchTaskResponse>;
  }

  async deleteDocument(indexUid: string, id: string): Promise<MeilisearchTaskResponse> {
    const res = await this.request("DELETE", `/indexes/${indexUid}/documents/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`deleteDocument(${indexUid}, ${id}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchTaskResponse>;
  }

  async deleteDocuments(indexUid: string, ids: string[]): Promise<MeilisearchTaskResponse> {
    const res = await this.request("POST", `/indexes/${indexUid}/documents/delete-batch`, ids);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`deleteDocuments(${indexUid}, ${ids.length}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchTaskResponse>;
  }

  // ─── API key management (master-key operations) ───────────────────────────

  /**
   * Look up a Meilisearch API key by its UID. Returns null on 404 — caller
   * uses that signal to decide whether to create the key. Throws on other
   * non-2xx responses so transient failures surface to the retry loop.
   */
  async getKey(uid: string): Promise<MeilisearchKey | null> {
    const res = await this.request("GET", `/keys/${encodeURIComponent(uid)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`getKey(${uid}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchKey>;
  }

  /**
   * Create an API key with a client-supplied deterministic UID. Idempotent —
   * a 409 (uid_already_exists) is swallowed and the caller is expected to
   * follow with getKey() to fetch the existing record.
   */
  async createKey(input: MeilisearchCreateKeyInput): Promise<MeilisearchKey | null> {
    const res = await this.request("POST", "/keys", {
      uid:         input.uid,
      name:        input.name        ?? null,
      description: input.description,
      actions:     [...input.actions],
      indexes:     [...input.indexes],
      expiresAt:   input.expiresAt,
    });
    if (res.status === 409) return null; // already exists — caller should getKey()
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Some Meili versions return 400 with `uid_already_exists`.
      if (body.includes("uid_already_exists")) return null;
      throw new Error(`createKey(${input.uid}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchKey>;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  /**
   * Execute a search. Callers that need tenant isolation should use
   * SearchService.search() instead — this method accepts any filter and
   * does not enforce tenant scoping on its own.
   *
   * @param searchKey override — if provided, overrides the master key for
   *                  this request. Use with tenant tokens so the filter
   *                  baked into the token is enforced by Meilisearch.
   */
  async search(
    indexUid: string,
    request: MeilisearchSearchRequest,
    searchKey?: string,
  ): Promise<MeilisearchSearchResponse> {
    const res = await this.request(
      "POST",
      `/indexes/${indexUid}/search`,
      request,
      searchKey,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`search(${indexUid}) failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<MeilisearchSearchResponse>;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async request(
    method: string,
    path:   string,
    body?:  unknown,
    overrideKey?: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.host}${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${overrideKey ?? this.apiKey}`,
          ...(body != null ? { "Content-Type": "application/json" } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createMeilisearchClient(config?: {
  host?:      string;
  apiKey?:    string;
  timeoutMs?: number;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}): MeilisearchClient | null {
  const host   = config?.host   ?? process.env["SEARCHCORE_URL"]        ?? "";
  const apiKey = config?.apiKey ?? process.env["SEARCHCORE_MASTER_KEY"] ?? "";
  if (!host || !apiKey) return null;
  return new MeilisearchClient({
    host,
    apiKey,
    timeoutMs: config?.timeoutMs,
    logger:    config?.logger,
  });
}
