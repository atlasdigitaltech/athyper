export type RuntimeDocumentEntityCode = string;
export type RuntimeDocumentRecordId = string;
export type RuntimeDocumentLineId = string;

export interface RuntimeDocumentRecord {
  id: RuntimeDocumentRecordId;
  data: Record<string, unknown>;
  status?: string | null;
}

export interface RuntimeDocumentVersion {
  id: string;
  versionNo?: number;
  status?: string | null;
  changeType?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface RuntimeDocumentLine {
  id?: RuntimeDocumentLineId;
  data: Record<string, unknown>;
}

export interface RuntimeDocumentDistribution {
  id?: string;
  lineId?: RuntimeDocumentLineId;
  data: Record<string, unknown>;
}

export interface RuntimeDocumentLinesInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  lineEntityCode?: RuntimeDocumentEntityCode;
  signal?: AbortSignal;
}

export interface RuntimeDocumentLinesResult {
  lines: RuntimeDocumentLine[];
  total?: number;
}

export interface RuntimeDocumentDistributionsInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  lineId?: RuntimeDocumentLineId;
  signal?: AbortSignal;
}

export interface RuntimeDocumentUpdateInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  data: Record<string, unknown>;
}

export interface RuntimeDocumentMutationResult {
  document?: RuntimeDocumentRecord;
  errors?: RuntimeDocumentError[];
}

export interface RuntimeDocumentError {
  field?: string;
  code?: string;
  message: string;
}

export interface RuntimeDocumentActionInput<TOperation = unknown> {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  operation: TOperation;
  actionCode: string;
  payload?: Record<string, unknown>;
}

export interface RuntimeDocumentActionResult {
  document?: RuntimeDocumentRecord;
  nextHref?: string;
  status?: string | null;
  errors?: RuntimeDocumentError[];
}

export interface RuntimeDocumentAdapter<TDocument = RuntimeDocumentRecord, TOperation = unknown> {
  fetchDocument(entityCode: RuntimeDocumentEntityCode, recordId: RuntimeDocumentRecordId): Promise<TDocument | null>;
  fetchVersions?(
    entityCode: RuntimeDocumentEntityCode,
    recordId: RuntimeDocumentRecordId,
  ): Promise<RuntimeDocumentVersion[]>;
  fetchLines?(input: RuntimeDocumentLinesInput): Promise<RuntimeDocumentLinesResult>;
  fetchDistributions?(input: RuntimeDocumentDistributionsInput): Promise<RuntimeDocumentDistribution[]>;
  updateDocument?(input: RuntimeDocumentUpdateInput): Promise<RuntimeDocumentMutationResult>;
  runDocumentAction?(input: RuntimeDocumentActionInput<TOperation>): Promise<RuntimeDocumentActionResult>;
}

export interface RuntimeLineCreateInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  lineEntityCode?: RuntimeDocumentEntityCode;
  data: Record<string, unknown>;
}

export interface RuntimeLineUpdateInput extends RuntimeLineCreateInput {
  lineId: RuntimeDocumentLineId;
}

export interface RuntimeLineDeleteInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId: RuntimeDocumentRecordId;
  lineId: RuntimeDocumentLineId;
}

export interface RuntimeLineMutationResult {
  line?: RuntimeDocumentLine;
  errors?: RuntimeDocumentError[];
}

export interface RuntimeDocumentReferenceSearchInput {
  entityCode: RuntimeDocumentEntityCode;
  query: string;
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
}

export interface RuntimeDocumentReferenceOption {
  value: string;
  label: string;
  description?: string;
  record?: Record<string, unknown>;
}

export interface RuntimeDocumentReferenceSearchResult {
  options: RuntimeDocumentReferenceOption[];
  total?: number;
}

export interface RuntimeDocumentLineAdapter {
  createLine(input: RuntimeLineCreateInput): Promise<RuntimeLineMutationResult>;
  updateLine(input: RuntimeLineUpdateInput): Promise<RuntimeLineMutationResult>;
  deleteLine(input: RuntimeLineDeleteInput): Promise<RuntimeLineMutationResult>;
  resolveReferenceOptions?(
    input: RuntimeDocumentReferenceSearchInput,
  ): Promise<RuntimeDocumentReferenceSearchResult>;
}

export interface RuntimeFlowSubmitInput {
  entityCode: RuntimeDocumentEntityCode;
  recordId?: RuntimeDocumentRecordId;
  flowCode: string;
  draft: Record<string, unknown>;
}

export interface RuntimeFlowSubmitResult {
  document?: RuntimeDocumentRecord;
  nextHref?: string;
  errors?: RuntimeDocumentError[];
}

export interface RuntimeRuleEvaluationInput {
  rule: unknown;
  context: Record<string, unknown>;
}

export interface RuntimeRuleEvaluationResult {
  value: unknown;
}

export interface RuntimeDocumentFlowAdapter<TFlowBundle = unknown> {
  fetchFlowBundle(entityCode: RuntimeDocumentEntityCode, flowCode: string): Promise<TFlowBundle>;
  submitFlow(input: RuntimeFlowSubmitInput): Promise<RuntimeFlowSubmitResult>;
  evaluateRule?(input: RuntimeRuleEvaluationInput): RuntimeRuleEvaluationResult;
}

export interface RuntimeDocumentAdapters<TDocument = RuntimeDocumentRecord, TOperation = unknown, TFlowBundle = unknown> {
  documents: RuntimeDocumentAdapter<TDocument, TOperation>;
  lines?: RuntimeDocumentLineAdapter;
  flows?: RuntimeDocumentFlowAdapter<TFlowBundle>;
}
