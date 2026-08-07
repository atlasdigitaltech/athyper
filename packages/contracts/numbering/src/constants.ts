import type { NumberingScopeKind } from "./types.js";

/** Canonical set of allowed simple tokens in format_template. Kept in sync with DDL trigger. */
export const ALLOWED_TOKENS = new Set([
  "seq",
  "yyyy", "yy", "mm", "dd", "mmm",
  "fiscal_year",
  "scope",
] as const);

/** ctx.* prefix — identifies entity field context tokens in a format_template. */
export const CTX_TOKEN_PREFIX = "ctx.";

/** Constraint limits — single source of truth shared between TS validation and DDL documentation. */
export const NUMBERING_CONFIG = {
  maxScopeKeyLength:    128,
  maxContextKeyLength:  64,
  maxContextFieldCount: 8,
  maxSequenceWidth:     20,
  minSequenceWidth:     1,
  maxStartValue:        Number.MAX_SAFE_INTEGER,
  maxTemplateLength:    256,
  minTemplateLength:    3,
  maxPreviewSteps:      10,
  defaultPreviewSteps:  3,
} as const;

/** Scope kinds that require a non-null scopeKey from the caller. */
export const SCOPE_KEY_REQUIRED_KINDS: ReadonlySet<NumberingScopeKind> = new Set([
  "entity",
  "legal_entity",
  "company_code",
  "site",
  "operating_organization",
  "resource_company",
  "ledger",
  "network_account",
]);
