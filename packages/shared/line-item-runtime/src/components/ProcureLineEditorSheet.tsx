"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  XCircle,
} from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { appEntityDetailHref, fmtAmount } from "@athyper/runtime-shared/core";
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
import type {
  LineItemEditorProps,
  LineItemTab,
  LineRecord,
  MatchException,
  ReferenceTabConfig,
} from "../types";
import {
  computeTabBadge,
  fieldsForGroups,
  resolveProcureEditorTabs,
  resolveProcureAmountConfig,
  resolveReferenceTabConfig,
  useProcureLineDistributions,
  useMatchExceptions,
  useReferencedRecord,
} from "../variants/procure";
import { MetaFieldInput } from "./MetaFieldInput";
import { MetaLineForm } from "./MetaLineForm";

// ─────────────────────────────────────────────────────────────────────────────
// FIELD LABEL CLASS
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABEL_CLASS   = "text-sm font-medium leading-normal text-muted-foreground";
const TABLE_HEADER_CLASS  = "text-xs font-medium text-muted-foreground";
const CARD_CLASS          = "rounded-lg border bg-card text-card-foreground shadow-sm";
const FIELD_BOX_CLASS     = `${CARD_CLASS} px-5 py-5`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function lineUrl(entityCode: string, parentId: string, lineId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines/${encodeURIComponent(lineId)}`;
}

function lineCollectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

type SaveErrorBody = { error?: string; message?: string; detail?: string; details?: unknown };

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  if (main) return body.error && body.error !== main ? `${main} (${body.error})` : main;
  if (body.details) return typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  return `Save failed (${status})`;
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function withHeaderCompanyCodeContext(
  draft:          Record<string, unknown>,
  headerRecord?:  Record<string, unknown> | null,
  companyCodeId?: string,
): Record<string, unknown> {
  const headerCompanyCodeId = nonEmptyText(companyCodeId) ?? nonEmptyText(headerRecord?.["company_code_id"]);
  const context = { ...(headerRecord ?? {}), ...draft };
  if (headerCompanyCodeId) context["company_code_id"] = headerCompanyCodeId;
  return context;
}

function displayProcureLabel(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function lineTitle(entity: CompiledEntity | null, line: DocumentLine): string {
  const tf    = resolveTitleField(entity);
  const title = tf ? recordValue(line as LineRecord, tf) : undefined;
  return title != null && String(title).trim() ? String(title) : entity?.entity_name ?? "Line";
}

function compactHeaderTitle(value: string, limit = 50): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function lineSubtitle(line: DocumentLine, currencyCode?: string): string | undefined {
  const qty   = Number(line.quantity);
  const price = Number(line.unit_price);
  const parts: string[] = [];
  if (Number.isFinite(qty) && qty > 0) {
    const uom = (line.unit_code ?? String((line.data as Record<string, unknown> | undefined)?.["uom_code"] ?? "")).trim();
    parts.push(uom ? `${qty} ${uom}` : String(qty));
  }
  if (Number.isFinite(price) && price > 0) parts.push(`${fmtAmount(price, currencyCode)}/unit`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE HEADER BADGE (with prev/next navigation)
// ─────────────────────────────────────────────────────────────────────────────

function LineHeaderBadge({
  label,
  line,
  hasPreviousLine,
  hasNextLine,
  onPreviousLine,
  onNextLine,
  disabled,
}: {
  label:          string;
  line:           DocumentLine;
  hasPreviousLine?: boolean;
  hasNextLine?:   boolean;
  onPreviousLine?: () => void;
  onNextLine?:    () => void;
  disabled?:      boolean;
}) {
  const lineNo   = Number(line.line_number);
  const hasLineNo = Number.isFinite(lineNo);
  const labelText = hasLineNo ? `${label} ${lineNo}` : label;

  return (
    <div
      className="inline-flex h-8 max-w-[12rem] items-center overflow-hidden rounded-lg bg-foreground text-background shadow-sm ring-1 ring-border/20"
      title={labelText}
    >
      <button
        type="button"
        aria-label="Previous line"
        disabled={disabled || !hasPreviousLine || !onPreviousLine}
        onClick={(e) => { e.stopPropagation(); onPreviousLine?.(); }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-background/85 transition-colors hover:bg-background/10 hover:text-background disabled:pointer-events-none disabled:opacity-35"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="h-5 w-px shrink-0 bg-background/25" />
      <span className="min-w-0 px-3 text-xs font-medium leading-none">
        <span className="block truncate">{labelText}</span>
      </span>
      {hasLineNo && (
        <>
          <span className="h-5 w-px shrink-0 bg-background/25" />
          <button
            type="button"
            aria-label="Next line"
            disabled={disabled || !hasNextLine || !onNextLine}
            onClick={(e) => { e.stopPropagation(); onNextLine?.(); }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-background/85 transition-colors hover:bg-background/10 hover:text-background disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CELL
// ─────────────────────────────────────────────────────────────────────────────

function FieldCell({
  field,
  draft,
  onDraftChange,
  disabled,
  readOnly,
  formData,
}: {
  field:         CompiledEntity["fields"][number];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  readOnly?:     boolean;
  formData?:     Record<string, unknown>;
}) {
  const value = draft[field.name];
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>{fieldLabel(field)}</span>
      {readOnly ? (
        <span className="text-sm text-foreground">
          {formatFieldValue(value, field) || <span className="text-muted-foreground/40">—</span>}
        </span>
      ) : (
        <MetaFieldInput
          field={field}
          value={value}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          formData={formData ?? draft}
        />
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT SUMMARY STRIP (below tabs)
// ─────────────────────────────────────────────────────────────────────────────

function AmountSummaryStrip({
  line,
  draft,
  entity,
}: {
  line:   DocumentLine;
  draft:  Record<string, unknown>;
  entity: CompiledEntity;
}) {
  const amountConfig = useMemo(() => resolveProcureAmountConfig(entity), [entity]);
  if (!amountConfig || amountConfig.summaryFields.length === 0) return null;

  const merged = { ...line, ...draft } as Record<string, unknown>;
  const nonZero = amountConfig.summaryFields.filter(({ name }) => {
    const n = Number(merged[name]);
    return Number.isFinite(n) && Math.abs(n) > 0.0001;
  });
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/30 px-5 py-2.5">
      {nonZero.map(({ name, label, bold, divider }) => (
        <span key={name} className={cn("flex items-baseline gap-1 text-xs tabular-nums", divider && "border-l border-border/30 pl-4")}>
          <span className="text-muted-foreground">{label}</span>
          <span className={cn("text-foreground", bold && "font-semibold")}>{fmtAmount(Number(merged[name]), undefined)}</span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE LINKS TAB
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceLinksPanel({
  line,
  entityCode,
  recordId:        parentRecordId,
  referenceConfig,
}: {
  line:            DocumentLine;
  entityCode:      string;
  recordId:        string;
  referenceConfig: ReferenceTabConfig;
}) {
  const lineId      = recordId(line as LineRecord);
  const exceptions  = useMatchExceptions(entityCode, parentRecordId, lineId, referenceConfig.showMatchStatus && Boolean(lineId));

  if (referenceConfig.links.length === 0) {
    return (
      <div className="px-5 py-8 text-sm text-muted-foreground">
        No reference documents linked to this line.
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {referenceConfig.links.map((link) => {
        const linkId = String((line as Record<string, unknown>)[link.idField] ?? "");
        if (!linkId) return null;
        return (
          <div key={link.idField} className={FIELD_BOX_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{link.entityLabel}</span>
              {link.numberField && (
                <span className="text-xs text-muted-foreground">
                  {String((line as Record<string, unknown>)[link.numberField] ?? "")}
                </span>
              )}
              <a
                href={appEntityDetailHref(link.entityCode, linkId)}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Open
              </a>
            </div>
          </div>
        );
      })}
      {exceptions.exceptions.length > 0 && (
        <div className="space-y-2">
          <p className={cn(FIELD_LABEL_CLASS, "pt-2")}>Match Exceptions</p>
          {exceptions.exceptions.map((exc) => (
            <div key={exc.id} className={cn(CARD_CLASS, "px-4 py-3")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground capitalize">
                  {exc.exception_type.replace(/_/g, " ")}
                </span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  exc.is_within_tolerance
                    ? "bg-warning/10 text-warning-foreground"
                    : "bg-destructive/10 text-destructive",
                )}>
                  {exc.is_within_tolerance ? "Within tolerance" : "Exception"}
                </span>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                {exc.variance_amount !== 0 && (
                  <span>Variance: {fmtAmount(Math.abs(exc.variance_amount))}</span>
                )}
                {exc.variance_pct != null && (
                  <span>{Math.abs(exc.variance_pct).toFixed(1)}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIBUTIONS TAB CONTENT (read-only summary)
// ─────────────────────────────────────────────────────────────────────────────

function DistributionsTabContent({
  entityCode,
  recordId:       parentRecordId,
  line,
  entity,
  currencyCode,
}: {
  entityCode:  string;
  recordId:    string;
  line:        DocumentLine;
  entity:      CompiledEntity;
  currencyCode?: string;
}) {
  const lineId = recordId(line as LineRecord);
  const { distributions, loading } = useProcureLineDistributions(entityCode, parentRecordId, lineId, Boolean(lineId));

  if (loading) {
    return <div className="px-5 py-8 text-sm text-muted-foreground animate-pulse">Loading distributions…</div>;
  }

  if (distributions.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">No accounting distributions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-5">
      {distributions.map((dist, i) => (
        <div key={String(dist["id"] ?? i)} className={cn(FIELD_BOX_CLASS, "space-y-2")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Distribution {String(dist["distribution_no"] ?? i + 1)}
            </span>
            {dist["distributed_amount"] != null && (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {fmtAmount(Number(dist["distributed_amount"]), currencyCode)}
              </span>
            )}
          </div>
          {Boolean(dist["account_code"]) && (
            <p className="text-xs text-muted-foreground">Account: {String(dist["account_code"])}</p>
          )}
          {Boolean(dist["cost_center_id"]) && (
            <p className="text-xs text-muted-foreground">Cost Centre: {String(dist["cost_center_id"])}</p>
          )}
          {Boolean(dist["project_id"]) && (
            <p className="text-xs text-muted-foreground">Project: {String(dist["project_id"])}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  activeTab,
  onTabChange,
  line,
  entity,
}: {
  tabs:        LineItemTab[];
  activeTab:   string;
  onTabChange: (key: string) => void;
  line:        LineRecord;
  entity:      CompiledEntity | null;
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border/40 px-5 scrollbar-hide">
      {tabs.map((tab) => {
        const badge = computeTabBadge(tab, line, entity);
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
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
// PROCURE LINE EDITOR SHEET
// ─────────────────────────────────────────────────────────────────────────────

export function ProcureLineEditorSheet({
  open,
  onOpenChange,
  line,
  distributions = [],
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
  onDraftSubmit,
  onLineCopied,
  onLineDeleted,
  hasPreviousLine,
  hasNextLine,
  onPreviousLine,
  onNextLine,
}: LineItemEditorProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;

  const tabs = useMemo(() => resolveProcureEditorTabs(resolvedEntity), [resolvedEntity]);
  const referenceConfig = useMemo(() => resolveReferenceTabConfig(resolvedEntity), [resolvedEntity]);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => initialTab ?? tabs[0]?.key ?? "fields");

  const lineKey    = recordId(line as LineRecord);
  const title      = useMemo(() => lineTitle(resolvedEntity, line), [resolvedEntity, line]);
  const subtitle   = useMemo(() => lineSubtitle(line, currencyCode), [line, currencyCode]);
  const fieldFormData = useMemo(
    () => withHeaderCompanyCodeContext(draft, record, companyCodeId),
    [companyCodeId, draft, record],
  );

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

    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try { await onDraftSubmit(patch); onOpenChange(false); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
      finally { setSaving(false); }
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
    if (!activeTabDef) return null;
    const { type, groups, fields: fieldNames } = activeTabDef;

    if (type === "accounting") {
      return (
        <DistributionsTabContent
          entityCode={entityCode}
          recordId={parentRecordId}
          line={line}
          entity={resolvedEntity!}
          currencyCode={currencyCode}
        />
      );
    }

    if (type === "reference_links") {
      return (
        <ReferenceLinksPanel
          line={line}
          entityCode={entityCode}
          recordId={parentRecordId}
          referenceConfig={referenceConfig}
        />
      );
    }

    const tabFields = resolvedEntity
      ? (fieldNames.length > 0
          ? fieldNames.flatMap((name) => resolvedEntity.fields.filter((f) => f.name === name))
          : fieldsForGroups(resolvedEntity, groups))
      : [];

    if (tabFields.length === 0) {
      return (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          No fields configured for this tab.
        </div>
      );
    }

    return (
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        {tabFields.map((field) => (
          <FieldCell
            key={field.name}
            field={field}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving || readOnly}
            readOnly={readOnly}
            formData={fieldFormData}
          />
        ))}
      </div>
    );
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`${entityCode}:procure-line-editor`}
      defaultWidth={640}
      expandedWidth={960}
      minWidth={440}
      maxWidth="92vw"
      resizable
      expandable
      badgeDetail={
        <LineHeaderBadge
          label={displayProcureLabel(resolvedEntity?.entity_name ?? "Line")}
          line={line}
          hasPreviousLine={hasPreviousLine}
          hasNextLine={hasNextLine}
          onPreviousLine={onPreviousLine}
          onNextLine={onNextLine}
          disabled={saving}
        />
      }
      title={<span title={title}>{compactHeaderTitle(title)}</span>}
      subtitle={subtitle}
      headerRight={
        readOnly && canEdit && onPromoteToEdit ? (
          <button
            type="button"
            onClick={onPromoteToEdit}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
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
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Close
          </button>
        )
      }
    >
      {resolvedEntity ? (
        <>
          {resolvedEntity && (
            <AmountSummaryStrip line={line} draft={draft} entity={resolvedEntity} />
          )}
          {tabs.length > 1 && (
            <TabBar
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              line={line as LineRecord}
              entity={resolvedEntity}
            />
          )}
          {tabs.length > 0 ? (
            tabContent()
          ) : (
            <MetaLineForm
              entity={resolvedEntity}
              draft={draft}
              onDraftChange={setDraft}
              disabled={saving || readOnly}
              mode={readOnly ? "view" : "edit"}
              currencyCode={currencyCode}
              formData={fieldFormData}
            />
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
