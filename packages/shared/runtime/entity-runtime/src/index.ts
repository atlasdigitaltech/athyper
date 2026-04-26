/**
 * @athyper/entity-runtime
 *
 * Master record rendering engine.
 * Renders list/detail/form pages from compiled metadata descriptors.
 *
 * Import paths:
 *   import { EntityListPage } from "@athyper/entity-runtime/list";
 *   import { EntityDetailPage } from "@athyper/entity-runtime/detail";
 *   import { EntityForm } from "@athyper/entity-runtime/form";
 *   import { registerDefaults } from "@athyper/entity-runtime/field-renderers";
 *   import { ActionBar } from "@athyper/entity-runtime/actions";
 */
export { PageShell, type PageShellProps } from "./shell";
export { PageHeader, TypeChip, ModeBadge, type PageHeaderProps } from "./shell";
export { EntityListPage, type EntityListPageProps } from "./list";
export { KanbanView, type KanbanViewProps, findKanbanGroupField } from "./list";
export { DashboardView, type DashboardViewProps } from "./list";
export { EntityDetailPage, type EntityDetailPageProps } from "./detail";
export { ApprovableDetailPage, type ApprovableDetailPageProps } from "./detail";
export { EntityForm, type EntityFormProps } from "./form";
export { ActionBar, type ActionBarProps } from "./actions";
export {
  registerFieldRenderer, resolveFieldRenderer, registerDefaults,
  type FieldRendererProps,
} from "./field-renderers";
// ── EntityHeader (types + component + atoms + hooks) ─────────────────────
export type {
  HeaderMode,
  HeaderIdentity,
  HeaderAction,
  HeaderException,
  HeaderFact,
  HeaderStatusDimension,
  HeaderProgressStage,
  HeaderProgress,
  HeaderFreshnessState,
  HeaderFreshness,
  HeaderTab,
  HeaderAuditMeta,
  EntityHeaderModel,
  EntityHeaderController,
  EntityEditSaveResult,
  EntityEditState,
  HeaderAdapterContext,
  EntityHeaderAdapter,
  SlaStatus,
} from "./header";
export type { ActionPolicy } from "./adapters";
export { EntityHeader, type EntityHeaderProps } from "./header";
export { useEntityHeaderController } from "./header";
export { ENTITY_HEADER_EVENTS } from "./header";
export {
  DEFAULT_DISPLAY_CONFIG,
  resolvePresentationConfig,
  detailRendererMap,
  listRendererMap,
  registerLinesRenderer,
  resolveLinesRenderer,
  type ResolvedDisplayConfig,
  type DetailRenderer,
  type ListRenderer,
  type ViewMode,
  type LinesRenderer,
  type LinesRendererProps,
  type DetailRendererKey,
  type ListRendererKey,
} from "./metadata";
