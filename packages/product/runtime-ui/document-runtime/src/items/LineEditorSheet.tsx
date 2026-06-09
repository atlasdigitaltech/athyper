"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Pencil } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  type LineRecord,
  MetaLineForm,
  buildLinePatch,
  formatFieldValue,
  initialDraft,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "./metaLineRuntime";

export interface LineEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: DocumentLine;
  distributions: AccountingDistribution[];
  currencyCode?: string;
  companyCodeId?: string;
  record?: Record<string, unknown>;
  entityCode: string;
  recordId: string;
  lineEntity?: CompiledEntity | null;
  lineEntityCode?: string | null;
  readOnly?: boolean;
  canEdit?: boolean;
  onPromoteToEdit?: () => void;
  initialTab?: string;
  hasAiClassification?: boolean;
  onLineSaved?: (patch: Partial<DocumentLine>) => void;
  onMutated?: () => void;
  onLineCopied?: () => void;
  onLineDeleted?: () => void;
}

function lineUrl(entityCode: string, recordIdValue: string, lineId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordIdValue)}/lines/${encodeURIComponent(lineId)}`;
}

function lineTitle(entity: CompiledEntity | null, line: DocumentLine): string {
  const titleField = resolveTitleField(entity);
  const title = titleField ? recordValue(line as LineRecord, titleField) : undefined;
  if (title != null && String(title).trim()) return String(title);
  return entity?.entity_name ?? "Line";
}

function lineSubtitle(entity: CompiledEntity | null, line: DocumentLine, currencyCode?: string): string | undefined {
  const columns = entity ? entity.fields.filter((field) => field.origin !== "system").slice(0, 3) : [];
  const parts = columns
    .flatMap((field) => {
      const value = recordValue(line as LineRecord, field);
      const text = formatFieldValue(value, field, currencyCode);
      return text === "-" ? [] : [`${field.label ?? field.name}: ${text}`];
    });
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function LineEditorSheet(props: LineEditorSheetProps) {
  const {
    open,
    onOpenChange,
    line,
    entityCode,
    recordId: parentRecordId,
    lineEntity,
    lineEntityCode,
    currencyCode,
    readOnly = false,
    canEdit = false,
    onPromoteToEdit,
    onLineSaved,
    onMutated,
  } = props;

  const fetchedLineEntity = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedLineEntity;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lineKey = recordId(line as LineRecord);
  const title = useMemo(() => lineTitle(resolvedEntity, line), [resolvedEntity, line]);
  const subtitle = useMemo(
    () => lineSubtitle(resolvedEntity, line, currencyCode),
    [currencyCode, line, resolvedEntity],
  );

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    setDraft(initialDraft(resolvedEntity, line as LineRecord));
    setSaveError(null);
  }, [lineKey, open, resolvedEntity, line]);

  async function save() {
    if (readOnly || !resolvedEntity || !lineKey) return;
    const patch = buildLinePatch(resolvedEntity, draft, line as LineRecord);
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(lineUrl(entityCode, parentRecordId, lineKey), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      onLineSaved?.(patch as Partial<DocumentLine>);
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
      widthKey={`${entityCode}:meta-line-editor`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badge={resolvedEntity?.entity_name}
      title={title}
      subtitle={subtitle}
      headerRight={
        <span className={[
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
          readOnly
            ? "border-border/50 bg-muted/50 text-muted-foreground"
            : "border-amber-400/60 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-400",
        ].join(" ")}
        >
          {readOnly ? (
            <><Eye className="h-3 w-3" /> Viewing</>
          ) : (
            <><Pencil className="h-3 w-3" /> Editing</>
          )}
        </span>
      }
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : undefined
      }
      footerEnd={
        readOnly ? (
          <>
            {canEdit && (
              <button
                type="button"
                onClick={onPromoteToEdit}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              Close
            </button>
          </>
        ) : (
          <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !resolvedEntity}
            className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          </>
        )
      }
    >
      {resolvedEntity ? (
        <MetaLineForm
          entity={resolvedEntity}
          draft={draft}
          onDraftChange={setDraft}
          disabled={saving}
          mode={readOnly ? "view" : "edit"}
        />
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
