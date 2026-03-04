/**
 * Platform Services
 *
 * Core platform capabilities that provide the foundation for the system.
 */

// Workflow Engine - Approval workflows, state machine, action execution
export * as WorkflowEngine from "./workflow-engine/index.js";

// Policy Engine - Policy evaluation, rule processing, decision logging
export * as PolicyEngine from "./policy-rules/index.js";

// Identity & Access - User identity, roles, groups, tenant resolution
export * as IdentityAccess from "./identity-access/index.js";

// Audit & Governance - Audit trails, compliance reporting
export * as AuditGovernance from "./audit-governance/index.js";

// Automation & Jobs - Background jobs, scheduled tasks
export * as AutomationJobs from "./automation-jobs/index.js";

// Foundation Services - Core infrastructure services
export * as Foundation from "./foundation/index.js";

// Metadata Studio - Schema and metadata management
export * as MetadataStudio from "./metadata-studio/index.js";

// Platform Meta - Platform-level metadata services
export * as PlatformMeta from "./meta/index.js";
