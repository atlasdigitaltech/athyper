/**
 * META Engine DI Tokens
 *
 * Dependency injection tokens for all META Engine services.
 * These tokens are used to register and resolve service implementations
 * in the DI container.
 *
 * Pattern:
 * - Token keys are grouped by category (meta.*)
 * - Token values are stable string identifiers
 * - TokenTypes interface provides type safety for resolved values
 */

import type {
  ActionDispatcher,
  ApprovalService,
  ApprovalTemplateService,
  AuditLogger,
  EntityClassificationService,
  EntityPageDescriptorService,
  GenericDataAPI,
  LifecycleManager,
  LifecycleTimerService,
  MetaCompiler,
  MetaEventBus,
  MetaRegistry,
  MetaStore,
  NumberingEngine,
  PolicyGate,
} from "./contracts.js";

// ============================================================================
// META Engine Tokens
// ============================================================================

/**
 * META Engine service tokens
 *
 * Namespace: meta.*
 */
export const META_TOKENS = {
  // ===== Core META Services =====

  /** Meta Registry - entity/version CRUD */
  registry: "meta.registry",

  /** Meta Compiler - schema → compiled IR */
  compiler: "meta.compiler",

  /** Policy Gate - policy evaluation */
  policyGate: "meta.policyGate",

  /** Audit Logger - audit trail */
  auditLogger: "meta.auditLogger",

  /** Generic Data API - generic CRUD operations */
  dataAPI: "meta.dataAPI",

  /** Meta Store - high-level registry + compiler */
  store: "meta.store",

  // ===== Cache =====

  /** Compiled model cache (Redis) */
  compiledModelCache: "meta.cache.compiledModel",

  /** Policy cache (Redis) */
  policyCache: "meta.cache.policy",

  // ===== Configuration =====

  /** META Engine configuration */
  config: "meta.config",

  // ===== Health =====

  /** META Engine health check registry */
  healthRegistry: "meta.health",

  // ===== Approvable Core Engine =====

  /** Entity Classification Service - resolves entity class and feature flags */
  classificationService: "meta.classificationService",

  /** Numbering Engine - atomic document number generation */
  numberingEngine: "meta.numberingEngine",

  /** Approval Service - approval workflow management */
  approvalService: "meta.approvalService",

  // ===== Entity Page Descriptor =====

  /** Entity Page Descriptor Service - page orchestration */
  descriptorService: "meta.descriptorService",

  /** Action Dispatcher - routes action execution to backend services */
  actionDispatcher: "meta.actionDispatcher",

  // ===== Event Bus =====

  /** Meta Event Bus - cross-cutting notification bus */
  eventBus: "meta.eventBus",

  // ===== Lifecycle & Template Authoring (EPIC G + H) =====

  /** Lifecycle Manager - state transitions, gate evaluation */
  lifecycleManager: "meta.lifecycleManager",

  /** Lifecycle Timer Service - auto-transitions, scheduled state changes */
  lifecycleTimerService: "meta.lifecycleTimerService",

  /** Approval Template Service - template CRUD, validation, compilation */
  approvalTemplateService: "meta.approvalTemplateService",

  // ===== Overlay System (EPIC I) =====

  /** Overlay Repository - overlay CRUD operations */
  overlayRepository: "meta.overlayRepository",

  /** Schema Composer Service - overlay composition and validation */
  schemaComposer: "meta.schemaComposer",
} as const;

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Token name type (string literal union)
 * Example: "meta.registry" | "meta.compiler" | ...
 */
export type MetaTokenName = (typeof META_TOKENS)[keyof typeof META_TOKENS];

/**
 * Token key type (object keys)
 * Example: "registry" | "compiler" | ...
 */
export type MetaTokenKey = keyof typeof META_TOKENS;

// ============================================================================
// Token Type Map
// ============================================================================

/**
 * Token -> resolved value type map
 * Provides type safety when resolving services from DI container
 *
 * Usage:
 * ```typescript
 * const registry = container.get<MetaTokenTypes[META_TOKENS.registry]>(META_TOKENS.registry);
 * // registry is typed as MetaRegistry
 * ```
 */
export interface MetaTokenTypes {
  // Core services
  [META_TOKENS.registry]: MetaRegistry;
  [META_TOKENS.compiler]: MetaCompiler;
  [META_TOKENS.policyGate]: PolicyGate;
  [META_TOKENS.auditLogger]: AuditLogger;
  [META_TOKENS.dataAPI]: GenericDataAPI;
  [META_TOKENS.store]: MetaStore;

  // Cache
  [META_TOKENS.compiledModelCache]: unknown; // Redis client or cache interface
  [META_TOKENS.policyCache]: unknown; // Redis client or cache interface

  // Configuration
  [META_TOKENS.config]: MetaEngineConfig;

  // Health
  [META_TOKENS.healthRegistry]: unknown; // Health registry interface

  // Approvable Core Engine
  [META_TOKENS.classificationService]: EntityClassificationService;
  [META_TOKENS.numberingEngine]: NumberingEngine;
  [META_TOKENS.approvalService]: ApprovalService;

  // Entity Page Descriptor
  [META_TOKENS.descriptorService]: EntityPageDescriptorService;
  [META_TOKENS.actionDispatcher]: ActionDispatcher;

  // Event Bus
  [META_TOKENS.eventBus]: MetaEventBus;

  // Lifecycle & Template Authoring
  [META_TOKENS.lifecycleManager]: LifecycleManager;
  [META_TOKENS.lifecycleTimerService]: LifecycleTimerService;
  [META_TOKENS.approvalTemplateService]: ApprovalTemplateService;

  // Overlay System
  [META_TOKENS.overlayRepository]: unknown; // IOverlayRepository from runtime
  [META_TOKENS.schemaComposer]: unknown; // SchemaComposerService from runtime
}

/**
 * Get token value type
 *
 * Usage:
 * ```typescript
 * type RegistryType = MetaTokenValue<typeof META_TOKENS.registry>;
 * // RegistryType = MetaRegistry
 * ```
 */
export type MetaTokenValue<T extends MetaTokenName> =
  T extends keyof MetaTokenTypes ? MetaTokenTypes[T] : unknown;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * META Engine configuration
 */
export type MetaEngineConfig = {
  /**
   * Enable compiled model caching
   * @default true
   */
  enableCache: boolean;

  /**
   * Cache TTL in seconds
   * @default 3600 (1 hour)
   */
  cacheTTL: number;

  /**
   * Enable policy evaluation caching
   * @default true
   */
  enablePolicyCache: boolean;

  /**
   * Policy cache TTL in seconds
   * @default 300 (5 minutes)
   */
  policyCacheTTL: number;

  /**
   * Enable audit logging
   * @default true
   */
  enableAudit: boolean;

  /**
   * Audit log retention in days
   * @default 90
   */
  auditRetentionDays: number;

  /**
   * Max page size for list queries
   * @default 100
   */
  maxPageSize: number;

  /**
   * Default page size for list queries
   * @default 20
   */
  defaultPageSize: number;

  /**
   * Enable schema validation on version create
   * @default true
   */
  enableSchemaValidation: boolean;

  /**
   * Precompile all active versions on startup
   * @default false
   */
  precompileOnStartup: boolean;
};

// Note: All types and constants are already exported inline above
// No need for duplicate exports here
