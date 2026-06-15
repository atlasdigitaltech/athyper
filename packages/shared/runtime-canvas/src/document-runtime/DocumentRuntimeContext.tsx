"use client";

/**
 * @athyper/runtime-canvas — DocumentRuntimeContext provider.
 *
 * Cleanup Plan v5 §3 (target architecture) + amendment 8 (idempotent
 * registries) + amendment 9 (deny-by-default affordances) + amendment 3
 * (declarative toolbar action aggregation).
 *
 * Wraps the render loop in DocumentObjectPageWorkspace. Aggregates the
 * cross-surface state so each surface renderer can read shared data
 * from a single context instead of fetching its own copy:
 *
 *   - lines, pricingComponents.{ all, headerScope, byLineId },
 *     distributions.{ all, byLineId }            (via useDocumentChildren)
 *   - rules.{ field_rules, action_rules }        (via useDocumentRules)
 *   - actions: aggregated toolbar action map     (via aggregateToolbarActions)
 *   - dispatch(actionCode)                        for header → other surfaces
 *   - conflict banner state                       for 409 supersede outcomes
 *
 * The provider is the ONLY place where Sprint 3+4 hooks run for a
 * given page — amendment 2's "single canonical line collection per
 * document page" lives here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  MetaEntityRuntimeDescriptor,
  SurfaceToolbarAction,
} from "@athyper/runtime-contracts";
import { aggregateToolbarActions } from "./action-registry";
import {
  useDocumentChildren,
  type DocumentChildBindings,
  type DocumentChildrenResult,
} from "./useDocumentChildren";
import {
  useDocumentRules,
  type DocumentRuleSet,
} from "./useDocumentRules";

// ─── Public types ────────────────────────────────────────────────────

export interface DocumentRuntimeConflict {
  message: string;
  /** Optional v2 id returned by the supersede endpoint. */
  createdId?: string;
}

export interface DocumentRuntimeContextValue {
  /** The descriptor that drove this page mount. */
  descriptor:  MetaEntityRuntimeDescriptor;
  /** Parent record id (e.g. PI id). */
  recordId:    string;
  /** Flattened parent record. */
  record:      Record<string, unknown>;

  /** Aggregated child collections — single source of truth. */
  children:    DocumentChildrenResult;

  /** Field + action rule projection. Null while loading. */
  rules:       DocumentRuleSet | null;
  rulesLoading: boolean;
  rulesError:  Error | null;

  /** Toolbar actions aggregated from surfaces (amendment 3). */
  toolbarActions: ReadonlyMap<string, SurfaceToolbarAction>;
  /** Dispatch a toolbar action — header invokes; other surfaces subscribe. */
  dispatchAction: (actionCode: string) => void;
  /** Listener registration (returns unsubscribe). Surfaces subscribe to
   *  the actions they own. */
  subscribeAction: (actionCode: string, listener: () => void) => () => void;

  /** 409 conflict surface set by supersede mutations. */
  conflict:       DocumentRuntimeConflict | null;
  setConflict:    (conflict: DocumentRuntimeConflict | null) => void;
}

const DocumentRuntimeContextObject = createContext<DocumentRuntimeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────

export interface DocumentRuntimeContextProviderProps {
  descriptor:  MetaEntityRuntimeDescriptor;
  recordId:    string;
  record:      Record<string, unknown>;
  /**
   * Binding codes for child fetches. Caller resolves these from the
   * descriptor's polymorphic_pc_lines surface config OR provides them
   * explicitly. When omitted, useDocumentChildren returns empty
   * collections (no fetch).
   */
  bindings?:   DocumentChildBindings;
  children:    ReactNode;
}

export function DocumentRuntimeContextProvider({
  descriptor,
  recordId,
  record,
  bindings,
  children,
}: DocumentRuntimeContextProviderProps) {
  // ── Child collections ─────────────────────────────────────────────
  const childrenResult = useDocumentChildren({
    parentId: recordId,
    bindings: bindings ?? { line: "" }, // empty fetches when omitted
  });

  // ── Rules projection ──────────────────────────────────────────────
  const rulesResult = useDocumentRules({
    entityCode: descriptor.entityCode,
  });

  // ── Toolbar action aggregation (amendment 3) ──────────────────────
  const toolbarActions = useMemo(
    () => aggregateToolbarActions(descriptor.surfaces),
    [descriptor.surfaces],
  );

  // ── Action dispatch / subscription pub/sub ────────────────────────
  const [listeners] = useState<Map<string, Set<() => void>>>(() => new Map());

  const dispatchAction = useCallback((actionCode: string) => {
    const subs = listeners.get(actionCode);
    if (!subs) return;
    for (const listener of subs) listener();
  }, [listeners]);

  const subscribeAction = useCallback((actionCode: string, listener: () => void) => {
    let subs = listeners.get(actionCode);
    if (!subs) {
      subs = new Set();
      listeners.set(actionCode, subs);
    }
    subs.add(listener);
    return () => {
      subs!.delete(listener);
      if (subs!.size === 0) listeners.delete(actionCode);
    };
  }, [listeners]);

  // ── Conflict surface ──────────────────────────────────────────────
  const [conflict, setConflict] = useState<DocumentRuntimeConflict | null>(null);

  const value: DocumentRuntimeContextValue = useMemo(
    () => ({
      descriptor,
      recordId,
      record,
      children: childrenResult,
      rules:        rulesResult.rules,
      rulesLoading: rulesResult.isLoading,
      rulesError:   rulesResult.error,
      toolbarActions,
      dispatchAction,
      subscribeAction,
      conflict,
      setConflict,
    }),
    [
      descriptor,
      recordId,
      record,
      childrenResult,
      rulesResult.rules,
      rulesResult.isLoading,
      rulesResult.error,
      toolbarActions,
      dispatchAction,
      subscribeAction,
      conflict,
    ],
  );

  return (
    <DocumentRuntimeContextObject.Provider value={value}>
      {children}
    </DocumentRuntimeContextObject.Provider>
  );
}

// ─── Consumer hook ───────────────────────────────────────────────────

export function useDocumentRuntimeContext(): DocumentRuntimeContextValue {
  const value = useContext(DocumentRuntimeContextObject);
  if (!value) {
    throw new Error(
      "useDocumentRuntimeContext must be called inside <DocumentRuntimeContextProvider>.",
    );
  }
  return value;
}

/** Optional consumer that returns null instead of throwing. */
export function useOptionalDocumentRuntimeContext(): DocumentRuntimeContextValue | null {
  return useContext(DocumentRuntimeContextObject);
}
