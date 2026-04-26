// Re-export the core edit contracts from the header types so consumers can
// import everything from "@athyper/entity-runtime/edit" without needing to
// know about the internal header barrel.
export type {
  EntityEditSaveResult,
  EntityEditState,
} from "../header/types";

/**
 * What the user chose to do when the navigation guard prompt appeared.
 *   "stay"           → dismissed the modal; remains on the page
 *   "discard"        → discarded all unsaved changes and navigated away
 *   "save_and_leave" → saved successfully and navigated away
 */
export type EditGuardAction = "stay" | "discard" | "save_and_leave";
