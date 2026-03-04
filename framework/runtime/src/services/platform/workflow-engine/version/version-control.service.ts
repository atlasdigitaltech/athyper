/**
 * Version Control Service
 *
 * Handles workflow version management including version history,
 * lifecycle transitions, and impact analysis.
 */

import type { IAuditTrailService } from "../audit/types.js";
import type { IApprovalInstanceRepository } from "../instance/types.js";
import type { ApprovalActionType, ApprovalStep, ApprovalTrigger, ApprovalWorkflowTemplate, SlaConfiguration } from "../types.js";
import type {
  ImpactAnalysis,
  ImpactIssue,
  IVersionControlService,
  IVersionRepository,
  MigrationStep,
  VersionChange,
  VersionComparison,
  VersionLifecycleEvent,
  WorkflowVersion,
} from "./types.js";

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
 * Version Control Service Implementation
 */
export class VersionControlService implements IVersionControlService {
  constructor(
    private readonly versionRepository: IVersionRepository,
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly auditService?: IAuditTrailService
  ) {}

  /**
   * Create a new version (draft)
   */
  async createVersion(
    tenantId: string,
    templateId: string,
    definition: ApprovalTemplate["definition"],
    metadata: WorkflowVersion["metadata"],
    createdBy: string,
    changeDescription?: string
  ): Promise<WorkflowVersion> {
    // Get existing versions to determine version number
    const existingVersions = await this.versionRepository.getVersions(tenantId, templateId);
    const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version), 0);
    const newVersionNumber = maxVersion + 1;

    // Get previous active version for change tracking
    const previousVersion = await this.versionRepository.getActiveVersion(tenantId, templateId);
    let changes: VersionChange[] = [];

    if (previousVersion) {
      changes = this.detectChanges(previousVersion.definition, definition);
    }

    // Create version
    const version = await this.versionRepository.createVersion({
      templateId,
      version: newVersionNumber,
      status: "draft",
      definition,
      metadata,
      createdAt: new Date(),
      createdBy,
      changeDescription,
      previousVersionId: previousVersion?.id,
      changes,
      instanceCount: 0,
      activeInstanceCount: 0,
    });

    // Record lifecycle event
    await this.versionRepository.createLifecycleEvent({
      versionId: version.id,
      event: "created",
      timestamp: new Date(),
      performedBy: createdBy,
      reason: changeDescription,
    });

    return version;
  }

  /**
   * Publish a draft version (make active)
   */
  async publishVersion(
    tenantId: string,
    versionId: string,
    publishedBy: string
  ): Promise<WorkflowVersion> {
    const version = await this.versionRepository.getVersion(tenantId, versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    if (version.status !== "draft") {
      throw new Error(`Cannot publish version in ${version.status} status`);
    }

    // Deprecate current active version
    const currentActive = await this.versionRepository.getActiveVersion(tenantId, version.templateId);
    if (currentActive) {
      await this.versionRepository.updateVersion(tenantId, currentActive.id, {
        status: "deprecated",
        deprecatedAt: new Date(),
        deprecatedBy: publishedBy,
      });

      await this.versionRepository.createLifecycleEvent({
        versionId: currentActive.id,
        event: "deprecated",
        timestamp: new Date(),
        performedBy: publishedBy,
        reason: `Replaced by version ${version.version}`,
      });
    }

    // Publish new version
    const now = new Date();
    const published = await this.versionRepository.updateVersion(tenantId, versionId, {
      status: "active",
      publishedAt: now,
      publishedBy,
    });

    await this.versionRepository.createLifecycleEvent({
      versionId,
      event: "published",
      timestamp: now,
      performedBy: publishedBy,
    });

    return published;
  }

  /**
   * Deprecate a version (soft retire)
   */
  async deprecateVersion(
    tenantId: string,
    versionId: string,
    deprecatedBy: string,
    reason: string
  ): Promise<WorkflowVersion> {
    const version = await this.versionRepository.getVersion(tenantId, versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    if (version.status !== "active") {
      throw new Error(`Cannot deprecate version in ${version.status} status`);
    }

    const now = new Date();
    const deprecated = await this.versionRepository.updateVersion(tenantId, versionId, {
      status: "deprecated",
      deprecatedAt: now,
      deprecatedBy,
    });

    await this.versionRepository.createLifecycleEvent({
      versionId,
      event: "deprecated",
      timestamp: now,
      performedBy: deprecatedBy,
      reason,
    });

    return deprecated;
  }

  /**
   * Retire a version (fully deactivate)
   */
  async retireVersion(
    tenantId: string,
    versionId: string,
    retiredBy: string,
    reason: string
  ): Promise<WorkflowVersion> {
    const version = await this.versionRepository.getVersion(tenantId, versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    if (version.status === "retired") {
      throw new Error("Version is already retired");
    }

    // Check for active instances
    if (version.activeInstanceCount && version.activeInstanceCount > 0) {
      throw new Error(`Cannot retire version with ${version.activeInstanceCount} active instances`);
    }

    const now = new Date();
    const retired = await this.versionRepository.updateVersion(tenantId, versionId, {
      status: "retired",
      retiredAt: now,
      retiredBy,
    });

    await this.versionRepository.createLifecycleEvent({
      versionId,
      event: "retired",
      timestamp: now,
      performedBy: retiredBy,
      reason,
    });

    return retired;
  }

  /**
   * Reactivate a deprecated/retired version
   */
  async reactivateVersion(
    tenantId: string,
    versionId: string,
    reactivatedBy: string,
    reason: string
  ): Promise<WorkflowVersion> {
    const version = await this.versionRepository.getVersion(tenantId, versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    if (version.status !== "deprecated" && version.status !== "retired") {
      throw new Error(`Cannot reactivate version in ${version.status} status`);
    }

    // Deprecate current active version if exists
    const currentActive = await this.versionRepository.getActiveVersion(tenantId, version.templateId);
    if (currentActive && currentActive.id !== versionId) {
      await this.versionRepository.updateVersion(tenantId, currentActive.id, {
        status: "deprecated",
        deprecatedAt: new Date(),
        deprecatedBy: reactivatedBy,
      });
    }

    const now = new Date();
    const reactivated = await this.versionRepository.updateVersion(tenantId, versionId, {
      status: "active",
      deprecatedAt: undefined,
      deprecatedBy: undefined,
      retiredAt: undefined,
      retiredBy: undefined,
    });

    await this.versionRepository.createLifecycleEvent({
      versionId,
      event: "reactivated",
      timestamp: now,
      performedBy: reactivatedBy,
      reason,
    });

    return reactivated;
  }

  /**
   * Get version history for a template
   */
  async getVersionHistory(tenantId: string, templateId: string): Promise<WorkflowVersion[]> {
    const versions = await this.versionRepository.getVersions(tenantId, templateId);
    return versions.sort((a, b) => b.version - a.version);
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    tenantId: string,
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionComparison> {
    const fromVersion = await this.versionRepository.getVersion(tenantId, fromVersionId);
    const toVersion = await this.versionRepository.getVersion(tenantId, toVersionId);

    if (!fromVersion || !toVersion) {
      throw new Error("One or both versions not found");
    }

    const changes = this.detectChanges(fromVersion.definition, toVersion.definition);
    const breakingChanges = changes.filter((c) => c.breaking);

    // Calculate summary
    const summary = {
      stepsAdded: changes.filter((c) => c.type === "step_added").length,
      stepsRemoved: changes.filter((c) => c.type === "step_removed").length,
      stepsModified: changes.filter((c) => c.type === "step_modified").length,
      conditionsChanged: changes.filter((c) =>
        ["condition_added", "condition_removed", "condition_modified"].includes(c.type)
      ).length,
      slaChanged: changes.some((c) => c.type === "sla_modified"),
      escalationsChanged: changes.some((c) => c.type === "escalation_modified"),
    };

    return {
      fromVersion: fromVersion.version,
      toVersion: toVersion.version,
      changes,
      breakingChanges,
      summary,
      compatible: breakingChanges.length === 0,
    };
  }

  /**
   * Analyze impact of activating a new version
   */
  async analyzeImpact(tenantId: string, versionId: string): Promise<ImpactAnalysis> {
    const version = await this.versionRepository.getVersion(tenantId, versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    // Get current active version
    const activeVersion = await this.versionRepository.getActiveVersion(tenantId, version.templateId);

    const issues: ImpactIssue[] = [];
    const recommendations: string[] = [];
    let migrationRequired = false;
    const migrationSteps: MigrationStep[] = [];

    // Analyze affected instances
    const affectedInstances = {
      total: activeVersion?.activeInstanceCount || 0,
      byStatus: {} as Record<string, number>,
      instanceIds: [] as string[],
    };

    if (activeVersion && activeVersion.id !== versionId) {
      // Compare versions
      const comparison = await this.compareVersions(tenantId, activeVersion.id, versionId);

      // Check for breaking changes
      if (comparison.breakingChanges.length > 0) {
        issues.push({
          severity: "error",
          type: "breaking_changes",
          description: `${comparison.breakingChanges.length} breaking changes detected`,
          affectedEntities: comparison.breakingChanges.map((c) => c.path),
          resolution: "Review breaking changes and create migration plan",
        });

        migrationRequired = true;
        recommendations.push("Create a migration plan for existing instances");
        recommendations.push("Consider running both versions in parallel during transition");
      }

      // Check for step removals
      if (comparison.summary.stepsRemoved > 0) {
        issues.push({
          severity: "warning",
          type: "steps_removed",
          description: `${comparison.summary.stepsRemoved} steps have been removed`,
          affectedEntities: comparison.changes
            .filter((c) => c.type === "step_removed")
            .map((c) => c.path),
          resolution: "Ensure removed steps are not critical to in-flight workflows",
        });

        migrationSteps.push({
          order: 1,
          action: "skip_removed_steps",
          description: "Mark removed steps as skipped in existing instances",
          automated: true,
        });
      }

      // Check for SLA changes
      if (comparison.summary.slaChanged) {
        issues.push({
          severity: "info",
          type: "sla_changed",
          description: "SLA configuration has changed",
          affectedEntities: ["sla"],
          resolution: "Review new SLA settings for existing instances",
        });
      }

      // Add instance count warning
      if (affectedInstances.total > 0) {
        issues.push({
          severity: "warning",
          type: "active_instances",
          description: `${affectedInstances.total} active instances will be affected`,
          affectedEntities: [],
          resolution: "Plan migration during low-activity period",
        });

        recommendations.push(`Schedule migration for ${affectedInstances.total} active instances`);
      }
    }

    // Validate new version
    const validation = await this.validateVersion(tenantId, version.definition);
    if (!validation.valid) {
      for (const error of validation.errors) {
        issues.push({
          severity: "error",
          type: "validation_error",
          description: error,
          affectedEntities: [],
        });
      }
    }

    for (const warning of validation.warnings) {
      issues.push({
        severity: "warning",
        type: "validation_warning",
        description: warning,
        affectedEntities: [],
      });
    }

    // Add general recommendations
    if (issues.length === 0) {
      recommendations.push("Version is ready for activation with no issues detected");
    } else {
      recommendations.push("Address all error-level issues before activation");
    }

    return {
      versionId,
      analyzedAt: new Date(),
      affectedInstances,
      issues,
      recommendations,
      migrationRequired,
      migrationSteps: migrationSteps.length > 0 ? migrationSteps : undefined,
    };
  }

  /**
   * Get active version for a template
   */
  async getActiveVersion(tenantId: string, templateId: string): Promise<WorkflowVersion | null> {
    return this.versionRepository.getActiveVersion(tenantId, templateId);
  }

  /**
   * Clone a version
   */
  async cloneVersion(
    tenantId: string,
    versionId: string,
    createdBy: string
  ): Promise<WorkflowVersion> {
    const source = await this.versionRepository.getVersion(tenantId, versionId);
    if (!source) {
      throw new Error("Source version not found");
    }

    return this.createVersion(
      tenantId,
      source.templateId,
      JSON.parse(JSON.stringify(source.definition)),
      { ...source.metadata, name: `${source.metadata.name} (Copy)` },
      createdBy,
      `Cloned from version ${source.version}`
    );
  }

  /**
   * Get version lifecycle events
   */
  async getLifecycleHistory(tenantId: string, versionId: string): Promise<VersionLifecycleEvent[]> {
    return this.versionRepository.getLifecycleEvents(tenantId, versionId);
  }

  /**
   * Validate a version definition
   */
  async validateVersion(
    tenantId: string,
    definition: ApprovalTemplate["definition"]
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for at least one step
    if (!definition.steps || definition.steps.length === 0) {
      errors.push("Workflow must have at least one step");
    }

    // Validate each step
    const stepIds = new Set<string>();
    for (const step of definition.steps || []) {
      // Check for duplicate IDs
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);

      // Check for approver rules
      if (!step.approvers || step.approvers.length === 0) {
        errors.push(`Step "${step.name}" has no approver rules`);
      }

      // Check dependency references
      for (const depId of step.dependsOn || []) {
        if (!stepIds.has(depId) && !definition.steps?.some((s: ApprovalStep) => s.id === depId)) {
          errors.push(`Step "${step.name}" depends on non-existent step: ${depId}`);
        }
      }

      // Warn about steps without SLA
      if (!step.sla && !definition.globalSla) {
        warnings.push(`Step "${step.name}" has no SLA configured`);
      }
    }

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(definition.steps || []);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies detected: ${circularDeps.join(", ")}`);
    }

    // Check global SLA
    if (definition.globalSla) {
      if (!definition.globalSla.warningThreshold && !definition.globalSla.completionTime) {
        warnings.push("Global SLA is defined but has no thresholds set");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Detect changes between two definitions
   */
  private detectChanges(
    oldDef: ApprovalTemplate["definition"],
    newDef: ApprovalTemplate["definition"]
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    const oldSteps = new Map<string, ApprovalStep>((oldDef.steps || []).map((s: ApprovalStep) => [s.id, s]));
    const newSteps = new Map<string, ApprovalStep>((newDef.steps || []).map((s: ApprovalStep) => [s.id, s]));

    // Detect added steps
    for (const [id, step] of newSteps) {
      if (!oldSteps.has(id)) {
        changes.push({
          type: "step_added",
          path: `steps.${id}`,
          description: `Step "${step.name}" added`,
          newValue: step,
          breaking: false,
        });
      }
    }

    // Detect removed steps
    for (const [id, step] of oldSteps) {
      if (!newSteps.has(id)) {
        changes.push({
          type: "step_removed",
          path: `steps.${id}`,
          description: `Step "${step.name}" removed`,
          previousValue: step,
          breaking: true,
        });
      }
    }

    // Detect modified steps
    for (const [id, newStep] of newSteps) {
      const oldStep = oldSteps.get(id);
      if (oldStep) {
        const stepChanges = this.compareSteps(id, oldStep, newStep);
        changes.push(...stepChanges);
      }
    }

    // Check global SLA changes
    if (JSON.stringify(oldDef.globalSla) !== JSON.stringify(newDef.globalSla)) {
      changes.push({
        type: "sla_modified",
        path: "globalSla",
        description: "Global SLA configuration changed",
        previousValue: oldDef.globalSla,
        newValue: newDef.globalSla,
        breaking: false,
      });
    }

    return changes;
  }

  /**
   * Compare two steps for changes
   */
  private compareSteps(
    stepId: string,
    oldStep: ApprovalStep,
    newStep: ApprovalStep
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    // Check name change
    if (oldStep.name !== newStep.name) {
      changes.push({
        type: "step_modified",
        path: `steps.${stepId}.name`,
        description: `Step name changed from "${oldStep.name}" to "${newStep.name}"`,
        previousValue: oldStep.name,
        newValue: newStep.name,
        breaking: false,
      });
    }

    // Check requirement change
    if (oldStep.requirement !== newStep.requirement) {
      changes.push({
        type: "step_modified",
        path: `steps.${stepId}.requirement`,
        description: `Approval requirement changed from "${oldStep.requirement}" to "${newStep.requirement}"`,
        previousValue: oldStep.requirement,
        newValue: newStep.requirement,
        breaking: true,
      });
    }

    // Check approver rules
    if (JSON.stringify(oldStep.approvers) !== JSON.stringify(newStep.approvers)) {
      changes.push({
        type: "approver_rule_modified",
        path: `steps.${stepId}.approvers`,
        description: "Approver rules modified",
        previousValue: oldStep.approvers,
        newValue: newStep.approvers,
        breaking: false,
      });
    }

    // Check conditions
    if (JSON.stringify(oldStep.conditions) !== JSON.stringify(newStep.conditions)) {
      changes.push({
        type: "condition_modified",
        path: `steps.${stepId}.conditions`,
        description: "Step conditions modified",
        previousValue: oldStep.conditions,
        newValue: newStep.conditions,
        breaking: true,
      });
    }

    // Check SLA
    if (JSON.stringify(oldStep.sla) !== JSON.stringify(newStep.sla)) {
      changes.push({
        type: "sla_modified",
        path: `steps.${stepId}.sla`,
        description: "Step SLA configuration modified",
        previousValue: oldStep.sla,
        newValue: newStep.sla,
        breaking: false,
      });
    }

    return changes;
  }

  /**
   * Detect circular dependencies in steps
   */
  private detectCircularDependencies(steps: ApprovalStep[]): string[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const inPath = new Set<string>();
    const cycles: string[] = [];

    const dfs = (stepId: string, path: string[]): void => {
      if (inPath.has(stepId)) {
        const cycleStart = path.indexOf(stepId);
        cycles.push(path.slice(cycleStart).join(" -> ") + " -> " + stepId);
        return;
      }

      if (visited.has(stepId)) return;

      visited.add(stepId);
      inPath.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const depId of step.dependsOn || []) {
          dfs(depId, [...path, stepId]);
        }
      }

      inPath.delete(stepId);
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id, []);
      }
    }

    return cycles;
  }
}

/**
 * Factory function to create version control service
 */
export function createVersionControlService(
  versionRepository: IVersionRepository,
  instanceRepository: IApprovalInstanceRepository,
  auditService?: IAuditTrailService
): IVersionControlService {
  return new VersionControlService(versionRepository, instanceRepository, auditService);
}
