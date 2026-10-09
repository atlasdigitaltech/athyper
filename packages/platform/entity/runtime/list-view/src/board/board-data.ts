import { useEffect, useState } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListScopeCoordinateV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { useListPages, type ListPages } from "../list-pages";
import { laneFilter, type BoardLane } from "./board-model";

/** One lane's records: the current list query AND the lane filter, paged by
 * cursor through the same list operation as every other layout. Requests
 * start only when `enabled` (lane expanded and in view); a collapsed lane
 * keeps its loaded cards. A changed query, lane or authority starts again. */
export function useBoardLanePage(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly field: string;
  readonly lane: BoardLane;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly enabled: boolean;
  /** Changes when the list is refreshed, so lanes reload with it. */
  readonly refreshKey: string;
}): ListPages {
  const { client, descriptor, state, field, lane, scope, enabled, refreshKey } =
    input;
  return useListPages({
    client,
    descriptor,
    query: {
      ...state,
      cursor: undefined,
      pageSize: descriptor.limits.defaultPageSize,
      filters: [...state.filters, laneFilter(field, lane)],
    },
    scope,
    refreshKey,
    enabled,
  });
}

/** True once the element has scrolled into view (or when the platform cannot
 * observe visibility, in which case lanes load immediately). */
export function useInView<T extends Element>(): readonly [(element: T | null) => void, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element || visible) return;
    const View = element.ownerDocument.defaultView;
    const Observer = (View as (Window & typeof globalThis) | null)?.IntersectionObserver;
    if (!Observer) {
      setVisible(true);
      return;
    }
    const observer = new Observer((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "0px 200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, visible]);
  return [setElement, visible] as const;
}
