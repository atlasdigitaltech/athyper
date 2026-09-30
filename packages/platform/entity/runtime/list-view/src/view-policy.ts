import type { ListLocationStateV1 } from "@athyper/contract-platform-entity-list";
import type { EntityLookupOptions } from "@athyper/contract-platform-entity-runtime";

/** Standard views may be addressed by their key or their saved-view catalogue ID. */
export function isListViewAllowed(
  view: Pick<ListLocationStateV1, "savedViewId" | "standardViewKey">,
  allowedViewKeys?: readonly string[],
): boolean {
  if (!allowedViewKeys) return true;
  const id = view.savedViewId;
  const standard =
    view.standardViewKey ??
    (id?.startsWith("standard.") ? id.slice(9) : undefined);
  return Boolean(
    (id && (id !== "system" || !standard) && allowedViewKeys.includes(id)) ||
    (standard &&
      (allowedViewKeys.includes(standard) ||
        allowedViewKeys.includes(`standard.${standard}`))) ||
    (!id && !standard && allowedViewKeys.includes("system")),
  );
}

/** View restrictions constrain identity, while permitted settings still take effect. */
export function constrainEmbeddedViewState(
  next: ListLocationStateV1,
  current: ListLocationStateV1,
  views: EntityLookupOptions["views"],
): ListLocationStateV1 {
  return !views.allowSwitching ||
    !isListViewAllowed(next, views.allowedViewKeys)
    ? {
        ...next,
        savedViewId: current.savedViewId,
        standardViewKey: current.standardViewKey,
        baseSavedViewId: current.baseSavedViewId,
      }
    : next;
}
