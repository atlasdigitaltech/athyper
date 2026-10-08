import { ENTITY_LIST_RENDERABLE_MODES } from "@athyper/contract-platform-entity-list";
import {
  MAX_LIST_FILTERS,
  MAX_LIST_FILTER_DEPTH,
  MAX_LIST_PAGE_SIZE,
  MAX_LIST_SORT_LEVELS,
} from "./list-limits.js";

/** Implementation contract of the shared generic record query/repository pair.
 * This is not a publication receipt, storage grant or deployed F6/F8 evidence.
 * Feature-specific board/calendar/Gantt resolvers are outside this bounded profile.
 */
export const GENERIC_RECORD_READ_CAPABILITIES = Object.freeze({
  owner: "shared.records",
  key: "entity.record.query",
  version: 1,
  readMode: "generic",
  backingKinds: Object.freeze(["table"] as const),
  modes: ENTITY_LIST_RENDERABLE_MODES,
  countModes: Object.freeze(["exact", "none"] as const),
  maximumPageSize: MAX_LIST_PAGE_SIZE,
  maximumPageSizeChoices: MAX_LIST_PAGE_SIZE,
  maximumSortLevels: MAX_LIST_SORT_LEVELS,
  maximumFilters: MAX_LIST_FILTERS,
  maximumFilterDepth: MAX_LIST_FILTER_DEPTH,
});
