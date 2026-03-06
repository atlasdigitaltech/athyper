/**
 * Overlay REST API Handlers
 *
 * EPIC I - Overlay REST API
 *
 * Provides HTTP handlers for overlay CRUD, composition preview,
 * validation, and change management operations.
 */

import { META_TOKENS, FIELD_OVERLAY_SAFETY } from "@athyper/core/meta";
import type { OverlaySafetyLevel } from "@athyper/core/meta";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../foundation/http/types.js";
import type {
  IOverlayRepository,
  SchemaComposerService,
} from "../../foundation/overlay-system/index.js";
import type {
  CreateOverlayInput,
  UpdateOverlayInput,
  CreateOverlayChangeInput,
} from "../../foundation/overlay-system/types.js";
import type { AuditLogger, MetaRegistry } from "@athyper/core/meta";
import type { Request, Response } from "express";

// ============================================================================
// Overlay Safety Validation
// ============================================================================

/**
 * Validate overlay change against FIELD_OVERLAY_SAFETY policy.
 *
 * Returns an array of violation messages. Empty = valid.
 *
 * Rules:
 *   - immutable properties cannot be changed by overlays
 *   - narrowable properties can only be made MORE restrictive
 *   - replaceable properties can be changed freely
 */
function validateOverlaySafety(
  kind: string,
  value: unknown,
): string[] {
  // Only validate field modifications — addField/removeField are structural
  if (kind !== "modifyField" || !value || typeof value !== "object") return [];

  const violations: string[] = [];
  const props = value as Record<string, unknown>;

  for (const [prop, newValue] of Object.entries(props)) {
    const safety = FIELD_OVERLAY_SAFETY[prop] as OverlaySafetyLevel | undefined;
    if (!safety) continue; // Unknown properties pass through (no policy defined)

    if (safety === "immutable") {
      violations.push(
        `Property '${prop}' is immutable and cannot be modified by overlays`,
      );
    }

    // Narrowable enforcement: overlays can restrict but never relax.
    // For boolean flags (isSortable, isFilterable, etc.): only false overrides are allowed.
    // For visibility/editability: handled by resolution functions, but block obvious violations.
    if (safety === "narrowable") {
      if (newValue === true && isBooleanCapabilityFlag(prop)) {
        violations.push(
          `Property '${prop}' is narrowable — overlays can disable (false) but not enable (true)`,
        );
      }
    }
  }

  return violations;
}

/** Boolean capability flags that overlays can only set to false (narrow) */
function isBooleanCapabilityFlag(prop: string): boolean {
  return [
    "isFilterable", "isSearchable", "isSortable", "isGroupable", "isAggregatable",
  ].includes(prop);
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/**
 * List Overlays Handler
 *
 * GET /api/meta/entities/:entity/overlays
 *
 * Query params: page, pageSize, isActive
 */
export class ListOverlaysHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { entity } = req.params as { entity: string };
      const { page, pageSize, isActive } = req.query as {
        page?: string;
        pageSize?: string;
        isActive?: string;
      };

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );
      const registry = await ctx.container.resolve<MetaRegistry>(
        META_TOKENS.registry,
      );

      // Get base entity ID from entity name
      const entityRecord = await registry.getEntity(entity);
      if (!entityRecord) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity not found: ${entity}`,
          },
        });
        return;
      }

      // List overlays for this entity
      const overlays = await overlayRepository.findByBaseEntity(
        entityRecord.id,
        tenantId,
      );

      // Apply filters
      let filtered = overlays;
      if (isActive !== undefined) {
        const activeFilter = isActive === "true";
        filtered = overlays.filter((o) => o.isActive === activeFilter);
      }

      // Apply pagination
      const pageNum = page ? parseInt(page, 10) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
      const start = (pageNum - 1) * pageSizeNum;
      const end = start + pageSizeNum;
      const paginated = filtered.slice(start, end);

      res.status(200).json({
        success: true,
        data: paginated,
        meta: {
          total: filtered.length,
          page: pageNum,
          pageSize: pageSizeNum,
          totalPages: Math.ceil(filtered.length / pageSizeNum),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

/**
 * Create Overlay Handler
 *
 * POST /api/meta/entities/:entity/overlays
 */
export class CreateOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { entity } = req.params as { entity: string };
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );
      const registry = await ctx.container.resolve<MetaRegistry>(
        META_TOKENS.registry,
      );

      // Get base entity ID
      const entityRecord = await registry.getEntity(entity);
      if (!entityRecord) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity not found: ${entity}`,
          },
        });
        return;
      }

      // Parse input
      const input = req.body as CreateOverlayInput;
      input.baseEntityId = entityRecord.id;

      // Create overlay
      const overlay = await overlayRepository.create(input, tenantId, userId);

      // Audit log
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.create",
        userId,
        tenantId,
        realmId: ctx.auth.realmKey ?? "default",
        action: "create",
        resource: `overlay:${overlay.overlayKey}`,
        details: {
          overlayId: overlay.id,
          overlayKey: overlay.overlayKey,
          entityName: entity,
        },
        result: "success",
      });

      res.status(201).json({
        success: true,
        data: overlay,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "CREATION_FAILED", message: String(error) },
      });
    }
  }
}

/**
 * Get Overlay Handler
 *
 * GET /api/meta/entities/:entity/overlays/:id
 */
export class GetOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Get overlay with changes
      const overlay = await overlayRepository.findByIdWithChanges(id);

      if (!overlay) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Overlay not found: ${id}` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: overlay,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

/**
 * Update Overlay Handler
 *
 * PATCH /api/meta/entities/:entity/overlays/:id
 */
export class UpdateOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Parse input
      const input = req.body as UpdateOverlayInput;

      // Update overlay
      const overlay = await overlayRepository.update(id, input, userId);

      // Audit log
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.update",
        userId,
        tenantId,
        realmId: ctx.auth.realmKey ?? "default",
        action: "update",
        resource: `overlay:${overlay.overlayKey}`,
        details: { overlayId: id, changes: input },
        result: "success",
      });

      res.status(200).json({
        success: true,
        data: overlay,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "UPDATE_FAILED", message: String(error) },
      });
    }
  }
}

/**
 * Delete Overlay Handler
 *
 * DELETE /api/meta/entities/:entity/overlays/:id
 */
export class DeleteOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Delete overlay (cascades to changes)
      await overlayRepository.delete(id);

      // Audit log
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.delete",
        userId,
        tenantId,
        realmId: ctx.auth.realmKey ?? "default",
        action: "delete",
        resource: `overlay:${id}`,
        details: { overlayId: id },
        result: "success",
      });

      res.status(200).json({
        success: true,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "DELETE_FAILED", message: String(error) },
      });
    }
  }
}

// ============================================================================
// Composition Handlers
// ============================================================================

/**
 * Preview Overlay Handler
 *
 * POST /api/meta/entities/:entity/overlays/preview
 *
 * Previews the composition of an overlay without saving it.
 * Includes conflict reporting (I4).
 */
export class PreviewOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { entity } = req.params as { entity: string };
      const tenantId = ctx.tenant.tenantKey ?? "default";

      const schemaComposer = await ctx.container.resolve<SchemaComposerService>(
        META_TOKENS.schemaComposer,
      );
      const registry = await ctx.container.resolve<MetaRegistry>(
        META_TOKENS.registry,
      );

      // Get base entity
      const entityRecord = await registry.getEntity(entity);
      if (!entityRecord) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity not found: ${entity}`,
          },
        });
        return;
      }

      // Get base schema from latest active version
      const latestVersion = await registry.getActiveVersion(entityRecord.id);
      if (!latestVersion) {
        res.status(404).json({
          success: false,
          error: {
            code: "NO_ACTIVE_VERSION",
            message: `No active version for entity: ${entity}`,
          },
        });
        return;
      }

      const baseSchema = latestVersion.schema as Record<string, unknown>;

      // Parse overlay from request body
      const { overlay } = req.body as { overlay?: any };

      // Preview composition
      const previewResult = await schemaComposer.previewComposition(
        entityRecord.id,
        tenantId,
        baseSchema,
        overlay,
      );

      res.status(200).json({
        success: previewResult.conflicts.length === 0,
        data: {
          schema: previewResult.schema,
          appliedOverlays: previewResult.appliedOverlays,
          conflicts: previewResult.conflicts, // Conflict reporting (I4)
          addedFields: previewResult.addedFields,
          modifiedFields: previewResult.modifiedFields,
          removedFields: previewResult.removedFields,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "PREVIEW_FAILED", message: String(error) },
      });
    }
  }
}

/**
 * Validate Overlay Handler
 *
 * POST /api/meta/entities/:entity/overlays/:id/validate
 */
export class ValidateOverlayHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { entity, id } = req.params as { entity: string; id: string };
      const tenantId = ctx.tenant.tenantKey ?? "default";

      const schemaComposer = await ctx.container.resolve<SchemaComposerService>(
        META_TOKENS.schemaComposer,
      );
      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );
      const registry = await ctx.container.resolve<MetaRegistry>(
        META_TOKENS.registry,
      );

      // Get overlay with changes
      const overlay = await overlayRepository.findByIdWithChanges(id);
      if (!overlay) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Overlay not found: ${id}` },
        });
        return;
      }

      // Get base entity
      const entityRecord = await registry.getEntity(entity);
      if (!entityRecord) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity not found: ${entity}`,
          },
        });
        return;
      }

      // Get base schema
      const latestVersion = await registry.getActiveVersion(entityRecord.id);
      if (!latestVersion) {
        res.status(404).json({
          success: false,
          error: {
            code: "NO_ACTIVE_VERSION",
            message: `No active version for entity: ${entity}`,
          },
        });
        return;
      }

      const baseSchema = latestVersion.schema as Record<string, unknown>;

      // Validate overlay
      const validationResult = await schemaComposer.validateOverlay(
        baseSchema,
        overlay,
      );

      res.status(200).json({
        success: true,
        data: validationResult,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: String(error) },
      });
    }
  }
}

// ============================================================================
// Change Management Handlers
// ============================================================================

/**
 * Get Changes Handler
 *
 * GET /api/meta/entities/:entity/overlays/:id/changes
 */
export class GetChangesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Get changes
      const changes = await overlayRepository.getChanges(id);

      res.status(200).json({
        success: true,
        data: changes,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

/**
 * Add Change Handler
 *
 * POST /api/meta/entities/:entity/overlays/:id/changes
 */
export class AddChangeHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Parse input
      const changeInput = req.body as CreateOverlayChangeInput;
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const createdBy = ctx.auth.userId ?? ctx.auth.subject ?? "system";

      // Validate overlay safety policy (FIELD_OVERLAY_SAFETY enforcement)
      const safetyViolations = validateOverlaySafety(changeInput.kind, changeInput.value);
      if (safetyViolations.length > 0) {
        res.status(422).json({
          success: false,
          error: {
            code: "OVERLAY_SAFETY_VIOLATION",
            message: "Overlay change violates field safety policy",
            violations: safetyViolations,
          },
        });
        return;
      }

      // Add change
      const change = await overlayRepository.addChange(
        id,
        changeInput,
        tenantId,
        createdBy,
      );

      // Audit log
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.addChange",
        userId: createdBy,
        tenantId,
        realmId: ctx.auth?.realmKey ?? "default",
        action: "create",
        resource: `overlay:${id}/change:${change.id}`,
        details: {
          overlayId: id,
          changeId: change.id,
          kind: changeInput.kind,
          path: changeInput.path,
        },
        result: "success",
      });

      res.status(201).json({
        success: true,
        data: change,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "ADD_CHANGE_FAILED", message: String(error) },
      });
    }
  }
}

/**
 * Remove Change Handler
 *
 * DELETE /api/meta/entities/:entity/overlays/:id/changes/:changeId
 */
export class RemoveChangeHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { changeId } = req.params as { changeId: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Remove change
      await overlayRepository.removeChange(changeId);

      // Audit log
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.removeChange",
        userId,
        tenantId,
        realmId: ctx.auth.realmKey ?? "default",
        action: "delete",
        resource: `overlay/change:${changeId}`,
        details: { changeId },
        result: "success",
      });

      res.status(200).json({
        success: true,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "REMOVE_CHANGE_FAILED", message: String(error) },
      });
    }
  }
}

/**
 * Reorder Changes Handler
 *
 * POST /api/meta/entities/:entity/overlays/:id/changes/reorder
 */
export class ReorderChangesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      const overlayRepository = await ctx.container.resolve<IOverlayRepository>(
        META_TOKENS.overlayRepository,
      );

      // Parse change IDs
      const { changeIds } = req.body as { changeIds: string[] };

      if (!Array.isArray(changeIds)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "changeIds must be an array of strings",
          },
        });
        return;
      }

      // Reorder changes
      await overlayRepository.reorderChanges(id, changeIds);

      // Audit log
      const tenantId = ctx.tenant.tenantKey ?? "default";
      const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
      const auditLogger = await ctx.container.resolve<AuditLogger>(
        META_TOKENS.auditLogger,
      );
      await auditLogger.log({
        eventType: "meta.overlay.reorderChanges",
        userId,
        tenantId,
        realmId: ctx.auth.realmKey ?? "default",
        action: "update",
        resource: `overlay:${id}/changes`,
        details: { overlayId: id, changeIds },
        result: "success",
      });

      res.status(200).json({
        success: true,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { code: "REORDER_FAILED", message: String(error) },
      });
    }
  }
}
