import type {
  NumberingPolicyContract,
  NumberingPolicyCoordinate,
  NumberingPreviewContext,
  NumberingPreviewResult,
} from "@athyper/numbering-contracts";
export type { NumberingPolicyTestCommand, NumberingPolicyTestResult } from "@athyper/numbering-contracts";

export type MetaEntityClass =
  | "business"
  | "configuration"
  | "reference"
  | "process"
  | "projection"
  | "technical";

export type MetaEntityOwnership = "system" | "package" | "tenant" | "overlay";
export type MetaEntityStatus = "draft" | "active" | "deprecated" | "retired";
export type MetaEntityChangeSetStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "abandoned"
  | "published";

export type MetaEntityFieldType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "decimal"
  | "boolean"
  | "uuid"
  | "date"
  | "datetime"
  | "json"
  | "enum"
  | "reference"
  | "money";

export type MetaEntityBackingKind = "table" | "view" | "materialized_view" | "external" | "virtual";
export type MetaEntityApiExposure = "none" | "catalog_only" | "api";
export type MetaEntityReadMode = "none" | "generic" | "facade" | "projection";
export type MetaEntityWriteMode = "none" | "generic" | "facade" | "append_only";
export type MetaEntityCreateMode = "form_only" | "early_draft" | "direct" | "source_document";
export type MetaEntityConcurrencyMode = "none" | "optimistic" | "append_only";
export type MetaEntityMemberStatus = "active" | "deprecated";
export type MetaEntityFieldValueOrigin = "stored" | "computed" | "projected" | "runtime";
export type MetaEntityFieldWriteMode = "mutable" | "write_once" | "read_only" | "computed";

export type MetaEntityDiagnosticSeverity = "error" | "warning" | "info";
export type MetaEntityStudioSection =
  | "overview"
  | "fields"
  | "keys"
  | "search"
  | "relations"
  | "surfaces"
  | "operations"
  | "flows"
  | "policies"
  | "lifecycle"
  | "numbering"
  | "tests"
  | "history"
  | "activity";

export interface MetaEntitySummary {
  id: string;
  tenantId: string | null;
  moduleCode: string;
  entityCode: string;
  entityClass: MetaEntityClass;
  ownershipModel: MetaEntityOwnership;
  status: MetaEntityStatus;
  openChangeSetCount: number;
  currentReleaseNo: number | null;
}

export interface MetaEntityModuleCoordinateRef {
  planeCode: "athyper";
  workspaceCode: string;
  moduleCode: string;
}

export interface MetaEntityPolicyDefinitionRef {
  id: string;
  tenantId: string | null;
  entityType: string;
  name: string;
  description: string | null;
  versionNo: number;
  status: "active" | "inactive" | "deprecated";
}

export interface MetaEntityModuleCoordinate extends MetaEntityModuleCoordinateRef {
  coordinateKey: string;
  moduleId: string;
  moduleName: string;
  moduleDescription: string | null;
  workspaceId: string;
  workspaceName: string;
}

export interface MetaEntityClassProfile {
  entityClass: MetaEntityClass;
  profileVersion: number;
  fallbackName: string;
  description: string;
  defaultBackingKind: MetaEntityBackingKind;
  defaultApiExposure: MetaEntityApiExposure;
  defaultReadMode: MetaEntityReadMode;
  defaultWriteMode: MetaEntityWriteMode;
  defaultConcurrencyMode: MetaEntityConcurrencyMode;
  defaultChangePolicy: "locked" | "controlled" | "extensible";
}

export interface MetaEntityChangeSetSummary {
  id: string;
  entityId: string;
  code: string;
  branchCode: string;
  title: string;
  status: MetaEntityChangeSetStatus;
  lockVersion: number;
  baseReleaseNo: number | null;
  updatedAt: string | null;
}

export interface MetaEntityCreateCommand {
  moduleCoordinate: MetaEntityModuleCoordinateRef;
  entityCode: string;
  entityClass: MetaEntityClass;
  initialChangeSet: {
    changeSetCode: string;
    title: string;
    storagePlane: "athyper" | "neon" | "mesh";
    storageSchema: string;
    storageObject: string;
  };
}

export interface MetaEntityCreateChangeSetCommand {
  entityId: string;
  changeSetCode: string;
  branchCode?: string;
  title: string;
  baseReleaseId?: string;
  parentChangeSetId?: string;
  changeSummary?: string;
  changeReasonCode?: string;
  ticketReference?: string;
}

export interface MetaEntityStringTypeConfig {
  kind: "string" | "text";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface MetaEntityNumericTypeConfig {
  kind: "integer" | "bigint" | "decimal";
  minimum?: number;
  maximum?: number;
  precision?: number;
  scale?: number;
}

export interface MetaEntityReferenceTypeConfig {
  kind: "reference";
  identifierType: "uuid" | "string" | "integer" | "bigint";
}

export interface MetaEntityMoneyTypeConfig {
  kind: "money";
  currencyMode: "field" | "fixed";
  currencyFieldKey?: string;
  fixedCurrencyCode?: string;
  scale?: number;
}

export interface MetaEntityEnumTypeConfig {
  kind: "enum";
  domainCode: string;
}

export interface MetaEntityScalarTypeConfig {
  kind: "boolean" | "uuid" | "date";
}

export interface MetaEntityDateTimeTypeConfig {
  kind: "datetime";
  timezoneMode?: "utc" | "offset" | "local";
}

export interface MetaEntityJsonTypeConfig {
  kind: "json";
  schemaCode?: string;
}

export type MetaEntityFieldTypeConfig =
  | MetaEntityStringTypeConfig
  | MetaEntityNumericTypeConfig
  | MetaEntityReferenceTypeConfig
  | MetaEntityMoneyTypeConfig
  | MetaEntityEnumTypeConfig
  | MetaEntityScalarTypeConfig
  | MetaEntityDateTimeTypeConfig
  | MetaEntityJsonTypeConfig;

export type MetaEntityDefaultSpec =
  | { kind: "static"; value: unknown; applyOn?: readonly ("create" | "reset")[] }
  | { kind: "current_time" | "current_date" | "principal"; applyOn?: readonly ("create" | "reset")[] }
  | { kind: "tenant_context"; contextKey: string; applyOn?: readonly ("create" | "reset")[] }
  | { kind: "parent_field"; fieldKey: string; applyOn?: readonly ("create" | "reset")[] }
  | { kind: "resolver"; resolverKey: string; applyOn?: readonly ("create" | "reset")[] };

export type MetaEntityComputationSpec =
  | { kind: "expression"; language: "cel" | "jsonlogic"; expression: string }
  | { kind: "handler"; handlerKey: string };

export type MetaEntityValidationRule =
  | { code: string; kind: "length"; parameters: { minimum?: number; maximum?: number }; messageKey?: string; severity?: "error" | "warning" }
  | { code: string; kind: "range"; parameters: { minimum?: number; maximum?: number; inclusiveMinimum?: boolean; inclusiveMaximum?: boolean }; messageKey?: string; severity?: "error" | "warning" }
  | { code: string; kind: "pattern"; parameters: { pattern: string; flags?: string }; messageKey?: string; severity?: "error" | "warning" }
  | { code: string; kind: "allowed_values"; parameters: { values: readonly unknown[] }; messageKey?: string; severity?: "error" | "warning" }
  | { code: string; kind: "comparison"; parameters: { fieldKey: string; operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" }; messageKey?: string; severity?: "error" | "warning" }
  | { code: string; kind: "custom_handler"; parameters: { handlerKey: string }; messageKey?: string; severity?: "error" | "warning" };

export interface MetaEntityValidationSpec {
  schemaVersion: 1;
  rules: readonly MetaEntityValidationRule[];
}

export interface MetaEntityRuntimeProfileDraft {
  id: string;
  profileKey: "default";
  backingKind: MetaEntityBackingKind;
  storagePlane: "athyper" | "neon" | "mesh" | null;
  storageSchema: string | null;
  storageObject: string | null;
  apiExposure: MetaEntityApiExposure;
  readMode: MetaEntityReadMode;
  writeMode: MetaEntityWriteMode;
  readHandlerKey: string | null;
  writeHandlerKey: string | null;
  createMode: MetaEntityCreateMode;
  concurrencyMode: MetaEntityConcurrencyMode;
  recordVersionFieldKey: string | null;
  tenantFieldKey: string | null;
  softDeleteFieldKey: string | null;
  draftTtlHours: number | null;
}

export interface MetaEntityFieldDraft {
  id: string;
  fieldKey: string;
  description?: string;
  dataType: MetaEntityFieldType;
  typeConfig: MetaEntityFieldTypeConfig;
  cardinality: "one" | "zero_or_one" | "many";
  valueOrigin: MetaEntityFieldValueOrigin;
  writeMode: MetaEntityFieldWriteMode;
  storagePath: string | null;
  defaultSpec: MetaEntityDefaultSpec | null;
  computationSpec: MetaEntityComputationSpec | null;
  validationSpec: MetaEntityValidationSpec | null;
  status: MetaEntityMemberStatus;
  replacementFieldKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  keyUsageCount: number;
  searchUsageCount: number;
  relationUsageCount: number;
}

export interface MetaEntityKeyDraft {
  id: string;
  keyKey: string;
  keyKind: "primary" | "natural" | "alternate" | "idempotency";
  uniquenessScope: "global" | "tenant";
  nullSemantics: "not_allowed" | "nulls_distinct" | "nulls_not_distinct";
  status: MetaEntityMemberStatus;
  replacementKeyKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  fields: readonly MetaEntityKeyFieldDraft[];
}

export interface MetaEntityKeyFieldDraft {
  id: string;
  entityFieldId: string;
  position: number;
}

export interface MetaEntitySearchProfileDraft {
  id: string;
  searchKey: string;
  searchKind: "keyword" | "full_text" | "hybrid";
  queryOperator: "and" | "or";
  minimumQueryLength: number;
  languageCode: string | null;
  normalizationMode: "none" | "casefold" | "casefold_unaccent";
  isDefault: boolean;
  status: MetaEntityMemberStatus;
  replacementSearchKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  fields: readonly MetaEntitySearchFieldDraft[];
}

export interface MetaEntitySearchFieldDraft {
  id: string;
  entityFieldId: string;
  position: number;
  matchMode: "exact" | "prefix" | "contains" | "full_text";
  weight: number;
}

export interface MetaEntityRelationDraft {
  id: string;
  relationKey: string;
  relationKind: "one_to_one" | "many_to_one" | "one_to_many" | "many_to_many";
  resolutionKind: "foreign_key" | "logical" | "polymorphic";
  ownershipMode: "reference" | "aggregate_child" | "shared";
  mutationMode: "read_only" | "source_owned" | "target_owned" | "coordinated";
  onDelete: "restrict" | "cascade" | "set_null" | "no_action";
  onUpdate: "restrict" | "cascade" | "no_action";
  inverseRelationKey: string | null;
  status: MetaEntityMemberStatus;
  replacementRelationKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  targets: readonly MetaEntityRelationTargetDraft[];
}

export interface MetaEntityRelationTargetDraft {
  id: string;
  relationTargetKey: string;
  targetEntityId: string;
  targetKeyKey: string;
  discriminatorValue: string | null;
  isDefault: boolean;
  fields: readonly MetaEntityRelationFieldDraft[];
}

export interface MetaEntityRelationFieldDraft {
  id: string;
  sourceFieldId: string;
  targetFieldKey: string;
  position: number;
}

export interface MetaEntitySurfaceFieldBindingDraft {
  id: string;
  bindingKey: string;
  entityFieldId: string;
  sectionId: string | null;
  position: number;
  labelOverride: string | null;
  helpText: string | null;
  placeholder: string | null;
  widgetKey: string | null;
  columnSpan: number;
  showRequiredIndicator: boolean;
  displayConfig: Readonly<Record<string, unknown>>;
  visibilityRule: Readonly<Record<string, unknown>> | null;
  editabilityRule: Readonly<Record<string, unknown>> | null;
  status: MetaEntityMemberStatus;
}

export interface MetaEntitySurfaceSectionDraft {
  id: string;
  sectionKey: string;
  parentSectionId: string | null;
  sectionKind: "section" | "group" | "fieldset" | "tab" | "columns";
  title: string | null;
  description: string | null;
  position: number;
  columnCount: number;
  collapsible: boolean;
  collapsedByDefault: boolean;
  layoutConfig: Readonly<Record<string, unknown>>;
}

export interface MetaEntitySurfaceDraft {
  id: string;
  surfaceKey: string;
  surfaceKind: "form" | "detail" | "list" | "lookup" | "embedded";
  title: string;
  description: string | null;
  layoutKind: "flow" | "grid" | "stack" | "tabs";
  layoutConfig: Readonly<Record<string, unknown>>;
  isDefault: boolean;
  status: MetaEntityMemberStatus;
  replacementSurfaceKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  sections: readonly MetaEntitySurfaceSectionDraft[];
  fieldBindings: readonly MetaEntitySurfaceFieldBindingDraft[];
}

export interface MetaEntityOperationDraft {
  id: string;
  operationKey: string;
  operationKind: "create" | "read" | "update" | "delete" | "execute" | "transition" | "import" | "export";
  label: string;
  description: string | null;
  handlerKey: string | null;
  permissionCode: string;
  executionMode: "synchronous" | "asynchronous";
  idempotencyMode: "none" | "optional" | "required";
  inputSurfaceKey: string | null;
  confirmationSurfaceKey: string | null;
  resultSurfaceKey: string | null;
  requiresMfa: boolean;
  auditEventCode: string;
  status: MetaEntityMemberStatus;
  replacementOperationKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
}

export interface MetaEntitySurfaceOperationDraft {
  id: string;
  surfaceId: string;
  operationId: string;
  sectionId: string | null;
  placementKey: string;
  interactionTarget: "primary" | "secondary" | "toolbar" | "row" | "selection" | "overflow";
  selectionMode: "none" | "single" | "multiple";
  position: number;
  labelOverride: string | null;
  iconKey: string | null;
  presentationVariant: string | null;
  confirmationSurfaceId: string | null;
  visibilityRule: Readonly<Record<string, unknown>> | null;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityOperationRuleDraft {
  id: string;
  operationId: string;
  ruleKey: string;
  priority: number;
  decision: "allow" | "deny";
  planeCode: "athyper" | "neon" | "mesh" | null;
  lifecycleStateCode: string | null;
  lifecycleTransitionCode: string | null;
  requiredCapabilityCode: string | null;
  reasonCode: string | null;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityOperationScopeBindingDraft {
  id: string;
  operationId: string;
  bindingKey: string;
  targetPlane: "neon" | "mesh";
  decisionMode: "entity_resource" | "collection";
  scopeKind:
    | "tenant" | "workspace" | "module" | "company_code" | "legal_entity"
    | "operating_organization" | "network_account" | "network_relationship" | "resource";
  coordinateSource:
    | "tenant_context" | "request_field" | "record_field" | "collection_field" | "relation_resolver";
  coordinateKey: string | null;
  resolverKey: string | null;
  missingValueBehavior: "deny";
  status: MetaEntityMemberStatus;
}

export interface MetaEntityFlowStepDraft {
  id: string;
  stepKey: string;
  surfaceId: string;
  position: number;
  titleOverride: string | null;
  description: string | null;
  entryCondition: Readonly<Record<string, unknown>> | null;
  completionCondition: Readonly<Record<string, unknown>> | null;
  isOptional: boolean;
}

export interface MetaEntityFlowDraft {
  id: string;
  flowKey: string;
  flowKind: "create" | "edit" | "review" | "execute";
  title: string;
  description: string | null;
  navigationMode: "linear" | "free";
  entryOperationId: string | null;
  completionOperationId: string | null;
  allowDraftResume: boolean;
  status: MetaEntityMemberStatus;
  replacementFlowKey?: string;
  deprecatedSinceReleaseNo?: number;
  plannedRemovalReleaseNo?: number;
  steps: readonly MetaEntityFlowStepDraft[];
}

export interface MetaEntityPolicyBindingDraft {
  id: string;
  bindingKey: string;
  operationId: string | null;
  policyDefinitionId: string;
  bindingStage: "authorization" | "precondition" | "validation" | "postcondition" | "masking";
  enforcement: "enforce" | "warn" | "observe";
  priority: number;
  inputMapping: Readonly<Record<string, unknown>>;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityFieldPolicyBindingDraft extends MetaEntityPolicyBindingDraft {
  fieldId: string;
}

export interface MetaEntityContractTestCaseDraft {
  id: string;
  testKey: string;
  testKind: "validation" | "compilation" | "compatibility" | "operation";
  title: string;
  description: string | null;
  targetPlane: "athyper" | "neon" | "mesh" | null;
  operationId: string | null;
  flowId: string | null;
  inputContext: Readonly<Record<string, unknown>>;
  expectedOutcome: "pass" | "fail" | "warning";
  expectedDiagnosticCodes: readonly string[];
  status: MetaEntityMemberStatus;
}

export interface MetaEntityLifecycleCoordinate {
  targetPlane: "athyper" | "neon" | "mesh";
  lifecycleCode: string;
  lifecycleRevision: number;
}

export interface MetaEntityLifecycleBindingDraft extends MetaEntityLifecycleCoordinate {
  id: string;
  bindingKey: string;
  stateFieldId: string;
  required: boolean;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityLifecycleOperationBindingDraft {
  id: string;
  lifecycleBindingId: string;
  operationId: string;
  mappingKey: string;
  transitionCode: string;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityNumberingBindingDraft extends NumberingPolicyCoordinate {
  id: string;
  bindingKey: string;
  fieldId: string;
  operationId: string | null;
  assignmentMode: "automatic" | "manual";
  required: boolean;
  status: MetaEntityMemberStatus;
}

export interface MetaEntityPhase2Graph {
  runtimeProfile: MetaEntityRuntimeProfileDraft;
  fields: readonly MetaEntityFieldDraft[];
  keys: readonly MetaEntityKeyDraft[];
  searchProfiles: readonly MetaEntitySearchProfileDraft[];
  relations: readonly MetaEntityRelationDraft[];
  surfaces: readonly MetaEntitySurfaceDraft[];
  operations: readonly MetaEntityOperationDraft[];
  surfaceOperations: readonly MetaEntitySurfaceOperationDraft[];
  operationRules: readonly MetaEntityOperationRuleDraft[];
  operationScopeBindings?: readonly MetaEntityOperationScopeBindingDraft[];
  flows: readonly MetaEntityFlowDraft[];
  policyBindings: readonly MetaEntityPolicyBindingDraft[];
  fieldPolicyBindings: readonly MetaEntityFieldPolicyBindingDraft[];
  testCases: readonly MetaEntityContractTestCaseDraft[];
  lifecycleBindings: readonly MetaEntityLifecycleBindingDraft[];
  lifecycleOperationBindings: readonly MetaEntityLifecycleOperationBindingDraft[];
  numberingBindings: readonly MetaEntityNumberingBindingDraft[];
}

export interface MetaEntitySaveCommand {
  commandId: string;
  changeSetId: string;
  expectedLockVersion: number;
  graph: MetaEntityPhase2Graph;
}

export interface MetaEntitySaveResult {
  changeSetId: string;
  lockVersion: number;
  graph: MetaEntityPhase2Graph;
  diagnostics: readonly MetaEntityDiagnostic[];
}

export interface MetaEntityValidationResult {
  changeSetId: string;
  valid: boolean;
  diagnostics: readonly MetaEntityDiagnostic[];
}

export interface MetaEntityContractTestRunCommand {
  changeSetId: string;
  expectedLockVersion: number;
  correlationId?: string;
}

export interface MetaEntityContractTestResult {
  id: string;
  testRunId: string;
  ordinal: number;
  testCaseId: string;
  testKey: string;
  testKind: MetaEntityContractTestCaseDraft["testKind"];
  targetPlane: MetaEntityContractTestCaseDraft["targetPlane"];
  expectedOutcome: MetaEntityContractTestCaseDraft["expectedOutcome"];
  actualOutcome: "pass" | "fail" | "warning" | "error";
  assertionPassed: boolean;
  diagnosticCodes: readonly string[];
  diagnostics: readonly MetaEntityDiagnostic[];
  actualOutput: Readonly<Record<string, unknown>>;
  durationMs: number;
  resultHash: string;
}

export interface MetaEntityContractTestRun {
  id: string;
  entityId: string;
  changeSetId: string;
  revisionId: string | null;
  sourceLockVersion: number;
  sourceContractHash: string;
  runnerCode: string;
  runnerVersion: string;
  status: "passed" | "failed" | "error";
  totalCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  durationMs: number;
  runHash: string;
  executedAt: string;
  executedBy: string;
  results?: readonly MetaEntityContractTestResult[];
}

export interface MetaEntityNumberingPreviewCommand extends NumberingPreviewContext {
  changeSetId: string;
  expectedLockVersion: number;
  numberingBindingId: string;
  correlationId?: string;
}

export interface MetaEntityNumberingTestArtifact {
  id: string;
  entityId: string;
  changeSetId: string;
  sourceLockVersion: number;
  numberingBindingId: string;
  bindingKey: string;
  targetPlane: "neon" | "mesh";
  fieldKey: string;
  operationKey: string | null;
  policyCode: string;
  policyRevision: number;
  policySource: "tenant" | "global" | null;
  bindingContract: Readonly<Record<string, unknown>>;
  policyContract: NumberingPolicyContract | null;
  previewInput: NumberingPreviewContext;
  actualOutput: NumberingPreviewResult | Readonly<Record<string, never>>;
  diagnosticCodes: readonly string[];
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
  status: "passed" | "failed";
  artifactHash: string;
  executedAt: string;
  executedBy: string;
}

export interface MetaEntityCheckpointCommand {
  changeSetId: string;
  expectedLockVersion: number;
  compatibilityLevel: "backward_compatible" | "forward_compatible" | "full" | "breaking";
  correlationId?: string;
}

export interface MetaEntityCheckpointResult {
  id: string;
  changeSetId: string;
  revisionNo: number;
  contractHash: string;
  revisionHash: string;
  changedPaths: readonly string[];
  validationStatus: "pending" | "valid" | "invalid";
  capturedAt: string;
}

export interface MetaEntityWorkflowCommand {
  changeSetId: string;
  expectedLockVersion: number;
  reason?: string;
  correlationId?: string;
}

export interface MetaEntityPublishCommand extends MetaEntityWorkflowCommand {
  revisionId: string;
  releaseKind?: "publish" | "rollback" | "retire";
  rollbackOfReleaseId?: string;
  versionLabel?: string;
  targetPlanes: readonly ("athyper" | "neon" | "mesh")[];
  minimumRuntimeVersion?: string;
  ticketReference?: string;
}

export interface MetaEntityReleaseResult {
  id: string;
  entityId: string;
  changeSetId: string;
  revisionId: string;
  releaseNo: number;
  releaseHash: string;
  publishedAt: string;
}

export interface MetaEntityReleaseSummary extends MetaEntityReleaseResult {
  releaseKind: "publish" | "rollback" | "retire";
  versionLabel: string | null;
  rollbackOfReleaseId: string | null;
  targetPlanes: readonly ("athyper" | "neon" | "mesh")[];
  publishedBy: string;
}

export interface MetaEntityActivityItem {
  id: string;
  eventCode: string;
  operation: string;
  outcome: string;
  severity: string;
  actorPrincipalId: string | null;
  occurredAt: string;
  correlationId: string | null;
  context: Readonly<Record<string, unknown>>;
}

export interface MetaEntityCapabilities {
  view: boolean;
  author: boolean;
  review: boolean;
  publish: boolean;
  rollback: boolean;
  retire: boolean;
}

export interface MetaEntityDiagnostic {
  id: string;
  code: string;
  severity: MetaEntityDiagnosticSeverity;
  message: string;
  section: MetaEntityStudioSection;
  objectId?: string;
}

export interface MetaEntityStudioSnapshot {
  capabilities: MetaEntityCapabilities;
  classProfiles: readonly MetaEntityClassProfile[];
  moduleCoordinates: readonly MetaEntityModuleCoordinate[];
  policyDefinitions: readonly MetaEntityPolicyDefinitionRef[];
  entities: readonly MetaEntitySummary[];
  changeSets: readonly MetaEntityChangeSetSummary[];
  activeEntityId: string | null;
  activeChangeSet: MetaEntityChangeSetSummary | null;
  runtimeProfile: MetaEntityRuntimeProfileDraft | null;
  fields: readonly MetaEntityFieldDraft[];
  keys: readonly MetaEntityKeyDraft[];
  searchProfiles: readonly MetaEntitySearchProfileDraft[];
  relations: readonly MetaEntityRelationDraft[];
  surfaces: readonly MetaEntitySurfaceDraft[];
  operations: readonly MetaEntityOperationDraft[];
  surfaceOperations: readonly MetaEntitySurfaceOperationDraft[];
  operationRules: readonly MetaEntityOperationRuleDraft[];
  operationScopeBindings?: readonly MetaEntityOperationScopeBindingDraft[];
  flows: readonly MetaEntityFlowDraft[];
  policyBindings: readonly MetaEntityPolicyBindingDraft[];
  fieldPolicyBindings: readonly MetaEntityFieldPolicyBindingDraft[];
  testCases: readonly MetaEntityContractTestCaseDraft[];
  lifecycleBindings: readonly MetaEntityLifecycleBindingDraft[];
  lifecycleOperationBindings: readonly MetaEntityLifecycleOperationBindingDraft[];
  numberingBindings: readonly MetaEntityNumberingBindingDraft[];
  testRuns: readonly MetaEntityContractTestRun[];
  activeTestRunResults: readonly MetaEntityContractTestResult[];
  numberingTestArtifacts: readonly MetaEntityNumberingTestArtifact[];
  diagnostics: readonly MetaEntityDiagnostic[];
  revisions: readonly MetaEntityCheckpointResult[];
  releases: readonly MetaEntityReleaseSummary[];
  activity: readonly MetaEntityActivityItem[];
}

export const EMPTY_META_ENTITY_STUDIO_SNAPSHOT: MetaEntityStudioSnapshot = {
  capabilities: { view: false, author: false, review: false, publish: false, rollback: false, retire: false },
  classProfiles: [],
  moduleCoordinates: [],
  policyDefinitions: [],
  entities: [],
  changeSets: [],
  activeEntityId: null,
  activeChangeSet: null,
  runtimeProfile: null,
  fields: [],
  keys: [],
  searchProfiles: [],
  relations: [],
  surfaces: [],
  operations: [],
  surfaceOperations: [],
  operationRules: [],
  flows: [],
  policyBindings: [],
  fieldPolicyBindings: [],
  testCases: [],
  lifecycleBindings: [],
  lifecycleOperationBindings: [],
  numberingBindings: [],
  testRuns: [],
  activeTestRunResults: [],
  numberingTestArtifacts: [],
  diagnostics: [],
  revisions: [],
  releases: [],
  activity: [],
};
