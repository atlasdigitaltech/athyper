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
import { useQueryClient } from "@tanstack/react-query";
import type {
  MetaEntityRuntimeDescriptor,
  SurfaceToolbarAction,
} from "@athyper/runtime-contracts";
import { CompiledEntityCacheScopeProvider } from "@athyper/runtime-line-item";
import { aggregateToolbarActions } from "./action-registry";
import {
  useDocumentChildren,
  type DocumentChildBindings,
  type DocumentChildRelations,
  type DocumentChildrenResult,
} from "./use-document-children";
import {
  useDocumentRules,
  type DocumentRuleSet,
} from "./use-document-rules";
import {
  DocumentEditCoordinatorProvider,
  type DocumentEditCoordinatorIdentity,
  type DocumentEditFetch,
  type DocumentEditOpenResult,
  seedDocumentOpenProjections,
} from "./document-edit-coordinator";

// ─── Public types ────────────────────────────────────────────────────

export interface DocumentRuntimeConflict {
  message: string;
  /** Optional v2 id returned by the supersede endpoint. */
  createdId?: string;
}

/**
 * Inherited-row jump channel (v3.1 Phase 3).
 *
 * Line drawers render apportioned child PCs with a `↗ from Header` chip.
 * Clicking the chip should scroll the header-scope strip into view and
 * flash the owning row. The strip surface registers a handler on mount
 * (knows how to find + scroll its own DOM); the line surface invokes
 * `jumpToHeaderRow(parentPcId)` from the click. The pub/sub pattern
 * mirrors `subscribeAction` + `dispatchAction` so a future second
 * strip (e.g. proforma header strip) can register without code changes.
 */
export type HeaderRowJumpHandler = (sourceHeaderPcId: string) => void;

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

  /**
   * Register a handler for "jump to header PC row". The header-scope
   * strip surface registers on mount and returns the unsubscribe.
   * Multiple handlers may register; all fire on dispatch. No-op when no
   * handler is registered (page rendered without the strip surface).
   */
  registerHeaderRowJumpHandler: (handler: HeaderRowJumpHandler) => () => void;
  /** Invoke registered handlers. Called by line drawers from the ↗ chip. */
  jumpToHeaderRow: HeaderRowJumpHandler;
}

const DocumentRuntimeContextObject = createContext<DocumentRuntimeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────

export interface DocumentRuntimeContextProviderProps {
  descriptor:  MetaEntityRuntimeDescriptor;
  recordId:    string;
  record:      Record<string, unknown>;
  /**
   * Relation names for child fetches. Caller resolves these from the
   * descriptor's polymorphic_pc_lines surface config. Legacy binding
   * codes are accepted only as a compatibility fallback.
   */
  relations?:  DocumentChildRelations;
  bindings?:   DocumentChildBindings;
  /**
   * Enables Document Edit Runtime v5 coordinator when descriptor.editRuntime is
   * present. Required instead of inferred because cache identity is security
   * sensitive: tenant/principal/permission-stamp must be exact.
   */
  editCoordinatorIdentity?: DocumentEditCoordinatorIdentity;
  editCoordinatorInitialCore?: unknown;
  editCoordinatorInitialOpen?: DocumentEditOpenResult;
  editCoordinatorFetcher?: DocumentEditFetch;
  children:    ReactNode;
}

export function DocumentRuntimeContextProvider(props: DocumentRuntimeContextProviderProps) {
  const content = (
    <CompiledEntityCacheScopeProvider scope={props.editCoordinatorIdentity}>
      <DocumentRuntimeContextBody {...props} />
    </CompiledEntityCacheScopeProvider>
  );

  if (props.descriptor.editRuntime && props.editCoordinatorIdentity) {
    return (
      <DocumentEditCoordinatorProvider
        contract={props.descriptor.editRuntime}
        entityCode={props.descriptor.entityCode}
        recordId={props.recordId}
        identity={props.editCoordinatorIdentity}
        fetcher={props.editCoordinatorFetcher}
        initialCore={props.editCoordinatorInitialCore}
        initialOpen={props.editCoordinatorInitialOpen}
      >
        {content}
      </DocumentEditCoordinatorProvider>
    );
  }

  return content;
}

function DocumentRuntimeContextBody({
  descriptor,
  recordId,
  record,
  relations,
  bindings,
  editCoordinatorIdentity,
  editCoordinatorInitialOpen,
  children,
}: DocumentRuntimeContextProviderProps) {
  const queryClient = useQueryClient();
  useMemo(() => {
    if (editCoordinatorIdentity && editCoordinatorInitialOpen) {
      seedDocumentOpenProjections(queryClient, editCoordinatorInitialOpen, editCoordinatorIdentity);
    }
  }, [editCoordinatorIdentity, editCoordinatorInitialOpen, queryClient]);

  // ── Child collections ─────────────────────────────────────────────
  const childrenResult = useDocumentChildren({
    parentId: recordId,
    entityCode: descriptor.entityCode,
    relations,
    bindings,
  });

  // ── Rules projection ──────────────────────────────────────────────
  const rulesResult = useDocumentRules({
    entityCode: descriptor.entityCode,
    identity: editCoordinatorIdentity,
    rulesVersion: readOpenRulesVersion(editCoordinatorInitialOpen),
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

  // ── Header-row jump channel (v3.1 Phase 3) ────────────────────────
  // Plain Set in a ref-style state so identity is stable across renders;
  // dispatching iterates the live set so a strip mounted after the
  // initial line drawer render still fires.
  const [jumpHandlers] = useState<Set<HeaderRowJumpHandler>>(() => new Set());
  const registerHeaderRowJumpHandler = useCallback(
    (handler: HeaderRowJumpHandler): (() => void) => {
      jumpHandlers.add(handler);
      return () => { jumpHandlers.delete(handler); };
    },
    [jumpHandlers],
  );
  const jumpToHeaderRow = useCallback((sourceHeaderPcId: string) => {
    for (const handler of jumpHandlers) handler(sourceHeaderPcId);
  }, [jumpHandlers]);

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
      registerHeaderRowJumpHandler,
      jumpToHeaderRow,
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
      registerHeaderRowJumpHandler,
      jumpToHeaderRow,
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

function readOpenRulesVersion(open: DocumentEditOpenResult | undefined): string {
  const core = open?.core;
  if (!core || typeof core !== "object" || Array.isArray(core)) return "unversioned";
  const rules = (core as Record<string, unknown>)["rules"];
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return "unversioned";
  const version = (rules as Record<string, unknown>)["version"];
  return typeof version === "string" && version ? version : "unversioned";
}

/** Optional consumer that returns null instead of throwing. */
export function useOptionalDocumentRuntimeContext(): DocumentRuntimeContextValue | null {
  return useContext(DocumentRuntimeContextObject);
}
