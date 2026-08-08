/**
 * @athyper/runtime-contracts — Interaction Surface Contract
 *
 * Defines the closed taxonomy of interaction surface kinds (page, overlay,
 * drawer-form, drawer-peek, modal-select, dialog-confirm) and the per-op
 * `interactionOptions` shape that drives the shared SurfaceStackController +
 * AddItemController runtime.
 *
 * This file deliberately does NOT modify `MetaEntityOperationSchema` — Phase
 * 1 wires these types into the live op schema. Phase 0.5 lands the contract
 * + tenant override merge boundary so cross-class overrides cannot leak
 * into customer config before guards exist.
 */
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Surface kinds + class map
// ═══════════════════════════════════════════════════════════════

export const InteractionSurfaceKindSchema = z.enum([
  "page",
  "overlay",
  "drawer-form",
  "drawer-peek",
  "modal-select",
  "dialog-confirm",
]);
export type InteractionSurfaceKind = z.infer<typeof InteractionSurfaceKindSchema>;

export const InteractionSurfaceClassSchema = z.enum([
  "destination",
  "parent_bound_full",
  "drawer",
  "selection",
  "confirmation",
]);
export type InteractionSurfaceClass = z.infer<typeof InteractionSurfaceClassSchema>;

/**
 * Cross-class tenant overrides are rejected at merge time. Two surfaces in
 * the same class may swap (e.g. drawer-form ↔ drawer-peek) only when the
 * read/write semantics check also passes.
 */
export const INTERACTION_SURFACE_CLASS: Record<InteractionSurfaceKind, InteractionSurfaceClass> = {
  page: "destination",
  overlay: "parent_bound_full",
  "drawer-form": "drawer",
  "drawer-peek": "drawer",
  "modal-select": "selection",
  "dialog-confirm": "confirmation",
};

/** Surface kinds that mutate state. drawer-peek and dialog-confirm are read-only/transient. */
export const MUTATING_SURFACE_KINDS: ReadonlySet<InteractionSurfaceKind> = new Set([
  "page",
  "overlay",
  "drawer-form",
  "modal-select",
]);

/** Surface kinds valid as a source-adapter picker (read-only kinds excluded). */
export const PICKER_SURFACE_KINDS: ReadonlySet<InteractionSurfaceKind> = new Set([
  "modal-select",
  "overlay",
  "page",
]);

// ═══════════════════════════════════════════════════════════════
// Width + add contract
// ═══════════════════════════════════════════════════════════════

export const InteractionSurfaceWidthSchema = z.enum([
  "compact",
  "default",
  "wide",
  "grid",
  "full",
]);
export type InteractionSurfaceWidth = z.infer<typeof InteractionSurfaceWidthSchema>;

export const AddSemanticsSchema = z.enum([
  "single",
  "batch_append",
  "transform_from_source",
  "replace",
]);

export const CommitModeSchema = z.enum([
  "stage_then_parent_save",
  "persist_immediately",
  "per_item_and_reset",
]);

export const SubPickPolicySchema = z.enum(["inline_first", "modal_when_columns"]);

export const ParentDirtyEffectSchema = z.enum([
  "none",
  "mark_parent_dirty",
  "parent_required_clean",
]);

export const AddContractSchema = z.object({
  semantics: AddSemanticsSchema,
  commitMode: CommitModeSchema,
  parentDirtyEffect: ParentDirtyEffectSchema.default("mark_parent_dirty"),
  subPickPolicy: SubPickPolicySchema.default("inline_first"),
  /** FK into MetaEntityRelation.key — validated at descriptor level. */
  targetRelation: z.string().min(1),
  /** Composite dedupe key paths inside the draft line shape. */
  dedupeKeys: z.array(z.string().min(1)).optional(),
}).strict();
export type AddContract = z.infer<typeof AddContractSchema>;

// ═══════════════════════════════════════════════════════════════
// Interaction options (per-op)
// ═══════════════════════════════════════════════════════════════

export const InteractionOptionsSchema = z.object({
  width: InteractionSurfaceWidthSchema.optional(),
  /** Opaque registry key — validated at app boot, not in schema. */
  contentAdapter: z.string().min(1).optional(),
  /** Routed expansion target. Forbidden when addContract is set. */
  expandRoute: z.string().min(1).optional(),
  /** Binding ref for overlay-bound / drawer-peek. Parent stays mounted. */
  bindParent: z.boolean().optional(),
  addContract: AddContractSchema.optional(),
  /** dialog-confirm only — specific consequence, never "Are you sure?". */
  consequence: z.string().min(1).optional(),
  /** Source-adapter IDs the op may invoke via the picker. */
  sourceAdapters: z.array(z.string().min(1)).optional(),
}).strict();
export type InteractionOptions = z.infer<typeof InteractionOptionsSchema>;

// ═══════════════════════════════════════════════════════════════
// Shape-level validation (kind ↔ options)
//
// Reused by: live op schema (Phase 1), override merge validator, descriptor
// regression suite. The rules match the 11-rule contract documented in the
// architecture plan.
// ═══════════════════════════════════════════════════════════════

export interface InteractionSurfaceShape {
  kind: InteractionSurfaceKind;
  options?: InteractionOptions;
}

export interface InteractionSurfaceIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export function validateInteractionSurfaceShape(
  shape: InteractionSurfaceShape,
  basePath: ReadonlyArray<string | number> = [],
): InteractionSurfaceIssue[] {
  const issues: InteractionSurfaceIssue[] = [];
  const { kind, options: opts } = shape;
  if (!opts) return issues;

  const at = (...segments: Array<string | number>): Array<string | number> => [
    ...basePath,
    ...segments,
  ];

  // Rule 3 — dialog-confirm requires named consequence; others forbid it.
  if (kind === "dialog-confirm" && !opts.consequence) {
    issues.push({
      path: at("interactionOptions", "consequence"),
      message:
        "dialog-confirm requires interactionOptions.consequence (named consequence, not 'Are you sure?')",
    });
  }
  if (kind !== "dialog-confirm" && opts.consequence) {
    issues.push({
      path: at("interactionOptions", "consequence"),
      message: "consequence is only valid on dialog-confirm",
    });
  }

  // Rule 4 — width valid only on drawer-form and modal-select.
  if (opts.width && kind !== "drawer-form" && kind !== "modal-select") {
    issues.push({
      path: at("interactionOptions", "width"),
      message: `width not applicable to ${kind} (only drawer-form, modal-select)`,
    });
  }

  // Rule 5 — bindParent only on overlay / drawer-peek.
  if (opts.bindParent && kind !== "overlay" && kind !== "drawer-peek") {
    issues.push({
      path: at("interactionOptions", "bindParent"),
      message: `bindParent only valid on overlay or drawer-peek (got ${kind})`,
    });
  }

  // Rule 6 — addContract only on drawer-form / overlay (mutating, item-shaped).
  if (opts.addContract && kind !== "drawer-form" && kind !== "overlay") {
    issues.push({
      path: at("interactionOptions", "addContract"),
      message: `addContract only valid on drawer-form or overlay (got ${kind})`,
    });
  }

  // Rule 7 — expandRoute forbidden when addContract is declared.
  if (opts.addContract && opts.expandRoute) {
    issues.push({
      path: at("interactionOptions", "expandRoute"),
      message:
        "expandRoute forbidden when addContract is declared (add ops do not have page identity)",
    });
  }

  // Rule 8 — expandRoute only on drawer-form / drawer-peek.
  if (opts.expandRoute && kind !== "drawer-form" && kind !== "drawer-peek") {
    issues.push({
      path: at("interactionOptions", "expandRoute"),
      message: `expandRoute only valid on drawer-form or drawer-peek (got ${kind})`,
    });
  }

  // Rule 9 — contentAdapter required on drawer-form / overlay / modal-select.
  const adapterRequired: InteractionSurfaceKind[] = ["drawer-form", "overlay", "modal-select"];
  if (adapterRequired.includes(kind) && !opts.contentAdapter) {
    issues.push({
      path: at("interactionOptions", "contentAdapter"),
      message: `${kind} requires interactionOptions.contentAdapter`,
    });
  }

  // Source adapters only meaningful on surfaces that host a picker.
  if (opts.sourceAdapters && opts.sourceAdapters.length > 0) {
    if (!PICKER_SURFACE_KINDS.has(kind) && kind !== "drawer-form") {
      // drawer-form is allowed because controller opens picker as a sub-surface.
      issues.push({
        path: at("interactionOptions", "sourceAdapters"),
        message: `sourceAdapters not applicable to ${kind} (host a picker on drawer-form, modal-select, overlay, or page)`,
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Tenant override schema
//
// Overrides are additive — every field is optional and falls back to the
// base op when absent. Cross-class moves are rejected at merge time using
// INTERACTION_SURFACE_CLASS, not at the Zod layer (the schema only checks
// shape; semantics require knowing the base op).
// ═══════════════════════════════════════════════════════════════

export const OperationPlacementSchema = z.enum([
  "PRIMARY",
  "TOOLBAR",
  "OVERFLOW",
  "CONTEXT",
  "COMMAND",
]);

export const MetaEntityOperationOverrideSchema = z.object({
  /** Op key being overridden. Must match an entity_operation in the descriptor. */
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  placement: OperationPlacementSchema.optional(),
  enabled: z.boolean().optional(),
  interactionSurfaceKind: InteractionSurfaceKindSchema.optional(),
  /** Partial — merges field-by-field with base interactionOptions. */
  interactionOptions: InteractionOptionsSchema.partial().optional(),
  sourceAdapters: z.array(z.string().min(1)).optional(),
}).strict();
export type MetaEntityOperationOverride = z.infer<typeof MetaEntityOperationOverrideSchema>;

/**
 * Minimal shape the merge validator needs from a base operation. We do NOT
 * import the full `MetaEntityOperation` type here because Phase 0.5 lands
 * before MetaEntityOperationSchema gains the interaction fields. Phase 1
 * tightens the call site to use the live type.
 */
export interface MergeableBaseOperation {
  key: string;
  label?: string | null;
  icon?: string | null;
  placement: z.infer<typeof OperationPlacementSchema>;
  enabled: boolean;
  interactionSurfaceKind?: InteractionSurfaceKind;
  interactionOptions?: InteractionOptions;
  sourceAdapters?: string[];
}

export interface MergeableResolvedOperation extends MergeableBaseOperation {}

export interface MergeOverrideResult {
  ok: boolean;
  resolved?: MergeableResolvedOperation;
  errors: InteractionSurfaceIssue[];
}

/**
 * Merge a tenant override onto a base operation, enforcing the six rules
 * agreed in the architecture plan:
 *   1. No cross-class override.
 *   2. No mutating op → read-only surface.
 *   3. No destructive-confirmation downgrade.
 *   4. No picker override to read-only surfaces (transitively enforced via
 *      adapter manifest constraints — checked here for sourceAdapters in opts).
 *   5. Adapter IDs referenced exist in the runtime registry (caller-supplied).
 *   6. Width/options constrained by resolved kind (delegated to
 *      validateInteractionSurfaceShape).
 */
export function mergeOperationOverride(
  base: MergeableBaseOperation,
  override: MetaEntityOperationOverride,
  context: {
    /** When provided, sourceAdapters referenced by override must exist here. */
    knownAdapterIds?: ReadonlySet<string>;
  } = {},
): MergeOverrideResult {
  const errors: InteractionSurfaceIssue[] = [];

  if (override.key !== base.key) {
    errors.push({
      path: ["key"],
      message: `Override key "${override.key}" does not match base op key "${base.key}"`,
    });
    return { ok: false, errors };
  }

  const baseKind = base.interactionSurfaceKind;
  const overrideKind = override.interactionSurfaceKind;
  const resolvedKind = overrideKind ?? baseKind;

  // Rule 1 — class boundary
  if (overrideKind && baseKind) {
    const baseClass = INTERACTION_SURFACE_CLASS[baseKind];
    const overrideClass = INTERACTION_SURFACE_CLASS[overrideKind];
    if (baseClass !== overrideClass) {
      errors.push({
        path: ["interactionSurfaceKind"],
        message: `Cross-class override rejected: ${baseKind} (${baseClass}) -> ${overrideKind} (${overrideClass})`,
      });
    }
  }

  // Rule 2 — mutating op cannot move to read-only surface
  const baseIsMutating =
    (baseKind && MUTATING_SURFACE_KINDS.has(baseKind)) ||
    !!base.interactionOptions?.addContract;
  if (baseIsMutating && overrideKind && !MUTATING_SURFACE_KINDS.has(overrideKind)) {
    errors.push({
      path: ["interactionSurfaceKind"],
      message: `Mutating op "${base.key}" cannot be overridden to read-only surface ${overrideKind}`,
    });
  }

  // Rule 3 — destructive confirmation cannot be downgraded
  const baseHasConsequence = !!base.interactionOptions?.consequence;
  if (baseHasConsequence && overrideKind && overrideKind !== "dialog-confirm") {
    errors.push({
      path: ["interactionSurfaceKind"],
      message: `Op "${base.key}" declares a destructive consequence and cannot be moved out of dialog-confirm`,
    });
  }

  // Merge interactionOptions field-by-field
  const mergedOptions: InteractionOptions | undefined =
    base.interactionOptions || override.interactionOptions
      ? {
          ...(base.interactionOptions ?? {}),
          ...(override.interactionOptions ?? {}),
          addContract:
            override.interactionOptions?.addContract ??
            base.interactionOptions?.addContract,
        }
      : undefined;

  // Rule 5 — adapter IDs exist (if registry supplied)
  const mergedSourceAdapters =
    override.sourceAdapters ??
    mergedOptions?.sourceAdapters ??
    base.sourceAdapters;
  if (context.knownAdapterIds && mergedSourceAdapters) {
    for (const id of mergedSourceAdapters) {
      if (!context.knownAdapterIds.has(id)) {
        errors.push({
          path: ["sourceAdapters"],
          message: `Unknown source adapter "${id}" referenced by override on op "${base.key}"`,
        });
      }
    }
  }

  // Rule 6 — width/options constrained by resolved kind
  if (resolvedKind) {
    const shapeIssues = validateInteractionSurfaceShape(
      { kind: resolvedKind, options: mergedOptions },
      [],
    );
    errors.push(...shapeIssues);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const resolved: MergeableResolvedOperation = {
    key: base.key,
    label: override.label ?? base.label ?? null,
    icon: override.icon ?? base.icon ?? null,
    placement: override.placement ?? base.placement,
    enabled: override.enabled ?? base.enabled,
    interactionSurfaceKind: resolvedKind,
    interactionOptions: mergedOptions,
    sourceAdapters: mergedSourceAdapters,
  };

  return { ok: true, resolved, errors: [] };
}
