/**
 * Approval Template Service Implementation
 *
 * Manages approval workflow template authoring, validation, compilation, and versioning.
 * Implements full lifecycle for approval template definitions.
 */

import { createHash } from "node:crypto";

import { uuid } from "../data/db-helpers.js";

import type { ApproverResolverService } from "./approver-resolver.service.js";
import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  ApprovalTemplate,
  ApprovalTemplateCreateInput,
  ApprovalTemplateRule,
  ApprovalTemplateService,
  ApprovalTemplateStage,
  ApprovalTemplateUpdateInput,
  CompiledApprovalTemplate,
  ListOptions,
  PaginatedResponse,
  TemplateValidationResult,
} from "@athyper/core/meta";
import type { Redis } from "ioredis";

/**
 * Approval Template Service Implementation
 */
export class ApprovalTemplateServiceImpl implements ApprovalTemplateService {
  constructor(
    private db: LifecycleDB_Type,
    private cache: Redis,
    private approverResolver?: ApproverResolverService,
  ) {}

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async create(
    input: ApprovalTemplateCreateInput,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate> {
    return await this.db.transaction().execute(async (trx) => {
      // Insert template
      const templateRow = await trx
        .insertInto("meta.approval_template")
        .values({
          id: uuid(),
          tenant_id: tenantId,
          code: input.code,
          name: input.name,
          behaviors: input.behaviors
            ? (JSON.stringify(input.behaviors) as any)
            : null,
          escalation_style: input.escalationStyle ?? null,
          version_no: 1,
          is_active: true,
          created_at: new Date(),
          created_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Insert stages
      for (const stage of input.stages) {
        await trx
          .insertInto("meta.approval_template_stage")
          .values({
            id: uuid(),
            tenant_id: tenantId,
            approval_template_id: templateRow.id,
            stage_no: stage.stageNo,
            name: stage.name ?? null,
            mode: stage.mode,
            quorum: stage.quorum ? (JSON.stringify(stage.quorum) as any) : null,
            created_at: new Date(),
            created_by: userId,
          })
          .execute();
      }

      // Insert rules
      for (const rule of input.rules) {
        await trx
          .insertInto("meta.approval_template_rule")
          .values({
            id: uuid(),
            tenant_id: tenantId,
            approval_template_id: templateRow.id,
            priority: rule.priority,
            conditions: JSON.stringify(rule.conditions) as any,
            assign_to: JSON.stringify(rule.assignTo) as any,
            created_at: new Date(),
            created_by: userId,
          })
          .execute();
      }

      return this.mapTemplateRow(templateRow);
    });
  }

  async get(
    idOrCode: string,
    tenantId: string,
  ): Promise<ApprovalTemplate | undefined> {
    // Try by ID first
    let row = await this.db
      .selectFrom("meta.approval_template")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", idOrCode)
      .executeTakeFirst();

    // If not found, try by code (active version)
    if (!row) {
      row = await this.db
        .selectFrom("meta.approval_template")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("code", "=", idOrCode)
        .where("is_active", "=", true)
        .executeTakeFirst();
    }

    return row ? this.mapTemplateRow(row) : undefined;
  }

  async list(
    tenantId: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<ApprovalTemplate>> {
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const offset = (page - 1) * pageSize;

    // Get total count (only active versions)
    const countResult = await this.db
      .selectFrom("meta.approval_template")
      .select(({ fn }) => [fn.countAll<number>().as("count")])
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow();

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / pageSize);

    // Get templates
    const rows = await this.db
      .selectFrom("meta.approval_template")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .orderBy(
        (options?.orderBy ?? "created_at") as any,
        options?.orderDir ?? "desc",
      )
      .limit(pageSize)
      .offset(offset)
      .execute();

    const data = rows.map((r) => this.mapTemplateRow(r));

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async update(
    idOrCode: string,
    input: ApprovalTemplateUpdateInput,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate> {
    return await this.db.transaction().execute(async (trx) => {
      // Get current active version
      const current = await this.get(idOrCode, tenantId);
      if (!current) {
        throw new Error(`Template not found: ${idOrCode}`);
      }

      // Deactivate current version
      await trx
        .updateTable("meta.approval_template")
        .set({ is_active: false })
        .where("id", "=", current.id)
        .execute();

      // Get max version number for this code
      const maxVersionResult = await trx
        .selectFrom("meta.approval_template")
        .select(({ fn }) => [fn.max<number>("version_no").as("max_version")])
        .where("tenant_id", "=", tenantId)
        .where("code", "=", current.code)
        .executeTakeFirstOrThrow();

      const newVersionNo = (maxVersionResult.max_version ?? 0) + 1;

      // Insert new version
      const newTemplate = await trx
        .insertInto("meta.approval_template")
        .values({
          id: uuid(),
          tenant_id: tenantId,
          code: current.code, // code stays the same
          name: input.name ?? current.name,
          behaviors: input.behaviors
            ? (JSON.stringify(input.behaviors) as any)
            : current.behaviors
              ? (JSON.stringify(current.behaviors) as any)
              : null,
          escalation_style:
            input.escalationStyle ?? current.escalationStyle ?? null,
          version_no: newVersionNo,
          is_active: true,
          created_at: new Date(),
          created_by: userId,
          updated_at: new Date(),
          updated_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Copy or update stages
      if (input.stages) {
        // Use new stages from input
        for (const stage of input.stages) {
          await trx
            .insertInto("meta.approval_template_stage")
            .values({
              id: uuid(),
              tenant_id: tenantId,
              approval_template_id: newTemplate.id,
              stage_no: stage.stageNo,
              name: stage.name ?? null,
              mode: stage.mode,
              quorum: stage.quorum
                ? (JSON.stringify(stage.quorum) as any)
                : null,
              created_at: new Date(),
              created_by: userId,
            })
            .execute();
        }
      } else {
        // Copy stages from current version
        const existingStages = await trx
          .selectFrom("meta.approval_template_stage")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .where("approval_template_id", "=", current.id)
          .execute();

        for (const stage of existingStages) {
          await trx
            .insertInto("meta.approval_template_stage")
            .values({
              id: uuid(),
              tenant_id: tenantId,
              approval_template_id: newTemplate.id,
              stage_no: stage.stage_no,
              name: stage.name,
              mode: stage.mode,
              quorum: stage.quorum,
              created_at: new Date(),
              created_by: userId,
            })
            .execute();
        }
      }

      // Copy or update rules
      if (input.rules) {
        // Use new rules from input
        for (const rule of input.rules) {
          await trx
            .insertInto("meta.approval_template_rule")
            .values({
              id: uuid(),
              tenant_id: tenantId,
              approval_template_id: newTemplate.id,
              priority: rule.priority,
              conditions: JSON.stringify(rule.conditions) as any,
              assign_to: JSON.stringify(rule.assignTo) as any,
              created_at: new Date(),
              created_by: userId,
            })
            .execute();
        }
      } else {
        // Copy rules from current version
        const existingRules = await trx
          .selectFrom("meta.approval_template_rule")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .where("approval_template_id", "=", current.id)
          .execute();

        for (const rule of existingRules) {
          await trx
            .insertInto("meta.approval_template_rule")
            .values({
              id: uuid(),
              tenant_id: tenantId,
              approval_template_id: newTemplate.id,
              priority: rule.priority,
              conditions: rule.conditions,
              assign_to: rule.assign_to,
              created_at: new Date(),
              created_by: userId,
            })
            .execute();
        }
      }

      return this.mapTemplateRow(newTemplate);
    });
  }

  async delete(idOrCode: string, tenantId: string): Promise<void> {
    const template = await this.get(idOrCode, tenantId);
    if (!template) {
      throw new Error(`Template not found: ${idOrCode}`);
    }

    // Delete all versions with this code (cascade will delete stages and rules)
    await this.db
      .deleteFrom("meta.approval_template")
      .where("tenant_id", "=", tenantId)
      .where("code", "=", template.code)
      .execute();
  }

  // ============================================================================
  // Nested Resources
  // ============================================================================

  async getStages(
    templateId: string,
    tenantId: string,
  ): Promise<ApprovalTemplateStage[]> {
    const rows = await this.db
      .selectFrom("meta.approval_template_stage")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("approval_template_id", "=", templateId)
      .orderBy("stage_no", "asc")
      .execute();

    return rows.map((r) => this.mapStageRow(r));
  }

  async getRules(
    templateId: string,
    tenantId: string,
  ): Promise<ApprovalTemplateRule[]> {
    const rows = await this.db
      .selectFrom("meta.approval_template_rule")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("approval_template_id", "=", templateId)
      .orderBy("priority", "asc")
      .execute();

    return rows.map((r) => this.mapRuleRow(r));
  }

  // ============================================================================
  // Validation & Compilation
  // ============================================================================

  async validate(
    idOrCode: string,
    tenantId: string,
  ): Promise<TemplateValidationResult> {
    const errors: Array<{ path: string; message: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];

    const template = await this.get(idOrCode, tenantId);
    if (!template) {
      return {
        valid: false,
        errors: [{ path: "template", message: "Template not found" }],
        warnings: [],
      };
    }

    const stages = await this.getStages(template.id, tenantId);
    const rules = await this.getRules(template.id, tenantId);

    // Validation 1: Must have at least one stage
    if (stages.length === 0) {
      errors.push({
        path: "stages",
        message: "Template must have at least one stage",
      });
    }

    // Validation 2: Stage numbers must be sequential starting from 1
    const stageNos = stages.map((s) => s.stageNo).sort((a, b) => a - b);
    for (let i = 0; i < stageNos.length; i++) {
      if (stageNos[i] !== i + 1) {
        errors.push({
          path: "stages",
          message: `Stage numbers must be sequential starting from 1 (found gap at ${i + 1})`,
        });
        break;
      }
    }

    // Validation 3: Each stage mode must be valid
    for (const stage of stages) {
      if (stage.mode !== "serial" && stage.mode !== "parallel") {
        errors.push({
          path: `stages[${stage.stageNo}].mode`,
          message: `Invalid stage mode: ${stage.mode} (must be "serial" or "parallel")`,
        });
      }
    }

    // Validation 4: Must have at least one rule
    if (rules.length === 0) {
      errors.push({
        path: "rules",
        message: "Template must have at least one routing rule",
      });
    }

    // Validation 5: Rule assignTo must have valid strategy
    const validStrategies = [
      "direct",
      "role",
      "group",
      "hierarchy",
      "department",
      "custom_field",
    ];
    for (let i = 0; i < rules.length; i++) {
      const assignTo = rules[i].assignTo as Record<string, unknown>;
      if (!assignTo.strategy || typeof assignTo.strategy !== "string") {
        errors.push({
          path: `rules[${i}].assignTo.strategy`,
          message: "Rule assignTo must have a strategy field",
        });
      } else if (!validStrategies.includes(assignTo.strategy)) {
        errors.push({
          path: `rules[${i}].assignTo.strategy`,
          message: `Invalid strategy: ${assignTo.strategy} (must be one of: ${validStrategies.join(", ")})`,
        });
      }
    }

    // Validation 6: Rule conditions should be valid structure
    for (let i = 0; i < rules.length; i++) {
      const conditions = rules[i].conditions as Record<string, unknown>;
      if (!conditions || typeof conditions !== "object") {
        errors.push({
          path: `rules[${i}].conditions`,
          message: "Rule conditions must be an object",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async compile(
    idOrCode: string,
    tenantId: string,
  ): Promise<CompiledApprovalTemplate> {
    const template = await this.get(idOrCode, tenantId);
    if (!template) {
      throw new Error(`Template not found: ${idOrCode}`);
    }

    const stages = await this.getStages(template.id, tenantId);
    const rules = await this.getRules(template.id, tenantId);

    // Build compiled artifact
    const compiled: CompiledApprovalTemplate = {
      templateId: template.id,
      code: template.code,
      version: template.versionNo ?? 1,
      stages,
      rules,
      compiledHash: "", // computed below
      compiledAt: new Date(),
    };

    // Compute hash
    const hashContent = JSON.stringify({
      code: template.code,
      version: template.versionNo,
      stages: stages.map((s) => ({
        stageNo: s.stageNo,
        mode: s.mode,
        quorum: s.quorum,
      })),
      rules: rules.map((r) => ({
        priority: r.priority,
        conditions: r.conditions,
        assignTo: r.assignTo,
      })),
    });
    compiled.compiledHash = createHash("sha256")
      .update(hashContent)
      .digest("hex");

    // Store compiled artifact
    await this.db
      .updateTable("meta.approval_template")
      .set({
        compiled_json: JSON.stringify(compiled) as any,
        compiled_hash: compiled.compiledHash,
      })
      .where("id", "=", template.id)
      .execute();

    return compiled;
  }

  // ============================================================================
  // Version Management
  // ============================================================================

  async listVersions(
    code: string,
    tenantId: string,
  ): Promise<ApprovalTemplate[]> {
    const rows = await this.db
      .selectFrom("meta.approval_template")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .orderBy("version_no", "desc")
      .execute();

    return rows.map((r) => this.mapTemplateRow(r));
  }

  async rollback(
    code: string,
    targetVersion: number,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalTemplate> {
    return await this.db.transaction().execute(async (trx) => {
      // Get target version
      const targetRow = await trx
        .selectFrom("meta.approval_template")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("code", "=", code)
        .where("version_no", "=", targetVersion)
        .executeTakeFirst();

      if (!targetRow) {
        throw new Error(
          `Version ${targetVersion} not found for template ${code}`,
        );
      }

      // Deactivate current active version
      await trx
        .updateTable("meta.approval_template")
        .set({ is_active: false })
        .where("tenant_id", "=", tenantId)
        .where("code", "=", code)
        .where("is_active", "=", true)
        .execute();

      // Get max version number
      const maxVersionResult = await trx
        .selectFrom("meta.approval_template")
        .select(({ fn }) => [fn.max<number>("version_no").as("max_version")])
        .where("tenant_id", "=", tenantId)
        .where("code", "=", code)
        .executeTakeFirstOrThrow();

      const newVersionNo = (maxVersionResult.max_version ?? 0) + 1;

      // Create new version as copy of target
      const newTemplate = await trx
        .insertInto("meta.approval_template")
        .values({
          id: uuid(),
          tenant_id: tenantId,
          code: targetRow.code,
          name: targetRow.name,
          behaviors: targetRow.behaviors,
          escalation_style: targetRow.escalation_style,
          version_no: newVersionNo,
          is_active: true,
          created_at: new Date(),
          created_by: userId,
          updated_at: new Date(),
          updated_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Copy stages from target version
      const targetStages = await trx
        .selectFrom("meta.approval_template_stage")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("approval_template_id", "=", targetRow.id)
        .execute();

      for (const stage of targetStages) {
        await trx
          .insertInto("meta.approval_template_stage")
          .values({
            id: uuid(),
            tenant_id: tenantId,
            approval_template_id: newTemplate.id,
            stage_no: stage.stage_no,
            name: stage.name,
            mode: stage.mode,
            quorum: stage.quorum,
            created_at: new Date(),
            created_by: userId,
          })
          .execute();
      }

      // Copy rules from target version
      const targetRules = await trx
        .selectFrom("meta.approval_template_rule")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("approval_template_id", "=", targetRow.id)
        .execute();

      for (const rule of targetRules) {
        await trx
          .insertInto("meta.approval_template_rule")
          .values({
            id: uuid(),
            tenant_id: tenantId,
            approval_template_id: newTemplate.id,
            priority: rule.priority,
            conditions: rule.conditions,
            assign_to: rule.assign_to,
            created_at: new Date(),
            created_by: userId,
          })
          .execute();
      }

      return this.mapTemplateRow(newTemplate);
    });
  }

  async diff(
    code: string,
    v1: number,
    v2: number,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const version1 = await this.db
      .selectFrom("meta.approval_template")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .where("version_no", "=", v1)
      .executeTakeFirst();

    const version2 = await this.db
      .selectFrom("meta.approval_template")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .where("version_no", "=", v2)
      .executeTakeFirst();

    if (!version1 || !version2) {
      throw new Error(`One or both versions not found: v${v1}, v${v2}`);
    }

    const stages1 = await this.getStages(version1.id, tenantId);
    const stages2 = await this.getStages(version2.id, tenantId);
    const rules1 = await this.getRules(version1.id, tenantId);
    const rules2 = await this.getRules(version2.id, tenantId);

    // Simple diff (could be enhanced with proper diff algorithm)
    return {
      name: {
        v1: version1.name,
        v2: version2.name,
        changed: version1.name !== version2.name,
      },
      stageCount: {
        v1: stages1.length,
        v2: stages2.length,
        changed: stages1.length !== stages2.length,
      },
      ruleCount: {
        v1: rules1.length,
        v2: rules2.length,
        changed: rules1.length !== rules2.length,
      },
      escalationStyle: {
        v1: version1.escalation_style,
        v2: version2.escalation_style,
        changed: version1.escalation_style !== version2.escalation_style,
      },
    };
  }

  async impactAnalysis(
    idOrCode: string,
    tenantId: string,
  ): Promise<{
    affectedTransitions: Array<{
      transitionId: string;
      entityName: string;
      operationCode: string;
    }>;
  }> {
    const template = await this.get(idOrCode, tenantId);
    if (!template) {
      throw new Error(`Template not found: ${idOrCode}`);
    }

    const rows = await (
      this.db
        .selectFrom("meta.lifecycle_transition_gate as g")
        .innerJoin(
          "meta.lifecycle_transition as t",
          "g.transition_id",
          "t.id",
        ) as any
    )
      .innerJoin(
        "meta.entity_lifecycle as el",
        "el.lifecycle_id",
        "t.lifecycle_id",
      )
      .select(["t.id as transition_id", "el.entity_name", "t.operation_code"])
      .where("g.tenant_id", "=", tenantId)
      .where("g.approval_template_id", "=", template.id)
      .execute();

    return {
      affectedTransitions: rows.map((r: any) => ({
        transitionId: r.transition_id,
        entityName: r.entity_name,
        operationCode: r.operation_code,
      })),
    };
  }

  // ============================================================================
  // Resolution Test
  // ============================================================================

  async testResolution(
    idOrCode: string,
    context: Record<string, unknown>,
    tenantId: string,
  ): Promise<{
    resolvedAssignees: Array<{
      principalId?: string;
      groupId?: string;
      strategy: string;
    }>;
  }> {
    if (!this.approverResolver) {
      throw new Error("ApproverResolver not available");
    }

    const template = await this.get(idOrCode, tenantId);
    if (!template) {
      throw new Error(`Template not found: ${idOrCode}`);
    }

    const rules = await this.getRules(template.id, tenantId);

    // Use the approver resolver to resolve assignees
    const result = await this.approverResolver.resolveAssignees(
      rules.map((r) => ({
        id: r.id,
        conditions: r.conditions,
        assign_to: r.assignTo,
        priority: r.priority,
      })),
      context,
      tenantId,
    );

    return {
      resolvedAssignees: result.map((r) => ({
        principalId: r.principalId,
        groupId: r.groupId,
        strategy: "resolved", // Placeholder since ResolvedAssignee doesn't include strategy
      })),
    };
  }

  // ============================================================================
  // Row Mappers
  // ============================================================================

  private mapTemplateRow(row: {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    behaviors: unknown | null;
    escalation_style: string | null;
    version_no: number;
    is_active: boolean;
    compiled_json?: unknown | null;
    compiled_hash?: string | null;
    created_at: Date;
    created_by: string;
    updated_at?: Date | null;
    updated_by?: string | null;
  }): ApprovalTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      behaviors: row.behaviors as Record<string, unknown> | undefined,
      escalationStyle: row.escalation_style ?? undefined,
      versionNo: row.version_no,
      isActive: row.is_active,
      compiledJson: row.compiled_json as Record<string, unknown> | undefined,
      compiledHash: row.compiled_hash ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at ?? undefined,
      updatedBy: row.updated_by ?? undefined,
    };
  }

  private mapStageRow(row: {
    id: string;
    tenant_id: string;
    approval_template_id: string;
    stage_no: number;
    name: string | null;
    mode: string;
    quorum: unknown | null;
    created_at: Date;
    created_by: string;
  }): ApprovalTemplateStage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      approvalTemplateId: row.approval_template_id,
      stageNo: row.stage_no,
      name: row.name ?? undefined,
      mode: row.mode as "serial" | "parallel",
      quorum: row.quorum as Record<string, unknown> | undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapRuleRow(row: {
    id: string;
    tenant_id: string;
    approval_template_id: string;
    priority: number;
    conditions: unknown;
    assign_to: unknown;
    created_at: Date;
    created_by: string;
  }): ApprovalTemplateRule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      approvalTemplateId: row.approval_template_id,
      priority: row.priority,
      conditions: row.conditions as Record<string, unknown>,
      assignTo: row.assign_to as Record<string, unknown>,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
