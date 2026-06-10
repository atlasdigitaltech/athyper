"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import {
  buildLinePatch,
  fieldLabel,
  formatFieldValue,
  initialDraft,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "../meta";
import type { LineItemEditorProps, LineItemTab, LineRecord } from "../types";
import {
  resolveSalesEditorTabs,
  resolveFulfillmentTabConfig,
} from "../variants/sales";
import { fieldsForGroups } from "../variants/procure";
import { computeTabBadge } from "../variants/procure";
import { MetaFieldInput } from "./MetaFieldInput";
import { MetaLineForm } from "./MetaLineForm";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function lineUrl(entityCode: string, parentId: string, lineId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines/${encodeURIComponent(lineId)}`;
}

type SaveErrorBody = { error?: string; message?: string; detail?: string };

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  return main ?? `Save failed (${status})`;
}

function displayLabel(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/_/g, " ").replace(/[\s/]+/g, " ").trim();
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function compactTitle(value: string, limit = 50): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function lineTitle(entity: CompiledEntity | null, line: DocumentLine): string {
  const tf    = resolveTitleField(entity);
  const title = tf ? recordValue(line as LineRecord, tf) : undefined;
  return title != null && String(title).trim() ? String(title) : entity?.entity_name ?? "Line";
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

function TabBar({
  tabs, activeTab, onTabChange, line, entity,
}: {
  tabs: LineItemTab[]; activeTab: string; onTabChange: (key: string) => void;
  line: LineRecord; entity: CompiledEntity | null;
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border/40 px-5 scrollbar-hide">
      {tabs.map((tab) => {
        const badge = computeTabBadge(tab, line, entity);
        return (
          <button key={tab.key} type="button" onClick={() => onTabChange(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}>
            {tab.label}
            {badge != null && (
              <span className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                activeTab === tab.key ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
              )}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FULFILLMENT TAB
// ─────────────────────────────────────────────────────────────────────────────

function FulfillmentTabContent({
  line,
  entity,
}: {
  line:   DocumentLine;
  entity: CompiledEntity;
}) {
  const config = useMemo(() => resolveFulfillmentTabConfig(entity), [entity]);

  if (config.links.length === 0) {
    return (
      <div className="px-5 py-8 text-sm text-muted-foreground">
        No fulfillment documents linked to this line.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-5">
      {config.links.map((link) => {
        const linkId = String((line as Record<string, unknown>)[link.idField] ?? "");
        if (!linkId) return null;
        return (
          <div key={link.idField} className="rounded-lg border bg-card px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{link.entityLabel}</span>
              {link.numberField && (
                <span className="text-xs text-muted-foreground">
                  {String((line as Record<string, unknown>)[link.numberField] ?? "")}
                </span>
              )}
            </div>
            {config.quantityField && (
              <p className="mt-1 text-xs text-muted-foreground">
                Qty: {String((line as Record<string, unknown>)[config.quantityField] ?? "-")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES LINE EDITOR SHEET
// ─────────────────────────────────────────────────────────────────────────────

export function SalesLineEditorSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId:       parentRecordId,
  lineEntity,
  lineEntityCode,
  currencyCode,
  companyCodeId,
  record,
  readOnly = false,
  canEdit  = false,
  onPromoteToEdit,
  initialTab,
  onLineSaved,
  onMutated,
}: LineItemEditorProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;

  const tabs = useMemo(() => resolveSalesEditorTabs(resolvedEntity), [resolvedEntity]);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => initialTab ?? tabs[0]?.key ?? "fields");

  const lineKey = recordId(line as LineRecord);
  const title   = useMemo(() => lineTitle(resolvedEntity, line), [resolvedEntity, line]);

  const fieldFormData = useMemo(() => ({
    ...(record ?? {}),
    ...draft,
    ...(companyCodeId ? { company_code_id: companyCodeId } : {}),
  }), [companyCodeId, draft, record]);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    setDraft(initialDraft(resolvedEntity, line as LineRecord));
    setSaveError(null);
  }, [lineKey, open, resolvedEntity, line]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    else if (tabs.length > 0) setActiveTab(tabs[0]!.key);
  }, [lineKey, initialTab, tabs]);

  async function save() {
    if (readOnly || !resolvedEntity || !lineKey) return;
    const patch = buildLinePatch(resolvedEntity, draft, line as LineRecord);
    if (Object.keys(patch).length === 0) { onOpenChange(false); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(lineUrl(entityCode, parentRecordId, lineKey), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as SaveErrorBody;
        setSaveError(saveErrorMessage(body, res.status));
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

  const activeTabDef = tabs.find((t) => t.key === activeTab);

  const tabContent = (): ReactNode => {
    if (!activeTabDef || !resolvedEntity) return null;

    if (activeTabDef.type === "fulfillment_links") {
      return <FulfillmentTabContent line={line} entity={resolvedEntity} />;
    }

    const tabFields = activeTabDef.fields.length > 0
      ? activeTabDef.fields.flatMap((name) => resolvedEntity.fields.filter((f) => f.name === name))
      : fieldsForGroups(resolvedEntity, activeTabDef.groups);

    if (tabFields.length === 0) {
      return <div className="px-5 py-8 text-sm text-muted-foreground">No fields configured for this tab.</div>;
    }

    return (
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        {tabFields.map((field) => (
          <label key={field.name} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium leading-normal text-muted-foreground">
              {fieldLabel(field)}
            </span>
            {readOnly ? (
              <span className="text-sm text-foreground">{formatFieldValue(draft[field.name], field, currencyCode) || "—"}</span>
            ) : (
              <MetaFieldInput field={field} value={draft[field.name]} disabled={saving}
                formData={fieldFormData} onChange={(v) => setDraft((d) => ({ ...d, [field.name]: v }))} />
            )}
          </label>
        ))}
      </div>
    );
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`${entityCode}:sales-line-editor`}
      defaultWidth={640}
      expandedWidth={960}
      minWidth={440}
      maxWidth="92vw"
      resizable
      expandable
      badge={displayLabel(resolvedEntity?.entity_name ?? "Line")}
      title={<span title={title}>{compactTitle(title)}</span>}
      headerRight={
        readOnly && canEdit && onPromoteToEdit ? (
          <button type="button" onClick={onPromoteToEdit}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />Edit
          </button>
        ) : undefined
      }
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />{saveError}
          </span>
        ) : undefined
      }
      footerEnd={
        !readOnly ? (
          <>
            <button type="button" onClick={() => onOpenChange(false)}
              className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={saving || !resolvedEntity}
              className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40">
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">
            Close
          </button>
        )
      }
    >
      {resolvedEntity ? (
        <>
          {tabs.length > 1 && (
            <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}
              line={line as LineRecord} entity={resolvedEntity} />
          )}
          {tabs.length > 0 ? tabContent() : (
            <MetaLineForm entity={resolvedEntity} draft={draft} onDraftChange={setDraft}
              disabled={saving || readOnly} mode={readOnly ? "view" : "edit"} currencyCode={currencyCode}
              formData={fieldFormData} />
          )}
        </>
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
