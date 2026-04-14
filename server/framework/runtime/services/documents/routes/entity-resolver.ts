/**
 * Document entity resolver — shared between documents.route and attachments.route.
 *
 * Extracted here to break the circular dependency that would result from
 * attachments.route importing from documents.route and vice-versa.
 */

import type { Kysely } from "kysely";

export const DOC_PREFIXES = ["purchase", "sales", "service", "expense", "payment", "customer"];

/**
 * Resolve a document entity by URL slug.
 * Tries exact name match first, then common prefixes (purchase_, sales_, …).
 * Returns the full entity row including table_schema, table_name, name, id, feature_flags.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDocumentEntity(db: Kysely<any>, docType: string) {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const slug = docType.replace(/-/g, "_");
  const candidates = [slug, ...DOC_PREFIXES.map((p) => `${p}_${slug}`)];

  for (const name of candidates) {
    const entity = await db
      .selectFrom("control.entity as e")
      .select(["e.id", "e.table_schema", "e.table_name", "e.name", "e.feature_flags"])
      .where("e.name", "=", name)
      .where("e.entity_class", "=", "DOCUMENT")
      .where("e.tenant_id", "is", null)
      .executeTakeFirst();
    if (entity) return entity;
  }
  return null;
}
