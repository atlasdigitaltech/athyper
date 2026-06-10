"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AttachmentsPanel,
  CommentsPanel,
  EntityContextDrawer,
  EventsPanel,
  type EntityContextDrawerAttachmentSummary,
  type EntityContextDrawerProps,
} from "../panels";
import { EntityWorkspaceShell, type EntityEditState } from "@athyper/runtime-shared/edit";
import { useOperationDispatch } from "../actions";
import { PrintPreviewModal } from "@athyper/entity-print/modal";
import { FlowModal } from "../flow";
import type {
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
  RuntimeOperationExecutionInput,
  RuntimeOperationExecutionResult,
} from "@athyper/runtime-contracts";
import { flattenRuntimeRecord, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { adaptOperation } from "@athyper/runtime-shared/meta-entity";
import { recordRecentVisit } from "@athyper/query";
import { RuntimeEditFormActionProvider } from "../edit/runtime-edit-form-actions";
import { RuntimeProcessSurface, type RuntimeProcessSurfaceId } from "../process/runtime-process-surface";
import { RuntimeRecordChrome } from "./runtime-record-chrome";
import type { RuntimeRecordChromeModel } from "./runtime-header-model";
import type { RuntimeCanvasFlags } from "../surfaces/types";

interface RuntimeRecordWorkspaceProps {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
  chrome: RuntimeRecordChromeModel;
  editMode?: boolean;
  editState?: EntityEditState;
  flags?: RuntimeCanvasFlags;
  executeOperation?: (input: RuntimeOperationExecutionInput) => Promise<RuntimeOperationExecutionResult>;
  children: ReactNode;
}

const ActiveTabContext = createContext<string | undefined>(undefined);
export function useActiveTab(): string | undefined { return useContext(ActiveTabContext); }

interface CommentsCountResponse {
  data?: unknown[];
  count?: number;
}

interface AttachmentSummaryItem {
  size_bytes?: number;
  visibility?: string | null;
  scan_status?: string | null;
  status?: string | null;
}

export function RuntimeRecordWorkspace({
  contract,
  record,
  recordId,
  processState,
  chrome,
  editMode = false,
  editState,
  flags,
  executeOperation,
  children,
}: RuntimeRecordWorkspaceProps) {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [commentsPanelCount, setCommentsPanelCount] = useState<number | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const firstTab = chrome.header.tabs?.[0]?.id;
  const [activeTab, setActiveTab] = useState(firstTab);

  const recordUuid = useMemo(() => readRecordId(record), [record]);
  const recordData = useMemo(() => flattenRuntimeRecord(record), [record]);
  const drawerEntity = useMemo(() => toDrawerEntity(contract), [contract]);
  const printEntity = useMemo(() => toPrintEntity(contract), [contract]);
  const enabledPanelIds = useMemo(
    () => new Set(recordUuid ? (chrome.platformIcons ?? []).map((icon) => icon.id) : []),
    [chrome.platformIcons, recordUuid],
  );
  const hasResolvedRecord = recordUuid !== null;
  const activeProcessSurface = resolveProcessSurfaceId(activeTab);

  useEffect(() => {
    if (!firstTab) return;
    if (!chrome.header.tabs?.some((tab) => tab.id === activeTab)) {
      setActiveTab(firstTab);
    }
  }, [activeTab, chrome.header.tabs, firstTab]);

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
    executeOperation,
  });

  const commentsCountQuery = useQuery<number>({
    queryKey: ["collab-comments", contract.entityCode, recordUuid],
    queryFn: async ({ signal }) => {
      if (!recordUuid) return 0;
      const params = new URLSearchParams({
        entityType: contract.entityCode,
        entityId: recordUuid,
        limit: "200",
      });
      const res = await fetch(`/api/collab/comments?${params}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return 0;
      const body = await res.json().catch(() => null) as CommentsCountResponse | null;
      if (typeof body?.count === "number") return body.count;
      return Array.isArray(body?.data) ? body.data.length : 0;
    },
    staleTime: 30_000,
    enabled: hasResolvedRecord && enabledPanelIds.has("comments"),
  });

  const attachmentsQuery = useQuery<AttachmentSummaryItem[]>({
    queryKey: ["attachments", contract.entityCode, recordUuid],
    queryFn: async ({ signal }) => {
      if (!recordUuid) return [];
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(contract.entityCode)}/${encodeURIComponent(recordUuid)}/attachments`,
        { signal, cache: "no-store" },
      );
      if (!res.ok) return [];
      const body = await res.json().catch(() => []);
      return Array.isArray(body) ? body as AttachmentSummaryItem[] : [];
    },
    staleTime: 30_000,
    enabled: hasResolvedRecord && enabledPanelIds.has("attachments"),
  });

  const attachmentsSummary = useMemo(
    () => summarizeAttachments(attachmentsQuery.data ?? []),
    [attachmentsQuery.data],
  );

  const commentsCount = commentsPanelCount ?? commentsCountQuery.data ?? 0;
  const platformIcons = useMemo(() => {
    if (!hasResolvedRecord) return undefined;
    return chrome.platformIcons?.map((icon) => {
      if (icon.id === "comments") {
        return {
          ...icon,
          count: commentsCount > 0 ? commentsCount : undefined,
          countPending: commentsCountQuery.isLoading,
        };
      }
      if (icon.id === "attachments") {
        return {
          ...icon,
          count: attachmentsSummary.count > 0 ? attachmentsSummary.count : undefined,
          countPending: attachmentsQuery.isLoading,
        };
      }
      return icon;
    });
  }, [
    attachmentsQuery.isLoading,
    attachmentsSummary.count,
    chrome.platformIcons,
    commentsCount,
    commentsCountQuery.isLoading,
    hasResolvedRecord,
  ]);

  const drawerChrome = useMemo(
    () => ({ ...chrome, platformIcons }),
    [chrome, platformIcons],
  );

  const content = (
    <ActiveTabContext.Provider value={activeTab}>
    <RuntimeEditFormActionProvider>
      <div className="flex flex-col gap-2.5">
        <RuntimeRecordChrome
          chrome={drawerChrome}
          editMode={editMode}
          activePlatformIcon={activePanel ?? undefined}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          onPlatformIconClick={(panelId) => {
            if (!recordUuid) return;
            if (panelId === "print") {
              setPrintOpen(true);
              return;
            }
            setActivePanel((current) => current === panelId ? null : panelId);
          }}
          onPrint={() => {
            if (recordUuid) setPrintOpen(true);
          }}
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

      <EntityContextDrawer
        open={activePanel !== null && hasResolvedRecord}
        onOpenChange={(open) => {
          if (!open) setActivePanel(null);
        }}
        activePanel={activePanel}
        widthScope="neon-entity"
        entity={drawerEntity}
        recordId={recordId}
        recordData={recordData}
        typeLabel={chrome.header.identity.typeLabel}
        identityName={chrome.header.identity.name ?? chrome.header.identity.number}
        panelCount={activePanel === "comments" ? commentsCount : null}
        attachments={attachmentsSummary}
      >
        <div className="px-6 py-5">
          {activePanel === "comments" && recordUuid && (
            <CommentsPanel
              entityCode={contract.entityCode}
              recordId={recordId}
              recordUuid={recordUuid}
              onCountChange={setCommentsPanelCount}
            />
          )}
          {activePanel === "attachments" && recordUuid && (
            <AttachmentsPanel
              entityCode={contract.entityCode}
              recordId={recordId}
              recordUuid={recordUuid}
            />
          )}
          {activePanel === "activity" && recordUuid && (
            <EventsPanel
              entityCode={contract.entityCode}
              recordId={recordId}
              recordUuid={recordUuid}
            />
          )}
        </div>
      </EntityContextDrawer>

      {printOpen && recordUuid ? (
        <PrintPreviewModal
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          entity={printEntity}
          record={{ id: recordUuid, data: recordData }}
          entityCode={contract.entityCode}
        />
      ) : null}

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

  return editState ? (
    <EntityWorkspaceShell editState={editState}>
      {content}
    </EntityWorkspaceShell>
  ) : content;
}

function resolveProcessSurfaceId(value: string | undefined): RuntimeProcessSurfaceId | null {
  if (value === "process" || value === "workflow" || value === "approvals") return "process"; // "workflow"/"approvals" = URL backward-compat aliases
  if (value === "versions") return value;
  return null;
}

function readRecordId(record: RuntimeRecordRow | undefined): string | null {
  const candidate = record?.id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function summarizeAttachments(items: AttachmentSummaryItem[]): EntityContextDrawerAttachmentSummary {
  return items.reduce<EntityContextDrawerAttachmentSummary>((summary, item) => {
    const size = typeof item.size_bytes === "number" ? item.size_bytes : 0;
    const visibility = item.visibility ?? "internal";
    const isQuarantined = item.scan_status === "quarantined" || item.status === "quarantined";

    summary.count += 1;
    summary.totalBytes += Number.isFinite(size) ? size : 0;
    if (visibility === "shared_with_supplier") summary.sharedCount += 1;
    else summary.internalCount += 1;
    if (isQuarantined) summary.quarantinedCount += 1;

    return summary;
  }, {
    count: 0,
    totalBytes: 0,
    internalCount: 0,
    sharedCount: 0,
    quarantinedCount: 0,
  });
}

function toDrawerEntity(contract: MetaEntityRuntimeDescriptor): EntityContextDrawerProps["entity"] {
  const fields = contract.fields.map((field) => ({
    id: field.key,
    name: field.name,
    column_name: field.columnName,
    label: field.label,
    data_type: field.dataType,
    origin: field.origin,
    is_readonly: field.isReadOnly,
    is_computed: field.isComputed,
    is_write_once: field.isWriteOnce,
  }));

  return {
    entity_id: contract.source.entityId ?? "00000000-0000-0000-0000-000000000000",
    entity_code: contract.entityCode,
    slug: contract.routeSlug,
    entity_name: contract.entityName,
    entity_class: contract.source.entityClass,
    table_schema: contract.source.tableSchema,
    table_name: contract.source.tableName,
    version_no: contract.source.versionNo ?? 0,
    version_hash: contract.source.versionHash ?? contract.audit.descriptorHash ?? "",
    fields,
    field_groups: [],
    display_config: {
      code_field: firstExistingField(contract, ["code", "document_no", "number", "external_code"]),
      title_field: firstExistingField(contract, ["name", "display_name", "title"]),
      subtitle_field: firstExistingField(contract, ["description", "subtitle"]),
    },
    feature_flags: {
      has_attachments: contract.capabilities.hasAttachments,
      comments_enabled: contract.capabilities.hasComments,
      event_history: contract.capabilities.hasActivityLog,
      version_control: contract.capabilities.hasVersions,
    },
    governance_level: contract.policy.governanceLevel ?? "standard",
    security_tier: contract.policy.securityTier ?? "standard",
    mutability: contract.policy.mutability === "immutable" ? "immutable" : "mutable",
    compiled_at: contract.audit.compiledAt ?? "1970-01-01T00:00:00.000Z",
    compiled_hash: contract.audit.compiledHash ?? contract.audit.descriptorHash ?? "",
  } as unknown as EntityContextDrawerProps["entity"];
}

type PrintPreviewEntity = Parameters<typeof PrintPreviewModal>[0]["entity"];

function toPrintEntity(contract: MetaEntityRuntimeDescriptor): PrintPreviewEntity {
  const displayConfig = runtimeDisplayConfig(contract);
  const fields = contract.fields.map((field) => ({
    id: field.key,
    name: field.name,
    column_name: field.columnName,
    label: field.label,
    data_type: field.dataType,
    ui_type: field.uiType ?? field.dataType,
    origin: field.origin,
    sort_order: field.order,
    is_readonly: field.isReadOnly,
    is_computed: field.isComputed,
    is_write_once: field.isWriteOnce,
    reference_config: field.referenceConfig ?? (
      field.referenceEntity
        ? { ref_entity: field.referenceEntity }
        : undefined
    ),
  }));

  return {
    entity_id: contract.source.entityId ?? "00000000-0000-0000-0000-000000000000",
    entity_code: contract.entityCode,
    slug: contract.routeSlug,
    entity_name: contract.entityName,
    entity_class: contract.source.entityClass,
    table_schema: contract.source.tableSchema,
    table_name: contract.source.tableName,
    version_no: contract.source.versionNo ?? 0,
    version_hash: contract.source.versionHash ?? contract.audit.descriptorHash ?? "",
    fields,
    field_groups: printFieldGroups(contract, displayConfig),
    display_config: {
      ...displayConfig,
      code_field: displayConfig["code_field"] ?? firstExistingField(contract, ["code", "document_no", "number", "external_code"]),
      title_field: displayConfig["title_field"] ?? firstExistingField(contract, ["name", "display_name", "title"]),
      subtitle_field: displayConfig["subtitle_field"] ?? firstExistingField(contract, ["description", "subtitle"]),
    },
    identity_config: {
      business_key_fields: [firstExistingField(contract, ["code", "document_no", "number", "external_code"]) ?? "id"],
    },
    feature_flags: {},
    data_policy: {
      pii_fields: [],
    },
    governance_level: contract.policy.governanceLevel ?? "standard",
    security_tier: contract.policy.securityTier ?? "standard",
    mutability: contract.policy.mutability === "immutable" ? "immutable" : "mutable",
    compiled_at: contract.audit.compiledAt ?? "1970-01-01T00:00:00.000Z",
    compiled_hash: contract.audit.compiledHash ?? contract.audit.descriptorHash ?? "",
  } as unknown as PrintPreviewEntity;
}

function runtimeDisplayConfig(contract: MetaEntityRuntimeDescriptor): Record<string, unknown> {
  const displayConfig = contract.extensions?.["displayConfig"];
  return isRecord(displayConfig) ? displayConfig : {};
}

function printFieldGroups(
  contract: MetaEntityRuntimeDescriptor,
  displayConfig: Record<string, unknown>,
): Array<{ group_key: string; label: string; sort_order: number; fields: string[] }> {
  const printConfig = isRecord(displayConfig["print_config"]) ? displayConfig["print_config"] : {};
  const labelOverrides = isRecord(printConfig["group_label_overrides"]) ? printConfig["group_label_overrides"] : {};
  const groupOrder = Array.isArray(printConfig["group_order"])
    ? printConfig["group_order"].filter((item): item is string => typeof item === "string")
    : [];
  const groupOrderMap = new Map(groupOrder.map((key, index) => [key, index]));
  const grouped = new Map<string, { minOrder: number; fields: string[] }>();

  for (const field of contract.fields) {
    if (!field.groupKey) continue;
    const existing = grouped.get(field.groupKey) ?? { minOrder: field.order, fields: [] };
    existing.minOrder = Math.min(existing.minOrder, field.order);
    existing.fields.push(field.name);
    grouped.set(field.groupKey, existing);
  }

  return [...grouped.entries()]
    .sort(([aKey, a], [bKey, b]) => {
      const ai = groupOrderMap.get(aKey) ?? 999;
      const bi = groupOrderMap.get(bKey) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.minOrder - b.minOrder;
    })
    .map(([groupKey, group], index) => ({
      group_key: groupKey,
      label: typeof labelOverrides[groupKey] === "string" ? labelOverrides[groupKey] : toTitleLabel(groupKey),
      sort_order: groupOrderMap.get(groupKey) ?? group.minOrder ?? index,
      fields: group.fields,
    }));
}

function firstExistingField(
  contract: MetaEntityRuntimeDescriptor,
  candidates: string[],
): string | undefined {
  return candidates.find((candidate) => (
    contract.fields.some((field) => field.name === candidate || field.columnName === candidate)
  ));
}

function firstFlatValue(data: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
