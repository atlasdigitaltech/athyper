import type { ReactNode } from "react";
import type {
  MetaEntityRuntimeDescriptor,
  MetaEntitySurface,
  MetaEntitySurfaceKind,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import type { RuntimeListState } from "@athyper/runtime-shared/core";

export type { RuntimeListState } from "@athyper/runtime-shared/core";

export type SurfaceKind = MetaEntitySurfaceKind;

export interface RuntimeSurfaceRendererProps {
  contract: MetaEntityRuntimeDescriptor;
  surface: MetaEntitySurface;
  record?: Record<string, unknown>;
  recordId: string;
  processState?: ProcessRuntimeState;
  detailState?: RuntimeListState;
  flags?: RuntimeCanvasFlags;
  /**
   * True when the parent shell wants the surface in editable mode.
   * Renderers that can edit should also call `useEditSessionContext()`
   * to get the live session (setHeaderField, getFieldMask, fieldErrors,
   * pendingHeaderPatch). Renderers that can't edit can safely ignore.
   */
  editMode?: boolean;
}

export type RuntimeSurfaceRenderer = (props: RuntimeSurfaceRendererProps) => ReactNode;

export type SurfaceRendererRegistry = Map<SurfaceKind, RuntimeSurfaceRenderer>;

export interface RuntimeCanvasFlags {
  groupedForms?: boolean;
  descriptorSurfaceShell?: boolean;
  enabledSurfaceKinds?: SurfaceKind[];
  disabledSurfaceKinds?: SurfaceKind[];
  /** Phase 3: use resolveFieldRenderer components instead of formatFieldValue strings */
  sharedFieldRenderers?: boolean;
  /** Render with the shared runtime-canvas record header. */
  sharedHeader?: boolean;
  /** Phase 2: route API/MODAL operations through useOperationDispatch */
  operationDispatch?: boolean;
  /** Render caller-visible workflow task operations in the header action bar. */
  workflowTaskActionsInHeader?: boolean;
  /** Suppress the compact Workflow / Approvals / Versions process tabs. */
  disabledProcessTabs?: boolean;
}

export function readRuntimeCanvasFlags(descriptor: MetaEntityRuntimeDescriptor): RuntimeCanvasFlags {
  const flags = descriptor.extensions?.["runtimeCanvasFlags"];
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return {};
  return flags as RuntimeCanvasFlags;
}
