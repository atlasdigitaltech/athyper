/** Copy owned by the shared reference-select primitive.  Entity surfaces use
 * this builder rather than recreating a subtly different message object. */
export interface EntityReferenceMessages {
  readonly search: string;
  readonly recent: string;
  readonly all: string;
  readonly results: string;
  readonly empty: string;
  readonly unavailable: string;
  readonly required: string;
  readonly clear: string;
  readonly clearRecent: string;
  readonly loadMore: string;
  readonly loading: string;
}

export type EntityReferenceMessageId =
  | "entity.reference.search"
  | "entity.reference.recent"
  | "entity.reference.all"
  | "entity.reference.results"
  | "entity.reference.empty"
  | "entity.reference.unavailable"
  | "entity.reference.required"
  | "entity.reference.clear"
  | "entity.reference.clearRecent"
  | "entity.reference.loadMore"
  | "entity.reference.loading";

export function createEntityReferenceMessages(
  message: (id: EntityReferenceMessageId) => string,
): EntityReferenceMessages {
  return Object.freeze({
    search: message("entity.reference.search"),
    recent: message("entity.reference.recent"),
    all: message("entity.reference.all"),
    results: message("entity.reference.results"),
    empty: message("entity.reference.empty"),
    unavailable: message("entity.reference.unavailable"),
    required: message("entity.reference.required"),
    clear: message("entity.reference.clear"),
    clearRecent: message("entity.reference.clearRecent"),
    loadMore: message("entity.reference.loadMore"),
    loading: message("entity.reference.loading"),
  });
}
