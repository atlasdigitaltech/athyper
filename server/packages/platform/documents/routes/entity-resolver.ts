/**
 * Document entity resolver — shared between documents.route and attachments.route.
 *
 * Extracted here to break the circular dependency that would result from
 * attachments.route importing from documents.route and vice-versa.
 */

import type { Kysely } from "kysely";

export const DOC_PREFIXES = ["purchase", "sales", "service", "expense", "payment", "customer"];

/**
 * Resolve an entity by URL slug for attachment operations.
 * Works for any entity_class (DOCUMENT, MASTER, PARTNER, etc.) so that
 * master entities like supplier/customer/legal_entity can host attachments
 * via the same /documents/:docType/:id/attachments routes.
 *
 * Resolution order:
 *   1. Exact slug match across all entity classes
 *   2. DOCUMENT-class prefixed variants (purchase_X, sales_X, …)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDocumentEntity(db: Kysely<any>, docType: string) {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const slug = docType.replace(/-/g, "_");

  // Exact match first — covers master entities (supplier, customer, legal_entity)
  // and any DOCUMENT entity whose name already contains the prefix.
  const exact = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.id", "e.table_schema", "e.table_name", "e.name", "e.feature_flags",
      "e.primary_key", "e.tenant_column", "e.read_capability", "e.write_capability",
    ])
    .where("e.name", "=", slug)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("e.read_capability", "<>", "none")
    .where("e.primary_key", "is not", null)
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst();
  if (exact) return exact;

  // Prefix expansion — purchase_invoice, sales_invoice, etc. (DOCUMENT class only)
  for (const prefix of DOC_PREFIXES) {
    const entity = await db
      .selectFrom("control.entity as e")
      .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
      .select([
        "e.id", "e.table_schema", "e.table_name", "e.name", "e.feature_flags",
        "e.primary_key", "e.tenant_column", "e.read_capability", "e.write_capability",
      ])
      .where("e.name", "=", `${prefix}_${slug}`)
      .where("e.entity_class", "=", "DOCUMENT")
      .where("e.tenant_id", "is", null)
      .where("e.runtime_enabled", "=", true)
      .where("e.status", "=", "ACTIVE")
      .where("e.is_active", "=", true)
      .where("e.read_capability", "<>", "none")
      .where("e.primary_key", "is not", null)
      .where("ev.status", "=", "EFFECTIVE")
      .executeTakeFirst();
    if (entity) return entity;
  }
  return null;
}
