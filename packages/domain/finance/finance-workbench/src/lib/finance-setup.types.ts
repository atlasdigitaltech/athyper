/**
 * Finance Setup — canonical DTOs (Phase 1 read-only; extensible for Phase 2 mutations).
 *
 * ─── Scope contract (frozen) ──────────────────────────────────────────────
 *   UI route param      → :companyCode      (stable readable code, e.g. "ACFB")
 *   API query param     → scopeCode         (readable code — NOT UUID)
 *   DTO payload field   → companyCode       (matches route param)
 *   Server internal     → companyCodeId     (UUID; resolved once at handler entry)
 *   NEVER used publicly → scopeId           (reserved for internal joins)
 *
 * ─── Reason-code registry (single source) ─────────────────────────────────
 *   All reasonCode strings resolve to control.lookup_value(
 *     domain_code = 'finance.postability_reason').
 *   The client hook useReasonCodeCatalog() caches the domain and provides
 *   the display text, severity, and chip hint for each code.
 *
 * ─── Postability separation (audit F1) ────────────────────────────────────
 *   PeriodPostability      → (company, book, period)
 *   AccountPostability     → (company, book, period, gl_account)
 *   Hub + Operate consume period; Explore + Configure inspectors consume account.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Chip vocabulary for both period and account postability. */
export type PostabilityChip =
  | "postable"
  | "adjustment_only"
  | "read_only"
  | "locked";

/** Full definition-state vocabulary. Object-specific subsets are declared per DTO. */
export type DefinitionState = "draft" | "active" | "inactive";

/** Vocabulary an object supports — F2 audit: chart_of_account/gl_account/ledger_book
 *  support all three; assignment/control tables typically support only ['active','inactive']. */
export type DefinitionStateVocabulary = ReadonlyArray<DefinitionState>;

/** Scope in the finance-setup domain. */
export type FinanceSetupScopeType = "tenant" | "legal_entity" | "company";

/** Journey-step lifecycle. */
export type JourneyStepState =
  | "not_started"
  | "in_progress"
  | "complete"
  | "blocked";

/** Conflict severity — mirrors metadata.severity in the reason-code lookup. */
export type ConflictSeverity = "info" | "warning" | "error" | "blocker";


// ─── Scope reference ────────────────────────────────────────────────────────

export interface ScopeRef {
  type: FinanceSetupScopeType;
  /** Stable readable code (companyCode / leCode / tenantCode). Never a UUID. */
  code: string;
  /** Human-friendly label (populated by server for display convenience). */
  label?: string;
}


// ─── Chips (returned in DTOs; UI renders via PostabilityChip / DefinitionStateChip) ──

export interface PostabilityDescriptor {
  chip:        PostabilityChip;
  reasonCode:  string;   // e.g. "period_open" — resolvable via useReasonCodeCatalog
  reasonText?: string;   // optional pre-resolved text (server-side convenience)
}

export interface PostabilityDescriptorMulti {
  chip:         PostabilityChip;
  reasonCodes:  string[];
  reasonTexts?: string[];
}

/** F2 — object-specific state chip. */
export interface DefinitionStateDescriptor {
  state:      DefinitionState;
  objectKind: string;                        // e.g. "chart_of_account" | "company_code_gl_account"
  vocabulary: DefinitionStateVocabulary;     // subset the object supports
}


// ─── Period + account postability (F1 audit split) ──────────────────────────

export interface PeriodPostability extends PostabilityDescriptor {
  companyCode:  string;
  bookId:       string;
  bookLabel?:   string;
  fiscalYear:   number;
  periodNumber: number;
}

export interface AccountPostability extends PostabilityDescriptorMulti {
  glAccountId:   string;
  glAccountCode: string;
  glAccountName: string;
  companyCode:   string;
  bookId:        string;
  fiscalYear:    number;
  periodNumber:  number;
}


// ─── Conflict (F8 audit: parent-scope visibility) ───────────────────────────

export type ConflictCategory =
  | "chart"
  | "book"
  | "gl_control"
  | "posting_role"
  | "house_bank"
  | "period"
  | "assignment";

export interface FinanceSetupConflict {
  id:              string;
  category:        ConflictCategory;
  severity:        ConflictSeverity;
  scope:           ScopeRef;                 // origin scope (typically company)
  visibleAtScopes: ReadonlyArray<ScopeRef>;  // F8: rollup visibility
  title:           string;
  message:         string;
  reasonCode:      string;
  /** Deep link to the appropriate fix surface (may be null when action is manual). */
  actionHref:      string | null;
  actionLabel?:    string;
  detectedAt:      string;                   // ISO
}


// ─── Journey ────────────────────────────────────────────────────────────────

export type JourneyStepKey =
  | "chart"
  | "books"
  | "gl_controls"
  | "house_banks"
  | "fiscal_period";

export interface JourneyStep {
  key:           JourneyStepKey;
  label:         string;
  state:         JourneyStepState;
  /** 0-100 or null when N/A (e.g., binary steps). */
  coveragePct:   number | null;
  /** Either a definition-state chip (for chart/books) or a postability chip (for period). */
  chip?:
    | { kind: "definition"; descriptor: DefinitionStateDescriptor }
    | { kind: "postability"; descriptor: PostabilityDescriptor };
  /** Deep link into the workspace that resolves this step. */
  primaryHref:   string;
  conflictCount: number;
}


// ─── Workspace card counts ──────────────────────────────────────────────────

export interface WorkspaceCardCounts {
  explore: {
    totalAccounts:    number;
    postableAccounts: number;
  };
  configure: {
    pendingRows: number;
    coveragePct: number;
  };
  operate: {
    openBlockers:          number;
    reconciliationSignals: number;
  };
}

export interface FinanceSetupGovernanceReadiness {
  source: "governance";
  cycleRunId: string | null;
  cycleStatus: string | null;
  mandatoryTaskCount: number;
  completedMandatoryTaskCount: number;
  criticalDeviationCount: number;
  certificationStatus: string | null;
  certified: boolean;
}


// ─── Hub payload (Phase 1 primary) ──────────────────────────────────────────

export interface CompanyHubPayload {
  companyCode:         string;
  companyName:         string;
  legalEntityCode:     string | null;
  legalEntityName:     string | null;
  tenantCode:          string | null;
  tenantName:          string | null;

  currentBookId:       string;
  currentBookLabel:    string;
  currentFiscalYear:   number;
  currentPeriodNumber: number;

  periodPostability:   PeriodPostability;

  /** Always 5 steps: chart / books / gl_controls / house_banks / fiscal_period. */
  journey:             JourneyStep[];

  /** Top-N conflicts for the header inbox (default 5). Full list at /conflicts. */
  inbox:               FinanceSetupConflict[];

  workspaceCounts:     WorkspaceCardCounts;
  /** Governed source of truth for whether this company may be certified posting-ready. */
  governanceReadiness: FinanceSetupGovernanceReadiness;

  /** ISO — used by the "last checked" surface. */
  computedAt:          string;
}


// ─── Rollup payload (Phase 1.6) ─────────────────────────────────────────────

export interface RollupCompanyRow {
  companyCode:     string;
  companyName:     string;
  journey:         JourneyStep[];
  conflictCount:   number;
}

export interface RollupPayload {
  scope:      ScopeRef;
  scopeName:  string;
  companies:  RollupCompanyRow[];
  aggregate: {
    completeCompanies: number;
    totalCompanies:    number;
    conflictCount:     number;
  };
  computedAt: string;
}


// ─── Posting preview response ───────────────────────────────────────────────

export interface PostingPreviewPayload {
  periodPostability:  PeriodPostability;
  /** Present only when the request specified a glAccountCode. */
  accountPostability?: AccountPostability;
}


// ─── Reason-code catalog entry (matches control.lookup_value shape) ─────────

export interface ReasonCodeEntry {
  code:       string;
  name:       string;
  description:string;
  severity:   ConflictSeverity;
  chipHint:   PostabilityChip;
  scopeKind:  "period" | "account" | "both";
  sortOrder:  number;
}


// ─── Request shapes (client → BFF → server) ─────────────────────────────────

export interface ReadinessRequest {
  scopeType:   FinanceSetupScopeType;
  scopeCode:   string;
  fiscalYear?: number;
  period?:     number;
  bookId?:     string;
}

export interface ConflictsRequest {
  scopeType: FinanceSetupScopeType;
  scopeCode: string;
  category?: ConflictCategory;
  severity?: ConflictSeverity;
}

export interface PostingPreviewRequest {
  scopeType:      "company";
  scopeCode:      string;
  fiscalYear:     number;
  period:         number;
  bookId?:        string;
  glAccountCode?: string;   // when set, response includes AccountPostability
}
