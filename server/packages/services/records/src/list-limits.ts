import type { EntityListMaxFilters, EntityListMaxSortLevels, EntityListMaxVisibleColumns } from "@athyper/contract-platform-entity-list";

/** Runtime copies are required because the browser contract is source-only in
 * production server images. Literal type assignments make contract drift a
 * compile-time error while keeping all server routes on one implementation. */
export const MAX_LIST_FIELDS: EntityListMaxVisibleColumns = 100;
export const MAX_LIST_FILTERS: EntityListMaxFilters = 20;
export const MAX_LIST_SORT_LEVELS: EntityListMaxSortLevels = 10;
