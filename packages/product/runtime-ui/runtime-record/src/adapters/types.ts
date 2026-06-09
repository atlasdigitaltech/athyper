export type RuntimeRecordId = string;
export type RuntimeEntityCode = string;

export interface RuntimeRecord {
  id: RuntimeRecordId;
  data: Record<string, unknown>;
  status?: string | null;
  version?: string | number | null;
}

export interface RuntimeMutationError {
  field?: string;
  code?: string;
  message: string;
}

export interface RuntimeMutationResult {
  record?: RuntimeRecord;
  status?: string | null;
  errors?: RuntimeMutationError[];
}

export interface RuntimeRecordDescriptorAdapter<TDescriptor = unknown, TOperation = unknown> {
  fetchDescriptor(entityCode: RuntimeEntityCode): Promise<TDescriptor | null>;
  fetchRecord(entityCode: RuntimeEntityCode, recordId: RuntimeRecordId): Promise<RuntimeRecord | null>;
  fetchOperations(entityCode: RuntimeEntityCode): Promise<TOperation[]>;
}

export interface RuntimeRecordNavigationAdapter {
  listHref(entityCode: RuntimeEntityCode): string;
  detailHref(entityCode: RuntimeEntityCode, recordId: RuntimeRecordId, mode?: string): string;
  newHref(entityCode: RuntimeEntityCode, params?: Record<string, string>): string;
  normalizeHref(href: string): string;
}

export interface RuntimeRecordMutationAdapter {
  createRecord(entityCode: RuntimeEntityCode, data: Record<string, unknown>): Promise<RuntimeMutationResult>;
  updateRecord(
    entityCode: RuntimeEntityCode,
    recordId: RuntimeRecordId,
    data: Record<string, unknown>,
  ): Promise<RuntimeMutationResult>;
  deleteRecord?(entityCode: RuntimeEntityCode, recordId: RuntimeRecordId): Promise<RuntimeMutationResult>;
}

export type RuntimeOperationIntent = "navigate" | "api" | "modal" | "inline" | "unknown";

export interface RuntimeOperationDispatchInput<TOperation = unknown> {
  entityCode: RuntimeEntityCode;
  recordId: RuntimeRecordId;
  recordUuid?: RuntimeRecordId;
  operation: TOperation;
  actionCode: string;
  payload?: Record<string, unknown>;
  remarks?: string;
}

export interface RuntimeOperationFlowSubmitInput {
  entityCode: RuntimeEntityCode;
  recordId: RuntimeRecordId;
  recordUuid?: RuntimeRecordId;
  actionCode: string;
  draft: Record<string, unknown>;
}

export interface RuntimeOperationDispatchResult<TFlowBundle = unknown> {
  intent: RuntimeOperationIntent;
  record?: RuntimeRecord;
  nextHref?: string;
  flowBundle?: TFlowBundle;
  status?: string | null;
  errors?: RuntimeMutationError[];
}

export interface RuntimeOperationAdapter<TOperation = unknown, TFlowBundle = unknown> {
  dispatchOperation(
    input: RuntimeOperationDispatchInput<TOperation>,
  ): Promise<RuntimeOperationDispatchResult<TFlowBundle>>;
  submitOperationFlow(
    input: RuntimeOperationFlowSubmitInput,
  ): Promise<RuntimeOperationDispatchResult<TFlowBundle>>;
}

export interface RuntimeReferenceLabelInput {
  entityCode: RuntimeEntityCode;
  recordId: RuntimeRecordId;
  sourceEntityCode?: RuntimeEntityCode;
  sourceRecord?: Record<string, unknown>;
}

export interface RuntimeReferenceOption {
  value: string;
  label: string;
  description?: string;
  recordId?: string;
  record?: Record<string, unknown>;
}

export interface RuntimeReferenceSearchInput {
  entityCode: RuntimeEntityCode;
  query: string;
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
  sourceEntityCode?: RuntimeEntityCode;
  sourceRecord?: Record<string, unknown>;
}

export interface RuntimeReferenceSearchResult {
  options: RuntimeReferenceOption[];
  total?: number;
}

export interface RuntimeLookupDomainInput {
  domainCode: string;
  query?: string;
  filters?: Record<string, unknown>;
}

export interface RuntimeLookupOption {
  code: string;
  label: string;
  description?: string;
  disabled?: boolean;
  raw?: Record<string, unknown>;
}

export interface RuntimeFieldLookupAdapter {
  resolveReferenceLabel(input: RuntimeReferenceLabelInput): Promise<string | null>;
  searchReferenceOptions(input: RuntimeReferenceSearchInput): Promise<RuntimeReferenceSearchResult>;
  loadLookupDomain(input: RuntimeLookupDomainInput): Promise<RuntimeLookupOption[]>;
}

export type RuntimePanelKind =
  | "comments"
  | "attachments"
  | "activity"
  | "workflow"
  | "tasks"
  | "watchers"
  | "reports"
  | "quality"
  | "integrations"
  | "distributions"
  | "custom";

export interface RuntimeAttachmentSummary {
  count: number;
  totalBytes?: number;
  sharedCount?: number;
  pendingScanCount?: number;
}

export interface RuntimeRecordPanelAdapter {
  fetchCommentCount?(entityCode: RuntimeEntityCode, recordId: RuntimeRecordId): Promise<number>;
  fetchAttachmentSummary?(
    entityCode: RuntimeEntityCode,
    recordId: RuntimeRecordId,
  ): Promise<RuntimeAttachmentSummary>;
  panelApiBase?(panel: RuntimePanelKind, entityCode: RuntimeEntityCode, recordId: RuntimeRecordId): string | null;
}

export interface RuntimeRecordAdapters<TDescriptor = unknown, TOperation = unknown, TFlowBundle = unknown>
  extends RuntimeRecordDescriptorAdapter<TDescriptor, TOperation> {
  navigation: RuntimeRecordNavigationAdapter;
  mutations?: RuntimeRecordMutationAdapter;
  operations?: RuntimeOperationAdapter<TOperation, TFlowBundle>;
  lookups?: RuntimeFieldLookupAdapter;
  panels?: RuntimeRecordPanelAdapter;
}
