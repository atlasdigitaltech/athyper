/** Narrow entry for runtime packages that host a docked tool panel (list
 * controls, record collaboration) without importing the whole shell. */
export {
  WorkspaceToolPanel,
  TOOL_PANEL_MIN_WIDTH,
  TOOL_PANEL_MAX_WIDTH,
  TOOL_PANEL_PIN_QUERY,
  type WorkspaceToolPanelLabels,
  type WorkspaceToolPanelMode,
} from "./workspace-tool-panel";
export {
  WorkspaceSidePanelContext,
  useWorkspaceSidePanel,
  type WorkspaceSidePanelRegistration,
} from "./workspace-side-panel";
export { CollectionControlPanel } from "./collection-control-panel";
