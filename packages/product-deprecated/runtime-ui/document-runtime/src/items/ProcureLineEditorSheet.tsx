"use client";

/**
 * ProcureLineEditorSheet
 *
 * Tabbed editor for procurement line entities.
 * Layout is 100% META-driven via display_config.procure_line.editor_tabs
 * or group_key conventions.  Falls back to MetaLineForm when neither applies.
 *
 * Tab types:
 *   "fields"          — editable field grid (same MetaFieldInput as MetaLineForm)
 *   "classification"  — ClassificationDecisionPanel + any classification fields
 *   "distributions"   — read-only accounting distributions list + dimension fields
 *   "reference_links" — PO/GR/SES reference cards + match status + exceptions
 *
 * CSS/UX is intentionally identical to LineEditorSheet — same DrawerShell,
 * same button classes, same error display, same field inputs.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Receipt,
  XCircle,
} from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { useEditDraftContext } from "@athyper/content-ui";
import { appEntityDetailHref, fmtAmount } from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import { SplitAccountingPanel, type SplitAccountingPanelHandle } from "./SplitAccountingPanel";
import {
  type LineRecord,
  MetaFieldInput,
  MetaLineForm,
  buildCreatePayload,
  buildLinePatch,
  fieldLabel,
  fieldOptions,
  formatFieldValue,
  initialDraft,
  isUomLikeField,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "./metaLineRuntime";
import {
  type ItemTabConfig,
  type MatchException,
  type PctTabConfig,
  type ProcureAmountConfig,
  type ProcureAmountSummaryField,
  type ProcureDistribution,
  type ProcureEditorTab,
  type QuantityProgress,
  type ReferenceLink,
  type ReferenceTabConfig,
  type TaxTabSection,
  computeTabBadge,
  fieldsForGroups,
  resolveItemTabConfig,
  resolvePctTabConfig,
  resolveReferenceTabConfig,
  resolveProcureAmountConfig,
  resolveProcureEditorTabs,
  resolveTaxTabSections,
  useMatchExceptions,
  useProcureLineDistributions,
  useReferencedRecord,
} from "./procureLineRuntime";
import { ClassificationDecisionPanel } from "./ClassificationDecisionPanel";

// ─────────────────────────────────────────────────────────────────────────────
// PROPS — intentionally mirrors LineEditorSheetProps
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcureLineEditorSheetProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  line?:           DocumentLine | null;
  distributions?: AccountingDistribution[];
  currencyCode?:   string;
  companyCodeId?:  string;
  record?:         Record<string, unknown>;
  entityCode:      string;
  recordId:        string;
  lineEntity?:     CompiledEntity | null;
  lineEntityCode?: string | null;
  readOnly?:       boolean;
  canEdit?:        boolean;
  onPromoteToEdit?: () => void;
  createMode?:     boolean;
  lineIntakeMode?: "manual" | "catalog";
  initialTab?:     string;
  hasAiClassification?: boolean;
  onLineSaved?:    (patch: Partial<DocumentLine>) => void;
  onMutated?:      () => void;
  /** Draft mode: skip server calls and hand the payload to the parent grid. */
  onDraftSubmit?:  (payload: Record<string, unknown>) => void | Promise<void>;
  onDraftClassify?: (line: DocumentLine, mode?: string) => Promise<Record<string, unknown> | void>;
  onLineCopied?:   () => void;
  onLineDeleted?:  () => void;
  hasPreviousLine?: boolean;
  hasNextLine?:     boolean;
  onPreviousLine?:  () => void;
  onNextLine?:      () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function lineUrl(entityCode: string, parentId: string, lineId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines/${encodeURIComponent(lineId)}`;
}

function lineCollectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

type SaveErrorBody = {
  error?:   string;
  message?: string;
  detail?:  string;
  details?: unknown;
};

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  if (main) return body.error && body.error !== main ? `${main} (${body.error})` : main;
  if (body.details) return typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  return `Save failed (${status})`;
}

const PROCURE_FIELD_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";
const PROCURE_SECTION_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";
const PROCURE_TABLE_HEADER_CLASS = "text-xs font-medium text-muted-foreground";
const PROCURE_CARD_CLASS = "rounded-lg border bg-card text-card-foreground shadow-sm";
const PROCURE_FIELD_BOX_CLASS = `${PROCURE_CARD_CLASS} px-5 py-5`;

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function withHeaderCompanyCodeContext(
  draft: Record<string, unknown>,
  headerRecord?: Record<string, unknown> | null,
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
  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function lineSubtitle(
  _entity:       CompiledEntity | null,
  line:          DocumentLine,
  currencyCode?: string,
): string | undefined {
  const parts: string[] = [];

  const qty = Number(line.quantity);
  if (Number.isFinite(qty) && qty > 0) {
    const uom =
      line.unit_code ??
      String((line.data as Record<string, unknown> | undefined)?.["uom_code"] ?? "");
    parts.push(uom.trim() ? `${qty} ${uom.trim()}` : String(qty));
  }

  const price = Number(line.unit_price);
  if (Number.isFinite(price) && price > 0) parts.push(`${fmtAmount(price, currencyCode)}/unit`);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

type LineNumberBadgeDetailOptions = {
  label: string;
  line: DocumentLine;
  hasPreviousLine?: boolean;
  hasNextLine?: boolean;
  onPreviousLine?: () => void;
  onNextLine?: () => void;
  disabled?: boolean;
};

function lineHeaderBadge({
  label,
  line,
  hasPreviousLine = false,
  hasNextLine = false,
  onPreviousLine,
  onNextLine,
  disabled = false,
}: LineNumberBadgeDetailOptions): ReactNode {
  const lineNo = Number(line.line_number);
  const hasLineNo = Number.isFinite(lineNo);
  const labelText = hasLineNo ? `${label} ${lineNo}` : label;
  return (
    <div
      className="inline-flex h-8 max-w-[12rem] items-center overflow-hidden rounded-lg bg-foreground text-background shadow-sm ring-1 ring-border/20"
      title={labelText}
    >
      <button
        type="button"
        aria-label="Previous invoice line"
        title="Previous line"
        disabled={disabled || !hasPreviousLine || !onPreviousLine}
        onClick={(event) => {
          event.stopPropagation();
          onPreviousLine?.();
        }}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center text-background/85 transition-colors hover:bg-background/10 hover:text-background disabled:pointer-events-none disabled:opacity-35",
        )}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
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
            aria-label="Next invoice line"
            title="Next line"
            disabled={disabled || !hasNextLine || !onNextLine}
            onClick={(event) => {
              event.stopPropagation();
              onNextLine?.();
            }}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center text-background/85 transition-colors hover:bg-background/10 hover:text-background disabled:pointer-events-none disabled:opacity-35",
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED FIELD CELL — same styling as MetaLineForm
// ─────────────────────────────────────────────────────────────────────────────

function FieldCell({
  field,
  draft,
  onDraftChange,
  disabled,
  requiredOverride,
  suppressRequired,
  formData,
}: {
  field:         ReturnType<typeof fieldsForGroups>[number];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  requiredOverride?: boolean;
  suppressRequired?: boolean;
  formData?:     Record<string, unknown>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {!suppressRequired && (field.is_required || requiredOverride) && (
          <span className="ml-0.5 text-destructive">*</span>
        )}
      </span>
      <MetaFieldInput
        field={field}
        value={draft[field.name]}
        disabled={disabled}
        formData={formData ?? draft}
        onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
      />
    </label>
  );
}

function DescriptionTextArea({
  field,
  draft,
  onDraftChange,
  disabled,
}: {
  field:         ReturnType<typeof fieldsForGroups>[number];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
}) {
  const raw = draft[field.name];
  const value = raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      <textarea
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(event) => onDraftChange({ ...draft, [field.name]: event.target.value })}
        className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring/50 focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
      />
    </label>
  );
}

function FieldsGrid({
  groups,
  entity,
  draft,
  onDraftChange,
  disabled,
  excludeNames,
}: {
  groups:         string[];
  entity:         CompiledEntity;
  draft:          Record<string, unknown>;
  onDraftChange:  (next: Record<string, unknown>) => void;
  disabled?:      boolean;
  /** Field names to hide — used to prevent readonly/computed money fields appearing as editable inputs. */
  excludeNames?:  string[];
}) {
  const allFields = useMemo(() => fieldsForGroups(entity, groups), [entity, groups]);
  const fields = useMemo(
    () => excludeNames?.length ? allFields.filter((f) => !excludeNames.includes(f.name)) : allFields,
    [allFields, excludeNames],
  );
  if (fields.length === 0) {
    return (
      <div className={cn(PROCURE_FIELD_BOX_CLASS, "py-6")}>
        <p className="text-xs text-muted-foreground/50">No configurable fields.</p>
      </div>
    );
  }
  return (
    <div className={cn(PROCURE_FIELD_BOX_CLASS, "grid gap-3 sm:grid-cols-2")}>
      {fields.map((f) => (
        <FieldCell
          key={f.name}
          field={f}
          draft={draft}
          onDraftChange={onDraftChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY AMOUNT SUMMARY (net_amount, gross_amount, and any is_readonly money)
// ─────────────────────────────────────────────────────────────────────────────

function ClassificationTabPanel({
  groups,
  entity,
  draft,
  onDraftChange,
  disabled,
  line,
  entityCode,
  parentRecordId,
  onRefresh,
  onClassify,
}: {
  groups: string[];
  entity: CompiledEntity;
  draft: Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  line: DocumentLine;
  entityCode: string;
  parentRecordId: string;
  onRefresh?: () => void;
  onClassify?: (line: DocumentLine, mode?: string) => Promise<Record<string, unknown> | void>;
}) {
  const fields = useMemo(() => resolveClassificationFields(entity, groups), [entity, groups]);
  const lineSnapshot = useMemo(() => lineSnapshotWithDraft(line, draft), [draft, line]);

  return (
    <div className={cn(PROCURE_FIELD_BOX_CLASS, "space-y-4")}>
      <ClassificationDecisionPanel
        line={lineSnapshot as Record<string, unknown>}
        entityCode={entityCode}
        recordId={parentRecordId}
        onRefresh={onRefresh}
        onClassify={onClassify ? async (mode) => {
          const decision = await onClassify(lineSnapshot, mode);
          if (decision && typeof decision === "object") {
            onDraftChange(applyClassificationDecisionToDraft(draft, decision));
          }
          return decision;
        } : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <FieldCell
            key={field.name}
            field={field}
            draft={draft}
            onDraftChange={onDraftChange}
            disabled={disabled}
            suppressRequired={isOptionalClassificationDraftField(field)}
          />
        ))}
      </div>
    </div>
  );
}

function ReadOnlyAmountGrid({
  fields,
  line,
  currencyCode,
}: {
  fields:       ProcureAmountSummaryField[];
  line:         DocumentLine;
  currencyCode?: string;
}) {
  if (fields.length === 0) return null;
  const lineAny = line as Record<string, unknown>;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border/30 pt-4">
      {fields.map((f) => {
        const raw = lineAny[f.name] ?? (line.data as Record<string, unknown> | null)?.[f.name];
        const num = Number(raw);
        const display = Number.isFinite(num)
          ? fmtAmount(num, currencyCode)
          : (raw != null ? String(raw) : "—");
        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            <span className={PROCURE_FIELD_LABEL_CLASS}>
              {f.label}
            </span>
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 text-sm tabular-nums text-foreground select-none cursor-default">
              {display}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIBUTIONS TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────

function DistributionsPanel({
  distributions,
  loading,
  currencyCode,
}: {
  distributions: ProcureDistribution[];
  loading:       boolean;
  currencyCode?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }
  if (distributions.length === 0) {
    return (
      <div className={cn(PROCURE_FIELD_BOX_CLASS, "border-dashed px-4 py-6 text-center")}>
        <p className="text-sm text-muted-foreground">No accounting distributions yet.</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Distributions are generated automatically when this line is posted.
        </p>
      </div>
    );
  }
  return (
    <div className={cn(PROCURE_CARD_CLASS, "overflow-hidden")}>
      <div className={cn("grid grid-cols-[2rem_1fr_1fr_auto] gap-x-3 border-b border-border/40 bg-muted/30 px-3 py-2", PROCURE_TABLE_HEADER_CLASS)}>
        <span>#</span>
        <span>Account</span>
        <span>Cost centre / Project</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="divide-y divide-border/30">
        {distributions.map((d, i) => (
          <div
            key={d.id ?? i}
            className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-x-3 px-3 py-2.5 text-xs"
          >
            <span className="tabular-nums text-muted-foreground">{d.distribution_no ?? i + 1}</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{d.account_code ?? "—"}</p>
              {d.account_source && (
                <p className="truncate text-xs text-muted-foreground">{d.account_source}</p>
              )}
            </div>
            <div className="min-w-0 text-muted-foreground">
              {[d.cost_center_id, d.project_id].filter(Boolean).join(" / ") || "—"}
            </div>
            <span className="tabular-nums text-right font-medium text-foreground">
              {d.distributed_amount != null
                ? `${Number(d.distributed_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currencyCode ? ` ${currencyCode}` : ""}`
                : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB — quantity progress bar
// ─────────────────────────────────────────────────────────────────────────────

function QuantityProgressBar({
  record,
  progress,
}: {
  record:   Record<string, unknown>;
  progress: QuantityProgress;
}) {
  const ordered  = Number(record[progress.ordered  ?? ""] ?? 0);
  const received = Number(record[progress.received ?? ""] ?? record[progress.accepted ?? ""] ?? 0);
  const invoiced = Number(record[progress.invoiced ?? ""] ?? 0);
  const remaining = progress.remaining ? Number(record[progress.remaining] ?? 0) : null;

  if (!ordered && !received) return null;

  const recvPct = ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0;
  const invPct  = ordered > 0 ? Math.min(100, (invoiced / ordered) * 100)  : 0;

  const qty = (label: string, val: number | null, cls?: string) =>
    val != null ? (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-xs font-medium tabular-nums text-foreground", cls)}>{val}</p>
      </div>
    ) : null;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid grid-cols-4 gap-2">
        {qty("Ordered",   progress.ordered   ? ordered   : null)}
        {qty("Received",  progress.received  ? received  : null)}
        {qty("Invoiced",  progress.invoiced  ? invoiced  : null)}
        {qty("Remaining", remaining)}
      </div>
      {ordered > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="relative h-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-success/50 transition-all duration-500"
              style={{ width: `${recvPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/50 transition-all duration-500"
              style={{ width: `${invPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB — single reference card
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceCard({
  link,
  lineRecord,
  tabActive,
}: {
  link:       ReferenceLink;
  lineRecord: Record<string, unknown>;
  tabActive:  boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const linkedId = String(lineRecord[link.idField] ?? "").trim();
  const hasLink  = Boolean(linkedId);

  const { record, loading } = useReferencedRecord(link.targetEntity, linkedId, hasLink && tabActive);

  if (!hasLink) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-input bg-background px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">{link.label}</span>
        <span className="text-xs text-muted-foreground/40">Not linked</span>
      </div>
    );
  }

  const parentDocLabel = record && link.parentNav
    ? String(record[link.parentNav.labelField] ?? record[link.parentNav.idField] ?? "")
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-background">
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between bg-muted/30 px-3.5 py-2.5 text-left border-b border-border/40 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {link.label}
          </span>
          {parentDocLabel && (
            <span className="truncate text-xs font-medium text-foreground">{parentDocLabel}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="px-3.5 py-3">
          {loading ? (
            <div className="h-8 animate-pulse rounded bg-muted/40" />
          ) : record ? (
            <>
              {/* Key field summary — top 6 non-system, non-id fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(record)
                  .filter(([k, v]) =>
                    !["id", "tenant_id", "created_at", "updated_at"].includes(k) &&
                    !k.endsWith("_id") &&
                    v != null &&
                    String(v).trim() !== "",
                  )
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs font-medium text-foreground">{String(value)}</p>
                    </div>
                  ))}
              </div>

              {/* Quantity progress */}
              {link.quantityProgress && (
                <QuantityProgressBar record={record} progress={link.quantityProgress} />
              )}

              {/* View parent document link */}
              {link.parentNav && record[link.parentNav.idField] && (
                <div className="mt-3 border-t border-border/40 pt-2.5">
                  <a
                    href={appEntityDetailHref(link.parentNav.entity, String(record[link.parentNav.idField]))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View {link.parentNav.entity.replace(/_/g, " ")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground/50">Record not found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB — match status badge row
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_STATUS_STYLES: Record<string, { pill: string; Icon: typeof CheckCircle2; label: string }> = {
  fully_matched:     { pill: "border-success/40 bg-success/10 text-success",          Icon: CheckCircle2, label: "Fully matched"     },
  partially_matched: { pill: "border-warning/40 bg-warning/10 text-warning",          Icon: AlertTriangle, label: "Partially matched" },
  match_exception:   { pill: "border-destructive/40 bg-destructive/10 text-destructive", Icon: XCircle,    label: "Match exception"   },
  unmatched:         { pill: "border-border/50 bg-muted text-muted-foreground",        Icon: AlertTriangle, label: "Unmatched"         },
};

function MatchStatusBadge({ status }: { status: string }) {
  const cfg = MATCH_STATUS_STYLES[status] ?? MATCH_STATUS_STYLES["unmatched"]!;
  const { Icon, pill, label } = cfg;
  return (
    <span className={cn("inline-flex items-center gap-1.5 h-6 rounded-full border px-2.5 text-xs font-medium", pill)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB — match exceptions list
// ─────────────────────────────────────────────────────────────────────────────

const EXCEPTION_STYLE: Record<string, string> = {
  open:             "bg-destructive/5 border-destructive/20 text-destructive",
  pending_approval: "bg-warning/5 border-warning/20 text-warning",
  approved:         "bg-success/5 border-success/20 text-success",
  force_matched:    "bg-muted border-border/40 text-muted-foreground",
  written_off:      "bg-muted border-border/40 text-muted-foreground",
};

function ExceptionsPanel({
  exceptions,
  loading,
}: {
  exceptions: MatchException[];
  loading:    boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (loading) return <div className="h-8 animate-pulse rounded-lg bg-muted/40" />;
  if (exceptions.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-input bg-background px-3.5 py-2.5">
        <span className="text-xs text-muted-foreground">Match exceptions</span>
        <span className="text-xs font-medium text-success">None</span>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-destructive/30 bg-background">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between bg-destructive/5 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {exceptions.length} match exception{exceptions.length !== 1 ? "s" : ""}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-destructive/60 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="divide-y divide-border/30">
          {exceptions.map((ex, i) => {
            const statusCls = EXCEPTION_STYLE[ex.status] ?? EXCEPTION_STYLE["open"];
            return (
              <div key={ex.id ?? i} className="px-3.5 py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">
                    {ex.exception_type.replace(/_/g, " ")}
                    {ex.exception_subtype && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({ex.exception_subtype})
                      </span>
                    )}
                  </p>
                  <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium", statusCls)}>
                    {ex.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {ex.expected_value != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Expected</p>
                      <p className="tabular-nums font-medium text-foreground">
                        {ex.expected_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                  {ex.actual_value != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Actual</p>
                      <p className="tabular-nums font-medium text-foreground">
                        {ex.actual_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Variance</p>
                    <p className={cn("tabular-nums font-medium", ex.is_within_tolerance ? "text-success" : "text-destructive")}>
                      {ex.variance_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {ex.variance_pct != null && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({ex.variance_pct.toFixed(2)}%)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {ex.resolution_type && (
                  <p className="text-xs text-muted-foreground">
                    Resolution: <span className="font-medium text-foreground">{ex.resolution_type.replace(/_/g, " ")}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB — assembled panel
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceTabPanel({
  config,
  lineRecord,
  entityCode,
  parentRecordId,
  lineId,
  tabActive,
}: {
  config:         ReferenceTabConfig;
  lineRecord:     Record<string, unknown>;
  entityCode:     string;
  parentRecordId: string;
  lineId:         string;
  tabActive:      boolean;
}) {
  const matchStatus = String(lineRecord[config.matchStatusField] ?? "");

  const { exceptions, loading: exceptionsLoading } = useMatchExceptions(
    entityCode,
    parentRecordId,
    lineId,
    tabActive && config.hasExceptions,
  );

  return (
    <div className={cn(PROCURE_FIELD_BOX_CLASS, "space-y-3")}>
      {/* Match status */}
      {matchStatus && (
        <div className="flex items-center justify-between">
          <MatchStatusBadge status={matchStatus} />
        </div>
      )}

      {/* Reference cards */}
      {config.links.map((link) => (
        <ReferenceCard
          key={link.idField}
          link={link}
          lineRecord={lineRecord}
          tabActive={tabActive}
        />
      ))}

      {/* Match exceptions */}
      {config.hasExceptions && (
        <ExceptionsPanel exceptions={exceptions} loading={exceptionsLoading} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM TAB PANEL — helpers
// ─────────────────────────────────────────────────────────────────────────────

type QtyMode = "qty_price" | "amount_only";

type LookupOption = { value: string; label: string };
type LookupResponse = {
  data?: Array<{ code: string; name: string }>;
  values?: Array<{ code: string; name: string }>;
};

// Module-level cache so the same domain is never re-fetched across mounts.
const lookupCache = new Map<string, LookupOption[]>();

function useLookupOptions(domainCode: string | null | undefined): LookupOption[] {
  const [opts, setOpts] = useState<LookupOption[]>(
    () => (domainCode ? (lookupCache.get(domainCode) ?? []) : []),
  );
  useEffect(() => {
    if (!domainCode) return;
    if (lookupCache.has(domainCode)) { setOpts(lookupCache.get(domainCode)!); return; }
    let cancelled = false;
    void fetch(`/api/relay/api/metadata/lookups/${encodeURIComponent(domainCode)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LookupResponse>) : null))
      .then((body) => {
        if (cancelled) return;
        const rows = body?.data ?? body?.values ?? [];
        const mapped = rows.map((r) => ({ value: r.code, label: r.name }));
        lookupCache.set(domainCode, mapped);
        setOpts(mapped);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [domainCode]);
  return opts;
}

// Types that only ever allow Amount-only mode (no Qty × Price toggle)
const AMOUNT_ONLY_TYPES = new Set(["mixed", "freight", "misc"]);

// Field classifiers for the quantity row
const PRICE_NAME_RE = /price|rate|cost|value/i;
function isMoneyField(f: EntityField): boolean {
  return f.data_type === "money" || (f.data_type === "decimal" && PRICE_NAME_RE.test(f.name));
}
function emptyDraftValueForField(field: EntityField): unknown {
  return field.data_type === "boolean" ? false : "";
}

function uniqueEntityFields(fields: EntityField[]): EntityField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.name)) return false;
    seen.add(field.name);
    return true;
  });
}

function clearDraftFields(
  draft:  Record<string, unknown>,
  fields: EntityField[],
): Record<string, unknown> {
  if (fields.length === 0) return draft;
  const next = { ...draft };
  for (const field of fields) {
    next[field.name] = emptyDraftValueForField(field);
  }
  return next;
}

function isBusinessIntentField(field: EntityField): boolean {
  return /business[_-]?intent/i.test(field.name);
}

function isItemReferenceField(field: EntityField): boolean {
  const ref = field.reference_config as Record<string, unknown> | null | undefined;
  const refEntity = ref?.["target_entity"];
  return field.name === "item_id" || refEntity === "item";
}

function assetFieldsForEntity(entity: CompiledEntity): EntityField[] {
  const byName = new Map(entity.fields.map((field) => [field.name, field]));
  return ["asset_class_id"]
    .map((name) => byName.get(name))
    .filter((field): field is EntityField =>
      Boolean(field && !field.is_readonly && field.origin !== "system" && !field.is_computed),
    );
}

function isTruthyDraftValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function syntheticClassificationField(
  name: "unspsc_code" | "hs_code",
  label: string,
  taxonomyDomain: "unspsc" | "hs",
  sortOrder: number,
): EntityField {
  return {
    id: `${name}:synthetic`,
    name,
    column_name: `metadata.${name}`,
    label,
    description: null,
    data_type: "text",
    ui_type: null,
    format: null,
    unit: null,
    cardinality: "zero_or_one",
    origin: "standard",
    is_required: false,
    is_readonly: false,
    is_unique: false,
    is_searchable: false,
    is_filterable: false,
    is_sortable: false,
    is_groupable: false,
    is_aggregatable: false,
    is_pii: false,
    is_computed: false,
    default_value: null,
    validation_rules: { max_length: 32 },
    enum_domain_code: taxonomyDomain,
    reference_config: null,
    money_config: null,
    sort_order: sortOrder,
    group_key: "classification",
    ui_hint: null,
    lookup_config: null,
    filter_config: null,
    i18n_key: null,
  };
}

function classificationFieldText(field: EntityField): string {
  return `${field.name} ${field.column_name} ${field.label ?? ""}`.toLowerCase();
}

function isCommodityCategoryField(field: EntityField): boolean {
  return /(commodity|spend)[_ -]?category/.test(classificationFieldText(field));
}

function isUnspscField(field: EntityField): boolean {
  return classificationFieldText(field).includes("unspsc");
}

function isHsTradeField(field: EntityField): boolean {
  const text = classificationFieldText(field);
  return /\bhs\b/.test(text) || text.includes("trade") || text.includes("tariff");
}

function classificationFieldRank(field: EntityField): number {
  if (isCommodityCategoryField(field)) return 10;
  if (isUnspscField(field)) return 20;
  if (isHsTradeField(field)) return 30;
  if (isBusinessIntentField(field)) return 40;
  return 100 + (field.sort_order ?? 0);
}

function isOptionalClassificationDraftField(field: EntityField): boolean {
  return isCommodityCategoryField(field) || isBusinessIntentField(field) || isUnspscField(field) || isHsTradeField(field);
}

function resolveClassificationFields(entity: CompiledEntity, groups: string[]): EntityField[] {
  const grouped = fieldsForGroups(entity, groups);
  const byName = new Map(entity.fields.map((field) => [field.name, field]));
  const fields = uniqueEntityFields([
    ...grouped,
    byName.get("unspsc_code") ?? syntheticClassificationField("unspsc_code", "UNSPSC Code", "unspsc", 46),
    byName.get("hs_code") ?? syntheticClassificationField("hs_code", "HS / Trade Code", "hs", 47),
  ].filter((field): field is EntityField => Boolean(field)));

  return fields.sort((a, b) => classificationFieldRank(a) - classificationFieldRank(b));
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function lineSnapshotWithDraft(line: DocumentLine, draft: Record<string, unknown>): DocumentLine {
  const lineRecord = line as Record<string, unknown>;
  const lineData = asObjectRecord(lineRecord["data"]) ?? {};
  const draftData = asObjectRecord(draft["data"]) ?? {};
  return {
    ...lineRecord,
    ...draft,
    data: { ...lineData, ...draftData },
  } as unknown as DocumentLine;
}

function applyClassificationDecisionToDraft(
  draft: Record<string, unknown>,
  decision: Record<string, unknown>,
): Record<string, unknown> {
  const selected = asObjectRecord(decision["selected"]);
  const commodity = asObjectRecord(selected?.["line_commodity_code"]);
  const next: Record<string, unknown> = {
    ...draft,
    classification_decision: decision,
  };

  const commodityCategoryId = selected?.["commodity_category_id"];
  if (commodityCategoryId != null) next["commodity_category_id"] = commodityCategoryId;
  const businessIntentId = selected?.["business_intent_id"];
  if (businessIntentId != null) next["business_intent_id"] = businessIntentId;

  const domain = typeof commodity?.["domain_code"] === "string"
    ? commodity["domain_code"].toLowerCase()
    : "";
  const code = commodity?.["code"];
  if (code != null && domain === "unspsc") next["unspsc_code"] = code;
  if (code != null && domain === "hs") next["hs_code"] = code;

  return next;
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function withNewProcureLineDefaults(draft: Record<string, unknown>): Record<string, unknown> {
  if (draft["price_unit"] != null && draft["price_unit"] !== "") return draft;
  return { ...draft, price_unit: 1 };
}

function procureValidationMessage(
  entity:       CompiledEntity,
  config:       ItemTabConfig,
  amountConfig: ProcureAmountConfig | null,
  draft:        Record<string, unknown>,
  intakeMode:   "manual" | "catalog" = "manual",
): string | null {
  const descriptionField = config.primaryFields.find((f) => f.name === "item_description")
    ?? config.primaryFields.find((f) => f.data_type === "text")
    ?? config.primaryFields[0];
  const itemField = [...config.primaryFields, ...config.classifyFields].find(isItemReferenceField);
  const typeField = config.classifyFields.find(
    (f) => f.data_type === "enum" || f.data_type === "lifecycle_state",
  );
  const amountField = amountConfig
    ? entity.fields.find((f) => f.name === amountConfig.amountField)
    : undefined;
  const typeValue = typeField ? String(draft[typeField.name] ?? "") : "";
  const forceAmountOnly = AMOUNT_ONLY_TYPES.has(typeValue.toLowerCase());
  const hasAmountValue = amountField ? !isMissingRequiredValue(draft[amountField.name]) : false;
  const hasQuantityValue = config.quantityRow.some((f) => !isMissingRequiredValue(draft[f.name]));
  const amountMode = forceAmountOnly || (hasAmountValue && !hasQuantityValue);

  const requiredFields = [
    typeField,
    descriptionField,
    ...(intakeMode === "catalog" ? [itemField] : []),
    ...(amountMode ? [amountField] : config.quantityRow),
  ];
  const seen = new Set<string>();
  const missing = requiredFields.flatMap((field): string[] => {
    if (!field || seen.has(field.name)) return [];
    seen.add(field.name);
    return isMissingRequiredValue(draft[field.name]) ? [fieldLabel(field)] : [];
  });
  return missing.length > 0 ? `Complete required fields: ${missing.join(", ")}.` : null;
}

/** Currency-prefixed amount input — SAR badge on left, number right-aligned, amber when zero. */
function CurrencyInput({
  value,
  onChange,
  disabled,
  currencyCode,
}: {
  value:         unknown;
  onChange:      (v: unknown) => void;
  disabled?:     boolean;
  currencyCode?: string;
}) {
  const n      = Number(value ?? 0);
  const isZero = !Number.isFinite(n) || n === 0;
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30 disabled:opacity-50">
      <span className="flex shrink-0 items-center border-r border-border/40 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground">
        {currencyCode ?? "—"}
      </span>
      <input
        type="number"
        step="any"
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3 text-right text-sm tabular-nums outline-none disabled:opacity-50",
          isZero ? "text-amber-500/80" : "text-foreground",
        )}
      />
    </div>
  );
}

type LineAmountPreview = {
  baseAmount: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  chargesAmount: number;
  grossAmount: number;
};

const MONEY_EPSILON = 0.005;

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lineDraftValue(
  line: DocumentLine | null | undefined,
  draft: Record<string, unknown>,
  fieldName: string | undefined,
): unknown {
  if (!fieldName) return undefined;
  if (draft[fieldName] !== undefined) return draft[fieldName];
  const lineAny = (line ?? {}) as Record<string, unknown>;
  if (lineAny[fieldName] !== undefined) return lineAny[fieldName];
  return (line?.data as Record<string, unknown> | null | undefined)?.[fieldName];
}

function firstAmount(
  line: DocumentLine | null | undefined,
  draft: Record<string, unknown>,
  fieldNames: Array<string | undefined>,
): number {
  for (const name of fieldNames) {
    const value = finiteNumber(lineDraftValue(line, draft, name));
    if (value != null) return value;
  }
  return 0;
}

function calculateLineAmountPreview({
  line,
  draft,
  amountConfig,
  discountConfig,
}: {
  line?: DocumentLine | null;
  draft: Record<string, unknown>;
  amountConfig: ProcureAmountConfig | null | undefined;
  discountConfig?: PctTabConfig | null;
}): LineAmountPreview {
  const baseAmount = firstAmount(line, draft, [
    "net_amount",
    amountConfig?.amountField,
    "line_amount",
    "gross_amount",
  ]);
  const rawPct = discountConfig?.pctField
    ? finiteNumber(lineDraftValue(line, draft, discountConfig.pctField.name))
    : finiteNumber(lineDraftValue(line, draft, "discount_pct"));
  const discountPct = rawPct == null ? 0 : clampNumber(rawPct, 0, 100);
  const manualDiscount = discountConfig?.amtField
    ? finiteNumber(lineDraftValue(line, draft, discountConfig.amtField.name))
    : finiteNumber(lineDraftValue(line, draft, "discount_amount"));
  const discountFromPct = baseAmount > 0 && discountPct > 0
    ? roundMoney((baseAmount * discountPct) / 100)
    : 0;
  const discountAmount = clampNumber(
    discountFromPct > 0 ? discountFromPct : roundMoney(manualDiscount ?? 0),
    0,
    Math.max(baseAmount, 0),
  );
  const taxAmount = firstAmount(line, draft, ["tax_amount"]);
  const chargesAmount = firstAmount(line, draft, ["charges_amount", "charge_amount", "misc_charges_amount"]);
  const grossAmount = roundMoney(baseAmount - discountAmount + taxAmount + chargesAmount);
  return {
    baseAmount,
    discountPct,
    discountAmount,
    taxAmount,
    chargesAmount,
    grossAmount,
  };
}

/** Quantity input with UOM badge on the right. */
function QtyUomInput({
  value,
  onChange,
  disabled,
  uomCode,
}: {
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
  uomCode?:  string;
}) {
  const n      = Number(value ?? 0);
  const isZero = !Number.isFinite(n) || n === 0;
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30">
      <input
        type="number"
        step="any"
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent pl-3 text-sm tabular-nums outline-none disabled:opacity-50",
          isZero ? "text-amber-500/80" : "text-foreground",
        )}
      />
      {uomCode && (
        <span className="flex shrink-0 items-center border-l border-border/40 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground">
          {uomCode}
        </span>
      )}
    </div>
  );
}

function QuantityRowCell({
  field,
  quantityRow,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
}: {
  field:        EntityField;
  quantityRow:  EntityField[];
  draft:        Record<string, unknown>;
  onDraftChange:(next: Record<string, unknown>) => void;
  disabled?:    boolean;
  currencyCode?: string;
}) {
  const uomField = quantityRow.find(isUomLikeField);
  const uomCode  = uomField ? String(draft[uomField.name] ?? "") : "";

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {isMoneyField(field) ? (
        <CurrencyInput
          value={draft[field.name]}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          currencyCode={currencyCode}
        />
      ) : isUomLikeField(field) ? (
        <MetaFieldInput
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          formData={draft}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      ) : field.data_type === "decimal" || field.data_type === "integer" ? (
        <QtyUomInput
          value={draft[field.name]}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          uomCode={uomCode || undefined}
        />
      ) : (
        <MetaFieldInput
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          formData={draft}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      )}
    </label>
  );
}

function TypePillsField({
  field,
  value,
  onChange,
  disabled,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
}) {
  const staticOpts = fieldOptions(field);
  // Fall back to lookup-domain fetch when field has no inline options
  const domainOpts = useLookupOptions(staticOpts.length === 0 ? field.enum_domain_code : null);
  const opts        = staticOpts.length > 0 ? staticOpts : domainOpts;

  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-input bg-background p-0.5">
      {opts.map((opt) => {
        const active = String(value ?? "") === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ItemTabPanel({
  config,
  entity,
  groups,
  draft,
  onDraftChange,
  disabled,
  amtCfg,
  currencyCode,
  formData,
  excludeNames,
}: {
  config:        ItemTabConfig;
  entity:        CompiledEntity;
  groups:        string[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  amtCfg?:       ProcureAmountConfig | null;
  currencyCode?: string;
  formData?:     Record<string, unknown>;
  excludeNames?: string[];
}) {
  const [qtyMode,  setQtyMode]  = useState<QtyMode>("qty_price");

  const allFields = useMemo(
    () => uniqueEntityFields([...fieldsForGroups(entity, groups), ...assetFieldsForEntity(entity)]),
    [entity, groups],
  );

  // ── WHAT section decomposition ──────────────────────────────────────────────
  const descriptionField = config.primaryFields[0];
  const itemRefField     = config.primaryFields[1];

  // First enum/lifecycle → type pills
  const typeEnumField         = config.classifyFields.find(
    (f) => f.data_type === "enum" || f.data_type === "lifecycle_state",
  );

  // ── HOW MUCH: type-based mode restriction ───────────────────────────────────
  const typeValue      = typeEnumField ? String(draft[typeEnumField.name] ?? "") : "";
  const forceAmountOnly = AMOUNT_ONLY_TYPES.has(typeValue.toLowerCase());
  const effectiveMode: QtyMode = forceAmountOnly ? "amount_only" : qtyMode;

  const amountOnlyField = amtCfg
    ? allFields.find((f) => f.name === amtCfg.amountField)
    : null;
  const hasQtyToggle = config.quantityRow.length > 0 && !!amountOnlyField;

  // ── remaining fields split: numeric → HOW MUCH overflow, others → outer section ──
  const layoutNames = useMemo(
    () =>
      new Set([
        ...config.primaryFields.map((f) => f.name),
        ...config.classifyFields.map((f) => f.name),
        ...config.quantityRow.map((f) => f.name),
      ]),
    [config],
  );
  const HOW_MUCH_DATA_TYPES = new Set(["decimal", "integer", "money", "numeric", "bigint"]);
  const remainingAll    = allFields.filter((f) => !layoutNames.has(f.name) && !(excludeNames?.includes(f.name)));
  const howMuchOverflow = remainingAll.filter((f) => HOW_MUCH_DATA_TYPES.has(f.data_type));
  const remainingFields = remainingAll.filter((f) => !HOW_MUCH_DATA_TYPES.has(f.data_type));
  const formulaFields = useMemo(
    () => uniqueEntityFields([...config.quantityRow, ...howMuchOverflow]),
    [config.quantityRow, howMuchOverflow],
  );

  function changeTypeValue(value: unknown) {
    const previousForceAmountOnly = AMOUNT_ONLY_TYPES.has(typeValue.toLowerCase());
    const nextTypeValue = String(value ?? "");
    const nextForceAmountOnly = AMOUNT_ONLY_TYPES.has(nextTypeValue.toLowerCase());
    const nextDraft = { ...draft, ...(typeEnumField ? { [typeEnumField.name]: value } : {}) };

    if (nextForceAmountOnly) {
      setQtyMode("amount_only");
      onDraftChange(clearDraftFields(nextDraft, formulaFields));
      return;
    }

    if (previousForceAmountOnly) {
      setQtyMode("qty_price");
      onDraftChange(amountOnlyField ? clearDraftFields(nextDraft, [amountOnlyField]) : nextDraft);
      return;
    }

    onDraftChange(nextDraft);
  }

  function changeQtyMode(mode: QtyMode) {
    setQtyMode(mode);
    if (mode === "amount_only") {
      onDraftChange(clearDraftFields(draft, formulaFields));
      return;
    }
    onDraftChange(amountOnlyField ? clearDraftFields(draft, [amountOnlyField]) : draft);
  }

  return (
    <div className={cn(PROCURE_FIELD_BOX_CLASS, "space-y-5")}>
      <div className="space-y-3.5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
            <div className="space-y-3.5">
          {/* Type: pill buttons */}
          {typeEnumField && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={PROCURE_FIELD_LABEL_CLASS}>
                {fieldLabel(typeEnumField)}
                {typeEnumField.is_required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <TypePillsField
                field={typeEnumField}
                value={draft[typeEnumField.name]}
                disabled={disabled}
                onChange={changeTypeValue}
              />
            </div>
          )}

          {/* Row 1: Description — full-width */}
          {descriptionField && (
            <DescriptionTextArea
              field={descriptionField}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
            />
          )}

            </div>

            <div className="space-y-3.5">
              {itemRefField && (
                <FieldCell
                  field={itemRefField}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  formData={formData}
                />
              )}
            </div>
          </div>
      </div>

      <div className="space-y-3.5">
          {/* Toggle: only for goods/services (or no type selected yet) */}
          {hasQtyToggle && !forceAmountOnly && (
            <div className="inline-flex w-[220px] max-w-full overflow-hidden rounded-lg border border-input bg-background p-0.5">
              {(["qty_price", "amount_only"] as QtyMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => changeQtyMode(mode)}
                  className={cn(
                    "h-8 w-[108px] shrink-0 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-40",
                    effectiveMode === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "qty_price" ? "Qty × Price" : "Amount only"}
                </button>
              ))}
            </div>
          )}

          {/* Qty × Price grid */}
          {effectiveMode === "qty_price" && config.quantityRow.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {config.quantityRow.map((f) => (
                <QuantityRowCell
                  key={f.name}
                  field={f}
                  quantityRow={config.quantityRow}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  currencyCode={currencyCode}
                />
              ))}
            </div>
          )}

          {/* Amount only field */}
          {effectiveMode === "amount_only" && amountOnlyField && (
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={PROCURE_FIELD_LABEL_CLASS}>
                {fieldLabel(amountOnlyField)}
                {amountOnlyField.is_required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <CurrencyInput
                value={draft[amountOnlyField.name]}
                onChange={(v) => onDraftChange({ ...draft, [amountOnlyField.name]: v })}
                disabled={disabled}
                currencyCode={currencyCode}
              />
            </label>
          )}

          {/* Secondary numeric fields (e.g. price_per) that aren't in quantityRow */}
          {effectiveMode === "qty_price" && howMuchOverflow.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {howMuchOverflow.map((f) => (
                <QuantityRowCell
                  key={f.name}
                  field={f}
                  quantityRow={config.quantityRow}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  currencyCode={currencyCode}
                />
              ))}
            </div>
          )}
      </div>

      {/* ── remaining fields (overflow) ──────────────────────── */}
      {remainingFields.length > 0 && (
        <>
          <div className="border-t border-border/30" />
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            {remainingFields.map((f) => (
              <FieldCell
                key={f.name}
                field={f}
                draft={draft}
                onDraftChange={onDraftChange}
                disabled={disabled}
                formData={formData}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────

function TaxSectionCard({
  section,
  draft,
  onDraftChange,
  disabled,
}: {
  section:       TaxTabSection;
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
}) {
  // Derive the % badge from the first pct/rate-type field in this section
  const pctField = section.fields.find(
    (f) => f.data_type === "decimal" && (f.name.endsWith("_pct") || f.name.endsWith("_rate")),
  );
  const pct = pctField ? Number(draft[pctField.name] ?? 0) : 0;

  return (
    <div className={cn(PROCURE_CARD_CLASS, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3.5 py-2">
        <span className={PROCURE_SECTION_LABEL_CLASS}>
          {displayProcureLabel(section.label)}
        </span>
        {pct > 0 && (
          <span className="rounded-full border border-border/40 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
            {pct}%
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          {section.fields.map((f) => (
            <FieldCell key={f.name} field={f} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaxTabPanel({
  sections,
  entity,
  groups,
  draft,
  onDraftChange,
  disabled,
}: {
  sections:      TaxTabSection[];
  entity:        CompiledEntity;
  groups:        string[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
}) {
  // Include readonly/computed fields for display (tax amounts are usually computed)
  const allFields    = useMemo(() => fieldsForGroups(entity, groups, false), [entity, groups]);
  const sectionNames = useMemo(() => new Set(sections.flatMap((s) => s.fields.map((f) => f.name))), [sections]);
  const otherFields  = allFields.filter((f) => !sectionNames.has(f.name));

  if (allFields.length === 0) {
    return (
      <div className={cn(PROCURE_FIELD_BOX_CLASS, "py-6")}>
        <p className="text-xs text-muted-foreground/50">No tax fields configured.</p>
      </div>
    );
  }

  // No sections → flat grid
  if (sections.length === 0) {
    return (
      <div className={cn(PROCURE_FIELD_BOX_CLASS, "grid gap-3 sm:grid-cols-2")}>
        {allFields.map((f) => (
          <FieldCell key={f.name} field={f} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <TaxSectionCard
          key={section.label}
          section={section}
          draft={draft}
          onDraftChange={onDraftChange}
          disabled={disabled}
        />
      ))}
      {otherFields.length > 0 && (
        <div className={cn(PROCURE_FIELD_BOX_CLASS, "grid gap-3 sm:grid-cols-2")}>
          {otherFields.map((f) => (
            <FieldCell key={f.name} field={f} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────

function DiscountTabPanel({
  config,
  entity,
  groups,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
  amtCfg,
}: {
  config:        PctTabConfig;
  entity:        CompiledEntity;
  groups:        string[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  currencyCode?: string;
  amtCfg?:       ProcureAmountConfig | null;
}) {
  const allFields   = useMemo(() => fieldsForGroups(entity, groups), [entity, groups]);
  const layoutNames = useMemo(
    () => new Set([config.pctField, config.amtField].filter((f): f is EntityField => f != null).map((f) => f.name)),
    [config],
  );
  const otherFields = allFields.filter((f) => !layoutNames.has(f.name));

  const preview = calculateLineAmountPreview({ draft, amountConfig: amtCfg, discountConfig: config });
  const manualDiscount = config.amtField ? finiteNumber(draft[config.amtField.name]) ?? 0 : 0;

  useEffect(() => {
    if (disabled || !config.amtField || preview.discountPct <= 0) return;
    if (Math.abs(manualDiscount - preview.discountAmount) < MONEY_EPSILON) return;
    onDraftChange({ ...draft, [config.amtField.name]: preview.discountAmount });
  }, [config.amtField, disabled, draft, manualDiscount, onDraftChange, preview.discountAmount, preview.discountPct]);

  function handlePctDraftChange(next: Record<string, unknown>) {
    if (!config.pctField || !config.amtField) {
      onDraftChange(next);
      return;
    }
    const pctValue = finiteNumber(next[config.pctField.name]);
    if (pctValue == null) {
      onDraftChange(next);
      return;
    }
    const pct = clampNumber(pctValue, 0, 100);
    const discountAmount = roundMoney((preview.baseAmount * pct) / 100);
    onDraftChange({
      ...next,
      [config.pctField.name]: pct,
      [config.amtField.name]: discountAmount,
    });
  }

  function handleAmountDraftChange(next: Record<string, unknown>) {
    if (!config.amtField || !config.pctField) {
      onDraftChange(next);
      return;
    }
    const amountValue = finiteNumber(next[config.amtField.name]);
    if (amountValue == null) {
      onDraftChange({ ...next, [config.pctField.name]: null });
      return;
    }
    const discountAmount = clampNumber(roundMoney(amountValue), 0, Math.max(preview.baseAmount, 0));
    const pct = preview.baseAmount > 0 ? roundPct((discountAmount / preview.baseAmount) * 100) : 0;
    onDraftChange({
      ...next,
      [config.amtField.name]: discountAmount,
      [config.pctField.name]: pct,
    });
  }

  return (
    <div className="space-y-4">
      <div className={cn(PROCURE_CARD_CLASS, "overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3.5 py-2">
          <span className={PROCURE_SECTION_LABEL_CLASS}>
            {displayProcureLabel(config.sectionLabel)}
          </span>
          {preview.discountPct > 0 && (
            <span className="rounded-full border border-border/40 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
              {preview.discountPct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="space-y-3 p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            {config.pctField && (
              <FieldCell
                field={config.pctField}
                draft={draft}
                onDraftChange={handlePctDraftChange}
                disabled={disabled}
              />
            )}
            {config.amtField && (
              <FieldCell
                field={config.amtField}
                draft={draft}
                onDraftChange={handleAmountDraftChange}
                disabled={disabled}
              />
            )}
          </div>
          {preview.baseAmount > 0 && (
            <div className="rounded-lg border border-input bg-background px-3 py-2.5 text-xs">
              <span className="text-muted-foreground">
                Base {fmtAmount(preview.baseAmount, currencyCode)} - discount
              </span>
              <span className="font-medium tabular-nums text-destructive">
                -{fmtAmount(preview.discountAmount, currencyCode)}
              </span>
              <span className="ml-4 text-muted-foreground">
                Gross {fmtAmount(preview.grossAmount, currencyCode)}
              </span>
            </div>
          )}
        </div>
      </div>
      {otherFields.length > 0 && (
        <div className={cn(PROCURE_FIELD_BOX_CLASS, "grid gap-3 sm:grid-cols-2")}>
          {otherFields.map((f) => (
            <FieldCell key={f.name} field={f} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RETENTION TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────

function RetentionTabPanel({
  config,
  entity,
  groups,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
  amtCfg,
}: {
  config:        PctTabConfig;
  entity:        CompiledEntity;
  groups:        string[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  currencyCode?: string;
  amtCfg?:       ProcureAmountConfig | null;
}) {
  const allFields   = useMemo(() => fieldsForGroups(entity, groups), [entity, groups]);
  const layoutNames = useMemo(
    () => new Set([config.pctField, config.amtField].filter((f): f is EntityField => f != null).map((f) => f.name)),
    [config],
  );
  const otherFields = allFields.filter((f) => !layoutNames.has(f.name));

  const pct          = config.pctField ? Number(draft[config.pctField.name] ?? 0) : 0;
  const baseAmt      = amtCfg ? Number(draft[amtCfg.amountField] ?? 0) : 0;
  const retentionAmt = pct > 0 && baseAmt > 0 ? (baseAmt * pct) / 100 : 0;

  return (
    <div className="space-y-4">
      <div className={cn(PROCURE_CARD_CLASS, "overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3.5 py-2">
          <span className={PROCURE_SECTION_LABEL_CLASS}>
            {displayProcureLabel(config.sectionLabel)}
          </span>
          {pct > 0 && (
            <span className="rounded-full border border-border/40 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
              {pct}%
            </span>
          )}
        </div>
        <div className="space-y-3 p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            {config.pctField && <FieldCell field={config.pctField} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />}
            {config.amtField && <FieldCell field={config.amtField} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />}
          </div>
          {retentionAmt > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Retention held (on {fmtAmount(baseAmt, currencyCode)})
              </span>
              <span className="font-medium tabular-nums text-warning">
                {fmtAmount(retentionAmt, currencyCode)}
              </span>
            </div>
          )}
        </div>
      </div>
      {otherFields.length > 0 && (
        <>
          {config.otherLabel && (
            <p className={PROCURE_SECTION_LABEL_CLASS}>
              {displayProcureLabel(config.otherLabel)}
            </p>
          )}
          <div className={cn(PROCURE_FIELD_BOX_CLASS, "grid gap-3 sm:grid-cols-2")}>
            {otherFields.map((f) => (
              <FieldCell key={f.name} field={f} draft={draft} onDraftChange={onDraftChange} disabled={disabled} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARGES TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ChargesTabPanel() {
  return (
    <div className={cn(PROCURE_CARD_CLASS, "space-y-4 border-dashed px-6 py-10 text-center")}>
      <Receipt className="mx-auto h-6 w-6 text-muted-foreground/30" />
      <div>
        <p className="text-sm font-medium text-muted-foreground">No additional charges</p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">
          Freight, handling, surcharges and rebates
        </p>
      </div>
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground/50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add charge
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER AMOUNT
// ─────────────────────────────────────────────────────────────────────────────

function FooterAmount({
  line,
  draft,
  distributions,
  amountConfig,
  discountConfig,
  currencyCode,
}: {
  line:           DocumentLine;
  draft:          Record<string, unknown>;
  distributions:  ProcureDistribution[];
  amountConfig:   ProcureAmountConfig;
  discountConfig?: PctTabConfig | null;
  currencyCode?:  string;
}) {
  const lineAny  = line as Record<string, unknown>;
  const lineData = (line.data as Record<string, unknown> | null) ?? {};
  const preview  = calculateLineAmountPreview({ line, draft, amountConfig, discountConfig });
  const currency = (amountConfig.currencyField
    ? String(lineDraftValue(line, draft, amountConfig.currencyField) ?? "")
    : currencyCode) || "";

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Build financial bar — skip zero values.
  const barParts: { label: string; value: number }[] = [];
  for (const f of amountConfig.financialBar) {
    const raw = f.name === "discount_amount"
      ? preview.discountAmount
      : f.name === "gross_amount" || f.name === "line_amount"
        ? preview.grossAmount
        : lineDraftValue(line, draft, f.name) ?? lineAny[f.name] ?? lineData[f.name];
    const n   = Number(raw ?? 0);
    if (Number.isFinite(n) && Math.abs(n) > 0.0001) {
      barParts.push({ label: f.label, value: n });
    }
  }

  // Allocation status from the primary amount field.
  const primaryAmt  = Number(lineDraftValue(line, draft, amountConfig.amountField) ?? preview.grossAmount);
  const distSum     = distributions.reduce((s, d) => s + Number(d.distributed_amount ?? 0), 0);
  const isFullyAllocated = distributions.length > 0 && Math.abs(primaryAmt - distSum) < 0.005;

  if (barParts.length === 0 && primaryAmt === 0) return null;

  // If financialBar has nothing, fall back to showing just the primary amount.
  const segments = barParts.length > 0 ? barParts : [{ label: "", value: preview.grossAmount || primaryAmt }];

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      {segments.map(({ label, value }, i) => (
        <span key={label || i} className="flex items-baseline gap-1 tabular-nums">
          {label && <span className="text-muted-foreground">{label}</span>}
          <span className="font-medium text-foreground">
            {fmt(value)}
            {currency && <span className="ml-0.5 font-normal text-muted-foreground">{currency}</span>}
          </span>
          {i < segments.length - 1 && <span className="text-border">·</span>}
        </span>
      ))}
      <span className={cn("ml-1", isFullyAllocated ? "text-success font-medium" : "text-muted-foreground")}>
        {isFullyAllocated ? "allocated" : "unallocated"}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onSelect,
  line,
  entity,
}: {
  tabs:     ProcureEditorTab[];
  active:   string;
  onSelect: (key: string) => void;
  line:     DocumentLine;
  entity:   CompiledEntity | null;
}) {
  return (
    <div className="flex gap-0.5 overflow-x-auto px-4 scrollbar-none">
      {tabs.map((tab) => {
        const badge    = computeTabBadge(tab, line as Record<string, unknown>, entity);
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {badge && (
              <span
                className={cn(
                  "inline-flex h-4 items-center rounded px-1 text-xs font-medium leading-none",
                  badge === "✓"
                    ? "bg-success/15 text-success"
                    : badge === "!"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
              >
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
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function ProcureLineEditorSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId: parentRecordId,
  currencyCode,
  companyCodeId,
  record,
  lineEntity,
  lineEntityCode,
  readOnly = false,
  canEdit  = false,
  onPromoteToEdit,
  createMode = false,
  lineIntakeMode = "manual",
  initialTab,
  onLineSaved,
  onMutated,
  onDraftSubmit,
  onDraftClassify,
  hasPreviousLine,
  hasNextLine,
  onPreviousLine,
  onNextLine,
}: ProcureLineEditorSheetProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;
  const emptyLine = useMemo(() => ({ data: {} }) as DocumentLine, []);
  const currentLine = line ?? emptyLine;

  // Phase 6d: same fork as LineEditorSheet — when an Edit Session is active
  // (object-page mode, editing), Save queues the change into the bundle
  // instead of calling the per-line REST endpoint.
  const editSession = useEditDraftContext();

  const tabs     = useMemo(() => resolveProcureEditorTabs(resolvedEntity),      [resolvedEntity]);
  const refCfg   = useMemo(() => resolveReferenceTabConfig(resolvedEntity),     [resolvedEntity]);
  const amtCfg   = useMemo(() => resolveProcureAmountConfig(resolvedEntity),    [resolvedEntity]);

  // Tab-specific layout configs — resolved from display_config, convention fallback
  const itemTabGroups    = useMemo(() => tabs.find((t) => t.key === "item")?.groups      ?? [], [tabs]);
  const taxTabGroups     = useMemo(() => tabs.find((t) => t.key === "tax")?.groups       ?? [], [tabs]);
  const discountGroups   = useMemo(() => tabs.find((t) => t.key === "discount")?.groups  ?? [], [tabs]);
  const retentionGroups  = useMemo(() => tabs.find((t) => t.key === "retention")?.groups ?? [], [tabs]);

  const itemTabCfg      = useMemo(() => resolveItemTabConfig(resolvedEntity, Array.from(new Set([...itemTabGroups, "classification"]))), [resolvedEntity, itemTabGroups]);
  const taxSections     = useMemo(() => resolveTaxTabSections(resolvedEntity, taxTabGroups),                                     [resolvedEntity, taxTabGroups]);
  const discountTabCfg  = useMemo(() => resolvePctTabConfig(resolvedEntity, discountGroups,  "discount_tab",  "TRADE DISCOUNT"), [resolvedEntity, discountGroups]);
  const retentionTabCfg = useMemo(() => resolvePctTabConfig(resolvedEntity, retentionGroups, "retention_tab", "RETENTION"),      [resolvedEntity, retentionGroups]);

  const firstTab  = tabs[0]?.key ?? "";
  const [activeTab, setActiveTab] = useState(initialTab ?? firstTab);
  const accountingPanelRef = useRef<SplitAccountingPanelHandle | null>(null);
  const [accountingDirty, setAccountingDirty] = useState(false);
  const [committingAccounting, setCommittingAccounting] = useState(false);

  // Reset tab when sheet opens / entity changes
  useEffect(() => {
    if (open) setActiveTab(initialTab ?? tabs[0]?.key ?? "");
  }, [open, initialTab, tabs]);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fieldFormData = useMemo(
    () => withHeaderCompanyCodeContext(draft, record, companyCodeId),
    [companyCodeId, draft, record],
  );

  const lineKey = recordId(currentLine as LineRecord);
  const isCreating = createMode || !lineKey;
  const isDraftBackedLine = Boolean(onDraftSubmit) || parentRecordId === "__draft__" || lineKey.startsWith("draft-line-");
  const isPersistedLine = !isCreating && !isDraftBackedLine;
  const title   = useMemo(() => {
    if (!isCreating) return lineTitle(resolvedEntity, currentLine);
    const titleField = resolveTitleField(resolvedEntity);
    const draftTitle = titleField ? draft[titleField.name] : undefined;
    if (draftTitle != null && String(draftTitle).trim()) return String(draftTitle).trim();
    if (lineIntakeMode === "catalog") return "Add Catalog Item";
    return `Add ${resolvedEntity?.entity_name ?? "line"}`;
  }, [currentLine, draft, isCreating, lineIntakeMode, resolvedEntity]);
  const compactTitle = useMemo(() => compactHeaderTitle(title), [title]);
  const subtitle = useMemo(
    () => isCreating ? resolvedEntity?.entity_name : lineSubtitle(resolvedEntity, currentLine, currencyCode),
    [currentLine, currencyCode, isCreating, resolvedEntity],
  );
  const hasDraftChanges = useMemo(
    () => {
      if (!resolvedEntity) return false;
      const payload = isCreating
        ? buildCreatePayload(resolvedEntity, draft)
        : buildLinePatch(resolvedEntity, draft, currentLine as LineRecord);
      return Object.keys(payload).length > 0;
    },
    [currentLine, draft, isCreating, resolvedEntity],
  );

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    const nextDraft = initialDraft(resolvedEntity, isCreating ? null : currentLine as LineRecord);
    setDraft(isCreating ? withNewProcureLineDefaults(nextDraft) : nextDraft);
    setSaveError(null);
    setAccountingDirty(false);
  }, [currentLine, isCreating, lineKey, open, resolvedEntity]);

  // Distributions — loaded proactively (needed for footer + accounting tab)
  const { distributions, refetch: refetchDistributions } = useProcureLineDistributions(
    entityCode,
    parentRecordId,
    lineKey,
    open && Boolean(lineKey) && isPersistedLine,
  );

  async function persistDraft(): Promise<boolean> {
    if (readOnly || !resolvedEntity) return false;
    if (!isCreating && !lineKey) return false;
    const payload = isCreating
      ? buildCreatePayload(resolvedEntity, draft)
      : buildLinePatch(resolvedEntity, draft, currentLine as LineRecord);
    if (!isCreating && Object.keys(payload).length === 0) return true;

    const validationError = procureValidationMessage(resolvedEntity, itemTabCfg, amtCfg, draft, lineIntakeMode);
    if (validationError) {
      setActiveTab("item");
      setSaveError(validationError);
      return false;
    }

    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try {
        await onDraftSubmit(payload);
        return true;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to update draft line");
        return false;
      } finally {
        setSaving(false);
      }
    }

    // Edit Session route: queue create/update into the bundle. The action-bar
    // Save commits transactionally with header + other line edits.
    if (editSession?.isEditing) {
      if (isCreating) {
        editSession.addLine(payload);
      } else if (lineKey) {
        editSession.updateLine(lineKey, payload as Record<string, unknown>);
        onLineSaved?.(payload as Partial<DocumentLine>);
      }
      onMutated?.();
      return true;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(
        isCreating
          ? lineCollectionUrl(entityCode, parentRecordId)
          : lineUrl(entityCode, parentRecordId, lineKey),
        {
          method: isCreating ? "POST" : "PATCH",
          body:   JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as SaveErrorBody;
        setSaveError(saveErrorMessage(body, res.status));
        return false;
      }
      if (!isCreating) onLineSaved?.(payload as Partial<DocumentLine>);
      onMutated?.();
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function commitAccountingChanges(): Promise<boolean> {
    const panel = accountingPanelRef.current;
    if (!panel?.hasDirty()) {
      setAccountingDirty(false);
      return true;
    }

    setCommittingAccounting(true);
    try {
      const ok = await panel.saveDirty();
      if (ok) setAccountingDirty(false);
      return ok;
    } finally {
      setCommittingAccounting(false);
    }
  }

  async function save() {
    if (readOnly || !resolvedEntity) return;
    if (!isCreating && !lineKey) return;
    if (!isCreating && activeTab === "distributions" && !(await commitAccountingChanges())) return;
    if (await persistDraft()) onOpenChange(false);
  }

  async function navigateLine(action?: () => void) {
    if (!action || saving || committingAccounting) return;
    if (activeTab === "distributions" && !(await commitAccountingChanges())) return;
    if (!readOnly && hasDraftChanges && !(await persistDraft())) return;
    action();
  }

  async function selectTab(nextTab: string) {
    if (nextTab === activeTab || saving || committingAccounting) return;
    if (activeTab === "distributions" && !(await commitAccountingChanges())) return;
    setActiveTab(nextTab);
  }

  // ── Current tab object ──
  const currentTab = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  // ── Tab body renderer ──
  function renderTabBody() {
    if (!resolvedEntity || !currentTab) return null;

    // Names excluded from editable grids: readonly/computed summaryFields + all financialBar fields.
    // This ensures net_amount / gross_amount are never editable regardless of which is amountField.
    const excludeNames = [
      ...(amtCfg?.summaryFields.map((f) => f.name) ?? []),
      ...(amtCfg?.financialBar.map((f) => f.name) ?? []),
    ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

    switch (currentTab.type) {
      case "fields":
        switch (currentTab.key) {
          case "item":
            return (
              <ItemTabPanel
                config={itemTabCfg}
                entity={resolvedEntity}
                groups={currentTab.groups}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving || readOnly}
                amtCfg={amtCfg}
                currencyCode={currencyCode}
                formData={fieldFormData}
                excludeNames={excludeNames}
              />
            );
          case "tax":
            return (
              <TaxTabPanel
                sections={taxSections}
                entity={resolvedEntity}
                groups={currentTab.groups}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving || readOnly}
              />
            );
          case "discount":
            return (
              <DiscountTabPanel
                config={discountTabCfg}
                entity={resolvedEntity}
                groups={currentTab.groups}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving || readOnly}
                currencyCode={currencyCode}
                amtCfg={amtCfg}
              />
            );
          case "retention":
            return (
              <RetentionTabPanel
                config={retentionTabCfg}
                entity={resolvedEntity}
                groups={currentTab.groups}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving || readOnly}
                currencyCode={currencyCode}
                amtCfg={amtCfg}
              />
            );
          default:
            return (
              <FieldsGrid
                groups={currentTab.groups}
                entity={resolvedEntity}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving || readOnly}
                excludeNames={excludeNames}
              />
            );
        }

      case "classification":
        return (
          <ClassificationTabPanel
            groups={currentTab.groups}
            entity={resolvedEntity}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving || readOnly}
            line={currentLine}
            entityCode={entityCode}
            parentRecordId={parentRecordId}
            onRefresh={onMutated}
            onClassify={isDraftBackedLine ? onDraftClassify : undefined}
          />
        );

      case "distributions":
        if (!isPersistedLine) {
          return (
            <div className={cn(PROCURE_FIELD_BOX_CLASS, "py-6")}>
              <p className="text-xs text-muted-foreground/60">
                {isDraftBackedLine
                  ? "Create the invoice before adding accounting distributions."
                  : "Save the line before adding accounting distributions."}
              </p>
            </div>
          );
        }
        return (
          <div className={cn(PROCURE_CARD_CLASS, "overflow-hidden")}>
            <SplitAccountingPanel
              ref={accountingPanelRef}
              line={currentLine}
              distributions={distributions as unknown as AccountingDistribution[]}
              currencyCode={currencyCode}
              entityCode={entityCode}
              recordId={parentRecordId}
              entity={resolvedEntity}
              formData={record}
              readOnly={readOnly}
              onDirtyChange={setAccountingDirty}
              onMutated={() => {
                void refetchDistributions();
                onMutated?.();
              }}
              onClose={() => { void save(); }}
            />
          </div>
        );

      case "charges":
        return <ChargesTabPanel />;

      case "reference_links":
        if (!isPersistedLine) {
          return (
            <div className={cn(PROCURE_FIELD_BOX_CLASS, "py-6")}>
              <p className="text-xs text-muted-foreground/60">
                {isDraftBackedLine
                  ? "Create the invoice before linking source documents."
                  : "Save the line before linking source documents."}
              </p>
            </div>
          );
        }
        return refCfg ? (
          <ReferenceTabPanel
            config={refCfg}
            lineRecord={currentLine as Record<string, unknown>}
            entityCode={entityCode}
            parentRecordId={parentRecordId}
            lineId={lineKey}
            tabActive={currentTab.key === activeTab}
          />
        ) : (
          <div className={cn(PROCURE_FIELD_BOX_CLASS, "py-6")}>
            <p className="text-xs text-muted-foreground/50">Reference config not available.</p>
          </div>
        );
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`${entityCode}:procure-line-editor`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badgeDetail={lineHeaderBadge({
        label: isCreating
          ? (lineIntakeMode === "catalog" ? "Add Catalog Item" : "Add Item")
          : displayProcureLabel(resolvedEntity?.entity_name ?? "Line"),
        line: currentLine,
        hasPreviousLine: isCreating ? false : hasPreviousLine,
        hasNextLine: isCreating ? false : hasNextLine,
        onPreviousLine: isCreating ? undefined : () => { void navigateLine(onPreviousLine); },
        onNextLine: isCreating ? undefined : () => { void navigateLine(onNextLine); },
        disabled: saving,
      })}
      title={<span title={title}>{compactTitle}</span>}
      subtitle={subtitle}
      headerBottom={
        tabs.length > 1 ? (
          <TabBar
            tabs={tabs}
            active={activeTab}
            onSelect={(key) => { void selectTab(key); }}
            line={currentLine}
            entity={resolvedEntity}
          />
        ) : undefined
      }
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : committingAccounting ? (
          <span className="text-xs font-medium text-muted-foreground">Saving accounting...</span>
        ) : accountingDirty && activeTab === "distributions" ? (
          <span className="text-xs font-medium text-warning">Pending accounting changes</span>
        ) : saving ? (
          <span className="text-xs font-medium text-muted-foreground">Saving changes...</span>
        ) : amtCfg ? (
          <FooterAmount
            line={currentLine}
            draft={draft}
            distributions={distributions}
            amountConfig={amtCfg}
            discountConfig={discountTabCfg}
            currencyCode={currencyCode}
          />
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
              disabled={saving || committingAccounting || !resolvedEntity}
              className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {saving || committingAccounting
                ? "Saving..."
                : isCreating
                  ? (lineIntakeMode === "catalog" ? "Add catalog item" : "Add item")
                  : onDraftSubmit
                    ? "Update"
                    : accountingDirty || hasDraftChanges ? "Save & Done" : "Done"}
            </button>
          </>
        )
      }
    >
      {resolvedEntity ? (
        tabs.length > 0 ? (
          <div className="px-5 py-4">{renderTabBody()}</div>
        ) : (
          /* Fallback: identical to LineEditorSheet */
          <MetaLineForm
            entity={resolvedEntity}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving || readOnly}
          />
        )
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
