/**
 * @athyper/runtime-contracts — Source Adapter Contract
 *
 * Defines the data-shape contract for source adapters consumed by the
 * AddItemController in @athyper/runtime-add-item. Executable adapter
 * interfaces (fetch/toDraftShape/etc.) live in runtime-add-item; this file
 * defines only the Zod-validated metadata an adapter must declare to be
 * registered (manifest, selection shape, side-effects) and the draft-line
 * shape that flows through commit.
 */
import { z } from "zod";

import { InteractionSurfaceKindSchema } from "./interaction-surface";

const JsonObjectSchema = z.record(z.string(), z.unknown());

// ═══════════════════════════════════════════════════════════════
// Adapter identity
// ═══════════════════════════════════════════════════════════════

/**
 * Adapter id pattern: lowercase ascii starting with a letter, with optional
 * one-level namespace ("pack.adapter"). Industry packs name themselves; the
 * grammar exists so accidental collisions stay rare and the id is safe to use
 * as a URL segment, a redis key, or an OTel attribute.
 */
export const SourceAdapterIdSchema = z
  .string()
  .min(2)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/);
export type SourceAdapterId = z.infer<typeof SourceAdapterIdSchema>;

// ═══════════════════════════════════════════════════════════════
// Picker — UI shape declared by the adapter
// ═══════════════════════════════════════════════════════════════

/**
 * Surface kinds a picker may use. Read-only / transient kinds are excluded:
 *   • drawer-form is excluded because the picker returns a selection (the
 *     drawer-form is the *fill* step, not the picker)
 *   • drawer-peek and dialog-confirm cannot return selections
 */
export const PickerSurfaceKindSchema = z.enum(["modal-select", "overlay", "page"]);
export type PickerSurfaceKind = z.infer<typeof PickerSurfaceKindSchema>;

export const SourceColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["text", "number", "money", "quantity", "date", "status"]).default("text"),
  sortable: z.boolean().default(false),
  filterable: z.boolean().default(false),
  width: z.union([z.number(), z.string()]).optional(),
}).strict();
export type SourceColumn = z.infer<typeof SourceColumnSchema>;

export const SourceFilterSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  control: z.enum(["text", "select", "date_range", "number_range", "reference"]),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
}).strict();
export type SourceFilter = z.infer<typeof SourceFilterSchema>;

// ═══════════════════════════════════════════════════════════════
// Selection shape — what the picker returns
// ═══════════════════════════════════════════════════════════════

/**
 * Discriminated union: the adapter declares which shape its picker returns.
 * Partial-quantity flows (open PO line with `remainingQty`) require the
 * `id_qty` or `id_qty_uom` variant so AddItemController can carry the chosen
 * quantity through to commit.
 */
export const SourceSelectionShapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("id_only"),
    idField: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("id_qty"),
    idField: z.string().min(1),
    qtyField: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("id_qty_uom"),
    idField: z.string().min(1),
    qtyField: z.string().min(1),
    uomField: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("composite"),
    keyFields: z.array(z.string().min(1)).min(2),
    schema: JsonObjectSchema.optional(),
  }).strict(),
]);
export type SourceSelectionShape = z.infer<typeof SourceSelectionShapeSchema>;

// ═══════════════════════════════════════════════════════════════
// Source binding — embedded on every committed draft line
// ═══════════════════════════════════════════════════════════════

/**
 * Identifies where a committed line came from. Required on every line for
 * matching, audit, duplicate detection, and reverse-link maintenance. The
 * `sourceType` field is the registered adapter id; `sourceDocType` /
 * `sourceDocId` / `sourceLineId` point at the upstream record.
 */
export const SourceBindingSchema = z.object({
  sourceType: SourceAdapterIdSchema,
  sourceDocType: z.string().optional(),
  sourceDocId: z.string().optional(),
  sourceLineId: z.string().optional(),
  /** Free-form payload — adapters carry pack-specific binding metadata here. */
  sourceRef: JsonObjectSchema.optional(),
  /** Three-way / two-way / no-match / evaluated-receipt classification. */
  matchType: z
    .enum(["three_way", "two_way", "no_match", "evaluated_receipt"])
    .optional(),
}).catchall(z.unknown());
export type SourceBinding = z.infer<typeof SourceBindingSchema>;

// ═══════════════════════════════════════════════════════════════
// Draft line shape — what flows through commit
// ═══════════════════════════════════════════════════════════════

export const DraftLineSchema = JsonObjectSchema.and(
  z.object({ sourceBinding: SourceBindingSchema }),
);
export type DraftLine = z.infer<typeof DraftLineSchema>;

// ═══════════════════════════════════════════════════════════════
// Side effects — declared by the adapter, executed by the committer
// ═══════════════════════════════════════════════════════════════

/**
 * Declarative side effects an adapter wants the commit pipeline to perform.
 * Adapters DO NOT execute side effects directly — they describe them via
 * `onCommitSideEffects(line, ctx)`, and DraftLineCommitter orchestrates
 * them inside a transactional pipeline with rollback on failure.
 *
 * Adding a new effect kind is a breaking change for committers, so this
 * union is intentionally narrow. Add new kinds via a contract version bump.
 */
export const SourceSideEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reserve_remaining_quantity"),
    entityCode: z.string().min(1),
    recordId: z.string().min(1),
    lineId: z.string().min(1),
    quantityField: z.string().min(1),
    quantity: z.number().positive(),
  }).strict(),
  z.object({
    kind: z.literal("link_source_line"),
    sourceBinding: SourceBindingSchema,
  }),
  z.object({
    kind: z.literal("emit_event"),
    eventType: z.string().min(1),
    payload: JsonObjectSchema.default({}),
  }).strict(),
]);
export type SourceSideEffect = z.infer<typeof SourceSideEffectSchema>;

// ═══════════════════════════════════════════════════════════════
// Adapter manifest
// ═══════════════════════════════════════════════════════════════

export const CacheStrategySchema = z.enum(["none", "session", "stale-while-revalidate"]);
export type CacheStrategy = z.infer<typeof CacheStrategySchema>;

export const StalenessStrategySchema = z.enum(["refresh", "warn", "fail"]);
export type StalenessStrategy = z.infer<typeof StalenessStrategySchema>;

export const SOURCE_ADAPTER_CONTRACT_VERSION = "source-adapter/v1" as const;

/**
 * Adapter entry mode.
 *
 *   • "picker"      — default. Adapter has a remote source; consumer opens a
 *                     picker (see `picker.kind`) before staging.
 *   • "direct_fill" — adapter has no remote source; the composer / fill UI is
 *                     the selection mechanism. Consumer skips `openPicker` and
 *                     calls `controller.stageLine(adapter, draft)` after the
 *                     fill UI commits. Manual / generator / recurring-billing
 *                     adapters use this mode.
 *
 * Default is "picker" so every pre-Phase-7 adapter keeps validating without
 * any changes. The `picker` field on the manifest is required for "picker"
 * entry and forbidden for "direct_fill".
 */
export const SourceAdapterEntrySchema = z.enum(["picker", "direct_fill"]);
export type SourceAdapterEntry = z.infer<typeof SourceAdapterEntrySchema>;

const PickerConfigSchema = z.object({
  kind: PickerSurfaceKindSchema,
  columns: z.array(SourceColumnSchema).min(1),
  filters: z.array(SourceFilterSchema).default([]),
  search: z.object({
    enabled: z.boolean().default(true),
    placeholder: z.string().optional(),
  }).default({ enabled: true }),
  defaultSort: z.object({
    field: z.string().min(1),
    direction: z.enum(["asc", "desc"]).default("asc"),
  }).optional(),
}).strict();

export const SourceAdapterManifestSchema = z.object({
  id: SourceAdapterIdSchema,
  /** Adapter contract version — incremented when the executable interface changes. */
  version: z.number().int().positive(),
  /**
   * Minimum framework version required to mount this adapter. The registry
   * rejects adapters whose `minFrameworkVersion` exceeds the live framework
   * version with a structured error.
   */
  minFrameworkVersion: z.number().int().positive().default(1),
  label: z.string().min(1),
  /** Permission gate — picker chooser hides this adapter when the user lacks it. */
  permissionCode: z.string().optional(),

  /** Entry mode. See SourceAdapterEntrySchema. */
  entry: SourceAdapterEntrySchema.default("picker"),

  /**
   * Picker configuration. Required when `entry === "picker"`; forbidden when
   * `entry === "direct_fill"`. Enforced by the superRefine block below.
   */
  picker: PickerConfigSchema.optional(),

  cacheStrategy: CacheStrategySchema.default("session"),
  stalenessStrategy: StalenessStrategySchema.default("fail"),
  selectionShape: SourceSelectionShapeSchema,
  /** Composite dedupe key paths inside the draft-line shape. */
  dedupeKeys: z.array(z.string().min(1)).min(1),

  /**
   * Fill stage configuration. When omitted, the picker selection is committed
   * directly. When provided, the controller opens a drawer-form for the user
   * to fill the listed fields. Field references resolve against the entity's
   * MetaEntityField list at runtime.
   */
  fill: z.object({
    fieldNames: z.array(z.string().min(1)).default([]),
    prefilledFieldNames: z.array(z.string().min(1)).default([]),
    requiredFieldNames: z.array(z.string().min(1)).default([]),
  }).default({ fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] }),
}).strict()
  .superRefine((manifest, ctx) => {
    // Entry / picker pairing.
    if (manifest.entry === "picker" && !manifest.picker) {
      ctx.addIssue({
        code: "custom",
        path: ["picker"],
        message: "entry='picker' requires a picker configuration",
      });
    }
    if (manifest.entry === "direct_fill" && manifest.picker) {
      ctx.addIssue({
        code: "custom",
        path: ["picker"],
        message: "entry='direct_fill' adapters must not declare a picker (the fill UI is the selection mechanism)",
      });
    }

    // Page-picker cacheStrategy guard (only applies when a picker exists).
    if (manifest.picker?.kind === "page" && manifest.cacheStrategy === "session") {
      ctx.addIssue({
        code: "custom",
        path: ["cacheStrategy"],
        message:
          "page pickers should not rely on session-only cache (page navigation invalidates session)",
      });
    }
    // The dedupe key list must reference real paths inside the draft. Field
    // existence cannot be validated at schema time (the field list is per-
    // entity), so the harness validates this at register-time.
  });
export type SourceAdapterManifest = z.infer<typeof SourceAdapterManifestSchema>;
