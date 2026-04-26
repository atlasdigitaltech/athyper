export { EntityWorkspaceShell, type EntityWorkspaceShellProps } from "./EntityWorkspaceShell";
export { useEntityEdit } from "./useEntityEdit";
export { EditGuardContext, type EditGuardContextValue } from "./EditGuardContext";
export type { EntityEditState, EntityEditSaveResult, EditGuardAction } from "./types";

// ── Phase 6.0 / 6.2 — Generic meta-edit runtime ──────────────────────────────
export { useEntityEditState, type UseEntityEditStateOptions, type EntityEditStateResult } from "./useEntityEditState";
export { GenericMetaEditPage, type GenericMetaEditPageProps } from "./GenericMetaEditPage";
export { GenericMetaEditForm, type GenericMetaEditFormProps } from "./GenericMetaEditForm";
export { buildTier1Adapter } from "./buildTier1Adapter";
export { buildDescriptorFromCompiledEntity } from "./buildDescriptorFromCompiledEntity";
export {
  registerEntityEditAdapter,
  getEntityEditAdapter,
  type EntityEditAdapter,
  type EntityEditableField,
  type EntityEditPolicy,
  type ValidationResult,
  type FieldRenderer,
  type SectionRenderer,
  type EntityEditAdapterContext,
} from "./adapter";
