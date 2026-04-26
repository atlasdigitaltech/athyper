import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface SpendCategorySuggestion {
  field:      "spend_category_id";
  id:         string;
  code:       string;
  name:       string;
  confidence: number;
  source:     "trigram";
}

export async function suggestSpendCategories(
  db:       AnyDb,
  tenantId: string,
  query:    string,
  limit   = 5,
): Promise<SpendCategorySuggestion[]> {
  if (!query.trim()) return [];
  const cap = Math.min(limit, 10);
  const q   = `%${query.trim()}%`;

  const { rows } = await sql<{ id: string; code: string; name: string }>`
    SELECT id, code, name
    FROM   master.spend_category
    WHERE  tenant_id = ${tenantId}::uuid
      AND  is_active = true
      AND  (name ILIKE ${q} OR code ILIKE ${q})
    ORDER BY
      CASE WHEN name ILIKE ${q} THEN 0 ELSE 1 END,
      name
    LIMIT  ${cap}
  `.execute(db);

  return rows.map((r, i) => ({
    field:      "spend_category_id" as const,
    id:         r.id,
    code:       r.code,
    name:       r.name,
    confidence: Math.max(0.50, 1 - i * 0.08),
    source:     "trigram" as const,
  }));
}
