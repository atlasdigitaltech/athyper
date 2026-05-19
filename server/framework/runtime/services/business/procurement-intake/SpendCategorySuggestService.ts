import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type SpendCategorySuggestionSource = "item" | "commodity" | "trigram" | "history";

export interface CommodityCodeInput {
  domain_code: string;
  code:        string;
  label?:      string | null;
}

export interface SpendCategorySuggestOptions {
  itemId?:        string | null;
  commodityCode?: CommodityCodeInput | null;
}

export interface SpendCategorySuggestion {
  field:      "commodity_category_id";
  id:         string;
  code:       string;
  name:       string;
  confidence: number;
  source:     SpendCategorySuggestionSource;
}

interface SpendCategoryRow {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  parent_id:   string | null;
  parent_code: string | null;
  parent_name: string | null;
  metadata:    string | null;
}

const STOP_WORDS = new Set([
  "and", "for", "the", "with", "without", "from", "into", "onto", "this", "that",
  "line", "item", "invoice", "purchase", "supply", "supplies", "service", "services",
  "annual", "monthly", "yearly", "inch", "inches", "unit", "each", "pcs", "piece",
]);

const SOURCE_RANK: Record<SpendCategorySuggestionSource, number> = {
  item:      4,
  commodity: 3,
  trigram:   2,
  history:   1,
};
const CATEGORY_HINTS: Array<{
  categoryPatterns: RegExp[];
  queryTokens: string[];
  score: number;
}> = [
  {
    categoryPatterns: [/\bit[-\s]?hw\b/i, /hardware/i, /infrastructure/i],
    queryTokens: [
      "adapter", "computer", "desktop", "device", "dell", "display", "dock", "hp",
      "keyboard", "laptop", "lenovo", "macbook", "monitor", "mouse", "notebook",
      "pc", "printer", "ram", "server", "ssd", "thinkpad", "workstation",
    ],
    score: 0.48,
  },
  {
    categoryPatterns: [/software/i, /license/i, /licence/i, /\bsaas\b/i],
    queryTokens: ["app", "license", "licence", "saas", "software", "subscription"],
    score: 0.44,
  },
  {
    categoryPatterns: [/service/i, /consult/i, /professional/i],
    queryTokens: ["consulting", "implementation", "service", "support"],
    score: 0.36,
  },
];

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeToken(raw: string): string {
  let token = raw.toLowerCase();
  if (token.endsWith("ies") && token.length > 4) token = `${token.slice(0, -3)}y`;
  else if (token.endsWith("s") && token.length > 4) token = token.slice(0, -1);
  return token;
}

function tokenize(text: string | null | undefined): string[] {
  const matches = (text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tokens = matches
    .map(normalizeToken)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

function includesPhrase(haystack: string, needle: string): boolean {
  const lhs = haystack.toLowerCase();
  const rhs = needle.toLowerCase().trim();
  return rhs.length >= 4 && lhs.includes(rhs);
}

function toSuggestion(
  row: Pick<SpendCategorySuggestion, "id" | "code" | "name">,
  confidence: number,
  source: SpendCategorySuggestionSource,
): SpendCategorySuggestion {
  return {
    field: "commodity_category_id",
    id: row.id,
    code: row.code,
    name: row.name,
    confidence: clampConfidence(confidence),
    source,
  };
}

function rankSuggestions(
  suggestions: SpendCategorySuggestion[],
  limit: number,
): SpendCategorySuggestion[] {
  return suggestions
    .sort((a, b) =>
      b.confidence - a.confidence
      || SOURCE_RANK[b.source] - SOURCE_RANK[a.source]
      || a.name.localeCompare(b.name),
    )
    .slice(0, Math.min(Math.max(limit, 1), 10));
}

function mergeSuggestions(
  lists: SpendCategorySuggestion[][],
  limit: number,
): SpendCategorySuggestion[] {
  const byId = new Map<string, SpendCategorySuggestion>();

  for (const suggestion of lists.flat()) {
    const previous = byId.get(suggestion.id);
    if (!previous) {
      byId.set(suggestion.id, suggestion);
      continue;
    }

    const suggestionRank = SOURCE_RANK[suggestion.source];
    const previousRank = SOURCE_RANK[previous.source];
    if (
      suggestion.confidence > previous.confidence
      || (suggestion.confidence === previous.confidence && suggestionRank > previousRank)
    ) {
      byId.set(suggestion.id, suggestion);
    }
  }

  return rankSuggestions([...byId.values()], limit);
}

async function suggestFromItem(
  db: AnyDb,
  tenantId: string,
  itemId: string | null | undefined,
): Promise<SpendCategorySuggestion[]> {
  if (!itemId) return [];

  const { rows } = await sql<{ id: string; code: string; name: string }>`
    SELECT cc.id::text AS id, cc.code, cc.name
    FROM   master.item im
    LEFT JOIN master.product prod
           ON prod.tenant_id = im.tenant_id
          AND prod.id = im.product_id
    JOIN master.commodity_category cc
           ON cc.tenant_id = im.tenant_id
          AND cc.id = COALESCE(im.commodity_category_id, prod.commodity_category_id)
          AND cc.is_active = true
    WHERE  im.tenant_id = ${tenantId}::uuid
      AND  im.id = ${itemId}::uuid
      AND  im.is_active = true
    LIMIT 1
  `.execute(db);

  return rows.map((row) => toSuggestion(row, 1, "item"));
}

async function suggestFromCommodityCode(
  db: AnyDb,
  tenantId: string,
  commodityCode: CommodityCodeInput | null | undefined,
  limit: number,
): Promise<SpendCategorySuggestion[]> {
  const domain = commodityCode?.domain_code?.trim().toLowerCase();
  const code = commodityCode?.code?.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!domain || !code) return [];

  const { rows } = await sql<{
    id: string;
    code: string;
    name: string;
    confidence: string | number | null;
  }>`
    WITH input_code AS (
      SELECT ${domain}::text AS domain_code, ${code}::text AS code
    ),
    code_candidates AS (
      SELECT domain_code, code, 0::int AS path_rank, 1.00::numeric AS path_confidence
      FROM input_code

      UNION ALL

      SELECT lower(cw.target_domain_code) AS domain_code,
             regexp_replace(cw.target_code, '[^A-Za-z0-9]', '', 'g') AS code,
             1::int AS path_rank,
             GREATEST(0.50, LEAST(1.00, COALESCE(cw.confidence, 70) / 100.0)) AS path_confidence
      FROM shared.commodity_crosswalk cw
      JOIN input_code i
        ON lower(cw.source_domain_code) = i.domain_code
       AND regexp_replace(cw.source_code, '[^A-Za-z0-9]', '', 'g') = i.code
      WHERE cw.is_active = true

      UNION ALL

      SELECT lower(cw.source_domain_code) AS domain_code,
             regexp_replace(cw.source_code, '[^A-Za-z0-9]', '', 'g') AS code,
             1::int AS path_rank,
             GREATEST(0.50, LEAST(1.00, COALESCE(cw.confidence, 70) / 100.0)) AS path_confidence
      FROM shared.commodity_crosswalk cw
      JOIN input_code i
        ON lower(cw.target_domain_code) = i.domain_code
       AND regexp_replace(cw.target_code, '[^A-Za-z0-9]', '', 'g') = i.code
      WHERE cw.is_active = true
    ),
    matches AS (
      SELECT
        cc.id::text AS id,
        cc.code,
        cc.name,
        LEAST(
          1.00,
          GREATEST(
            0.00,
            (r.confidence / 100.0) * c.path_confidence
              - CASE WHEN c.path_rank = 0 THEN 0 ELSE 0.08 END
          )
        ) AS confidence,
        r.priority,
        CASE r.match_mode
          WHEN 'EXACT' THEN 4
          WHEN 'PREFIX' THEN 3
          WHEN 'RANGE' THEN 2
          WHEN 'CROSSWALK' THEN 1
          ELSE 0
        END AS mode_rank,
        length(r.code_from) AS specificity,
        r.created_at
      FROM control.commodity_code_to_category_rule r
      JOIN code_candidates c
        ON lower(r.commodity_domain_code) = c.domain_code
      JOIN master.commodity_category cc
        ON cc.tenant_id = r.tenant_id
       AND cc.id = r.commodity_category_id
       AND cc.is_active = true
      WHERE r.tenant_id = ${tenantId}::uuid
        AND r.is_active = true
        AND (
          (r.match_mode = 'EXACT' AND c.code = r.code_from AND r.code_to IS NULL)
          OR (r.match_mode = 'PREFIX' AND c.code LIKE r.code_from || '%')
          OR (r.match_mode = 'RANGE' AND c.code >= r.code_from AND c.code <= COALESCE(r.code_to, r.code_from))
          OR (r.match_mode = 'CROSSWALK' AND c.path_rank > 0 AND c.code = r.code_from)
        )
    )
    SELECT id, code, name, confidence
    FROM matches
    ORDER BY priority DESC, mode_rank DESC, specificity DESC, confidence DESC, created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 10)}
  `.execute(db);

  return rows.map((row) => toSuggestion(row, Number(row.confidence ?? 0), "commodity"));
}

function scoreCategoryRow(row: SpendCategoryRow, query: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const nameText = `${row.code} ${row.name}`;
  const descriptionText = `${row.description ?? ""} ${row.parent_code ?? ""} ${row.parent_name ?? ""}`;
  const metadataText = row.metadata ?? "";
  const categoryText = `${nameText} ${descriptionText} ${metadataText}`;

  const nameTokens = new Set(tokenize(nameText));
  const descriptionTokens = new Set(tokenize(descriptionText));
  const metadataTokens = new Set(tokenize(metadataText));
  const queryTokenSet = new Set(queryTokens);

  let score = 0;
  let matches = 0;
  let strongMatches = 0;

  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      score += 0.22;
      matches += 1;
      if (token.length >= 5) strongMatches += 1;
    }
    if (descriptionTokens.has(token)) {
      score += 0.14;
      matches += 1;
      if (token.length >= 5) strongMatches += 1;
    }
    if (metadataTokens.has(token)) {
      score += 0.12;
      matches += 1;
      if (token.length >= 5) strongMatches += 1;
    }
  }

  for (const hint of CATEGORY_HINTS) {
    if (
      hint.queryTokens.some((token) => queryTokenSet.has(token)) &&
      hint.categoryPatterns.some((pattern) => pattern.test(categoryText))
    ) {
      score += hint.score;
      matches += 1;
      strongMatches += 1;
    }
  }

  if (matches === 0) return 0;

  if (includesPhrase(row.name, query)) score += 0.28;
  if (includesPhrase(row.description ?? "", query)) score += 0.18;
  if (row.parent_id) score += 0.03;
  else score -= 0.10;
  if (strongMatches > 0) score += Math.min(0.36, strongMatches * 0.30);
  if (matches >= 2) score += 0.10;

  return clampConfidence(Math.min(0.94, 0.42 + score));
}

async function suggestFromDescription(
  db: AnyDb,
  tenantId: string,
  query: string,
  limit: number,
): Promise<SpendCategorySuggestion[]> {
  const cleanQuery = query.trim();
  const queryTokens = tokenize(cleanQuery);
  if (!cleanQuery || queryTokens.length === 0) return [];

  const { rows } = await sql<SpendCategoryRow>`
    SELECT
      sc.id::text AS id,
      sc.code,
      sc.name,
      sc.description,
      sc.parent_id::text AS parent_id,
      parent.code AS parent_code,
      parent.name AS parent_name,
      sc.metadata::text AS metadata
    FROM master.commodity_category sc
    LEFT JOIN master.commodity_category parent
      ON parent.tenant_id = sc.tenant_id
     AND parent.id = sc.parent_id
    WHERE sc.tenant_id = ${tenantId}::uuid
      AND sc.is_active = true
    ORDER BY
      CASE WHEN sc.parent_id IS NULL THEN 1 ELSE 0 END,
      COALESCE(parent.sort_order, sc.sort_order),
      sc.sort_order,
      sc.code
    LIMIT 500
  `.execute(db);

  const suggestions = rows
    .map((row) => ({ row, confidence: scoreCategoryRow(row, cleanQuery, queryTokens) }))
    .filter((entry) => entry.confidence >= 0.50)
    .map((entry) => toSuggestion(entry.row, entry.confidence, "trigram"));

  return rankSuggestions(suggestions, limit);
}

export function pickAutoSpendCategory(
  suggestions: SpendCategorySuggestion[],
  existingSpendCategoryId?: string | null,
): SpendCategorySuggestion | null {
  if (existingSpendCategoryId) return null;

  const first = suggestions[0];
  if (!first) return null;

  if (first.source === "item" && first.confidence >= 0.85) return first;
  if (first.source === "commodity" && first.confidence >= 0.80) return first;

  const second = suggestions.find((suggestion) => suggestion.id !== first.id);
  const margin = second ? first.confidence - second.confidence : first.confidence;
  if (first.confidence >= 0.84 && margin >= 0.08) return first;

  return null;
}

export async function suggestSpendCategories(
  db:       AnyDb,
  tenantId: string,
  query:    string,
  limit   = 5,
  options: SpendCategorySuggestOptions = {},
): Promise<SpendCategorySuggestion[]> {
  const cap = Math.min(Math.max(limit, 1), 10);
  const [itemSuggestions, commoditySuggestions, descriptionSuggestions] = await Promise.all([
    suggestFromItem(db, tenantId, options.itemId),
    suggestFromCommodityCode(db, tenantId, options.commodityCode, cap),
    suggestFromDescription(db, tenantId, query, cap),
  ]);

  return mergeSuggestions([
    itemSuggestions,
    commoditySuggestions,
    descriptionSuggestions,
  ], cap);
}
