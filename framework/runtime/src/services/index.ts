/**
 * Services Module Index
 *
 * Organizes services into 4 main categories:
 * - platform/         - Core platform capabilities (workflow, policy, identity)
 * - platform-services/ - Platform-level shared services (notifications, integrations)
 * - business/         - Business domain services
 * - enterprise-services/ - Enterprise-level services (analytics, collaboration)
 */

// =============================================================================
// Platform Services (Core Capabilities)
// =============================================================================

// Workflow Engine (formerly approval/)
export * as WorkflowEngine from "./platform/workflow-engine/index.js";

// Policy Engine (formerly policy/)
export * as PolicyEngine from "./platform/policy-rules/index.js";

// Identity & Access Management (formerly iam/)
export * as IdentityAccess from "./platform/identity-access/index.js";

// =============================================================================
// Platform Services (Shared Infrastructure)
// =============================================================================

export * as PlatformServices from "./platform-services/index.js";

// =============================================================================
// Business Services
// =============================================================================

export * as BusinessServices from "./business/index.js";

// =============================================================================
// Enterprise Services
// =============================================================================

export * as EnterpriseServices from "./enterprise-services/index.js";

// =============================================================================
// Meta Services (Platform Meta)
// =============================================================================

export * as MetaServices from "./platform/meta/index.js";

// =============================================================================
// Re-exports for backward compatibility (deprecated)
// =============================================================================

/** @deprecated Use WorkflowEngine instead */
export * as Approval from "./platform/workflow-engine/index.js";

/** @deprecated Use PolicyEngine instead */
export * as Policy from "./platform/policy-rules/index.js";

/** @deprecated Use IdentityAccess instead */
export * as IAM from "./platform/identity-access/index.js";
