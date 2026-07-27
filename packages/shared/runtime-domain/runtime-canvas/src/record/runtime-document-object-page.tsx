"use client";

/**
 * Generic object-page client wrapper shared by both view + edit routes:
 *   - `/app/[entity]/[id]`        → autoEnterEdit unset → read-only render
 *   - `/app/[entity]/[id]/edit`   → autoEnterEdit=true  → enters edit on mount
 *
 * Renders `DocumentObjectPageWorkspace` for any entity whose descriptor
 * declares `renderer === "document"`. Master / ledger / simple entities
 * continue to render via `RuntimeEditPage` / `RuntimeDetailPage`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DocumentObjectPageWorkspace } from "./document-object-page-workspace";
import { buildRuntimeRecordChromeModel, type RuntimeRecordChromeModel } from "./runtime-header-model";
import { getSurfaceRenderer } from "../surfaces/registry";
import { isProcessTabId } from "../process/runtime-process-surface";
import { readRuntimeCanvasFlags } from "../surfaces/types";
import { RecordWorkspaceQueryBoundary } from "../record-query";
import {
  buildDocumentEditEndpoints,
  fetchDocumentEditOpen,
  markDocumentEditPerformance,
  markDocumentEditPerformanceOnce,
  DocumentRuntimeContextProvider,
  type DocumentEditCoordinatorIdentity,
  type DocumentEditOpenResult,
  type DocumentChildRelations,
} from "../document-runtime";
import type { SnapshotChildContracts } from "../process/snapshot-field-rules";
import {
  useEditDraftContext,
  type DocumentSectionDescriptor,
} from "@athyper/content-ui";
import type { DocumentEditSubmitResponseV1 } from "@athyper/api-contracts/document-edit-submit";
import type {
  EffectiveRecordWorkspaceManifest,
  MetaEntityRuntimeDescriptor,
  MetaEntitySurfaceKind,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import {
  flattenRuntimeRecord,
  type RuntimeRecordRow,
} from "@athyper/runtime-shared/core";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";
import {
  applyRuntimeDocumentPlanePolicy,
  type RuntimeDocumentPlaneAdapter,
} from "./runtime-document-plane-adapter";

export interface RuntimeDocumentObjectPageProps {
  entityCode: string;
  recordId: string;
  recordUuid: string;
  descriptor: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
  adapter: RuntimeDocumentPlaneAdapter;
  processState?: ProcessRuntimeState;
  workspaceManifest?: EffectiveRecordWorkspaceManifest;
  /**
   * When true (typical for `/.../[id]/edit` routes), the workspace fires
   * `enterEdit()` on mount. When omitted/false (typical for view routes at
   * `/.../[id]`), the page renders read-only until the user clicks Edit
   * in the chrome action bar, which navigates to the `/edit` URL.
   */
  autoEnterEdit?: boolean;
  /** Compatibility-only value; record routes now resolve this on Versions intent. */
  snapshotChildContracts?: SnapshotChildContracts;
  /**
   * Optional v5 edit-runtime cache identity. Must be produced server-side from
   * the authenticated session/permission stamp; the client intentionally does
   * not guess this from public session data.
   */
  editCoordinatorIdentity?: DocumentEditCoordinatorIdentity;
  editCoordinatorInitialCore?: unknown;
  editCoordinatorInitialOpen?: DocumentEditOpenResult;
}

export function DocumentEditBootstrapClient({
  entityCode,
  recordId,
  identity,
  adapter,
}: {
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  adapter: RuntimeDocumentPlaneAdapter;
}) {
  const editRscNavigationCompletedRef = useRef(false);
  const openQuery = useQuery({
    queryKey: ["document-edit-open", entityCode, recordId, identity.permissionStamp] as const,
    queryFn: () => {
      markDocumentEditPerformance("document-open-started");
      return fetchDocumentEditOpen(
        adapter.transport,
        buildDocumentEditEndpoints(entityCode, recordId).open,
        identity,
      );
    },
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (openQuery.isLoading || openQuery.isFetching) return;
    if (openQuery.isError || !openQuery.data) return;
    if (editRscNavigationCompletedRef.current) return;
    editRscNavigationCompletedRef.current = true;
    markDocumentEditPerformanceOnce("edit-rsc-navigation-completed");
  }, [
    openQuery.isError,
    openQuery.isFetching,
    openQuery.isLoading,
    openQuery.data,
  ]);

  if (openQuery.isLoading) {
    return <main className="min-h-[40vh] animate-pulse rounded-lg bg-muted/20" aria-label="Opening document editor" />;
  }
  if (openQuery.isError || !openQuery.data) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-destructive">
        {openQuery.error instanceof Error ? openQuery.error.message : "The document editor could not be opened."}
      </main>
    );
  }

  const core = isRecord(openQuery.data.core) ? openQuery.data.core : {};
  const record = isRecord(core["record"]) ? core["record"] as RuntimeRecordRow : null;
  const descriptor = isRecord(core["descriptor"])
    ? core["descriptor"] as MetaEntityRuntimeDescriptor
    : null;
  if (!record || !descriptor) {
    return <main className="p-6 text-sm text-destructive">OPEN did not return the complete document bootstrap.</main>;
  }
  const recordUuid = typeof record.id === "string" && record.id ? record.id : recordId;
  return (
    <RuntimeDocumentObjectPage
      entityCode={entityCode}
      recordId={recordId}
      recordUuid={recordUuid}
      descriptor={descriptor}
      record={record}
      adapter={adapter}
      processState={isRecord(core["processState"]) ? core["processState"] as ProcessRuntimeState : undefined}
      editCoordinatorIdentity={identity}
      editCoordinatorInitialCore={core}
      editCoordinatorInitialOpen={openQuery.data}
      autoEnterEdit
    />
  );
}

/**
 * Surfaces rendered as side drawers (context panels), not as object-page
 * sections. Mirrors `DescriptorSurfaceShell`.
 */
const CONTEXT_PANEL_KINDS: ReadonlySet<MetaEntitySurfaceKind> = new Set<MetaEntitySurfaceKind>([
  "attachments",
  "comments",
  "activity_log",
  "audit_trail",
  "versions",
  "compare",
]);

/**
 * Document-runtime child relations are declared on the
 * `polymorphic_pc_lines` surface (Cleanup Plan v5 §P5a). When that
 * surface is absent — e.g. a document entity without a PC/AD model —
 * the provider mounts with no relations and `useDocumentChildren`
 * returns empty collections without firing any fetch.
 */
function extractDocumentChildRelations(
  descriptor: MetaEntityRuntimeDescriptor,
): DocumentChildRelations | undefined {
  // Phase 2 — accept legacy `polymorphic_pc_lines` and generic `document_lines`.
  // Both kinds carry the same `config.relations` shape; the registry routes
  // the kind to the same renderer during the compatibility window.
  const surface = descriptor.surfaces.find(
    (s) => s.kind === "polymorphic_pc_lines" || s.kind === "document_lines",
  );
  const declaredRelations = new Map<string, string>();
  for (const relation of descriptor.relations) {
    declaredRelations.set(relation.key, relation.name);
    declaredRelations.set(relation.name, relation.name);
  }
  if (surface && (surface.kind === "polymorphic_pc_lines" || surface.kind === "document_lines")) {
    const relations = surface.config.relations;
    if (!relations) return undefined;

    const lines = declaredRelationOrUndefined(relations?.lines, declaredRelations);
    if (!lines) return undefined;
    return {
      surfaceKey: surface.key,
      lines,
      pricingComponents: declaredRelationOrUndefined(relations.pricingComponents, declaredRelations),
      distributions: declaredRelationOrUndefined(relations.distributions, declaredRelations),
      schedules: declaredRelationOrUndefined(relations.schedules, declaredRelations),
    };
  }

  // Metadata-native fallback for document descriptors that expose a standard
  // line_items surface without the richer polymorphic document surface.
  const lineSurface = descriptor.surfaces.find((candidate) => candidate.kind === "line_items");
  if (
    lineSurface?.kind === "line_items"
    && lineSurface.relationName
    && declaredRelations.has(lineSurface.relationName)
  ) {
    return {
      surfaceKey: lineSurface.key,
      lines: declaredRelations.get(lineSurface.relationName)!,
    };
  }
  return undefined;
}

function declaredRelationOrUndefined(
  relationName: string | undefined,
  declaredRelations: ReadonlyMap<string, string>,
): string | undefined {
  return relationName ? declaredRelations.get(relationName) : undefined;
}

export function RuntimeDocumentObjectPage({
  entityCode,
  recordId,
  recordUuid,
  descriptor: sourceDescriptor,
  record: sourceRecord,
  adapter,
  processState,
  workspaceManifest,
  autoEnterEdit = false,
  snapshotChildContracts,
  editCoordinatorIdentity,
  editCoordinatorInitialCore,
  editCoordinatorInitialOpen,
}: RuntimeDocumentObjectPageProps) {
  const openedAtRef = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const policy = useMemo(
    () => applyRuntimeDocumentPlanePolicy(sourceDescriptor, sourceRecord, adapter),
    [adapter, sourceDescriptor, sourceRecord],
  );
  const descriptor = policy.descriptor;
  const record = policy.record;
  const flags = useMemo(() => readRuntimeCanvasFlags(descriptor), [descriptor]);
  const [optimisticRecord, setOptimisticRecord] = useState<RuntimeRecordRow | null>(null);
  const effectiveRecord = optimisticRecord ?? record;

  useEffect(() => {
    setOptimisticRecord(null);
  }, [record, recordId]);
  useEffect(() => {
    emitSurfaceEvent({
      name: "surface_opened",
      plane: adapter.plane,
      scopeType: adapter.plane === "mesh" ? "network_account" : adapter.plane === "admin" ? "platform" : "tenant",
      surfaceCode: `document.${descriptor.entityCode}`,
      route: adapter.resolveDeepLink({ entityCode, recordId, destination: "detail" }),
      durationMs: performance.now() - openedAtRef.current,
      result: "success",
    });
  }, [adapter, descriptor.entityCode, entityCode, recordId]);

  // ── Chrome ────────────────────────────────────────────────────────────────
  // Chrome mode tracks the URL intent so the action set surfaces correctly:
  // view route (autoEnterEdit=false) → "detail" → Edit button + Print icon
  // edit route (autoEnterEdit=true)  → "edit"   → Save button, no Print
  // The Edit action in detail mode navigates to `/.../[id]/edit`, where
  // autoEnterEdit then fires `enterEdit()` automatically.
  const chromeMode = autoEnterEdit ? "edit" : "detail";
  const baseChrome = useMemo<RuntimeRecordChromeModel>(
    () => buildRuntimeRecordChromeModel({
      contract: descriptor,
      record: effectiveRecord,
      recordId,
      mode: chromeMode,
      processState,
      flags,
    }),
    [descriptor, effectiveRecord, recordId, chromeMode, processState, flags],
  );

  // ── Sections derived from main surfaces ───────────────────────────────────
  const mainSurfaces = useMemo(
    () => descriptor.surfaces
      .filter((s) => s.enabled && !CONTEXT_PANEL_KINDS.has(s.kind))
      .filter((s) => s.placement === "main")
      .filter((s) => !flags.disabledSurfaceKinds?.includes(s.kind))
      .sort((a, b) => a.order - b.order),
    [descriptor.surfaces, flags.disabledSurfaceKinds],
  );

  // ── Header-placed surfaces ────────────────────────────────────────────────
  // Cleanup Plan v5 §P6 F2 — surfaces seeded with `placement: "header"`
  // (today: PI `document_header`) render once above the section loop,
  // not inside the scrollspy tab system. Order is preserved so multiple
  // header surfaces stack predictably.
  const sections = useMemo<DocumentSectionDescriptor<string>[]>(
    () => mainSurfaces.map((surface, idx) => ({
      id: `surface_${surface.key}`,
      label: surface.label ?? surface.kind,
      kind: surface.kind,
      // First section eager so the page renders content immediately;
      // subsequent sections defer queries until they approach the viewport.
      loadPolicy: idx === 0 ? "eager" : "nearViewport",
      hash: surface.key,
    })),
    [mainSurfaces],
  );

  const chrome = useMemo<RuntimeRecordChromeModel>(
    () => {
      // Section tabs use the `surface_*` id namespace so they line up with
      // the doc workspace's IntersectionObserver-tracked section refs.
      const sectionTabs = sections.map((s) => ({ id: s.id, label: s.label }));
      // Process tabs (versions / lifecycle / audit / process) come straight
      // from baseChrome's resolveProcessTabs output. Filter, don't redefine,
      // so badge counts + ordering stay authoritative.
      const processTabs = (baseChrome.header.tabs ?? []).filter((t) => isProcessTabId(t.id));
      return {
        ...baseChrome,
        header: {
          ...baseChrome.header,
          tabs: [...sectionTabs, ...processTabs],
        },
      };
    },
    [baseChrome, sections],
  );

  // ── Per-section renderer ──────────────────────────────────────────────────
  const recordData = useMemo(() => flattenRuntimeRecord(effectiveRecord), [effectiveRecord]);

  // ── DocumentRuntimeContext relations ──────────────────────────────────────
  // Derived from the descriptor's `polymorphic_pc_lines` surface config; when
  // absent the provider becomes a no-op shell (action pub/sub + rules without
  // child fetches). Mounted unconditionally so any surface renderer can
  // safely call useDocumentRuntimeContext() — failing closed if any surface
  // depends on context that the provider never supplies is fine, throwing
  // because the provider was never mounted is not.
  const documentRelations = useMemo(
    () => extractDocumentChildRelations(descriptor),
    [descriptor],
  );

  const renderSection = useCallback(
    (descr: DocumentSectionDescriptor<string>) => {
      const surface = mainSurfaces.find((s) => `surface_${s.key}` === descr.id);
      if (!surface) return null;
      const Renderer = getSurfaceRenderer(surface.kind);
      if (!Renderer) return null;
      // Wrapper reads the live edit session from context (provided by the
      // workspace via EditDraftProvider) and forwards `editMode` to the
      // renderer. Renderers that don't support editing simply ignore it.
      return (
        <SurfaceEditModeSlot>
          {(editMode) => (
            <Renderer
              contract={descriptor}
              surface={surface}
              record={recordData}
              recordId={recordId}
              processState={processState}
              flags={flags}
              editMode={editMode}
            />
          )}
        </SurfaceEditModeSlot>
      );
    },
    [mainSurfaces, descriptor, recordData, recordId, processState, flags],
  );

  // ── Header surface slot ───────────────────────────────────────────────────
  // Built outside the workspace JSX so the slot ReactNode is stable across
  // workspace re-renders. The rendered children mount INSIDE the workspace's
  // EditDraftProvider (slot is a prop, evaluated lazily at render time),
  // so SurfaceEditModeSlot resolves the live session correctly.
  // ── Edit-session transport ────────────────────────────────────────────────
  const onRefreshRecord = useCallback(() => {
    return adapter.refresh();
  }, [adapter]);

  const onSaveSuccess = useCallback((response: DocumentEditSubmitResponseV1) => {
    setOptimisticRecord({
      ...record,
      ...response.record,
      data: {
        ...(record.data ?? {}),
        ...(response.record.data ?? {}),
      },
    });
    void adapter.refresh();
    emitSurfaceEvent({
      name: "document_actioned",
      plane: adapter.plane,
      scopeType: adapter.plane === "mesh" ? "network_account" : adapter.plane === "admin" ? "platform" : "tenant",
      surfaceCode: `document.${descriptor.entityCode}`,
      route: adapter.resolveDeepLink({ entityCode, recordId, destination: "detail" }),
      durationMs: 0,
      result: "success",
    });
  }, [adapter, descriptor.entityCode, entityCode, record, recordId]);

  const deleteDraftAttemptRef = useRef<string | null>(null);
  const onDeleteDraft = useCallback(async () => {
    deleteDraftAttemptRef.current ??= typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `delete_draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const response = await adapter.transport(
        `/api/runtime/v1/entities/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/draft/discard`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": deleteDraftAttemptRef.current,
          },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        return { ok: false as const, message: body?.message ?? `Draft deletion failed (${response.status}).` };
      }
      deleteDraftAttemptRef.current = null;
      adapter.replace(adapter.resolveDeepLink({
        entityCode,
        recordId,
        destination: "list",
      }));
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [adapter, entityCode, recordId]);

  // Baseline reversal is a separate business operation and is only exposed
  // for entity types with a dedicated permission, preflight and audit path.
  // Today that is purchase invoice only.
  const onRevertToBaseline = useCallback(async (workspaceId: string, sourceTabId: string) => {
    if (entityCode !== "purchase_invoice") {
      return { ok: false as const, code: "UNSUPPORTED", message: "Baseline reversal is not wired for this entity type" };
    }
    try {
      const res = await adapter.transport(
        `/api/runtime/v1/entities/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/edit/revert-to-baseline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Document-Edit-Workspace": workspaceId,
          },
          body: JSON.stringify({ operation: "revert_to_baseline", sourceTabId }),
        },
      );
      if (res.ok) return { ok: true as const };
      const body = await res.json().catch(() => null) as
        | { error?: string; message?: string }
        | null;
      return {
        ok:      false as const,
        code:    body?.error,
        message: body?.message ?? `Discard failed (${res.status})`,
      };
    } catch (err) {
      return {
        ok:      false as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }, [adapter, entityCode, recordId]);

  return (
    <RecordWorkspaceQueryBoundary manifest={workspaceManifest}>
      <DocumentRuntimeContextProvider
        descriptor={descriptor}
        recordId={recordId}
        record={recordData}
        relations={documentRelations}
        editCoordinatorIdentity={editCoordinatorIdentity}
        editCoordinatorInitialCore={editCoordinatorInitialCore}
        editCoordinatorInitialOpen={editCoordinatorInitialOpen}
      >
        <DocumentObjectPageWorkspace
        contract={descriptor}
        record={effectiveRecord}
        recordId={recordId}
        recordUuid={recordUuid}
        processState={processState}
        workspaceManifest={workspaceManifest}
        chrome={chrome}
        sections={sections}
        renderSection={renderSection}
        sectionPrefetchDistance={descriptor.createMode === "EARLY_DRAFT" && recordData["is_provisional"] === true
          ? 200
          : undefined}
        onSaveSuccess={onSaveSuccess}
        onRefreshRecord={onRefreshRecord}
        onRevertToBaseline={entityCode === "purchase_invoice" ? onRevertToBaseline : undefined}
        onDeleteDraft={descriptor.createMode === "EARLY_DRAFT" && recordData["is_provisional"] === true
          ? onDeleteDraft
          : undefined}
        autoEnterEdit={autoEnterEdit && adapter.mutationMode === "full"}
        flags={flags}
        snapshotChildContracts={snapshotChildContracts}
        />
      </DocumentRuntimeContextProvider>
    </RecordWorkspaceQueryBoundary>
  );
}

// Lives inside the workspace's EditDraftProvider, so the context lookup
// here returns the live session. The render prop pattern keeps the consumer
// signature tight without forcing every surface renderer to consume context.
function SurfaceEditModeSlot({
  children,
}: {
  children: (editMode: boolean) => ReactNode;
}) {
  const session = useEditDraftContext();
  return <>{children(Boolean(session?.isEditing))}</>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
