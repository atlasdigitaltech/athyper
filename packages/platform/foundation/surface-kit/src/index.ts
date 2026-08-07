/**
 * @athyper/platform-surface-kit
 *
 * Convenience re-export package for shared surface and layout primitives.
 * Consumers get a stable, minimal import path for the most commonly used
 * shell and display building blocks from @athyper/platform-ui.
 */

export {
  SurfaceHeader,
  type SurfaceHeaderProps,
  type SurfaceHeaderKind,
  type SurfaceHeaderBack,
  type SurfaceHeaderFact,
  type SurfaceHeaderNavigationItem,
} from "@athyper/platform-ui/surfaces";

export { WorkPanel, type WorkPanelProps } from "@athyper/platform-ui/surfaces";
export { StatePanel, type StatePanelProps } from "@athyper/platform-ui/surfaces";

export { PageFrame, type PageFrameProps } from "@athyper/platform-ui/layout";
export { PanelGrid, type PanelGridProps } from "@athyper/platform-ui/layout";

export {
  MetricStrip,
  type MetricStripProps,
  type Metric,
  type MetricTone,
} from "@athyper/platform-ui/data";

export { ToolbarButton, type ToolbarButtonProps } from "@athyper/platform-ui/primitives";
export { BoundaryBanner, type BoundaryBannerProps } from "@athyper/platform-ui/composites";
