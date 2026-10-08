/** Every list view mode the contracts reserve. Published metadata and saved
 * state may name any of these; availability is decided separately. */
export const ENTITY_LIST_VIEW_MODES = Object.freeze([
  "table",
  "compact",
  "board",
  "dashboard",
  "spreadsheet",
] as const);

/** Modes that have a shared renderer and server projection today. Authoring
 * allow-lists and the list service admit only these. */
export const ENTITY_LIST_RENDERABLE_MODES = Object.freeze([
  "table",
  "compact",
] as const);
