"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@athyper/ui/primitives";
import { Button } from "@athyper/ui/primitives";
import {
  DocumentObjectPage,
  EditDraftProvider,
  useDocumentDirtyMap,
  useDocumentEditDraft,
  useDocumentPageController,
  useLazyDocumentSections,
  usePinOnScroll,
  type DocumentEditDraftSaveCallback,
  type DocumentSectionDescriptor,
} from "@athyper/content-ui";
import {
  DocumentWorkspaceDraftContextSchema,
  type DocumentAutosaveConfig,
} from "@athyper/api-contracts/document-edit-draft";
import type { DocumentEditSubmitResponseV1 } from "@athyper/api-contracts/document-edit-submit";
import type {
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import { flattenRuntimeRecord, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { adaptOperation } from "@athyper/runtime-shared/meta-entity";
import { useOperationDispatch } from "../actions";
import { EnteringEditSkeleton } from "../edit/entering-edit-skeleton";
import { FlowModal } from "../flow";
import { RuntimeRecordChrome } from "./runtime-record-chrome";
import { DocumentChromeActionBar } from "./document-chrome-action-bar";
import type { RuntimeRecordChromeModel } from "./runtime-header-model";
import { useContainingScrollRoot } from "./use-containing-scroll-root";
import {
  ContextDrawerHost,
  PrintPreviewHost,
  buildContextDrawerEntity,
  useContextDrawer,
  usePrintPreview,
} from "../panels";
import type { RuntimeCanvasFlags } from "../surfaces/types";
import type { SnapshotChildContracts } from "../process/snapshot-field-rules";
import {
  DocumentEditRequestError,
  useDocumentEditCoordinator,
  useOptionalDocumentEditSection,
} from "../document-runtime/document-edit-coordinator";
import { useOptionalDocumentRuntimeContext } from "../document-runtime/document-runtime-context";
import { markDocumentEditPerformanceOnce } from "../document-runtime/document-edit-performance-marks";
import {
  RuntimeProcessSurface,
  resolveProcessSurfaceId,
  type RuntimeProcessSurfaceId,
} from "../process/runtime-process-surface";

/**
 * Object-page workspace — sibling to `RuntimeRecordWorkspace`.
 *
 * `RuntimeRecordWorkspace` is the generic record shell: tabs are click-
 * driven and edit state is the simple `EntityEditState` contract from
 * `@athyper/runtime-shared`. That model works fine for masters and ledgers
 * but is too thin for document workflows that need scrollspy-synced tabs,
 * server-truthed field masks, ETag conflict recovery, and a
 * bundled lines transaction.
 *
 * This workspace composes the full Phase 4-12 stack from `@athyper/content-ui`:
 *
 *   - `useDocumentEditDraft`     — etag-based concurrency, fieldMask + sectionMask, autosave
 *   - coordinator event stream   — one SSE owner for document invalidations
 *   - `useDocumentPageController`+ `useDocumentScrollSpy` — scroll-synced tab activation
 *   - `useLazyDocumentSections`  — lazy section data gating
 *   - `usePinOnScroll`           — derived header mode (expanded → pinned past threshold)
 *   - `useDocumentDirtyMap`      — section-level dirty + error badges
 *
 * Section content is the consumer's responsibility — `renderSection` is
 * called per descriptor and the consumer wires its own queries, panels,
 * and sub-components. Children wrapped in `EditDraftProvider` see the
 * live draft via `useEditDraftContext`, which is what `MassEditSheet`
 * (and any future per-line action sheet) keys off of.
 *
 * Save conflicts are recovered from the authoritative optimistic-concurrency
 * response. Event-driven cache invalidation belongs to the coordinator.
 */

export interface DocumentObjectPageWorkspaceProps {
  contract: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
  recordId: string;
  recordUuid: string;
  processState?: ProcessRuntimeState;
  chrome: RuntimeRecordChromeModel;

  /** Ordered list of sections to render, identical to the EntityHeader tab strip. */
  sections: DocumentSectionDescriptor<string>[];
  /** Render contents of a single section. Called per descriptor in `sections`. */
  renderSection: (descriptor: DocumentSectionDescriptor<string>) => ReactNode;
  /** Distance below the viewport at which near-viewport sections hydrate. */
  sectionPrefetchDistance?: number;
  /**
   * Surfaces with `placement: "header"` render here — between the chrome
   * and the section loop, inside the workspace's EditDraftProvider so
   * the consumer's render tree can call `useEditDraftContext()`.
   *
   * Cleanup Plan v5 §P6 F2 — `document_header` surface mount slot.
   * Pass `undefined` when no header-placed surfaces exist; the slot then
   * renders nothing and the layout collapses to chrome + sections.
   */

  autosave?: DocumentAutosaveConfig;
  onSaveSuccess?: (response: DocumentEditSubmitResponseV1) => void;
  /**
   * Called when the user resolves a version-conflict dialog with "Reload".
   * Should refetch the record + re-enter edit mode.
   */
  onRefreshRecord: () => Promise<void> | void;

  /**
   * When true, the workspace fires `enterEdit()` on mount. Use on routes
   * where the URL itself conveys intent to edit (e.g. `/.../[id]/edit`).
   * When false (default), the consumer drives entry via an Edit affordance
   * in the chrome / header actions.
   */
  autoEnterEdit?: boolean;

  /**
   * Optional. Called when the user confirms a baseline reversal. Implementations
   * should POST to the entity's explicit revert-to-baseline endpoint, which reverts
   * committed child edits (lines / AD / PC / SL) back to the last
   * authoring_lock snapshot. The workspace's local edit-discard always
   * fires afterward to clear the in-memory draft buffer.
   *
   * Return:
   *  - { ok: true }                         on successful revert
   *  - { ok: false, code: "NO_BASELINE…" }  when no prior submission exists;
   *    the workspace still does a local-only discard in this case so the
   *    user's intent is honoured even on a brand-new draft
   *  - { ok: false, message }               for other errors; the workspace
   *    keeps the confirm dialog open so the user can see the message
   *
   * Pass undefined for entity types that don't expose a baseline-reversal
   * operation. Recovery-draft discard remains available independently.
   */
  onRevertToBaseline?: (workspaceId: string, sourceTabId: string) => Promise<
    | { ok: true }
    | { ok: false; code?: string; message?: string }
  >;
  /** Deletes an EARLY_DRAFT provisional business record through its explicit lifecycle endpoint. */
  onDeleteDraft?: () => Promise<{ ok: true } | { ok: false; message?: string }>;

  flags?: RuntimeCanvasFlags;

  /**
   * Optional bundle of per-section child descriptors that the snapshot
   * Versions/Compare drawers consume for descriptor-aware row rendering.
   * The host app prefetches this on the server. Absent / empty → drawers
   * fall back to raw column names for non-header sections.
   */
  snapshotChildContracts?: SnapshotChildContracts;
}

const PIN_ON_SCROLL_THRESHOLD = 96;
const CHILD_TABLE_SECTION_KINDS = new Set([
  "line_items",
  "child_records",
  "polymorphic_pc_lines",
  "header_scope_pc_strip",
  "document_lines",
  "document_components",
  "document_schedules",
  "document_accounting",
]);

export function DocumentObjectPageWorkspace({
  contract,
  recordId,
  recordUuid,
  record,
  processState,
  chrome,
  sections,
  renderSection,
  sectionPrefetchDistance,
  autoEnterEdit,
  autosave,
  onSaveSuccess,
  onRefreshRecord,
  onRevertToBaseline,
  onDeleteDraft,
  flags,
  snapshotChildContracts,
}: DocumentObjectPageWorkspaceProps) {
  const editCoordinator = useDocumentEditCoordinator();
  const { scopeRef, scrollRoot } = useContainingScrollRoot<HTMLDivElement>();

  // ── Process-tab mount (Versions / Compare / Lifecycle / Audit) ───────────
  // `activeSectionId` is driven by IntersectionObserver scroll detection —
  // letting it own process-tab ids would force the IO to know about non-
  // section ids. A second state cleanly separates "scroll-driven section
  // view" from "user explicitly opened a process surface". When non-null
  // the body swaps from <DocumentObjectPage> to <RuntimeProcessSurface>.
  //
  // Reset triggers:
  //   - recordId change   — fresh record always opens in section view
  //   - edit mode entered — process tabs are filtered out of the chrome
  //     anyway (see chromeWithBadges below); also clear state so the body
  //     doesn't briefly render a stale process surface during the flip
  const [activeProcessTab, setActiveProcessTab] = useState<RuntimeProcessSurfaceId | null>(null);

  // ── Context drawer (comments / attachments / activity) ────────────────────
  const recordData = useMemo(() => flattenRuntimeRecord(record), [record]);
  const drawerEntity = useMemo(() => buildContextDrawerEntity(contract), [contract]);
  const drawer = useContextDrawer({
    entityCode: contract.entityCode,
    recordId,
    recordUuid,
    platformIcons: chrome.platformIcons,
  });
  const print = usePrintPreview();

  const adaptedOps = useMemo(
    () => (flags?.operationDispatch
      ? contract.operations.map((operation) => ({
          ...adaptOperation(operation),
          id: operation.key,
        }))
      : []),
    [contract.operations, flags?.operationDispatch],
  );

  const statusFieldName = useMemo(
    () => contract.fields.find((field) => (
      field.name === "status" || field.name === "lifecycle_state"
    ))?.name,
    [contract.fields],
  );

  const operationDispatch = useOperationDispatch({
    entityCode: contract.entityCode,
    recordId,
    recordUuid,
    statusFieldName,
  });

  // ── Edit session ──────────────────────────────────────────────────────────
  const submitWorkspaceChanges = useCallback<DocumentEditDraftSaveCallback>(async (changes, etag) => {
    try {
      const response = await editCoordinator.submitWorkspaceChanges({ etag, changes });
      return {
        type: "ok",
        response,
      };
    } catch (error) {
      if (!(error instanceof DocumentEditRequestError)) {
        return { type: "error", message: error instanceof Error ? error.message : String(error) };
      }
      const body = isRecord(error.body) ? error.body : {};
      if (error.status === 412 || error.code === "VERSION_CONFLICT") {
        return {
          type: "conflict",
          currentEtag: typeof body["currentEtag"] === "string" ? body["currentEtag"] : undefined,
          message: error.message,
        };
      }
      if (error.status === 422) {
        return {
          type: "validation",
          message: error.message,
          fieldErrors: normalizeSubmitFieldErrors(body["fieldErrors"]),
        };
      }
      return { type: "error", message: error.message };
    }
  }, [editCoordinator]);

  const loadWorkspaceContext = useCallback(async () => {
    const opened = await editCoordinator.openWorkspace();
    const core = isRecord(opened.core) ? opened.core : {};
    return DocumentWorkspaceDraftContextSchema.parse(core["draftContext"]);
  }, [editCoordinator]);

  const editSession = useDocumentEditDraft({
    enabled: true,
    loadWorkspaceContext,
    submitWorkspaceChanges,
    onSaveSuccess,
    autosave,
  });

  // Auto-enter edit when the URL conveys intent (e.g. `/.../[id]/edit`). The
  // ref gate ensures `enterEdit()` fires exactly once across re-renders even
  // if `autoEnterEdit` toggles. Idempotent on the hook side: a second call
  // while `isEditing` is true returns early.
  const autoEnterFiredRef = useRef(false);
  useEffect(() => {
    if (!autoEnterEdit) return;
    if (autoEnterFiredRef.current) return;
    autoEnterFiredRef.current = true;
    void editSession.enterEdit();
  }, [autoEnterEdit, editSession]);

  const runtimeContext = useOptionalDocumentRuntimeContext();
  const firstEditableFieldRenderedRef = useRef(false);
  const rulesReady = runtimeContext ? !runtimeContext.rulesLoading : false;
  const lineMetadataReady = runtimeContext ? !runtimeContext.children.isLoading : false;

  const markFirstEditableFieldRendered = useCallback(() => {
    if (!editSession.isEditing) return;
    if (firstEditableFieldRenderedRef.current) return;
    firstEditableFieldRenderedRef.current = true;
    markDocumentEditPerformanceOnce("first-editable-field-rendered");
  }, [editSession.isEditing]);

  useEffect(() => {
    if (
      !editSession.isEditing
      || !firstEditableFieldRenderedRef.current
      || !rulesReady
      || !lineMetadataReady
    ) {
      return;
    }
    markDocumentEditPerformanceOnce("editor-fully-interactive");
  }, [editSession.isEditing, lineMetadataReady, rulesReady]);

  // ── Section controller + scrollspy ────────────────────────────────────────
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const sectionsKey = useMemo(
    () => sections.map((s) => `${s.id}|${s.hash ?? ""}`).join(","),
    [sections],
  );

  const { sectionByHash, sectionById } = useMemo(() => {
    const byHash = new Map<string, string>();
    const byId = new Map<string, string>();
    for (const s of sections) {
      byHash.set(s.hash ?? s.id, s.id);
      byId.set(s.id, s.hash ?? s.id);
    }
    return { sectionByHash: byHash, sectionById: byId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey]);

  const pageController = useDocumentPageController({
    sectionIds,
    hashFor: (id) => sectionById.get(id) ?? id,
    idForHash: (hash) => sectionByHash.get(hash) ?? null,
    scrollRoot,
  });
  const {
    activeSectionId,
    registerSectionRef: registerPageSectionRef,
    scrollToSection,
  } = pageController;

  const lazy = useLazyDocumentSections({
    sections,
    enabled: true,
    prefetchDistance: sectionPrefetchDistance,
    initialLoadedIds: activeSectionId
      ? [activeSectionId]
      : [],
  });
  const {
    markLoaded: markSectionLoaded,
    register: registerLazySection,
    shouldLoad: shouldLoadSection,
  } = lazy;

  const markSectionsThrough = useCallback(
    (sectionId: string) => {
      const activeIndex = sections.findIndex((section) => section.id === sectionId);
      const ids = activeIndex >= 0
        ? sections.slice(0, activeIndex + 1).map((section) => section.id)
        : [sectionId];
      for (const id of ids) markSectionLoaded(id);
    },
    [markSectionLoaded, sections],
  );

  useEffect(() => {
    if (!activeSectionId) return;
    markSectionsThrough(activeSectionId);
  }, [activeSectionId, markSectionsThrough]);

  // Reset process-tab mount on record nav. Fresh record always opens in
  // section view; otherwise a stale process surface would briefly render
  // before chrome state catches up.
  useEffect(() => {
    setActiveProcessTab(null);
  }, [recordId]);

  // Defensive: if edit mode flips on while a process tab is active (e.g.
  // user clicked Edit from a header action that's visible regardless),
  // drop back to section view so the in-edit chrome filter + body match.
  useEffect(() => {
    if (editSession.isEditing) setActiveProcessTab(null);
  }, [editSession.isEditing]);

  const registerSectionRef = useCallback(
    (id: string, el: HTMLElement | null) => {
      registerPageSectionRef(id, el);
      registerLazySection(id, el);
    },
    [registerLazySection, registerPageSectionRef],
  );

  // ── Pin-on-scroll → header mode ───────────────────────────────────────────
  const isHeaderPinned = usePinOnScroll({
    threshold: PIN_ON_SCROLL_THRESHOLD,
    scrollRoot,
  });
  const headerMode = isHeaderPinned ? "pinned" : "expanded";

  // ── Dirty map → tab badges + jump-to-error ────────────────────────────────
  // Only header fields are surfaced as section badges here; lines-bundle
  // dirtiness shows up on the dedicated lines section through its own
  // descriptor's `hasEditableFields` signal.
  const dirtyMap = useDocumentDirtyMap({
    sections,
    pendingPatch: editSession.pendingHeaderPatch,
    fieldErrors: editSession.fieldErrors,
  });

  // ── Version-conflict recovery ─────────────────────────────────────────────
  const handleRefreshAfterConflict = useCallback(async () => {
    await onRefreshRecord();
  }, [onRefreshRecord]);

  // ── Inject section badges (dirty / error) into the header tab model ───────
  // Also drop process tabs (Versions / Lifecycle / Audit / Process) while
  // editing — they're meta surfaces, meaningless mid-edit, and a footgun
  // for accidentally navigating away from in-flight draft work.
  const chromeWithBadges = useMemo(() => {
    const filtered = editSession.isEditing
      ? chrome.header.tabs?.filter((tab) => !resolveProcessSurfaceId(tab.id))
      : chrome.header.tabs;
    const badged = filtered?.map((tab) => {
      const errorCount = dirtyMap.errorCountBySection[tab.id] ?? 0;
      if (errorCount > 0) {
        return { ...tab, badge: { type: "error" as const, count: errorCount } };
      }
      if (dirtyMap.dirtySectionIds.has(tab.id)) {
        return { ...tab, badge: { type: "dirty" as const } };
      }
      return tab;
    });
    if (!badged) return chrome;
    return { ...chrome, header: { ...chrome.header, tabs: badged } };
  }, [chrome, dirtyMap.dirtySectionIds, dirtyMap.errorCountBySection, editSession.isEditing]);

  // Save / Discard are now owned by DocumentChromeActionBar (mounted via
  // RuntimeRecordChrome's actionLeadingSlot). The workspace's only chrome
  // responsibility in edit mode is to (a) strip the __edit/__view actions
  // the model emits — the bar's View|Edit pill replaces them — and (b) hide
  // forward-only primary actions (lifecycle: Submit/Post/Void; workflow_task:
  // Approve/Deny/RequestInfo) so the chrome reads as a single forward path
  // (Save), not a noisy band of disabled-and-greyed buttons next to it. Those
  // ops reappear automatically the moment the user exits edit mode.
  // Generic primary actions (export, print, record-scoped like Duplicate)
  // stay visible — they're orthogonal to save semantics.
  const editIsEditing = editSession.isEditing;

  const chromeWithEditActions = useMemo<RuntimeRecordChromeModel>(() => {
    const stripped = chromeWithBadges.header.actions.filter(
      (a) => a.id !== "__edit" && a.id !== "__view",
    );

    if (!editIsEditing) {
      return {
        ...chromeWithBadges,
        header: { ...chromeWithBadges.header, actions: stripped },
      };
    }

    const filtered = stripped.filter((a) => {
      if (a.placement !== "primary") return true;
      const actionGroup = a.group ?? "record";
      return actionGroup !== "lifecycle" && actionGroup !== "workflow_task";
    });

    return {
      ...chromeWithBadges,
      header: { ...chromeWithBadges.header, actions: filtered },
    };
  }, [chromeWithBadges, editIsEditing]);

  // Overlay the drawer's enriched platform icons (with badge counts) onto the
  // chrome model the chrome component consumes.
  const chromeForRender = useMemo<RuntimeRecordChromeModel>(
    () => ({ ...chromeWithEditActions, platformIcons: drawer.enrichedPlatformIcons }),
    [chromeWithEditActions, drawer.enrichedPlatformIcons],
  );

  // ── Section render gate (lazy data) ───────────────────────────────────────
  const renderSectionGated = useCallback(
    (descriptor: DocumentSectionDescriptor<string>) => {
      if (!shouldLoadSection(descriptor.id)) return null;
      return (
        <WorkspaceSectionHydrator
          sectionKey={descriptor.hash ?? descriptor.id.replace(/^surface_/, "")}
          onRender={markFirstEditableFieldRendered}
        >
          {renderSection(descriptor)}
        </WorkspaceSectionHydrator>
      );
    },
    [markFirstEditableFieldRendered, renderSection, shouldLoadSection],
  );

  // ── Section nav handlers ──────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (id: string) => {
      // Process tabs (versions / lifecycle / audit / process) live in a
      // separate body slot — don't scroll, just flip the mount.
      const processId = resolveProcessSurfaceId(id);
      if (processId) {
        setActiveProcessTab(processId);
        return;
      }
      // Section tab → leave process mode (if any) and resume normal scroll.
      setActiveProcessTab(null);
      markSectionsThrough(id);
      scrollToSection(id, "tabClick");
    },
    [markSectionsThrough, scrollToSection],
  );

  return (
    <EditDraftProvider value={editSession}>
      <div ref={scopeRef} className="flex flex-col gap-2.5">
        {/* While auto-enter-edit is loading the server's edit context, show
            a small "Entering edit mode…" skeleton above the chrome so the
            user gets immediate intent feedback rather than a view-mode
            flash before the Editing chip + Save/Discard actions render. */}
        <EnteringEditSkeleton
          visible={
            Boolean(autoEnterEdit)
            && !editSession.isEditing
            && editSession.contextError === null
          }
        />

        <RuntimeRecordChrome
          chrome={chromeForRender}
          editMode={editSession.isEditing}
          hideEditingBadge
          mode={headerMode}
          activeTab={activeProcessTab ?? activeSectionId}
          onActiveTabChange={handleTabChange}
          activePlatformIcon={drawer.activePlatformIcon}
          onPlatformIconClick={drawer.onPlatformIconClick}
          onPrint={print.openPrint}
          flags={flags}
          adaptedOps={adaptedOps}
          operationDispatch={operationDispatch}
          actionLeadingSlot={
            <DocumentChromeActionBar
              mode={editSession.isEditing ? "edit" : "view"}
              viewHref={chromeForRender.actionHrefs["__view"] ?? ""}
              editHref={chromeForRender.actionHrefs["__edit"] ?? ""}
              canEdit={Boolean(
                contract.capabilities.canEdit && !contract.capabilities.isReadOnly,
              )}
              editDisabledReason={chromeWithBadges.header.actions.find(
                (a) => a.id === "__edit",
              )?.disabledReason}
              onRevertToBaseline={onRevertToBaseline}
              onDeleteDraft={onDeleteDraft}
              onRefreshRecord={onRefreshRecord}
            />
          }
        />

        {activeProcessTab ? (
          <RuntimeProcessSurface
            activeSurface={activeProcessTab}
            contract={contract}
            record={record}
            recordId={recordId}
            processState={processState}
            snapshotChildContracts={snapshotChildContracts}
          />
        ) : (
          <DocumentObjectPage
            sections={sections}
            registerSectionRef={registerSectionRef}
            renderSection={renderSectionGated}
            resolveTitle={resolveSectionTitle}
          />
        )}
      </div>

      <ContextDrawerHost
        entity={drawerEntity}
        entityCode={contract.entityCode}
        recordId={recordId}
        recordUuid={recordUuid}
        recordData={recordData}
        activePanel={drawer.activePanel}
        onClose={drawer.close}
        typeLabel={chrome.header.identity.typeLabel}
        identityName={chrome.header.identity.name ?? chrome.header.identity.number}
        commentsCount={drawer.commentsCount}
        attachmentsSummary={drawer.attachmentsSummary}
        onCommentsCountChange={drawer.onCommentsCountChange}
      />

      <PrintPreviewHost
        contract={contract}
        entityCode={contract.entityCode}
        recordUuid={recordUuid}
        recordData={recordData}
        open={print.isOpen}
        onClose={print.close}
      />

      {flags?.operationDispatch && operationDispatch.isModalOpen && operationDispatch.activeBundle ? (
        <FlowModal
          open={operationDispatch.isModalOpen}
          onClose={operationDispatch.closeModal}
          bundle={operationDispatch.activeBundle}
          userPermissions={[]}
          onSubmit={operationDispatch.submitModal}
          submitting={operationDispatch.isSubmitting}
        />
      ) : null}

      {/* Reactive conflict recovery from the authoritative save response. */}
      <Dialog
        open={editSession.saveStatus === "conflict"}
        onOpenChange={(open) => { if (!open) editSession.discard(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document changed on the server</DialogTitle>
            <DialogDescription>
              {editSession.saveError ?? "Another user updated this document while you were editing."}
              {" "}
              Reload to merge their changes, or discard yours and exit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                editSession.discard();
                editSession.exitEdit({ discardDirty: true });
                void handleRefreshAfterConflict();
              }}
            >
              Discard my changes
            </Button>
            <Button
              onClick={async () => {
                await editSession.refreshContext();
                await handleRefreshAfterConflict();
              }}
            >
              Reload &amp; keep editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </EditDraftProvider>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function WorkspaceSectionHydrator({
  sectionKey,
  onRender,
  children,
}: {
  sectionKey: string;
  onRender?: () => void;
  children: ReactNode;
}) {
  useOptionalDocumentEditSection(sectionKey, { enabled: true });
  useEffect(() => {
    onRender?.();
  }, [onRender]);
  return <>{children}</>;
}

function normalizeSubmitFieldErrors(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([field, message]) => {
    if (typeof message === "string") return [[field, message]];
    if (Array.isArray(message)) {
      const messages = message.filter((entry): entry is string => typeof entry === "string");
      return messages.length > 0 ? [[field, messages.join(" ")]] : [];
    }
    return [];
  }));
}

function resolveSectionTitle(descriptor: DocumentSectionDescriptor<string>): string | undefined {
  return CHILD_TABLE_SECTION_KINDS.has(descriptor.kind) ? undefined : descriptor.label;
}
