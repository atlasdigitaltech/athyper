/**
 * Schema Composer Service
 *
 * Composes entity schemas from base + overlays with deterministic merge rules.
 * Handles overlay loading, validation, and application.
 */

import type { IOverlayRepository } from "./overlay.repository.js";
import type {
  OverlayConflictMode,
  OverlayChangeRecord,
  OverlayWithChanges,
  OverlayApplyResult,
  OverlayConflict,
  OverlayValidationResult,
  OverlayValidationErrorDetail,
  OverlayValidationWarning,
  CompositionPreviewResult,
} from "./types.js";
import type { Logger } from "../../../../kernel/logger.js";

// ============================================================================
// Schema Composer Service
// ============================================================================

/**
 * Service for composing entity schemas with overlays.
 * Applies overlay changes to base schemas with deterministic merge rules.
 */
export class SchemaComposerService {
  constructor(
    private overlayRepo: IOverlayRepository,
    private logger: Logger
  ) {}

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Load overlays from DB and build ordered list for composition
   */
  async loadOverlaysForEntity(
    baseEntityId: string,
    tenantId: string
  ): Promise<OverlayWithChanges[]> {
    const overlays = await this.overlayRepo.findActiveByBaseEntity(baseEntityId, tenantId);

    // Load changes for each overlay
    const overlaysWithChanges: OverlayWithChanges[] = [];
    for (const overlay of overlays) {
      const changes = await this.overlayRepo.getChanges(overlay.id);
      overlaysWithChanges.push({ ...overlay, changes });
    }

    return overlaysWithChanges;
  }

  /**
   * Apply overlay changes to a base schema.
   * Returns composed schema with conflict tracking.
   */
  applyOverlays(
    baseSchema: Record<string, unknown>,
    overlays: OverlayWithChanges[],
    defaultConflictMode: OverlayConflictMode = "fail"
  ): { schema: Record<string, unknown>; result: OverlayApplyResult } {
    // Deep clone to avoid mutating original
    const schema = JSON.parse(JSON.stringify(baseSchema));
    const conflicts: OverlayConflict[] = [];
    const appliedOverlays: string[] = [];

    // Apply each overlay in priority order (already sorted)
    for (const overlay of overlays) {
      const conflictMode = overlay.conflictMode ?? defaultConflictMode;

      this.logger.debug({
        msg: "applying_overlay",
        overlayKey: overlay.overlayKey,
        changeCount: overlay.changes.length,
        conflictMode,
      });

      // Apply each change within the overlay
      for (const change of overlay.changes) {
        const result = this.applyChange(schema, change, conflictMode);

        if (!result.success && result.conflict) {
          conflicts.push({
            overlayKey: overlay.overlayKey,
            path: change.path,
            message: result.conflict,
            changeKind: change.kind,
          });
        }
      }

      appliedOverlays.push(overlay.overlayKey);
    }

    return {
      schema,
      result: {
        success: conflicts.length === 0,
        appliedOverlays,
        conflicts,
      },
    };
  }

  /**
   * Validate overlay changes against a base schema without applying
   */
  validateOverlay(
    baseSchema: Record<string, unknown>,
    overlay: OverlayWithChanges
  ): OverlayValidationResult {
    const errors: OverlayValidationErrorDetail[] = [];
    const warnings: OverlayValidationWarning[] = [];

    for (let i = 0; i < overlay.changes.length; i++) {
      const change = overlay.changes[i];

      // Validate change structure
      const structureErrors = this.validateChangeStructure(change, i);
      errors.push(...structureErrors);

      // Validate against schema
      const schemaResult = this.validateChangeAgainstSchema(baseSchema, change, i);
      errors.push(...schemaResult.errors);
      warnings.push(...schemaResult.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Preview composed schema without persisting
   */
  async previewComposition(
    baseEntityId: string,
    tenantId: string,
    baseSchema: Record<string, unknown>,
    additionalOverlay?: OverlayWithChanges
  ): Promise<CompositionPreviewResult> {
    // Load existing overlays
    const overlays = await this.loadOverlaysForEntity(baseEntityId, tenantId);

    // Add additional overlay if provided
    const allOverlays = additionalOverlay
      ? [...overlays, additionalOverlay].sort((a, b) => a.priority - b.priority)
      : overlays;

    // Track field changes
    const addedFields: string[] = [];
    const modifiedFields: string[] = [];
    const removedFields: string[] = [];

    // Collect field change info
    for (const overlay of allOverlays) {
      for (const change of overlay.changes) {
        switch (change.kind) {
          case "addField":
            addedFields.push(change.path);
            break;
          case "modifyField":
            modifiedFields.push(change.path);
            break;
          case "removeField":
            removedFields.push(change.path);
            break;
        }
      }
    }

    // Apply overlays
    const { schema, result } = this.applyOverlays(baseSchema, allOverlays);

    return {
      schema,
      appliedOverlays: result.appliedOverlays,
      conflicts: result.conflicts,
      addedFields: [...new Set(addedFields)],
      modifiedFields: [...new Set(modifiedFields)],
      removedFields: [...new Set(removedFields)],
    };
  }

  // ============================================================================
  // Change Application
  // ============================================================================

  /**
   * Apply a single overlay change to schema
   */
  private applyChange(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    conflictMode: OverlayConflictMode
  ): { success: boolean; conflict?: string } {
    try {
      switch (change.kind) {
        case "addField":
          return this.applyAddField(schema, change, conflictMode);

        case "modifyField":
          return this.applyModifyField(schema, change, conflictMode);

        case "removeField":
          return this.applyRemoveField(schema, change);

        case "tweakPolicy":
          return this.applyTweakPolicy(schema, change, conflictMode);

        case "addIndex":
          return this.applyAddIndex(schema, change, conflictMode);

        case "removeIndex":
          return this.applyRemoveIndex(schema, change);

        case "tweakRelation":
          // Future implementation
          this.logger.warn({
            msg: "unsupported_change_kind",
            kind: change.kind,
            path: change.path,
          });
          return { success: true };

        default:
          return {
            success: false,
            conflict: `Unknown change kind: ${change.kind}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        conflict: `Error applying change: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Add a new field to the schema
   */
  private applyAddField(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    conflictMode: OverlayConflictMode
  ): { success: boolean; conflict?: string } {
    const existing = this.getValueAtPath(schema, change.path);

    if (existing !== undefined) {
      switch (conflictMode) {
        case "fail":
          return {
            success: false,
            conflict: `Field already exists at path: ${change.path}`,
          };

        case "overwrite":
          this.setValueAtPath(schema, change.path, change.value);
          return { success: true };

        case "merge":
          if (typeof existing === "object" && typeof change.value === "object") {
            this.setValueAtPath(schema, change.path, this.deepMerge(existing, change.value));
          } else {
            this.setValueAtPath(schema, change.path, change.value);
          }
          return { success: true };
      }
    }

    this.setValueAtPath(schema, change.path, change.value);
    return { success: true };
  }

  /**
   * Modify an existing field in the schema
   */
  private applyModifyField(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    conflictMode: OverlayConflictMode
  ): { success: boolean; conflict?: string } {
    const existing = this.getValueAtPath(schema, change.path);

    if (existing === undefined) {
      switch (conflictMode) {
        case "fail":
          return {
            success: false,
            conflict: `Cannot modify non-existent field at path: ${change.path}`,
          };

        case "overwrite":
        case "merge":
          // Treat as add
          this.setValueAtPath(schema, change.path, change.value);
          return { success: true };
      }
    }

    if (conflictMode === "merge" && typeof existing === "object" && typeof change.value === "object") {
      this.setValueAtPath(schema, change.path, this.deepMerge(existing, change.value));
    } else {
      this.setValueAtPath(schema, change.path, change.value);
    }

    return { success: true };
  }

  /**
   * Remove a field from the schema
   */
  private applyRemoveField(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord
  ): { success: boolean; conflict?: string } {
    const existing = this.getValueAtPath(schema, change.path);

    if (existing === undefined) {
      // Field doesn't exist - that's okay, consider it removed
      return { success: true };
    }

    this.deleteValueAtPath(schema, change.path);
    return { success: true };
  }

  /**
   * Tweak policy settings at a path
   */
  private applyTweakPolicy(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    conflictMode: OverlayConflictMode
  ): { success: boolean; conflict?: string } {
    // Policy tweaks always merge by default
    const existing = this.getValueAtPath(schema, change.path);

    if (existing === undefined) {
      this.setValueAtPath(schema, change.path, change.value);
    } else if (typeof existing === "object" && typeof change.value === "object") {
      this.setValueAtPath(schema, change.path, this.deepMerge(existing, change.value));
    } else if (conflictMode === "fail") {
      return {
        success: false,
        conflict: `Cannot tweak policy: type mismatch at path ${change.path}`,
      };
    } else {
      this.setValueAtPath(schema, change.path, change.value);
    }

    return { success: true };
  }

  /**
   * Add an index definition to the schema (EPIC I - I2)
   */
  private applyAddIndex(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    conflictMode: OverlayConflictMode
  ): { success: boolean; conflict?: string } {
    // Ensure indexes array exists
    if (!schema.indexes) {
      schema.indexes = [];
    }

    const indexes = schema.indexes as Array<unknown>;
    const indexDef = change.value as { name: string; columns: string[]; unique?: boolean };

    // Check if index with same name already exists
    const existingIndex = indexes.find((idx: any) => idx.name === indexDef.name);

    if (existingIndex) {
      switch (conflictMode) {
        case "fail":
          return {
            success: false,
            conflict: `Index already exists: ${indexDef.name}`,
          };

        case "overwrite":
          // Remove existing and add new
          const index = indexes.findIndex((idx: any) => idx.name === indexDef.name);
          indexes.splice(index, 1, indexDef);
          return { success: true };

        case "merge":
          // Merge index properties
          Object.assign(existingIndex, indexDef);
          return { success: true };
      }
    }

    // Add new index
    indexes.push(indexDef);
    return { success: true };
  }

  /**
   * Remove an index definition from the schema (EPIC I - I2)
   */
  private applyRemoveIndex(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord
  ): { success: boolean; conflict?: string } {
    if (!schema.indexes || !Array.isArray(schema.indexes)) {
      // No indexes to remove - that's okay
      return { success: true };
    }

    const indexName = change.value as string;
    const indexes = schema.indexes as Array<any>;
    const index = indexes.findIndex(idx => idx.name === indexName);

    if (index === -1) {
      // Index doesn't exist - that's okay, consider it removed
      return { success: true };
    }

    indexes.splice(index, 1);
    return { success: true };
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  private validateChangeStructure(
    change: OverlayChangeRecord,
    index: number
  ): OverlayValidationErrorDetail[] {
    const errors: OverlayValidationErrorDetail[] = [];

    if (!change.path || typeof change.path !== "string") {
      errors.push({
        changeIndex: index,
        path: change.path ?? "(empty)",
        message: "Change path must be a non-empty string",
        code: "INVALID_PATH",
      });
    }

    if (!change.kind) {
      errors.push({
        changeIndex: index,
        path: change.path,
        message: "Change kind is required",
        code: "MISSING_KIND",
      });
    }

    // Validate value based on kind
    if (change.kind === "addField" || change.kind === "modifyField") {
      if (change.value === undefined) {
        errors.push({
          changeIndex: index,
          path: change.path,
          message: `Value is required for ${change.kind} changes`,
          code: "MISSING_VALUE",
        });
      }
    }

    // Validate index operations (EPIC I - I2)
    if (change.kind === "addIndex") {
      if (!change.value || typeof change.value !== "object") {
        errors.push({
          changeIndex: index,
          path: change.path,
          message: "add_index requires value with {name, columns} properties",
          code: "MISSING_INDEX_DEF",
        });
      } else {
        const indexDef = change.value as any;
        if (!indexDef.name || !indexDef.columns || !Array.isArray(indexDef.columns)) {
          errors.push({
            changeIndex: index,
            path: change.path,
            message: "Index definition must have name and columns array",
            code: "INVALID_INDEX_DEF",
          });
        }
        if (indexDef.columns && Array.isArray(indexDef.columns) && indexDef.columns.length === 0) {
          errors.push({
            changeIndex: index,
            path: change.path,
            message: "Index must specify at least one column",
            code: "EMPTY_INDEX_COLUMNS",
          });
        }
      }
    }

    if (change.kind === "removeIndex") {
      if (!change.value || typeof change.value !== "string") {
        errors.push({
          changeIndex: index,
          path: change.path,
          message: "remove_index requires index name as string value",
          code: "MISSING_INDEX_NAME",
        });
      }
    }

    return errors;
  }

  private validateChangeAgainstSchema(
    schema: Record<string, unknown>,
    change: OverlayChangeRecord,
    index: number
  ): { errors: OverlayValidationErrorDetail[]; warnings: OverlayValidationWarning[] } {
    const errors: OverlayValidationErrorDetail[] = [];
    const warnings: OverlayValidationWarning[] = [];

    const existing = this.getValueAtPath(schema, change.path);

    switch (change.kind) {
      case "addField":
        if (existing !== undefined) {
          warnings.push({
            changeIndex: index,
            path: change.path,
            message: "Field already exists - behavior depends on conflict mode",
            code: "FIELD_EXISTS",
          });
        }
        break;

      case "modifyField":
        if (existing === undefined) {
          warnings.push({
            changeIndex: index,
            path: change.path,
            message: "Field does not exist - behavior depends on conflict mode",
            code: "FIELD_NOT_FOUND",
          });
        }
        break;

      case "removeField":
        if (existing === undefined) {
          warnings.push({
            changeIndex: index,
            path: change.path,
            message: "Field does not exist - removal will be a no-op",
            code: "FIELD_NOT_FOUND",
          });
        }
        break;
    }

    return { errors, warnings };
  }

  // ============================================================================
  // Path Manipulation Helpers
  // ============================================================================

  /**
   * Get value at a JSON path (supports dot notation)
   * e.g., "fields.name.validation.required"
   */
  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Set value at a JSON path (creates intermediate objects as needed)
   */
  private setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Delete value at a JSON path
   */
  private deleteValueAtPath(obj: Record<string, unknown>, path: string): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) {
        return; // Path doesn't exist
      }
      current = current[part] as Record<string, unknown>;
    }

    delete current[parts[parts.length - 1]];
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: unknown, source: unknown): unknown {
    if (typeof target !== "object" || target === null) {
      return source;
    }
    if (typeof source !== "object" || source === null) {
      return source;
    }

    const result = { ...(target as Record<string, unknown>) };
    const sourceObj = source as Record<string, unknown>;

    for (const key of Object.keys(sourceObj)) {
      if (key in result) {
        result[key] = this.deepMerge(result[key], sourceObj[key]);
      } else {
        result[key] = sourceObj[key];
      }
    }

    return result;
  }
}
