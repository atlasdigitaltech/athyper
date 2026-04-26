// ── Types (Phase 1) ───────────────────────────────────────────────────────
export type {
  HeaderMode,
  HeaderIdentity,
  HeaderAction,
  HeaderException,
  HeaderFact,
  HeaderStatusDimension,
  HeaderProgressStage,
  HeaderProgress,
  HeaderTab,
  HeaderAuditMeta,
  EntityHeaderModel,
  EntityHeaderController,
  EntityEditSaveResult,
  EntityEditState,
  HeaderAdapterContext,
  EntityHeaderAdapter,
  SlaStatus,
} from "./types";

// ── Main component (Phase 2) ──────────────────────────────────────────────
export { EntityHeader, type EntityHeaderProps } from "./EntityHeader";

// ── Atoms (Phase 2) ───────────────────────────────────────────────────────
export {
  EntityIdentityBar,  type EntityIdentityBarProps,
  EntityActionBar,    type EntityActionBarProps,
  EntityExceptionStrip, type EntityExceptionStripProps,
  EntityFactRail,     type EntityFactRailProps,
  EntityStatusStrip,  type EntityStatusStripProps,
  EntityProgressRow,  type EntityProgressRowProps,
  EntityTimeline,     type EntityTimelineProps,
  EntityTabBar,       type EntityTabBarProps,
} from "./atoms";

// ── Hooks (Phase 2) ───────────────────────────────────────────────────────
export { useEntityHeaderController } from "./hooks/useEntityHeaderController";
export { useRailState, type RailState } from "./hooks/useRailState";

// ── Telemetry (Phase 2) ───────────────────────────────────────────────────
export { ENTITY_HEADER_EVENTS, type EntityHeaderEvent } from "./telemetry";

// ── Fixtures — dev/test only, never import in production code ─────────────
export {
  FIXTURES,
  createInvoiceDraft,
  viewInvoiceApproved,
  editInvoiceDirty,
  viewInvoiceWithExceptions,
  viewInvoicePinned,
  viewInvoiceMobile,
} from "./fixtures";
