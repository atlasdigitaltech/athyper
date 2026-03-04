/**
 * Version Control Module Types
 *
 * Types for workflow version history, lifecycle management,
 * and impact analysis for template changes.
 */

import type { ApprovalActionType, ApprovalStep, ApprovalTrigger, ApprovalWorkflowTemplate, SlaConfiguration } from "../types.js";

// Definition type extracted from template (the runtime configuration part)
type TemplateDefinition = {
  triggers: ApprovalTrigger[];
  steps: ApprovalStep[];
  globalSla?: SlaConfiguration;
  allowedActions: ApprovalActionType[];
  metadata?: Record<string, unknown>;
};

// Alias for backward compatibility - template with definition access
type ApprovalTemplate = ApprovalWorkflowTemplate & { definition: TemplateDefinition };

/**
 * Version status
 */
export type VersionStatus = "draft" | "active" | "deprecated" | "retired";

/**
 * Workflow version record
 */
export type WorkflowVersion = {
  id: string;
  templateId: string;
  version: number;
  status: VersionStatus;
  definition: ApprovalTemplate["definition"];
  metadata: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
  };

  // Version history
  createdAt: Date;
  createdBy: string;
  publishedAt?: Date;
  publishedBy?: string;
  deprecatedAt?: Date;
  deprecatedBy?: string;
  retiredAt?: Date;
  retiredBy?: string;

  // Change tracking
  changeDescription?: string;
  previousVersionId?: string;
  changes?: VersionChange[];

  // Statistics
  instanceCount?: number;
  activeInstanceCount?: number;
};

/**
 * Type of change made
 */
export type ChangeType =
  | "step_added"
  | "step_removed"
  | "step_modified"
  | "condition_added"
  | "condition_removed"
  | "condition_modified"
  | "sla_modified"
  | "escalation_modified"
  | "approver_rule_modified"
  | "metadata_modified";

/**
 * Individual version change
 */
export type VersionChange = {
  type: ChangeType;
  path: string;
  description: string;
  previousValue?: unknown;
  newValue?: unknown;
  breaking: boolean;
};

/**
 * Version comparison result
 */
export type VersionComparison = {
  fromVersion: number;
  toVersion: number;
  changes: VersionChange[];
  breakingChanges: VersionChange[];
  summary: {
    stepsAdded: number;
    stepsRemoved: number;
    stepsModified: number;
    conditionsChanged: number;
    slaChanged: boolean;
    escalationsChanged: boolean;
  };
  compatible: boolean;
};

/**
 * Impact analysis for a version change
 */
export type ImpactAnalysis = {
  versionId: string;
  analyzedAt: Date;

  // Affected instances
  affectedInstances: {
    total: number;
    byStatus: Record<string, number>;
    instanceIds: string[];
  };

  // Potential issues
  issues: ImpactIssue[];

  // Recommendations
  recommendations: string[];

  // Migration path
  migrationRequired: boolean;
  migrationSteps?: MigrationStep[];
};

/**
 * Impact issue
 */
export type ImpactIssue = {
  severity: "info" | "warning" | "error";
  type: string;
  description: string;
  affectedEntities: string[];
  resolution?: string;
};

/**
 * Migration step for version upgrade
 */
export type MigrationStep = {
  order: number;
  action: string;
  description: string;
  automated: boolean;
  script?: string;
};

/**
 * Version lifecycle event
 */
export type VersionLifecycleEvent = {
  id: string;
  versionId: string;
  event: "created" | "published" | "deprecated" | "retired" | "reactivated";
  timestamp: Date;
  performedBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Version search criteria
 */
export type VersionSearchCriteria = {
  templateId?: string;
  status?: VersionStatus | VersionStatus[];
  createdAfter?: Date;
  createdBefore?: Date;
  createdBy?: string;
  tags?: string[];
  hasActiveInstances?: boolean;
};

/**
 * Version repository interface
 */
export interface IVersionRepository {
  // Version CRUD
  createVersion(version: Omit<WorkflowVersion, "id">): Promise<WorkflowVersion>;
  getVersion(tenantId: string, versionId: string): Promise<WorkflowVersion | null>;
  getVersionByNumber(tenantId: string, templateId: string, version: number): Promise<WorkflowVersion | null>;
  getVersions(tenantId: string, templateId: string): Promise<WorkflowVersion[]>;
  getActiveVersion(tenantId: string, templateId: string): Promise<WorkflowVersion | null>;
  updateVersion(tenantId: string, versionId: string, updates: Partial<WorkflowVersion>): Promise<WorkflowVersion>;
  searchVersions(tenantId: string, criteria: VersionSearchCriteria): Promise<WorkflowVersion[]>;

  // Lifecycle events
  createLifecycleEvent(event: Omit<VersionLifecycleEvent, "id">): Promise<VersionLifecycleEvent>;
  getLifecycleEvents(tenantId: string, versionId: string): Promise<VersionLifecycleEvent[]>;

  // Statistics
  updateInstanceCount(tenantId: string, versionId: string, count: number, activeCount: number): Promise<void>;
}

/**
 * Version control service interface
 */
export interface IVersionControlService {
  /**
   * Create a new version (draft)
   */
  createVersion(
    tenantId: string,
    templateId: string,
    definition: ApprovalTemplate["definition"],
    metadata: WorkflowVersion["metadata"],
    createdBy: string,
    changeDescription?: string
  ): Promise<WorkflowVersion>;

  /**
   * Publish a draft version (make active)
   */
  publishVersion(
    tenantId: string,
    versionId: string,
    publishedBy: string
  ): Promise<WorkflowVersion>;

  /**
   * Deprecate a version (soft retire)
   */
  deprecateVersion(
    tenantId: string,
    versionId: string,
    deprecatedBy: string,
    reason: string
  ): Promise<WorkflowVersion>;

  /**
   * Retire a version (fully deactivate)
   */
  retireVersion(
    tenantId: string,
    versionId: string,
    retiredBy: string,
    reason: string
  ): Promise<WorkflowVersion>;

  /**
   * Reactivate a deprecated/retired version
   */
  reactivateVersion(
    tenantId: string,
    versionId: string,
    reactivatedBy: string,
    reason: string
  ): Promise<WorkflowVersion>;

  /**
   * Get version history for a template
   */
  getVersionHistory(tenantId: string, templateId: string): Promise<WorkflowVersion[]>;

  /**
   * Compare two versions
   */
  compareVersions(
    tenantId: string,
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionComparison>;

  /**
   * Analyze impact of activating a new version
   */
  analyzeImpact(
    tenantId: string,
    versionId: string
  ): Promise<ImpactAnalysis>;

  /**
   * Get active version for a template
   */
  getActiveVersion(tenantId: string, templateId: string): Promise<WorkflowVersion | null>;

  /**
   * Clone a version
   */
  cloneVersion(
    tenantId: string,
    versionId: string,
    createdBy: string
  ): Promise<WorkflowVersion>;

  /**
   * Get version lifecycle events
   */
  getLifecycleHistory(tenantId: string, versionId: string): Promise<VersionLifecycleEvent[]>;

  /**
   * Validate a version definition
   */
  validateVersion(
    tenantId: string,
    definition: ApprovalTemplate["definition"]
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
}
