/**
 * @athyper/api-contracts — Edit Session schemas
 *
 * Contract for the document Edit Session endpoints:
 *   GET   /api/records/:entity/:id/edit-context
 *   PATCH /api/records/:entity/:id/edit-session    (If-Match: <etag>)
 *
 * Server is the source of truth for editability. The client uses the
 * returned `fieldMask` for UX gating only; the server re-validates on
 * every PATCH regardless of what the client sent.
 *
 * `etag` is the opaque optimistic-concurrency token. Internally the
 * server maps it onto the existing `row_version` numeric column so the
 * record-level locking semantics remain unchanged.
 *
 * Locked design decisions (Phase 4):
 *   - Single transactional save endpoint.
 *   - PATCH response always returns updated etag + fresh fieldMask/sectionMask.
 *   - Canonical op is `update`; `edit` accepted as legacy alias.
 *   - Approver inline correction OUT OF SCOPE — Recall → Edit → Resubmit only.
 *   - Hashes are clean (`#overview`); internal section IDs may still use prefixes.
 */
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Field mask — why a field cannot be edited in the current context
// ═══════════════════════════════════════════════════════════════

export const LockedFieldReasonSchema = z.enum([
  "status_locked",     // editable_in_status excludes current status
  "permission_locked", // field-level RBAC denied for this user
  "pii_masked",        // value is masked; request access to unmask
  "readonly",          // declared read-only in metadata
  "computed",          // derived value (totals, etc.)
  "system",            // managed by system (created_at, etag)
]);
export type LockedFieldReason = z.infer<typeof LockedFieldReasonSchema>;

export const FieldMaskEntrySchema = z.object({
  /** True when this field is editable in the current context. */
  editable: z.boolean(),
  /** Set when `editable === false`. Drives Read-variant icon + tooltip. */
  reason: LockedFieldReasonSchema.optional(),
  /** Human-readable detail for the reason; defaults from server. */
  message: z.string().optional(),
});
export type FieldMaskEntry = z.infer<typeof FieldMaskEntrySchema>;

/** Field name → mask entry. Keys match `MetaEntityField.name`. */
export const FieldMaskSchema = z.record(z.string(), FieldMaskEntrySchema);
export type FieldMask = z.infer<typeof FieldMaskSchema>;

// ═══════════════════════════════════════════════════════════════
// Section mask — per-section editability summary
// ═══════════════════════════════════════════════════════════════

export const SectionMaskEntrySchema = z.object({
  hasEditableFields: z.boolean(),
  editableFieldCount: z.number(),
});
export type SectionMaskEntry = z.infer<typeof SectionMaskEntrySchema>;

/**
 * Section ID → mask entry.
 *
 * Section IDs match the document object-page section descriptors.
 * The client may use a `__` prefix internally (e.g. `__overview`); the
 * server uses whatever the entity's display config declares, defaulting
 * to grouping all editable header fields into `__overview`.
 */
export const SectionMaskSchema = z.record(z.string(), SectionMaskEntrySchema);
export type SectionMask = z.infer<typeof SectionMaskSchema>;

// ═══════════════════════════════════════════════════════════════
// Edit context — returned by GET /edit-context
// ═══════════════════════════════════════════════════════════════

export const DocumentEditContextSchema = z.object({
  recordId: z.string(),
  entityCode: z.string(),
  status: z.string(),
  /** Opaque concurrency token. Sent back in `If-Match` on save. */
  etag: z.string(),
  /** False when the record cannot be entered into edit mode at all. */
  canUpdate: z.boolean(),
  /** Set when `canUpdate === false`; user-facing explanation. */
  disabledReason: z.string().optional(),
  fieldMask: FieldMaskSchema,
  sectionMask: SectionMaskSchema,
});
export type DocumentEditContext = z.infer<typeof DocumentEditContextSchema>;

// ═══════════════════════════════════════════════════════════════
// Edit session PATCH — bundled transactional save
// ═══════════════════════════════════════════════════════════════

export const EditSessionLineCreateSchema = z.record(z.string(), z.unknown());
export type EditSessionLineCreate = z.infer<typeof EditSessionLineCreateSchema>;

export const EditSessionLineUpdateSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export type EditSessionLineUpdate = z.infer<typeof EditSessionLineUpdateSchema>;

export const EditSessionLineBundleSchema = z.object({
  create: z.array(EditSessionLineCreateSchema).optional(),
  update: z.array(EditSessionLineUpdateSchema).optional(),
  delete: z.array(z.string()).optional(),
});
export type EditSessionLineBundle = z.infer<typeof EditSessionLineBundleSchema>;

export const EditSessionPatchBodySchema = z.object({
  /** Header field deltas — only fields the client believes have changed. */
  header: z.record(z.string(), z.unknown()).optional(),
  /**
   * Line bundle — create / update / delete in a single transaction with
   * the header changes. Phase 4 server may reject `lines` until the line
   * bundle handler lands (Phase 6); contract is forward-declared here.
   */
  lines: EditSessionLineBundleSchema.optional(),
});
export type EditSessionPatchBody = z.infer<typeof EditSessionPatchBodySchema>;

export const EditSessionPatchResponseSchema = z.object({
  /** Full updated record after the transaction commits. */
  record: z.object({
    id: z.string(),
    data: z.record(z.string(), z.unknown()),
    status: z.string().optional(),
  }),
  /** New opaque concurrency token. Use on the next save. */
  etag: z.string(),
  status: z.string(),
  /** Fresh mask — fields' editability may change after status transitions. */
  fieldMask: FieldMaskSchema,
  sectionMask: SectionMaskSchema,
});
export type EditSessionPatchResponse = z.infer<typeof EditSessionPatchResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Error envelopes
// ═══════════════════════════════════════════════════════════════

/** 412 Precondition Failed — etag mismatch. Body shape for client handling. */
export const EditSessionConflictBodySchema = z.object({
  error: z.literal("VERSION_CONFLICT"),
  /** Current server etag — client may offer "Reload to merge". */
  currentEtag: z.string(),
});
export type EditSessionConflictBody = z.infer<typeof EditSessionConflictBodySchema>;

/** 422 Unprocessable Entity — validation errors per field. */
export const EditSessionValidationBodySchema = z.object({
  error: z.literal("VALIDATION"),
  message: z.string().optional(),
  fieldErrors: z.record(z.string(), z.string()),
});
export type EditSessionValidationBody = z.infer<typeof EditSessionValidationBodySchema>;

// ═══════════════════════════════════════════════════════════════
// Autosave config (Phase 10 #3) — opt-in per entity via display_config
// ═══════════════════════════════════════════════════════════════

/**
 * Per-entity autosave configuration. Read from
 * `entity.display_config.autosave` via {@link readAutosaveConfig}.
 *
 * Locked design decisions:
 *   - Default is OFF. Explicit save remains the standard for transactional
 *     entities (purchase_invoice, journal_entry).
 *   - Tenants opt high-frequency entities (purchase_requisition, sales_quote)
 *     into autosave by setting `display_config.autosave: { enabled: true }`.
 *   - On save failure (validation / conflict / network), autosave pauses
 *     until the next manual Save click. Prevents server-spam loops.
 */
export const DocumentAutosaveConfigSchema = z.object({
  /** Master switch. Default false. */
  enabled: z.boolean().default(false),
  /**
   * Idle delay after the last user edit before autosave fires.
   * Floor 250ms (prevents per-keystroke spam), ceiling 10s (sanity).
   */
  debounceMs: z.number().int().min(250).max(10000).default(1500),
  /**
   * When true (default), autosave pauses on any save failure until the
   * user manually clicks Save (or discards/exits). When false, autosave
   * retries on every subsequent edit even if previous save failed —
   * appropriate only for entities with very low save failure rates.
   */
  pauseOnError: z.boolean().default(true),
});
export type DocumentAutosaveConfig = z.infer<typeof DocumentAutosaveConfigSchema>;

/** Default config when no `autosave` block is present in display_config. */
export const DEFAULT_AUTOSAVE_CONFIG: DocumentAutosaveConfig = {
  enabled: false,
  debounceMs: 1500,
  pauseOnError: true,
};

/**
 * Reads + validates the autosave config from an entity's display_config.
 * Returns the default config when the field is absent, malformed, or
 * fails schema validation — never throws.
 */
export function readAutosaveConfig(
  displayConfig: Record<string, unknown> | null | undefined,
): DocumentAutosaveConfig {
  if (!displayConfig || typeof displayConfig !== "object") return DEFAULT_AUTOSAVE_CONFIG;
  const raw = (displayConfig as Record<string, unknown>)["autosave"];
  if (raw == null || typeof raw !== "object") return DEFAULT_AUTOSAVE_CONFIG;
  const parsed = DocumentAutosaveConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_AUTOSAVE_CONFIG;
}

// ═══════════════════════════════════════════════════════════════
// Pending delta config (Phase 10 #4) — opt-in per entity via display_config
// ═══════════════════════════════════════════════════════════════

/**
 * Per-entity pending-delta preview mode. Read from
 * `entity.display_config.pending_delta` via {@link readPendingDeltaMode}.
 *
 * Locked design decisions:
 *   - Default is `"off"`. AP and other ledger-sensitive entities should
 *     stay off to avoid showing approximate numbers next to legal totals.
 *   - `"simple"` sums line gross-amount deltas only — safe for entities
 *     where the total is just SUM(line.gross_amount) (e.g. purchase_order,
 *     sales_quote). Approximation risk is zero for these.
 *   - `"full"` attempts client-side tax/discount/withholding recomputation.
 *     Will drift from server math for complex tax rules — UI marks deltas
 *     as approximate. Reserved for entities where the preview value
 *     outweighs the drift cost.
 */
export const DocumentPendingDeltaModeSchema = z.enum(["off", "simple", "full"]).default("off");
export type DocumentPendingDeltaMode = z.infer<typeof DocumentPendingDeltaModeSchema>;

/** Default mode when no `pending_delta` field is present in display_config. */
export const DEFAULT_PENDING_DELTA_MODE: DocumentPendingDeltaMode = "off";

/**
 * Reads + validates the pending-delta mode from an entity's display_config.
 * Returns `"off"` when the field is absent, malformed, or fails validation.
 */
export function readPendingDeltaMode(
  displayConfig: Record<string, unknown> | null | undefined,
): DocumentPendingDeltaMode {
  if (!displayConfig || typeof displayConfig !== "object") return DEFAULT_PENDING_DELTA_MODE;
  const raw = (displayConfig as Record<string, unknown>)["pending_delta"];
  if (raw === undefined) return DEFAULT_PENDING_DELTA_MODE;
  const parsed = DocumentPendingDeltaModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PENDING_DELTA_MODE;
}
