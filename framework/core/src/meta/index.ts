/**
 * META Engine
 *
 * Framework for dynamic entity modeling, policy-driven access control,
 * and runtime schema management.
 *
 * Phase 2: Core META Contracts
 * - Pure TypeScript types and interfaces
 * - No implementation (just contracts)
 * - DI tokens for service resolution
 *
 * Usage:
 * ```typescript
 * import { META_TOKENS, type MetaRegistry, type EntitySchema } from "@athyper/core/meta";
 *
 * // Register implementation
 * container.register(META_TOKENS.registry, MyMetaRegistryImpl);
 *
 * // Resolve service
 * const registry = container.get<MetaRegistry>(META_TOKENS.registry);
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Field types
  FieldType,
  FieldDefinition,

  // Policy types
  PolicyEffect,
  PolicyAction,
  PolicyOperator,
  PolicyCondition,
  PolicyDefinition,

  // Schema types
  EntitySchema,

  // Compiled types
  CompiledField,
  CompiledPolicy,
  CompiledModel,

  // Context types
  RequestContext,

  // Audit types
  AuditEventType,
  AuditEvent,

  // Query types
  ListOptions,
  PaginatedResponse,

  // Entity types
  Entity,
  EntityVersion,
  EntityVersionSummary,

  // Validation types
  ValidationResult,
  ValidationError,

  // Health check
  HealthCheckResult,

  // Compilation diagnostics (Phase 9.2)
  DiagnosticSeverity,
  CompileDiagnostic,
  CompilationResult,

  // Overlay system (Phase 10)
  OverlayChangeKind,
  OverlayConflictMode,
  OverlayChange,
  Overlay,
  OverlaySet,
  CompiledModelWithOverlays,

  // Policy engine (Phase 11)
  PolicyRuleScopeType,
  PolicyRuleSubjectType,
  PolicyConditionType,
  OUCheckMode,
  PolicyConditionDefinition,
  CompiledPolicyCondition,
  PolicyRuleDefinition,
  CompiledPolicyRule,
  IndexedPolicy,
  PolicyDecision,
  PermissionDecisionLog,

  // Workflow runtime (Phase 12)
  Lifecycle,
  LifecycleState,
  LifecycleTransition,
  LifecycleTransitionGate,
  ApprovalTemplate,
  ApprovalTemplateStage,
  ApprovalTemplateRule,
  EntityLifecycle,
  CompiledLifecycleRoute,
  EntityLifecycleRouteCompiled,
  EntityLifecycleInstance,
  EntityLifecycleEvent,
  LifecycleTransitionRequest,
  LifecycleTransitionResult,

  // Approval runtime (Phase 13)
  ApprovalInstance,
  ApprovalStage,
  ApprovalTask,
  ApprovalAssignmentSnapshot,
  ApprovalEscalation,
  ApprovalEvent,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  ApprovalCreationRequest,
  ApprovalCreationResult,

  // Approvable Core Engine (Phase 1)
  EntityClass,
  EntityFeatureFlags,
  ApprovalInstanceStatus,
  ApprovalTaskStatus,
  NumberingResetPolicy,
  NumberingRule,
  NumberingSequence,
  EffectiveDatedListOptions,

  // Template authoring (EPIC G)
  ApprovalTemplateCreateInput,
  ApprovalTemplateUpdateInput,
  TemplateValidationResult,
  CompiledApprovalTemplate,

  // Lifecycle gate evaluation (EPIC H)
  ThresholdRule,
  GateDecision,

  // Lifecycle timers (H4: Auto-Transitions)
  LifecycleTimerType,
  LifecycleTimerPolicy,
  LifecycleTimerRules,
  LifecycleTimerSchedule,
  LifecycleTimerPayload,
} from "./types.js";

export type {
  // DDL generation (Phase 14)
  DdlGenerationOptions,
  DdlGenerationResult,
} from "./contracts.js";

// ============================================================================
// Descriptor Type Exports (Entity Page Orchestration)
// ============================================================================

export type {
  ReasonCode,
  ViewMode,
  BadgeDescriptor,
  ActionGroup,
  ActionDescriptor,
  TabDescriptor,
  SectionDescriptor,
  EntityPageStaticDescriptor,
  EntityPageDynamicDescriptor,
  ActionExecutionRequest,
  ActionExecutionResult,
} from "./descriptor-types.js";

// ============================================================================
// Contract Exports
// ============================================================================

export type {
  // Core services
  MetaRegistry,
  MetaCompiler,
  PolicyGate,
  AuditLogger,
  GenericDataAPI,
  MetaStore,

  // Lifecycle services (Phase 12)
  LifecycleRouteCompiler,
  LifecycleManager,
  LifecycleTimerService,

  // Approval services (Phase 13)
  ApprovalService,

  // Approvable Core Engine services
  EntityClassificationService,
  NumberingEngine,

  // DDL generation (Phase 14)
  DdlGenerator,

  // Query filters
  AuditQueryFilters,

  // Bulk operation result
  BulkOperationResult,

  // Lifecycle types
  AvailableTransition,

  // Entity Page Descriptor (Entity Page Orchestration)
  EntityPageDescriptorService,
  ActionDispatcher,

  // Event Bus (Cross-Cutting Notifications)
  MetaEvent,
  MetaEventType,
  MetaEventHandler,
  MetaEventBus,

  // Template authoring (EPIC G)
  ApprovalTemplateService,
} from "./contracts.js";

// ============================================================================
// Token Exports
// ============================================================================

export {
  // Tokens
  META_TOKENS,
} from "./tokens.js";

export { DEFAULT_ENTITY_FEATURE_FLAGS } from "./types.js";

// Validation rules (Dynamic Rule Engine)
export type {
  ConditionOperator as ValidationConditionOperator,
  ConditionLeaf as ValidationConditionLeaf,
  ConditionGroup as ValidationConditionGroup,
  ConditionGroup, // Also export without alias for lifecycle timers
  ValidationRuleSeverity,
  ValidationPhase,
  ValidationTrigger,
  ValidationRuleKind,
  BaseValidationRule,
  RequiredRule,
  MinMaxRule,
  LengthRule,
  RegexRule,
  EnumConstraintRule,
  CrossFieldRule,
  ConditionalRule,
  DateRangeRule,
  ReferentialIntegrityRule,
  UniqueRule,
  ValidationRule,
  ValidationRuleSet,
  RuleValidationError,
  RuleValidationResult,
} from "./validation-rules.js";

export type {
  // Token types
  MetaTokenName,
  MetaTokenKey,
  MetaTokenTypes,
  MetaTokenValue,

  // Config
  MetaEngineConfig,
} from "./tokens.js";

// ============================================================================
// Legacy Exports (Deprecated)
// ============================================================================

/**
 * @deprecated Use FieldDefinition instead
 */
export type FieldMetadata = {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "reference" | "enum";
  required: boolean;
  label?: string;
  description?: string;
  referenceTo?: string;
  enumValues?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  helpText?: string;
};

/**
 * @deprecated Use EntitySchema instead
 */
export type EntityMetadata = {
  name: string;
  label: string;
  description?: string;
  fields: FieldMetadata[];
  permissions?: {
    create?: string[];
    read?: string[];
    update?: string[];
    delete?: string[];
  };
};

/**
 * @deprecated Will be replaced with MetaRegistry implementation
 *
 * Simple in-memory metadata registry for runtime schema introspection.
 * This is a legacy implementation and will be replaced with the full
 * META Engine services in Phase 3.
 */
export class MetadataRegistry {
  private entities = new Map<string, EntityMetadata>();

  register(entity: EntityMetadata): void {
    this.entities.set(entity.name, entity);
  }

  get(entityName: string): EntityMetadata | undefined {
    return this.entities.get(entityName);
  }

  getAll(): EntityMetadata[] {
    return Array.from(this.entities.values());
  }

  getFieldMetadata(
    entityName: string,
    fieldName: string
  ): FieldMetadata | undefined {
    const entity = this.get(entityName);
    return entity?.fields.find((f) => f.name === fieldName);
  }
}
