#!/usr/bin/env tsx
/**
 * Meilisearch Backfill — Track B2 Slice B
 *
 * One-shot script that reindexes all rows of one or more entities
 * registered in control.entity. Uses the same generic mapping pipeline
 * as the outbox handler: control.entity lookup → row fetch →
 * default mapper → optional per-entity override.
 *
 * Usage:
 *   DATABASE_URL=... MEILISEARCH_URL=... MEILISEARCH_MASTER_KEY=... \
 *     npx tsx server/scripts/meilisearch-backfill.ts [--entity=invoice,journal_entry] [--batch-size=500]
 *
 * Default entity set: invoice,journal_entry (the prototype scope).
 * Extend via --entity=foo,bar once more overrides are registered.
 *
 * Idempotency: upsert-by-id at Meilisearch is idempotent. Re-running is
 * safe; rows added since the last run are picked up.
 *
 * Deletes: NOT handled — rows removed from the DB since the last run
 * remain in the index. The outbox handler covers deletes for live
 * traffic; full index rebuild is a separate concern.
 */

import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import {
  createMeilisearchClient,
  createSearchService,
  createEntityMetaService,
  defaultRowToSearchDocument,
  invoiceOverride,
  journalEntryOverride,
  INVOICE_ENTITY_TYPE,
  JOURNAL_ENTRY_ENTITY_TYPE,
  type EntityDocumentOverride,
  type SearchDocument,
} from "@athyper/svc-search";

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL           = process.env["DATABASE_URL"];
const MEILISEARCH_URL        = process.env["MEILISEARCH_URL"];
const MEILISEARCH_MASTER_KEY = process.env["MEILISEARCH_MASTER_KEY"];

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}
if (!MEILISEARCH_URL || !MEILISEARCH_MASTER_KEY) {
  console.error("ERROR: MEILISEARCH_URL and MEILISEARCH_MASTER_KEY environment variables are required");
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

interface Args {
  entities:  string[];
  batchSize: number;
}

function parseArgs(argv: string[]): Args {
  let entities: string[] = [INVOICE_ENTITY_TYPE, JOURNAL_ENTRY_ENTITY_TYPE];
  let batchSize          = 500;
  for (const arg of argv) {
    if (arg.startsWith("--entity=")) {
      entities = arg.slice("--entity=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith("--batch-size=")) {
      const n = parseInt(arg.slice("--batch-size=".length), 10);
      if (Number.isFinite(n) && n > 0 && n <= 5000) batchSize = n;
    }
  }
  return { entities, batchSize };
}

// ── Overrides registry — match bootstrap ─────────────────────────────────────

const OVERRIDES: ReadonlyMap<string, EntityDocumentOverride> = new Map([
  [INVOICE_ENTITY_TYPE,       invoiceOverride],
  [JOURNAL_ENTRY_ENTITY_TYPE, journalEntryOverride],
]);

// ── DB + Meili ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new Kysely<any>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: DATABASE_URL, max: 4 }),
  }),
});

const client = createMeilisearchClient({
  host:   MEILISEARCH_URL,
  apiKey: MEILISEARCH_MASTER_KEY,
});
if (!client) {
  console.error("ERROR: Meilisearch client could not be constructed");
  process.exit(1);
}
// CLI script: fail fast rather than loop forever. The isAvailable() probe
// below has already confirmed Meili is reachable, so three attempts at
// ensureIndex + scoped-key provisioning is plenty — any further failures
// indicate a real problem the operator should see, not a transient blip.
const search      = createSearchService({
  client,
  retry: { initialDelayMs: 500, maxDelayMs: 2_000, maxAttempts: 3 },
});
const metaService = createEntityMetaService(db);

// ── Generic backfill driver ───────────────────────────────────────────────────

async function backfillEntity(entityType: string, batchSize: number): Promise<number> {
  const meta = await metaService.resolve(entityType);
  if (!meta) {
    console.warn(`[${entityType}] not found in control.entity — skipping`);
    return 0;
  }

  const fqTable = `${meta.schema}.${meta.table}` as `${string}.${string}`;
  const override = OVERRIDES.get(entityType);

  let total = 0;
  let lastId: string | null = null;

  for (;;) {
    let q = db
      .selectFrom(fqTable as never)
      .selectAll()
      .orderBy("id" as never, "asc")
      .limit(batchSize);
    if (lastId) q = q.where("id" as never, ">", lastId as never);

    const rows = await q.execute() as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    const docs: SearchDocument[] = [];
    for (const row of rows) {
      const defaultDoc = defaultRowToSearchDocument(row, entityType);
      if (!defaultDoc) continue;
      docs.push(override ? override(defaultDoc, row) : defaultDoc);
    }
    if (docs.length > 0) await search.upsert(docs);

    total += rows.length;
    lastId = String((rows[rows.length - 1] as { id: string }).id);
    console.log(`[${entityType}] indexed ${total} (last id=${lastId})`);
  }

  return total;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("meilisearch-backfill starting", { entities: args.entities, batchSize: args.batchSize });

  const reachable = await client!.isAvailable();
  if (!reachable) {
    throw new Error(`Meilisearch unreachable at ${MEILISEARCH_URL}`);
  }
  // warmUp() runs ensureIndex + scoped-key provisioning with retry. In the
  // script context we want a single-shot attempt with a tight retry cap —
  // if Meili is flaky on first contact the operator can re-run the script
  // rather than have it sit in an infinite loop. Keep the initial delay
  // short; cap at 10s and trust the reachability probe above to have
  // caught hard outages already.
  await search.warmUp();
  console.log("meilisearch_index_ready");

  let grandTotal = 0;
  for (const entityType of args.entities) {
    grandTotal += await backfillEntity(entityType, args.batchSize);
  }

  console.log(`meilisearch-backfill complete: ${grandTotal} documents upserted`);
}

main()
  .then(async () => {
    await db.destroy();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(
      "meilisearch-backfill failed:",
      err instanceof Error ? err.message : String(err),
    );
    await db.destroy().catch(() => { /* ignore */ });
    process.exit(1);
  });
