"use client";

import type { ReactNode } from "react";
import { Clock, Lock, MessageSquare, Paperclip, type LucideIcon } from "lucide-react";
import { formatBytes } from "@athyper/runtime-shared/core";
import { DrawerHeaderTitle } from "@athyper/platform-ui";
import { DrawerPeekShell } from "@athyper/platform-ui/surfaces/shells";

const PANEL_META: Record<string, { label: string; Icon: LucideIcon }> = {
  comments:    { label: "Comments",    Icon: MessageSquare },
  attachments: { label: "Attachments", Icon: Paperclip },
  activity:    { label: "Activity",    Icon: Clock },
};

export interface EntityContextDrawerAttachmentSummary {
  count: number;
  totalBytes: number;
  internalCount: number;
  sharedCount: number;
  quarantinedCount: number;
}

export interface RuntimeContextDrawerEntity {
  entity_id?: string;
  entity_code: string;
  slug?: string;
  entity_name: string;
  entity_class?: string;
  table_schema?: string;
  table_name?: string;
  fields?: RuntimeContextDrawerField[];
  display_config?: RuntimeContextDrawerDisplayConfig;
  feature_flags?: Record<string, unknown>;
}

export interface RuntimeContextDrawerField {
  id?: string;
  name: string;
  column_name?: string;
  label?: string;
  data_type?: string;
}

export interface RuntimeContextDrawerDisplayConfig {
  code_field?: string;
  title_field?: string;
  subtitle_field?: string;
  document_header?: {
    type_label?: string;
  };
}

export interface EntityContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePanel: string | null;
  widthScope: string;
  entity: RuntimeContextDrawerEntity;
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

function fieldValueByName(
  entity: RuntimeContextDrawerEntity,
  data: Record<string, unknown>,
  fieldName: string | undefined,
): unknown {
  if (!fieldName) return undefined;
  if (Object.hasOwn(data, fieldName)) return data[fieldName];
  const field = entity.fields?.find((item) => item.name === fieldName || item.column_name === fieldName);
  if (field?.name && Object.hasOwn(data, field.name)) return data[field.name];
  if (field?.column_name && Object.hasOwn(data, field.column_name)) return data[field.column_name];
  return undefined;
}

function resolveIdentitySubtitle(
  entity: RuntimeContextDrawerEntity,
  data: Record<string, unknown>,
  recordId: string,
  identityName?: string | null,
): string {
  const numberField = entity.display_config?.code_field;
  const titleField = entity.display_config?.title_field;
  const subtitleField = entity.display_config?.subtitle_field;
  const number = text(fieldValueByName(entity, data, numberField)) ?? recordId;
  const title = text(identityName)
    ?? text(fieldValueByName(entity, data, titleField !== numberField ? titleField : undefined))
    ?? text(fieldValueByName(entity, data, subtitleField));

  if (!title || title === number) return number;
  return `${number} - ${title}`;
}

function attachmentSubtitle(
  base: string,
  summary: EntityContextDrawerAttachmentSummary | undefined,
): ReactNode {
  if (!summary || summary.count === 0) return base;

  const sizeStr = formatBytes(summary.totalBytes);
  if (summary.quarantinedCount > 0) {
    return `${base} - ${sizeStr} - ${summary.internalCount} internal - ${summary.quarantinedCount} quarantined`;
  }
  if (summary.sharedCount > 0) {
    return `${base} - ${sizeStr} - ${summary.internalCount} internal - ${summary.sharedCount} shared`;
  }
  return (
    <>
      {base}{" - "}{sizeStr}{" - "}
      <Lock className="inline size-3 align-middle opacity-60" />
      {" All internal"}
    </>
  );
}

function panelTitle(activePanel: string | null, count: number | null | undefined): ReactNode {
  if (!activePanel) return "";

  const meta = PANEL_META[activePanel];
  const label = meta?.label ?? activePanel;
  const Icon = meta?.Icon;

  return <DrawerHeaderTitle title={label} icon={Icon} count={count} />;
}

export function EntityContextDrawer({
  open,
  onOpenChange,
  activePanel,
  widthScope,
  entity,
  recordId,
  recordData,
  identityName,
  panelCount,
  attachments,
  headerRight,
  children,
}: EntityContextDrawerProps) {
  const identitySubtitle = resolveIdentitySubtitle(entity, recordData, recordId, identityName);
  const titleCount = activePanel === "attachments" ? attachments?.count : panelCount;

  return (
    <DrawerPeekShell
      open={open}
      onOpenChange={onOpenChange}
      widthKey={activePanel ? `${widthScope}:${entity.entity_code}:${activePanel}` : undefined}
      defaultWidth="80vw"
      minWidth="30vw"
      expandedWidth="80vw"
      maxWidth="85vw"
      title={panelTitle(activePanel, titleCount)}
      subtitle={activePanel === "attachments" ? attachmentSubtitle(identitySubtitle, attachments) : identitySubtitle}
      actions={headerRight}
    >
      {children}
    </DrawerPeekShell>
  );
}
