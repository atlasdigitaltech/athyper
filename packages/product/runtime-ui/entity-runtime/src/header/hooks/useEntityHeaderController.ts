"use client";

import { useState, useCallback } from "react";
import type { EntityHeaderController, EntityHeaderModel, HeaderTab } from "../types";

/**
 * Manages an EntityHeaderModel in local state and exposes a controller
 * for patching lazy tab counts as async queries resolve.
 *
 * Usage:
 *   const ctrl = useEntityHeaderController(initialModel);
 *   // as count queries resolve:
 *   useEffect(() => ctrl.patchTabCount("comments", n), [n]);
 *   // render:
 *   <EntityHeader model={ctrl.model} ... />
 */
export function useEntityHeaderController(
  initialModel: EntityHeaderModel,
): EntityHeaderController {
  const [model, setModel] = useState<EntityHeaderModel>(initialModel);

  const patchTabCount = useCallback((tabId: string, count: number) => {
    setModel(prev => ({
      ...prev,
      tabs: patchTab(prev.tabs, tabId, { count, countPending: false }),
    }));
  }, []);

  const patchTabPending = useCallback((tabId: string, pending: boolean) => {
    setModel(prev => ({
      ...prev,
      tabs: patchTab(prev.tabs, tabId, { countPending: pending }),
    }));
  }, []);

  return { model, patchTabCount, patchTabPending };
}

function patchTab(
  tabs: HeaderTab[] | undefined,
  tabId: string,
  patch: Partial<HeaderTab>,
): HeaderTab[] | undefined {
  if (!tabs) return tabs;
  return tabs.map(t => (t.id === tabId ? { ...t, ...patch } : t));
}
