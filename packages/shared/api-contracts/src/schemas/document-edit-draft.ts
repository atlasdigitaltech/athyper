import { z } from "zod";

/** Transport-neutral masks and local workspace-draft preferences. */
export const LockedFieldReasonSchema = z.enum([
  "status_locked",
  "permission_locked",
  "pii_masked",
  "readonly",
  "computed",
  "system",
]);
export type LockedFieldReason = z.infer<typeof LockedFieldReasonSchema>;

export const FieldMaskEntrySchema = z.object({
  editable: z.boolean(),
  reason: LockedFieldReasonSchema.optional(),
  message: z.string().optional(),
});
export type FieldMaskEntry = z.infer<typeof FieldMaskEntrySchema>;

export const FieldMaskSchema = z.record(z.string(), FieldMaskEntrySchema);
export type FieldMask = z.infer<typeof FieldMaskSchema>;

export const SectionMaskEntrySchema = z.object({
  hasEditableFields: z.boolean(),
  editableFieldCount: z.number(),
});
export type SectionMaskEntry = z.infer<typeof SectionMaskEntrySchema>;

export const SectionMaskSchema = z.record(z.string(), SectionMaskEntrySchema);
export type SectionMask = z.infer<typeof SectionMaskSchema>;

/** Server-truthed edit state used to initialize the workspace draft adapter. */
export const DocumentWorkspaceDraftContextSchema = z.object({
  recordId: z.string(),
  entityCode: z.string(),
  status: z.string(),
  etag: z.string(),
  canUpdate: z.boolean(),
  disabledReason: z.string().optional(),
  fieldMask: FieldMaskSchema,
  sectionMask: SectionMaskSchema,
});
export type DocumentWorkspaceDraftContext = z.infer<typeof DocumentWorkspaceDraftContextSchema>;

export const DocumentAutosaveConfigSchema = z.object({
  enabled: z.boolean().default(false),
  debounceMs: z.number().int().min(250).max(10_000).default(1_500),
  pauseOnError: z.boolean().default(true),
});
export type DocumentAutosaveConfig = z.infer<typeof DocumentAutosaveConfigSchema>;

export const DEFAULT_AUTOSAVE_CONFIG: DocumentAutosaveConfig = {
  enabled: false,
  debounceMs: 1_500,
  pauseOnError: true,
};

export function readAutosaveConfig(
  displayConfig: Record<string, unknown> | null | undefined,
): DocumentAutosaveConfig {
  if (!displayConfig || typeof displayConfig !== "object") return DEFAULT_AUTOSAVE_CONFIG;
  const raw = displayConfig["autosave"];
  if (raw == null || typeof raw !== "object") return DEFAULT_AUTOSAVE_CONFIG;
  const parsed = DocumentAutosaveConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_AUTOSAVE_CONFIG;
}

export const DocumentPendingDeltaModeSchema = z.enum(["off", "simple", "full"]).default("off");
export type DocumentPendingDeltaMode = z.infer<typeof DocumentPendingDeltaModeSchema>;
export const DEFAULT_PENDING_DELTA_MODE: DocumentPendingDeltaMode = "off";

export function readPendingDeltaMode(
  displayConfig: Record<string, unknown> | null | undefined,
): DocumentPendingDeltaMode {
  if (!displayConfig || typeof displayConfig !== "object") return DEFAULT_PENDING_DELTA_MODE;
  const raw = displayConfig["pending_delta"];
  if (raw === undefined) return DEFAULT_PENDING_DELTA_MODE;
  const parsed = DocumentPendingDeltaModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PENDING_DELTA_MODE;
}
