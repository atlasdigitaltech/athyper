/**
 * Search outbox handler — converts event.outbox rows into Meilisearch
 * upserts/deletes for ANY entity registered in control.entity.
 *
 * Generic pipeline:
 *   event.outbox row
 *      └─▶ resolve entity meta (cached control.entity lookup)
 *      └─▶ fetch row tenant-scoped from {schema}.{table}
 *      └─▶ defaultRowToSearchDocument (conventions)
 *      └─▶ optional per-entity override (enrichment)
 *      └─▶ SearchService.upsert (or deleteByEntityRef on delete / missing row)
 *
 * Event convention (enforced by emitters):
 *   topic       = "search"
 *   entity_type = control.entity.name value
 *   entity_id   = source row uuid
 *   event_type  = "<entity_type>.created" | ".updated" | ".deleted"
 *
 * Idempotency: upsert-by-id and delete-by-id at Meilisearch are both
 * idempotent. The handler is safe under at-least-once delivery.
 */

import type { Kysely } from "kysely";
import type { OutboxEvent, OutboxTopicHandler } from "@athyper/svc-jobs";
import type { SearchService } from "../client/search.service.js";
import { SearchNotReadyError } from "../client/search.service.js";
import {
  createEntityMetaService,
  type EntityMetaService,
} from "../client/entity-meta.js";
import {
  defaultRowToSearchDocument,
  type EntityDocumentOverride,
} from "../client/default-mapper.js";

export interface SearchOutboxHandlerDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  search: SearchService;
  /**
   * Per-entity enrichment overrides. Keyed by entity_type (control.entity.name).
   * Optional — entities without an override use the default convention mapper.
   */
  overrides?: Map<string, EntityDocumentOverride>;
  /** Override the default metadata service (e.g. for tests). */
  metaService?: EntityMetaService;
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

function isDeleteEvent(event: OutboxEvent): boolean {
  return Boolean(event.event_type && event.event_type.endsWith(".deleted"));
}

export function createSearchOutboxHandler(deps: SearchOutboxHandlerDeps): OutboxTopicHandler {
  const { db, search, overrides, logger } = deps;
  const metaService = deps.metaService ?? createEntityMetaService(db);

  return {
    async handle(event: OutboxEvent): Promise<void> {
      // Defer work while the search service is warming up. Throwing a
      // retryable error pushes the outbox row back to 'pending' with the
      // standard backoff — rows stay queued rather than hammering a
      // Meilisearch that is not yet reachable.
      if (!search.isReady()) {
        throw new SearchNotReadyError("search_outbox_warming");
      }

      if (!event.entity_type || !event.entity_id) {
        logger?.warn("search_outbox_skipped_no_entity", {
          outboxId:  event.id,
          eventType: event.event_type,
        });
        return;
      }

      // ── Delete: remove from index, no DB fetch required ──────────────────
      if (isDeleteEvent(event)) {
        await search.deleteByEntityRef(event.entity_type, event.entity_id);
        return;
      }

      // ── Resolve backing table via control.entity ─────────────────────────
      const meta = await metaService.resolve(event.entity_type);
      if (!meta) {
        logger?.warn("search_outbox_unknown_entity_type", {
          outboxId:   event.id,
          entityType: event.entity_type,
        });
        return;
      }

      // ── Fetch row generically ────────────────────────────────────────────
      const fqTable = `${meta.schema}.${meta.table}` as `${string}.${string}`;
      const row = await db
        .selectFrom(fqTable as never)
        .selectAll()
        .where(meta.primaryKey as never, "=", event.entity_id as never)
        .$if(meta.tenantColumn !== null, (query) =>
          query.where(meta.tenantColumn! as never, "=", event.tenant_id as never),
        )
        .executeTakeFirst();

      if (!row) {
        // Self-heal: source row gone → remove from index.
        await search.deleteByEntityRef(event.entity_type, event.entity_id);
        return;
      }

      const plainRow = row as Record<string, unknown>;

      // ── Default conventions + optional per-entity override ───────────────
      const defaultDoc = defaultRowToSearchDocument(plainRow, event.entity_type, {
        primaryKey: meta.primaryKey,
        tenantColumn: meta.tenantColumn,
        tenantId: event.tenant_id,
        entityId: event.entity_id,
      });
      if (!defaultDoc) {
        logger?.warn("search_outbox_default_map_failed", {
          outboxId:   event.id,
          entityType: event.entity_type,
          entityId:   event.entity_id,
        });
        return;
      }

      const override = overrides?.get(event.entity_type);
      const finalDoc = override ? override(defaultDoc, plainRow) : defaultDoc;

      await search.upsert([finalDoc]);
    },
  };
}
