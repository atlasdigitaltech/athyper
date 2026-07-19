"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePinOnScroll } from "@athyper/content-ui";
import {
  ContextDrawerHost,
  PrintPreviewHost,
  buildContextDrawerEntity,
  useContextDrawer,
  usePrintPreview,
} from "../panels";
import { EntityWorkspaceShell, type EntityEditState } from "@athyper/runtime-shared";
import { useOperationDispatch } from "../actions";
import { FlowModal } from "../flow";
import type {
  EffectiveRecordWorkspaceManifest,
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
  RuntimeOperationExecutionInput,
  RuntimeOperationExecutionResult,
} from "@athyper/runtime-contracts";
import { flattenRuntimeRecord, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { adaptOperation } from "@athyper/runtime-shared/meta-entity";
import { recordRecentVisit } from "@athyper/query";
import { RuntimeEditFormActionProvider } from "../edit/runtime-edit-form-actions";
import { RuntimeEditGuardDialog } from "../edit/runtime-edit-guard-dialog";
import {
  RuntimeProcessSurface,
  isRecordWorkspaceProcessSurfaceSupported,
  resolveProcessSurfaceId,
} from "../process/runtime-process-surface";
import { RuntimeRecordChrome } from "./runtime-record-chrome";
import type { RuntimeRecordChromeModel } from "./runtime-header-model";
import { useContainingScrollRoot } from "./use-containing-scroll-root";
import { SurfaceStackProvider } from "@athyper/ui/surfaces/stack";
import type { RuntimeCanvasFlags } from "../surfaces/types";
import { useRecordWorkspaceObservability } from "./use-record-workspace-observability";
import { RecordWorkspaceQueryBoundary } from "../record-query";

interface RuntimeRecordWorkspaceProps {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
  workspaceManifest?: EffectiveRecordWorkspaceManifest;
  chrome: RuntimeRecordChromeModel;
  editMode?: boolean;
  editState?: EntityEditState;
  flags?: RuntimeCanvasFlags;
  executeOperation?: (input: RuntimeOperationExecutionInput) => Promise<RuntimeOperationExecutionResult>;
  children: ReactNode;
}

const ActiveTabContext = createContext<string | undefined>(undefined);
export function useActiveTab(): string | undefined { return useContext(ActiveTabContext); }

export function RuntimeRecordWorkspace({
  contract,
  record,
  recordId,
  processState,
  workspaceManifest,
  chrome,
  editMode = false,
  editState,
  flags,
  executeOperation,
  children,
}: RuntimeRecordWorkspaceProps) {
  const { scopeRef, scrollRoot } = useContainingScrollRoot<HTMLDivElement>();
  const effectiveTabs = useMemo(
    () => chrome.header.tabs?.filter((tab) => {
      const processSurface = resolveProcessSurfaceId(tab.id);
      return !processSurface
        || !workspaceManifest
        || isRecordWorkspaceProcessSurfaceSupported(workspaceManifest, processSurface);
    }),
    [chrome.header.tabs, workspaceManifest],
  );
  const firstTab = effectiveTabs?.[0]?.id;
  const [activeTab, setActiveTab] = useState(firstTab);
  // Mirror DocumentObjectPageWorkspace so master entities also pin their chrome.
  // Threshold matches the document workspace (PIN_ON_SCROLL_THRESHOLD = 96).
  const isHeaderPinned = usePinOnScroll({ threshold: 96, scrollRoot });
  const headerMode = isHeaderPinned ? "pinned" : "expanded";

  const recordUuid = useMemo(() => readRecordId(record), [record]);
  const recordData = useMemo(() => flattenRuntimeRecord(record), [record]);
  const drawerEntity = useMemo(() => buildContextDrawerEntity(contract), [contract]);
  const activeProcessSurface = resolveProcessSurfaceId(activeTab);
  const print = usePrintPreview();

  const drawer = useContextDrawer({
    entityCode: contract.entityCode,
    recordId,
    recordUuid,
    platformIcons: chrome.platformIcons,
  });

  useRecordWorkspaceObservability({
    entityCode: contract.entityCode,
    recordId,
    recordUuid,
    renderer: contract.renderer,
    activeSurface: drawer.activePanel ?? activeTab,
  });

  useEffect(() => {
    if (!firstTab) return;
    if (!effectiveTabs?.some((tab) => tab.id === activeTab)) {
      setActiveTab(firstTab);
    }
  }, [activeTab, effectiveTabs, firstTab]);

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
    () => contract.fields.find((f) => f.name === "status" || f.name === "lifecycle_state")?.name,
    [contract.fields],
  );

  useEffect(() => {
    const name = firstFlatValue(recordData, ["name", "display_name", "title"]);
    const code = firstFlatValue(recordData, ["code", "document_no", "number", "external_code"]);
    recordRecentVisit({
      href: `/app/${contract.routeSlug}/${recordId}`,
      label: name ?? code ?? contract.entityName,
      entityCode: contract.entityCode,
      entityLabel: contract.entityName,
      recordCode: code ?? undefined,
      recordName: name ?? undefined,
    });
    // fires once per record navigation; contract and recordData are stable server props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const operationDispatch = useOperationDispatch({
    entityCode: contract.entityCode,
    recordId,
    recordUuid: recordUuid ?? undefined,
    statusFieldName,
    ...(workspaceManifest ? {
      workspaceKeyInput: {
        entityCode: workspaceManifest.entityCode,
        recordId: workspaceManifest.recordId,
        cacheScopeKey: workspaceManifest.cacheScope.key,
      },
    } : {}),
    executeOperation,
  });

  const drawerChrome = useMemo(
    () => ({
      ...chrome,
      header: { ...chrome.header, tabs: effectiveTabs },
      platformIcons: drawer.enrichedPlatformIcons,
    }),
    [chrome, drawer.enrichedPlatformIcons, effectiveTabs],
  );

  const content = (
    <ActiveTabContext.Provider value={activeTab}>
    <RuntimeEditFormActionProvider>
      <div
        ref={scopeRef}
        data-athyper-record-workspace={contract.entityCode}
        className="flex min-h-full flex-col gap-1.5 bg-muted/20"
      >
        <RuntimeRecordChrome
          chrome={drawerChrome}
          editMode={editMode}
          mode={headerMode}
          activePlatformIcon={drawer.activePlatformIcon}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          onPlatformIconClick={drawer.onPlatformIconClick}
          onPrint={print.openPrint}
          flags={flags}
          adaptedOps={adaptedOps}
          operationDispatch={operationDispatch}
        />
        {activeProcessSurface ? (
          <RuntimeProcessSurface
            activeSurface={activeProcessSurface}
            contract={contract}
            record={record}
            recordId={recordId}
            processState={processState}
          />
        ) : (
          children
        )}
      </div>

      <ContextDrawerHost
        contract={contract}
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
        onAttachmentsSummaryChange={drawer.onAttachmentsSummaryChange}
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
    </RuntimeEditFormActionProvider>
    </ActiveTabContext.Provider>
  );

  return (
    <RecordWorkspaceQueryBoundary manifest={workspaceManifest}>
      <SurfaceStackProvider>
        {editState ? (
          <EntityWorkspaceShell
            editState={editState}
            renderGuardDialog={(guardProps) => <RuntimeEditGuardDialog {...guardProps} />}
          >
            {content}
          </EntityWorkspaceShell>
        ) : (
          content
        )}
      </SurfaceStackProvider>
    </RecordWorkspaceQueryBoundary>
  );
}

function readRecordId(record: RuntimeRecordRow | undefined): string | null {
  const candidate = record?.id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function firstFlatValue(data: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}
