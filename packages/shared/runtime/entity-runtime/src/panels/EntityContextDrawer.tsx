"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import { formatBytes } from "@athyper/runtime-shared/core";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";

const PANEL_LABELS: Record<string, string> = {
  comments:    "Comments",
  attachments: "Attachments",
  activity:    "Activity",
};

export interface EntityContextDrawerAttachmentSummary {
  count:            number;
  totalBytes:       number;
  internalCount:    number;
  sharedCount:      number;
  quarantinedCount: number;
}

export interface EntityContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePanel: string | null;
  widthScope: string;
  entity: CompiledEntity;
  recordId: string;
  recordData: Record<string, unknown>;
  typeLabel?: string;
  identityName?: string | null;
  panelCount?: number | null;
  attachments?: EntityContextDrawerAttachmentSummary;
  headerRight?: ReactNode;
  children?: ReactNode;
}

function text(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  return String(value);
}

function titleCaseEntityName(entityName: string): string {
  return entityName.toUpperCase().replace(/_/g, " ");
}

function firstText(data: Record<string, unknown>, fieldNames: Array<string | undefined>): string | undefined {
  for (const fieldName of fieldNames) {
    if (!fieldName) continue;
    const value = text(data[fieldName]);
    if (value) return value;
  }
  return undefined;
}

function resolveIdentitySubtitle(
  entity: CompiledEntity,
  data: Record<string, unknown>,
  recordId: string,
  identityName?: string | null,
): string {
  const displayConfig = entity.display_config;
  const documentHeader = displayConfig?.document_header;

  const numberField = documentHeader?.number_field ?? displayConfig?.code_field;
  const number = firstText(data, [
    numberField,
    "document_no",
    "code",
    "number",
  ]) ?? recordId;

  const title = text(identityName) ?? firstText(data, [
    documentHeader?.title_field,
    documentHeader?.party_name_field,
    displayConfig?.title_field !== numberField ? displayConfig?.title_field : undefined,
    displayConfig?.subtitle_field,
    "name",
    "display_name",
    "description",
    "supplier_name",
    "customer_name",
    "party_name",
    "vendor_name",
  ]);

  if (!title || title === number) return number;
  return `${number} · ${title}`;
}

function attachmentSubtitle(
  base: string,
  summary: EntityContextDrawerAttachmentSummary | undefined,
): ReactNode {
  if (!summary || summary.count === 0) return base;

  const sizeStr = formatBytes(summary.totalBytes);
  if (summary.quarantinedCount > 0) {
    return `${base} · ${sizeStr} · ${summary.internalCount} internal · ${summary.quarantinedCount} quarantined`;
  }
  if (summary.sharedCount > 0) {
    return `${base} · ${sizeStr} · ${summary.internalCount} internal · ${summary.sharedCount} shared`;
  }
  return (
    <>
      {base}{" · "}{sizeStr}{" · "}
      <Lock className="inline size-3 align-middle opacity-60" />
      {" All internal"}
    </>
  );
}

function panelTitle(activePanel: string | null, count: number | null | undefined): ReactNode {
  if (!activePanel) return "";

  const label = PANEL_LABELS[activePanel] ?? activePanel;
  if (!count || count <= 0) return label;

  return (
    <span className="flex items-center gap-2">
      {label}
      <span className="inline-flex items-center h-5 px-1.5 rounded-full text-doc-subtitle font-semibold bg-muted text-muted-foreground border border-border/60 leading-none tabular-nums">
        {count}
      </span>
    </span>
  );
}

export function EntityContextDrawer({
  open,
  onOpenChange,
  activePanel,
  widthScope,
  entity,
  recordId,
  recordData,
  typeLabel,
  identityName,
  panelCount,
  attachments,
  headerRight,
  children,
}: EntityContextDrawerProps) {
  const identitySubtitle = resolveIdentitySubtitle(entity, recordData, recordId, identityName);
  const titleCount = activePanel === "attachments" ? attachments?.count : panelCount;

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={activePanel ? `${widthScope}:${entity.entity_code}:${activePanel}` : undefined}
      defaultWidth="60vw"
      minWidth="30vw"
      expandedWidth="80vw"
      maxWidth="85vw"
      resizable
      expandable
      badge={typeLabel ?? entity.display_config?.document_header?.type_label ?? titleCaseEntityName(entity.entity_name)}
      title={panelTitle(activePanel, titleCount)}
      subtitle={activePanel === "attachments" ? attachmentSubtitle(identitySubtitle, attachments) : identitySubtitle}
      headerRight={headerRight}
    >
      {children}
    </DrawerShell>
  );
}
