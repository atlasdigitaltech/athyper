"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  type LineRecord,
  MetaLineForm,
  buildCreatePayload,
  buildLinePatch,
  formatFieldValue,
  initialDraft,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "./metaLineRuntime";

export interface LineComposerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line?: DocumentLine | null;
  entityCode: string;
  recordId: string;
  currencyCode?: string;
  companyCodeId?: string;
  lineEntity?: CompiledEntity | null;
  lineEntityCode?: string | null;
  suggestBaseUrl?: string;
  classifyBaseUrl?: string;
  onMutated?: () => void;
  onDraftSubmit?: (payload: Record<string, unknown>) => void | Promise<void>;
}

function collectionUrl(entityCode: string, recordIdValue: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordIdValue)}/lines`;
}

function itemUrl(entityCode: string, recordIdValue: string, lineId: string): string {
  return `${collectionUrl(entityCode, recordIdValue)}/${encodeURIComponent(lineId)}`;
}

function titleFor(entity: CompiledEntity | null, line: DocumentLine | null | undefined): string {
  if (!line) return `Add ${entity?.entity_name ?? "line"}`;
  const titleField = resolveTitleField(entity);
  const title = titleField ? recordValue(line as LineRecord, titleField) : undefined;
  return title != null && String(title).trim() ? String(title) : `Edit ${entity?.entity_name ?? "line"}`;
}

function subtitleFor(entity: CompiledEntity | null, line: DocumentLine | null | undefined, currencyCode?: string): string | undefined {
  if (!line || !entity) return entity?.entity_name;
  const fields = entity.fields.filter((field) => field.origin !== "system").slice(0, 3);
  const parts = fields.flatMap((field) => {
    const value = recordValue(line as LineRecord, field);
    const text = formatFieldValue(value, field, currencyCode);
    return text === "-" ? [] : [`${field.label ?? field.name}: ${text}`];
  });
  return parts.length > 0 ? parts.join(" | ") : entity.entity_name;
}

export function LineComposerSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId: parentRecordId,
  currencyCode,
  lineEntity,
  lineEntityCode,
  onMutated,
  onDraftSubmit,
}: LineComposerSheetProps) {
  const fetchedLineEntity = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedLineEntity;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isNew = !line;
  const lineKey = recordId(line as LineRecord | null | undefined);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    setDraft(initialDraft(resolvedEntity, line as LineRecord | null | undefined));
    setSaveError(null);
  }, [lineKey, line, open, resolvedEntity]);

  const title = useMemo(() => titleFor(resolvedEntity, line), [line, resolvedEntity]);
  const subtitle = useMemo(
    () => subtitleFor(resolvedEntity, line, currencyCode),
    [currencyCode, line, resolvedEntity],
  );

  async function save() {
    if (!resolvedEntity) return;
    const payload = isNew
      ? buildCreatePayload(resolvedEntity, draft)
      : buildLinePatch(resolvedEntity, draft, line as LineRecord);

    if (!isNew && Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try {
        await onDraftSubmit(payload);
        onOpenChange(false);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to update draft line");
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(
        isNew ? collectionUrl(entityCode, parentRecordId) : itemUrl(entityCode, parentRecordId, lineKey),
        {
          method: isNew ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      onMutated?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="transactional"
      widthKey={`${entityCode}:meta-line-composer`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badge={resolvedEntity?.entity_name}
      title={title}
      subtitle={subtitle}
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : undefined
      }
      footerEnd={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !resolvedEntity}
            className="h-9 rounded-lg bg-foreground px-5 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {saving ? "Saving..." : onDraftSubmit ? (isNew ? "Add" : "Update") : isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      {resolvedEntity ? (
        <MetaLineForm
          entity={resolvedEntity}
          draft={draft}
          onDraftChange={setDraft}
          disabled={saving}
          mode="compose"
        />
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
