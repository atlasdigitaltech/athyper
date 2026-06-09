/**
 * @athyper/api-contracts — Common Schemas
 *
 * Shared types used across all API domains. Mirrors patterns from:
 *   - Audit columns (created_at/by, updated_at/by)
 *   - Lifecycle columns (status, is_active, status_changed_at/by)
 *   - Pagination (offset + cursor)
 *   - Money (amount + currency_code, 3-char ISO 4217)
 *   - API envelope and error shape
 */
import { z } from "zod";

// ── Identifiers ─────────────────────────────────────────────────

export const UuidSchema = z.string().uuid();
export const TenantIdSchema = UuidSchema;
export const EntityCodeSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/);

// ── Audit ───────────────────────────────────────────────────────

export const AuditSchema = z.object({
  created_at: z.string().datetime(),
  created_by: UuidSchema,
  updated_at: z.string().datetime().nullable(),
  updated_by: UuidSchema.nullable(),
});

// ── Lifecycle ───────────────────────────────────────────────────

export const LifecycleSchema = z.object({
  status: z.string(),
  is_active: z.boolean(),
  status_changed_at: z.string().datetime().nullable(),
  status_changed_by: UuidSchema.nullable(),
});

// ── Money ───────────────────────────────────────────────────────

export const MoneySchema = z.object({
  amount: z.number(),
  currency_code: z.string().length(3),
});

export const MoneyWithRateSchema = MoneySchema.extend({
  exchange_rate: z.number().positive().optional(),
  base_amount: z.number().optional(),
  base_currency_code: z.string().length(3).optional(),
});

// ── Pagination ──────────────────────────────────────────────────

export const PaginationRequestSchema = z.object({
  page: z.number().int().positive().default(1),
  page_size: z.number().int().min(1).max(500).default(25),
  sort_by: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).default("asc"),
});

export const PaginationResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total_pages: z.number().int().nonnegative(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
});

// ── API Envelope ────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    errors: z.array(ApiErrorSchema).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationResponseSchema,
    errors: z.array(ApiErrorSchema).optional(),
  });
}

// ── Filter Operators ────────────────────────────────────────────

export const FilterOperatorSchema = z.enum([
  "eq", "neq", "gt", "gte", "lt", "lte",
  "in", "not_in", "like", "ilike",
  "is_null", "is_not_null",
  "between", "contains", "starts_with",
]);

export const FilterConditionSchema = z.object({
  field: z.string(),
  operator: FilterOperatorSchema,
  value: z.unknown(),
});

export const FilterGroupSchema = z.object({
  logic: z.enum(["and", "or"]).default("and"),
  conditions: z.array(FilterConditionSchema),
});

// ── Semantic Intent ─────────────────────────────────────────────
// Shared enum matching SemanticIntent from @athyper/theme/semantic-colors.
// Used by StatusLane, ProcessHealthTile, StatusDimension, SatelliteCard, etc.

export const SemanticIntentSchema = z.enum([
  "neutral", "info", "success", "warning", "error", "primary", "accent", "muted",
]);
export type SemanticIntent = z.infer<typeof SemanticIntentSchema>;

// ── Type Exports ────────────────────────────────────────────────

export type Uuid = z.infer<typeof UuidSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type MoneyWithRate = z.infer<typeof MoneyWithRateSchema>;
export type Audit = z.infer<typeof AuditSchema>;
export type Lifecycle = z.infer<typeof LifecycleSchema>;
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;
export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type FilterCondition = z.infer<typeof FilterConditionSchema>;
export type FilterGroup = z.infer<typeof FilterGroupSchema>;
