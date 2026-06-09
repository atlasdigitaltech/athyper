/**
 * @athyper/entity-runtime — EntityHeader telemetry event constants
 *
 * Import these constants wherever header events are emitted so that
 * event names stay consistent across atoms and adapters.
 */

export const ENTITY_HEADER_EVENTS = {
  MODE_CHANGED:    "entity_header.mode_changed",
  RAIL_TOGGLED:    "entity_header.rail_toggled",
  TAB_CHANGED:     "entity_header.tab_changed",
  ACTION_CLICKED:  "entity_header.action_clicked",
  BACK_CLICKED:    "entity_header.back_clicked",
} as const;

export type EntityHeaderEvent =
  (typeof ENTITY_HEADER_EVENTS)[keyof typeof ENTITY_HEADER_EVENTS];
