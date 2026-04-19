/**
 * SearchService — high-level, tenant-scoped operations.
 *
 * Thin service layer over MeilisearchClient. Enforces tenant scoping by
 * minting a tenant token per query and passing it to Meilisearch. Indexing
 * ops (upsert/delete) bypass tenant tokens since the indexer is a trusted
 * server-side caller that must write documents carrying _tenant_id.
 *
 * Lifecycle:
 *   new SearchService({...})          // cheap, no IO
 *   searchService.isReady() === false // until warm-up completes
 *   searchService.warmUp()            // idempotent, retries until success
 *   searchService.isReady() === true  // index + scoped key are live
 *
 * Callers (outbox handler, /api/search route) must check isReady() and
 * either defer work (throw a retryable error) or return a "warming"
 * response. The warm-up loop is kicked off by bootstrap via lifecycle.onReady
 * and runs indefinitely in the background so search comes up automatically
 * once Meilisearch is reachable.
 */

import { MeilisearchClient, type MeilisearchSearchResponse } from "./meilisearch-client.js";
import { mintMeilisearchTenantToken } from "./tenant-token.js";
import { ensureTenantTokenSignerKey, type ResolvedSignerKey } from "./scoped-key.js";
import {
  SEARCH_INDEX_NAME,
  SEARCHABLE_ATTRIBUTES,
  FILTERABLE_ATTRIBUTES,
  SORTABLE_ATTRIBUTES,
  RANKING_RULES,
  STOP_WORDS,
  buildDocumentId,
  type SearchDocument,
} from "./index-schema.js";

export interface SearchServiceOptions {
  /** Admin client authenticated with the Meilisearch master key. */
  client:     MeilisearchClient;
  indexUid?:  string;                // default: "records"
  logger?: {
    info(event: string,  fields?: Record<string, unknown>): void;
    warn(event: string,  fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
  /**
   * Retry policy for warmUp(). Exposed for tests and CLI scripts; production
   * runtime callers should accept the defaults (no attempt cap — loop
   * indefinitely so search comes up automatically when Meili is reachable).
   * Backoff starts at `initialDelayMs` and doubles up to `maxDelayMs`.
   * Set `maxAttempts` > 0 to cap retries; the loop then rejects with the
   * final error instead of looping forever. CLI scripts use this to fail
   * fast rather than hang when Meilisearch is down.
   */
  retry?: {
    initialDelayMs?: number;
    maxDelayMs?:     number;
    maxAttempts?:    number;
  };
}

export interface SearchQuery {
  tenantId:    string;
  q:           string;
  entityTypes?: string[];            // filter: entity_type IN (…)
  status?:      string[];            // filter: status IN (…)
  limit?:       number;
  offset?:      number;
  sort?:        "relevance" | "updated_desc" | "title_asc";
}

export type WarmUpState =
  | { status: "not_started" }
  | { status: "warming"; attempt: number; lastError?: string }
  | { status: "ready"; keyUid: string }
  | { status: "stopped" };

/** Error thrown by upsert/search/deleteByEntityRef when warm-up has not
 *  completed. Outbox handler treats this as retryable. */
export class SearchNotReadyError extends Error {
  constructor(message = "search_not_ready") {
    super(message);
    this.name = "SearchNotReadyError";
  }
}

export class SearchService {
  private readonly client:   MeilisearchClient;
  private readonly indexUid: string;
  private readonly logger?:  SearchServiceOptions["logger"];
  private readonly retry:    Required<NonNullable<SearchServiceOptions["retry"]>>;

  private signer:    ResolvedSignerKey | null = null;
  private warmUpPromise: Promise<void> | null = null;
  private state:     WarmUpState = { status: "not_started" };
  private stopRequested = false;

  constructor(opts: SearchServiceOptions) {
    this.client   = opts.client;
    this.indexUid = opts.indexUid ?? SEARCH_INDEX_NAME;
    this.logger   = opts.logger;
    this.retry    = {
      initialDelayMs: opts.retry?.initialDelayMs ?? 1_000,
      maxDelayMs:     opts.retry?.maxDelayMs     ?? 30_000,
      maxAttempts:    opts.retry?.maxAttempts    ?? 0, // 0 = infinite
    };
  }

  // ─── Readiness ─────────────────────────────────────────────────────────────

  isReady(): boolean {
    return this.state.status === "ready";
  }

  getState(): WarmUpState {
    return this.state;
  }

  /**
   * Provision the index + tenant-token signing key. Idempotent and safe to
   * call multiple times — concurrent callers await the same underlying
   * promise. Retries with exponential backoff until Meilisearch is
   * reachable AND both provisioning steps succeed.
   *
   * Never rejects under normal operation — the loop continues indefinitely.
   * Returns once isReady() flips true. stopWarmUp() cancels the loop during
   * shutdown; stopped warm-ups reject with a cancellation error.
   */
  warmUp(): Promise<void> {
    if (this.isReady())        return Promise.resolve();
    if (this.warmUpPromise)    return this.warmUpPromise;

    this.warmUpPromise = this.runWarmUpLoop();
    return this.warmUpPromise;
  }

  /**
   * Signal the warm-up loop to exit at the next retry boundary. Used during
   * process shutdown so the loop does not keep the event loop alive.
   */
  stopWarmUp(): void {
    this.stopRequested = true;
  }

  private async runWarmUpLoop(): Promise<void> {
    let delay = this.retry.initialDelayMs;
    let attempt = 0;

    for (;;) {
      if (this.stopRequested) {
        this.state = { status: "stopped" };
        throw new Error("search_warmup_stopped");
      }

      attempt += 1;
      this.state = { status: "warming", attempt, lastError: this.state.status === "warming" ? this.state.lastError : undefined };

      try {
        // Step 1: index must exist with canonical settings.
        await this.client.ensureIndex(this.indexUid, "id");
        await this.client.updateIndexSettings(this.indexUid, {
          searchableAttributes: [...SEARCHABLE_ATTRIBUTES],
          filterableAttributes: [...FILTERABLE_ATTRIBUTES],
          sortableAttributes:   [...SORTABLE_ATTRIBUTES],
          rankingRules:         [...RANKING_RULES],
          stopWords:            [...STOP_WORDS],
        });

        // Step 2: scoped search-only key for tenant-token signing. Uses the
        // admin (master-key) client for provisioning only. The resolved
        // scoped key value lives inside this SearchService and is never
        // surfaced on the public interface.
        const signer = await ensureTenantTokenSignerKey(this.client);
        this.signer  = signer;
        this.state   = { status: "ready", keyUid: signer.uid };
        this.logger?.info("search_warmup_completed", {
          keyUid:  signer.uid,
          attempts: attempt,
        });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.state = { status: "warming", attempt, lastError: message };
        this.logger?.warn("search_warmup_attempt_failed", {
          attempt,
          nextDelayMs: delay,
          err: message,
        });

        if (this.retry.maxAttempts > 0 && attempt >= this.retry.maxAttempts) {
          throw err instanceof Error
            ? err
            : new Error(`search_warmup_failed_after_${attempt}_attempts: ${message}`);
        }

        await this.sleep(delay);
        delay = Math.min(delay * 2, this.retry.maxDelayMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      // unref so a pending retry does not block process shutdown.
      if (typeof (t as { unref?: () => void }).unref === "function") {
        (t as { unref: () => void }).unref();
      }
    });
  }

  // ─── Indexing (called by outbox worker / backfill) ─────────────────────────

  /**
   * Idempotent no-op after the first successful warm-up. Retained for
   * compatibility with callers that want an explicit trigger before
   * writing documents (e.g. the backfill script). In-process calls should
   * prefer warmUp() which has the retry loop.
   */
  async ensureIndex(): Promise<void> {
    if (this.isReady()) return;
    await this.warmUp();
  }

  async upsert(docs: SearchDocument[]): Promise<void> {
    if (docs.length === 0) return;
    if (!this.isReady()) throw new SearchNotReadyError("search_upsert_not_ready");
    await this.client.addDocuments(this.indexUid, docs);
  }

  async deleteByEntityRef(entityType: string, entityId: string): Promise<void> {
    if (!this.isReady()) throw new SearchNotReadyError("search_delete_not_ready");
    await this.client.deleteDocument(
      this.indexUid,
      buildDocumentId(entityType, entityId),
    );
  }

  // ─── Query (called by /api/search route) ───────────────────────────────────

  async search(query: SearchQuery): Promise<MeilisearchSearchResponse> {
    if (!this.isReady() || !this.signer) {
      throw new SearchNotReadyError("search_query_not_ready");
    }

    const token = await mintMeilisearchTenantToken(this.signer.key, {
      tenantId:  query.tenantId,
      indexUid:  this.indexUid,
      apiKeyUid: this.signer.uid,
    });

    const extraFilters: string[] = [];
    if (query.entityTypes?.length) {
      const quoted = query.entityTypes.map((t) => `"${t.replace(/"/g, '\\"')}"`);
      extraFilters.push(`entity_type IN [${quoted.join(",")}]`);
    }
    if (query.status?.length) {
      const quoted = query.status.map((s) => `"${s.replace(/"/g, '\\"')}"`);
      extraFilters.push(`status IN [${quoted.join(",")}]`);
    }

    const sortMap: Record<NonNullable<SearchQuery["sort"]>, string[] | undefined> = {
      relevance:    undefined,
      updated_desc: ["updated_at:desc"],
      title_asc:    ["title:asc"],
    };

    return this.client.search(
      this.indexUid,
      {
        q:      query.q,
        filter: extraFilters.length ? extraFilters.join(" AND ") : undefined,
        sort:   sortMap[query.sort ?? "relevance"],
        limit:  Math.min(100, query.limit ?? 20),
        offset: query.offset ?? 0,
      },
      token,
    );
  }
}

export function createSearchService(opts: SearchServiceOptions): SearchService {
  return new SearchService(opts);
}
