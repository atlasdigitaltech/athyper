// framework/runtime/src/services/business/engines/report-pack-engine/services/pack-generation-service.ts
//
// Orchestrates pack generation: loads a pack definition, iterates its items,
// and delegates to the Statement Engine for STATEMENT items and the
// Comparison Service for COMPARISON items.

import { ok, fail, validateTransition } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  PackDefinition,
  PackItem,
  PackInstance,
  PackInstanceItem,
  PackInstanceStatus,
  GeneratePackInput,
  PeriodMode,
  VarianceSource,
  ResolvedPeriod,
} from "../domain/types.js";
import { PACK_INSTANCE_TRANSITIONS } from "../domain/types.js";
import type {
  PackDefinitionRepo,
  PackInstanceRepo,
} from "../persistence/pack-repo.js";
import type { StatementGenerationService } from "../../statement-engine/services/statement-generation-service.js";
import type { StatementComparisonService } from "../../statement-engine/services/statement-comparison-service.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PackGenerationService {
  /** Generate a new pack instance from a definition */
  generate(
    ctx: OperationContext,
    input: GeneratePackInput,
  ): Promise<ServiceResult<PackInstance>>;

  /** Get a pack instance with all its items */
  getInstance(
    tenantId: string,
    packInstanceId: string,
  ): Promise<ServiceResult<{
    instance: PackInstance;
    items: PackInstanceItem[];
  }>>;

  /** List pack definitions */
  listDefinitions(
    tenantId: string,
    entityCode: string,
    packType?: string,
  ): Promise<PackDefinition[]>;

  /** Transition pack instance status */
  updateStatus(
    ctx: OperationContext,
    packInstanceId: string,
    targetStatus: PackInstanceStatus,
  ): Promise<ServiceResult<PackInstance>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultPackGenerationService implements PackGenerationService {
  constructor(
    private readonly defRepo: PackDefinitionRepo,
    private readonly instanceRepo: PackInstanceRepo,
    private readonly stmtService: StatementGenerationService,
    private readonly comparisonService: StatementComparisonService,
  ) {}

  async generate(
    ctx: OperationContext,
    input: GeneratePackInput,
  ): Promise<ServiceResult<PackInstance>> {
    const startTime = Date.now();

    // ── 1. Load pack definition ──────────────────────────────────
    const definition = await this.defRepo.getById(
      input.tenantId,
      input.packDefinitionId,
    );
    if (!definition) {
      return fail("DEFINITION_NOT_FOUND", `Pack definition ${input.packDefinitionId} not found`);
    }
    if (!definition.isActive) {
      return fail("DEFINITION_INACTIVE", `Pack definition ${definition.packCode} is inactive`);
    }

    // ── 2. Load items ────────────────────────────────────────────
    const items = await this.defRepo.getItems(definition.id);
    const activeItems = items.filter((item) => item.isActive);
    if (activeItems.length === 0) {
      return fail("NO_ITEMS", "Pack definition has no active items");
    }

    // ── 3. Resolve defaults ──────────────────────────────────────
    const bookCode = input.bookCode ?? definition.defaultBookCode;
    const varianceSource = input.varianceSource ?? definition.defaultVarianceSource;
    const periodMode = input.periodMode ?? definition.defaultPeriodMode;

    // ── 4. Create pack instance (status: GENERATING) ─────────────
    const packInstance = await this.instanceRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      packDefinitionId: definition.id,
      packVersion: definition.version,
      fiscalYear: input.fiscalYear,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      bookCode,
      dimensionSetId: input.dimensionSetId ?? null,
      varianceSource: varianceSource ?? null,
      periodMode: periodMode ?? null,
      totalItems: activeItems.length,
      generatedBy: input.generatedBy ?? ctx.actorId,
    });

    // ── 5. Generate each item ────────────────────────────────────
    let itemsCompleted = 0;

    for (const item of activeItems) {
      const resolvedBook = item.bookCode ?? bookCode;
      const resolvedPeriodMode = item.periodMode ?? periodMode;
      const resolvedVariance = item.varianceSource ?? varianceSource;
      const resolvedPeriod = resolvePeriod(
        resolvedPeriodMode,
        input.fiscalYear,
        input.periodFrom,
        input.periodTo,
      );

      // Create a PENDING instance item
      const instanceItem = await this.instanceRepo.insertItem({
        packInstanceId: packInstance.id,
        packItemId: item.id,
        itemStatus: "PENDING",
        resolvedBookCode: resolvedBook,
        resolvedPeriodMode: resolvedPeriodMode ?? null,
        resolvedVarianceSource: resolvedVariance ?? null,
        resolvedPeriodFrom: resolvedPeriod.periodFrom,
        resolvedPeriodTo: resolvedPeriod.periodTo,
        resolvedFiscalYear: resolvedPeriod.fiscalYear,
        sortOrder: item.sortOrder,
      });

      // Process based on item type
      if (item.itemType === "STATEMENT" && item.statementDefinitionId) {
        await this.generateStatementItem(
          ctx,
          input,
          item,
          instanceItem,
          resolvedBook,
          resolvedPeriod,
          resolvedVariance,
        );
        itemsCompleted++;
      } else if (item.itemType === "COMPARISON") {
        await this.generateComparisonItem(
          ctx,
          input,
          item,
          instanceItem,
          resolvedPeriod,
        );
        itemsCompleted++;
      } else if (item.itemType === "NARRATIVE" || item.itemType === "SEPARATOR") {
        // Non-generative items are immediately completed
        await this.instanceRepo.updateItemStatus(
          instanceItem.id,
          "COMPLETED",
        );
        itemsCompleted++;
      } else {
        await this.instanceRepo.updateItemStatus(
          instanceItem.id,
          "SKIPPED",
          "Missing required configuration",
        );
      }

      // Update progress
      await this.instanceRepo.updateProgress(
        packInstance.id,
        itemsCompleted,
      );
    }

    // ── 6. Finalize: GENERATING → DRAFT ──────────────────────────
    const durationMs = Date.now() - startTime;
    await this.instanceRepo.updateProgress(
      packInstance.id,
      itemsCompleted,
      durationMs,
    );
    const finalInstance = await this.instanceRepo.updateStatus(
      input.tenantId,
      packInstance.id,
      "DRAFT",
    );

    return ok(finalInstance);
  }

  async getInstance(
    tenantId: string,
    packInstanceId: string,
  ): Promise<ServiceResult<{
    instance: PackInstance;
    items: PackInstanceItem[];
  }>> {
    const instance = await this.instanceRepo.getById(tenantId, packInstanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Pack instance ${packInstanceId} not found`);
    }

    const items = await this.instanceRepo.getItems(packInstanceId);
    return ok({ instance, items });
  }

  async listDefinitions(
    tenantId: string,
    entityCode: string,
    packType?: string,
  ): Promise<PackDefinition[]> {
    return this.defRepo.list(tenantId, entityCode, {
      packType,
      isActive: true,
    });
  }

  async updateStatus(
    ctx: OperationContext,
    packInstanceId: string,
    targetStatus: PackInstanceStatus,
  ): Promise<ServiceResult<PackInstance>> {
    const instance = await this.instanceRepo.getById(ctx.tenantId, packInstanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Pack instance ${packInstanceId} not found`);
    }

    if (!validateTransition(instance.status, targetStatus, PACK_INSTANCE_TRANSITIONS)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition from ${instance.status} to ${targetStatus}`,
      );
    }

    const updated = await this.instanceRepo.updateStatus(
      ctx.tenantId,
      packInstanceId,
      targetStatus,
      ctx.actorId,
    );
    return ok(updated);
  }

  // ─── Private: Generate a STATEMENT item ──────────────────────────

  private async generateStatementItem(
    ctx: OperationContext,
    input: GeneratePackInput,
    item: PackItem,
    instanceItem: PackInstanceItem,
    resolvedBook: string,
    resolvedPeriod: ResolvedPeriod,
    resolvedVariance: VarianceSource | null,
  ): Promise<void> {
    await this.instanceRepo.updateItemStatus(instanceItem.id, "GENERATING");

    const result = await this.stmtService.generate(ctx, {
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      definitionId: item.statementDefinitionId!,
      fiscalYear: resolvedPeriod.fiscalYear,
      periodFrom: resolvedPeriod.periodFrom,
      periodTo: resolvedPeriod.periodTo,
      bookCode: resolvedBook,
      dimensionSetId: input.dimensionSetId,
      dimensionFilter: item.dimensionTypeCode && item.dimensionValueCode
        ? { [item.dimensionTypeCode]: item.dimensionValueCode }
        : undefined,
      includePriorYear: resolvedVariance === "PRIOR_YEAR" || resolvedVariance === "PRIOR_PERIOD",
      generatedBy: input.generatedBy ?? ctx.actorId,
    });

    if (result.ok) {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "COMPLETED",
        null,
        result.value.id,
      );
    } else {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "FAILED",
        result.error.message,
      );
    }
  }

  // ─── Private: Generate a COMPARISON item ─────────────────────────

  private async generateComparisonItem(
    ctx: OperationContext,
    input: GeneratePackInput,
    item: PackItem,
    instanceItem: PackInstanceItem,
    resolvedPeriod: ResolvedPeriod,
  ): Promise<void> {
    if (!item.compareBaseBook || !item.compareTargetBook || !item.statementDefinitionId) {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "SKIPPED",
        "Missing comparison configuration (base book, target book, or definition)",
      );
      return;
    }

    await this.instanceRepo.updateItemStatus(instanceItem.id, "GENERATING");

    // Generate both book instances first
    const [baseResult, targetResult] = await Promise.all([
      this.stmtService.generate(ctx, {
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        definitionId: item.statementDefinitionId,
        fiscalYear: resolvedPeriod.fiscalYear,
        periodFrom: resolvedPeriod.periodFrom,
        periodTo: resolvedPeriod.periodTo,
        bookCode: item.compareBaseBook,
        generatedBy: input.generatedBy ?? ctx.actorId,
      }),
      this.stmtService.generate(ctx, {
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        definitionId: item.statementDefinitionId,
        fiscalYear: resolvedPeriod.fiscalYear,
        periodFrom: resolvedPeriod.periodFrom,
        periodTo: resolvedPeriod.periodTo,
        bookCode: item.compareTargetBook,
        generatedBy: input.generatedBy ?? ctx.actorId,
      }),
    ]);

    if (!baseResult.ok) {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "FAILED",
        `Base book generation failed: ${baseResult.error.message}`,
      );
      return;
    }
    if (!targetResult.ok) {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "FAILED",
        `Target book generation failed: ${targetResult.error.message}`,
      );
      return;
    }

    // Now compare
    const compareResult = await this.comparisonService.compare(ctx, {
      tenantId: input.tenantId,
      baseInstanceId: baseResult.value.id,
      compareInstanceId: targetResult.value.id,
    });

    if (compareResult.ok) {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "COMPLETED",
        null,
        null,
        // comparison ID would come from persisted comparison
        // For now, link via the base statement instance
        baseResult.value.id,
      );
    } else {
      await this.instanceRepo.updateItemStatus(
        instanceItem.id,
        "FAILED",
        `Comparison failed: ${compareResult.error.message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Period resolution
// ---------------------------------------------------------------------------

function resolvePeriod(
  mode: PeriodMode,
  fiscalYear: number,
  periodFrom: number,
  periodTo: number,
): ResolvedPeriod {
  switch (mode) {
    case "PTD":
      return { fiscalYear, periodFrom, periodTo };

    case "QTD": {
      // Quarter start: period 1-3 → 1, 4-6 → 4, 7-9 → 7, 10-12 → 10
      const qStart = Math.floor((periodTo - 1) / 3) * 3 + 1;
      return { fiscalYear, periodFrom: qStart, periodTo };
    }

    case "YTD":
      return { fiscalYear, periodFrom: 1, periodTo };

    case "PRIOR_PERIOD":
      if (periodFrom <= 1) {
        return { fiscalYear: fiscalYear - 1, periodFrom: 12, periodTo: 12 };
      }
      return { fiscalYear, periodFrom: periodFrom - 1, periodTo: periodFrom - 1 };

    case "PRIOR_YEAR":
      return { fiscalYear: fiscalYear - 1, periodFrom, periodTo };

    case "ROLLING_12M": {
      // 12 months ending at periodTo of fiscalYear
      if (periodTo >= 12) {
        return { fiscalYear, periodFrom: 1, periodTo: 12 };
      }
      // Cross-year: simplified to current FY for now
      return { fiscalYear, periodFrom: 1, periodTo };
    }

    default:
      return { fiscalYear, periodFrom, periodTo };
  }
}
