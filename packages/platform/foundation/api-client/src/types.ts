/**
 * @athyper/platform-api-client — Domain Types
 *
 * Canonical type definitions for all Athyper platform domains.
 * These will be aligned with @athyper/api-contracts once that package is defined.
 */

// ── Shared ────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page:       number;
  pageSize:   number;
  total:      number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data:       T[];
  pagination: PaginationMeta;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export interface FieldDescriptor {
  name:       string;
  label:      string;
  type:       string;
  required?:  boolean;
  readOnly?:  boolean;
  [key: string]: unknown;
}

export interface CompiledEntity {
  entity_code: string;
  entity_name: string;
  realm_key?:  string;
  fields:      FieldDescriptor[];
  [key: string]: unknown;
}

export interface CatalogEntity {
  entity_code: string;
  entity_name: string;
  [key: string]: unknown;
}

export interface EntityOperation {
  code:       string;
  label:      string;
  placement?: string;
  [key: string]: unknown;
}

export interface StatusTransition {
  from: string;
  to:   string;
  [key: string]: unknown;
}

export interface StatusRoute {
  entity_code: string;
  transitions: StatusTransition[];
  [key: string]: unknown;
}

export interface LookupValue {
  code:        string;
  label:       string;
  active:      boolean;
  sort_order?: number;
  [key: string]: unknown;
}

export interface LookupDomainBundle {
  domain_code: string;
  values:      LookupValue[];
}

export interface EntityCapability {
  code:    string;
  enabled: boolean;
  [key: string]: unknown;
}

// ── Flow ──────────────────────────────────────────────────────────────────────

export interface FlowStep {
  step_code: string;
  label:     string;
  type:      string;
  fields?:   FieldDescriptor[];
  [key: string]: unknown;
}

export interface FlowBundle {
  flow_code: string;
  trigger:   string;
  steps:     FlowStep[];
  [key: string]: unknown;
}

// ── Records ───────────────────────────────────────────────────────────────────

export interface MasterRecord {
  id:          string;
  entity_code: string;
  status?:     string;
  data:        Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface MasterRecordWrite {
  data: Record<string, unknown>;
}

export interface EntityListSortEntry {
  key:    string;
  dir:    "asc" | "desc";
  nulls?: "first" | "last";
}

export type FilterEntry =
  | { eq:     unknown }
  | { neq:    unknown }
  | { in:     unknown[] }
  | { nin:    unknown[] }
  | { gt:     unknown }
  | { gte:    unknown }
  | { lt:     unknown }
  | { lte:    unknown }
  | { like:   string }
  | { ilike:  string }
  | { isNull: boolean };

export type EntityListFilters = Record<string, FilterEntry>;

export type FacetScope = string;

export interface BulkPreflightItem {
  recordId:   string;
  canExecute: boolean;
  reason?:    string;
}

export interface BulkPreflightResult {
  action:  string;
  results: BulkPreflightItem[];
}

export interface BulkActionResult {
  action:    string;
  succeeded: string[];
  failed:    Array<{ recordId: string; reason: string }>;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface DocumentDetail {
  id:          string;
  doc_type:    string;
  status:      string;
  data:        Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface StatusTransitionRequest {
  to_status: string;
  note?:     string;
  [key: string]: unknown;
}

export interface WorkflowAction {
  code:  string;
  label: string;
}

export interface WorkflowSummary {
  current_step?:     string;
  approvers?:        string[];
  available_actions: WorkflowAction[];
}

export interface MatchingSummary {
  grn_matched?:      boolean;
  invoice_matched?:  boolean;
  tolerance_status?: string;
}

export interface DocumentBundle<
  H = Record<string, unknown>,
  L = Record<string, unknown>,
> {
  header:   H;
  lines:    L[];
  workflow: WorkflowSummary;
  matching: MatchingSummary;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export interface InboxItem {
  id:          string;
  request_id:  string;
  entity_type: string;
  entity_id:   string;
  status:      string;
  [key: string]: unknown;
}

export interface ApprovalAction {
  action: string;
  note?:  string;
  [key: string]: unknown;
}

export interface ApprovalContext {
  request_id:        string;
  entity_type:       string;
  entity_id:         string;
  current_step?:     string;
  available_actions: ApprovalAction[];
  [key: string]: unknown;
}

export interface WorkflowEvent {
  id:          string;
  event_type:  string;
  actor?:      string;
  occurred_at: string;
  [key: string]: unknown;
}

export interface ActivityEntry {
  id:               string;
  event_type:       string;
  entity_type?:     string;
  entity_id?:       string;
  actor?:           string;
  summary:          string;
  occurred_at:      string;
  [key: string]: unknown;
}

// ── Platform ──────────────────────────────────────────────────────────────────

export interface WorkspaceNode {
  code:      string;
  label:     string;
  path:      string;
  children?: WorkspaceNode[];
  [key: string]: unknown;
}

export interface Notification {
  id:         string;
  type:       string;
  message:    string;
  read:       boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface SavedView {
  id:          string;
  entity_code: string;
  name:        string;
  config:      Record<string, unknown>;
  created_by?: string;
  created_at?: string;
  is_shared?:  boolean;
  is_pinned?:  boolean;
  is_starred?: boolean;
}

// ── Ledger ────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id:          string;
  journal_no:  string;
  status:      string;
  period:      string;
  total_dr:    number;
  total_cr:    number;
  created_at?: string;
  [key: string]: unknown;
}

export interface PostingLine {
  id:         string;
  journal_id: string;
  account_id: string;
  dr_amount:  number;
  cr_amount:  number;
  [key: string]: unknown;
}

export interface PostingTrace {
  doc_type: string;
  doc_id:   string;
  journals: JournalEntry[];
  [key: string]: unknown;
}

// ── Collaboration ─────────────────────────────────────────────────────────────

export interface EntityComment {
  id:              string;
  tenantId:        string;
  entityType:      string;
  entityId:        string;
  commenterId:     string;
  commenterName?:  string;
  commentText:     string;
  parentCommentId: string | null;
  threadDepth:     number;
  visibility:      string;
  createdAt:       string;
  updatedAt:       string | null;
  replyCount?:     number;
}

export interface ReactionSummary {
  reactionType: string;
  emoji:        string;
  count:        number;
  reacted:      boolean;
}

export interface TimelineEntry {
  id:                string;
  source:            string;
  tenantId:          string;
  eventType:         string;
  severity:          string;
  entityType?:       string;
  entityId?:         string;
  actorUserId?:      string;
  actorDisplayName?: string;
  summary:           string;
  details?:          Record<string, unknown>;
  occurredAt:        string;
}

export interface BookmarkSnapshot {
  displayName?: string | null;
}

export interface BookmarkListItem {
  id:          string;
  entityCode:  string;
  recordId:    string;
  displayName: string | null;
  recordCode:  string | null;
  createdAt:   string;
}

export interface BookmarkListGroup {
  entityCode: string;
  count:      number;
  items:      BookmarkListItem[];
}

export interface CommentCountEntry {
  total:   number;
  hasOpen: boolean;
}
