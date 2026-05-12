"use client";

import { useState, useRef, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, Award, CalendarDays, CheckCircle2, Clock3,
  FileBadge, Info, MoreHorizontal, Plus, Star, Trash2, Edit2, ChevronRight,
  Building2, Scale, ShieldCheck, Users,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  type BadgeKind, type AlertSeverity, type RecordAlert,
  BADGE_KIND_VARIANT, BADGE_KIND_LABEL,
} from "@athyper/theme/record-badge";
import {
  Badge, Button, DrawerShell, Skeleton,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@athyper/ui/primitives";
import { FilterPillBar, SearchInput } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import type { SummaryCardsConfig, MasterTab } from "@athyper/metadata-client/compiled-reader";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { useCompiledEntity } from "@athyper/query";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import { titleCase } from "@athyper/runtime-shared/core";
import { BankingSummaryPanel } from "./BankingSummaryPanel";
import { TaxProfileSummaryPanel } from "./TaxProfileSummaryPanel";
import {
  configuredAuditFieldNames,
  configuredStatusFieldNames,
  fieldByName,
  fieldHiddenInSurface,
} from "../metadata/fieldSemantics";
import {
  OperationalDisplayMetadataProvider,
  OperationalFieldLabel,
  OperationalFieldValue,
  OperationalPresentationView,
  supportsOperationalPresentation,
} from "./OperationalPresentationView";

// ── Shared types ──────────────────────────────────────────────────────────────

type ChildRecord = Record<string, unknown>;

export interface ViewOnlyReason {
  label:   string;
  tooltip: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHILD_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const CHILD_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const CHILD_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const CHILD_ITEM_TITLE_CLASS = "text-sm font-semibold leading-snug text-foreground";
const CHILD_KPI_VALUE_CLASS = "text-xl font-semibold leading-none text-foreground";
const CHILD_RELATION_BADGE_CLASS = "rounded-full bg-foreground px-2 text-background";

function formatDate(val: unknown): string {
  if (!val) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(String(val)));
  } catch { return String(val); }
}

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return formatDate(str);
  return str;
}

// Mask all-digit strings longer than 8 chars (account numbers, etc.)
function maskIfNumeric(str: string): string {
  if (str.length > 8 && /^\d+$/.test(str.replace(/[\s-]/g, ""))) {
    return "****" + str.slice(-4);
  }
  return str;
}

// Humanize enum-code-shaped strings ("billing" → "Billing", "legal_compliance" → "Legal Compliance").
// Leaves already-readable strings (mixed case, spaces) unchanged.
function humanizeIfCode(str: string): string {
  if (/^[a-z][a-z0-9_-]*$/.test(str)) {
    return str.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return str;
}

// Client-side sort driven by config.defaultSort spec array.
// Each spec: "field:asc" | "field:desc". Booleans sort true-first when desc.
function applyDefaultSort(records: ChildRecord[], sortSpecs: string[]): ChildRecord[] {
  if (!sortSpecs.length) return records;
  return [...records].sort((a, b) => {
    for (const spec of sortSpecs) {
      const trimmed = spec.trim();
      const spaceMatch = trimmed.match(/^(.+?)\s+(asc|desc)$/i);
      const colonIdx = trimmed.lastIndexOf(":");
      const field = spaceMatch
        ? (spaceMatch[1] ?? "")
        : (colonIdx > 0 ? trimmed.slice(0, colonIdx) : trimmed);
      if (!field) continue;
      const dir = (spaceMatch
        ? (spaceMatch[2] ?? "asc")
        : (colonIdx > 0 ? trimmed.slice(colonIdx + 1) : "asc")).toLowerCase();
      const aVal  = a[field];
      const bVal  = b[field];
      let cmp = 0;
      if (typeof aVal === "boolean" && typeof bVal === "boolean") {
        cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0); // asc: false < true
      } else {
        cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""));
      }
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function childScopeKey(tab: Pick<MasterTab, "owner_type_filter" | "party_type_filter" | "through_entity">): string {
  return [
    tab.owner_type_filter ? `owner:${tab.owner_type_filter}` : "",
    tab.party_type_filter ? `party:${tab.party_type_filter}` : "",
    tab.through_entity    ? `via:${tab.through_entity}`      : "",
  ].filter(Boolean).join("|");
}

function buildChildRecordsUrl(entityCode: string, parentId: string, tab: MasterTab): string {
  const params = new URLSearchParams({ parent_id: parentId });
  if (tab.owner_type_filter) params.set("owner_type_filter", tab.owner_type_filter);
  if (tab.party_type_filter) params.set("party_type_filter", tab.party_type_filter);
  if (tab.through_entity)    params.set("through_entity",    tab.through_entity);
  return `/api/relay/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`;
}

function applyScopeFilters(
  data: Record<string, unknown>,
  ownerTypeFilter?: string,
  partyTypeFilter?: string,
): Record<string, unknown> {
  return {
    ...data,
    ...(ownerTypeFilter ? { owner_type: ownerTypeFilter } : {}),
    ...(partyTypeFilter ? { party_type: partyTypeFilter } : {}),
  };
}

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringArraySetting(settings: Record<string, unknown>, key: string): string[] {
  const value = settings[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function summaryPresentationSettings(config: SummaryCardsConfig): Record<string, unknown> {
  return asPlainRecord(config.presentation_config) ?? {};
}

function configuredDetailAuditFields(config: SummaryCardsConfig, entity?: CompiledEntity): Set<string> {
  const settings = summaryPresentationSettings(config);
  const auditFieldNames = entity ? configuredAuditFieldNames(entity) : undefined;
  return new Set([
    ...stringArraySetting(settings, "audit_fields"),
    ...Object.values(auditFieldNames ?? {}).filter((name): name is string => Boolean(name)),
  ]);
}

function configuredDetailHiddenFields(config: SummaryCardsConfig, entity?: CompiledEntity): Set<string> {
  const settings = summaryPresentationSettings(config);
  const configured = [
    ...stringArraySetting(settings, "hidden_fields"),
    ...stringArraySetting(settings, "detail_hidden_fields"),
    ...stringArraySetting(settings, "detail_excluded_fields"),
  ];
  const metadataHidden = (entity?.fields ?? [])
    .filter((field) => field.origin === "system" || fieldHiddenInSurface(field, "detail"))
    .map((field) => field.name);
  return new Set([...configured, ...metadataHidden]);
}

function configuredDetailFieldVisible(
  key: string,
  value: unknown,
  config: SummaryCardsConfig,
  entity?: CompiledEntity,
): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (configuredDetailHiddenFields(config, entity).has(key)) return false;
  const field = entity ? fieldByName(entity, key) : undefined;
  return !(field && (field.origin === "system" || fieldHiddenInSurface(field, "detail")));
}

// ── Badge evaluators ──────────────────────────────────────────────────────────

const STATUS_TO_KIND: Record<string, BadgeKind> = {
  active: "active", inactive: "inactive", archived: "archived",
  draft: "draft", pending: "pending", blocked: "blocked",
  resigned: "inactive", terminated: "inactive",
  on_hold: "on_hold", "on-hold": "on_hold",
  sanctioned: "sanctioned", expired: "expired",
  connected: "active", synced: "active", verified: "verified",
  unverified: "unverified", conflict: "rejected", error: "blocked",
  drift: "on_hold", suspended: "blocked", invited: "pending",
  clear: "verified", passed: "verified", complete: "verified",
  missing: "unverified", incomplete: "unverified", not_started: "pending",
  not_checked: "pending", in_progress: "pending", failed: "rejected",
  received: "pending", waived: "verified", not_applicable: "verified",
  flagged: "sanctioned", pep: "on_hold", no_pep: "verified",
  unknown: "unverified",
};

function statusKind(status: string): BadgeKind {
  return STATUS_TO_KIND[status.toLowerCase()] ?? "active";
}

function daysUntil(val: unknown): number | null {
  if (!val) return null;
  try {
    const ms = new Date(String(val)).getTime() - Date.now();
    return Math.ceil(ms / 86_400_000);
  } catch { return null; }
}

function dateMs(val: unknown): number | null {
  if (!val) return null;
  const ms = new Date(String(val)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

interface BadgeEntry { kind: BadgeKind; label: string; }

function evaluateBadges(keys: string[], rec: ChildRecord): BadgeEntry[] {
  const out: BadgeEntry[] = [];
  for (const key of keys) {
    if (key === "primary" || key === "is_primary") {
      if (rec.is_primary === true)
        out.push({ kind: "primary", label: BADGE_KIND_LABEL.primary });
    } else if (key === "status") {
      const s = rec.status as string | undefined;
      if (s) {
        const kind = statusKind(s);
        out.push({ kind, label: BADGE_KIND_LABEL[kind] ?? titleCase(s) });
      }
    } else if (key === "verified" || key === "is_verified") {
      const v = rec.is_verified ?? rec.verified;
      out.push(
        v === true
          ? { kind: "verified",   label: BADGE_KIND_LABEL.verified   }
          : { kind: "unverified", label: BADGE_KIND_LABEL.unverified },
      );
    } else if (key === "expiry") {
      const dateVal = rec.effective_until ?? rec.expiry_date ?? rec.expires_at;
      const days = daysUntil(dateVal);
      if (days !== null) {
        if (days < 0)  out.push({ kind: "expired",       label: BADGE_KIND_LABEL.expired       });
        else if (days < 30) out.push({ kind: "expiring_soon", label: BADGE_KIND_LABEL.expiring_soon });
      }
    } else if (typeof rec[key] === "string") {
      const value = String(rec[key]);
      const kind = statusKind(value);
      out.push({ kind, label: humanizeIfCode(value) });
    }
  }
  return out;
}

function formatFactValue(key: string, val: unknown): string | null {
  if (val === null || val === undefined || val === "" || val === false) return null;
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return formatDate(str);
  if (key.endsWith("_pct") || key === "ownership_pct" || key === "voting_pct") {
    const n = Number(str);
    if (Number.isFinite(n)) return `${Number(n.toFixed(4)).toString()}%`;
  }
  return humanizeIfCode(maskIfNumeric(str));
}

interface RecordGroup {
  key: string;
  label: string;
  records: ChildRecord[];
}

function groupRecords(records: ChildRecord[], config: SummaryCardsConfig): RecordGroup[] {
  const field = config.group_by_field;
  if (!field) return [{ key: "__all", label: "Records", records }];

  const buckets = new Map<string, ChildRecord[]>();
  for (const rec of records) {
    const raw = rec[field];
    const key = raw === null || raw === undefined || raw === "" ? "__ungrouped" : String(raw);
    const current = buckets.get(key) ?? [];
    current.push(rec);
    buckets.set(key, current);
  }

  const labels = config.group_labels ?? {};
  const order = config.group_order ?? [];
  const orderedKeys = [
    ...order.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter((key) => !order.includes(key)).sort((a, b) => a.localeCompare(b)),
  ];

  return orderedKeys.map((key) => ({
    key,
    label: labels[key] ?? (key === "__ungrouped" ? "Other" : humanizeIfCode(key)),
    records: buckets.get(key) ?? [],
  }));
}

// ── Alert evaluators ──────────────────────────────────────────────────────────

function evaluateAlerts(rules: string[], rec: ChildRecord): RecordAlert | null {
  const alerts: RecordAlert[] = [];
  for (const rule of rules) {
    if (rule === "bank_missing_verification" && !rec.is_verified) {
      alerts.push({ severity: "warning", message: "Bank account not verified" });
    } else if (rule === "bank_inactive" && rec.status === "inactive") {
      alerts.push({ severity: "info", message: "Account is inactive" });
    } else if (rule === "cert_expired") {
      const days = daysUntil(rec.effective_until ?? rec.expiry_date);
      if (days !== null && days < 0)
        alerts.push({ severity: "critical", message: `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago` });
    } else if (rule === "cert_expiring_soon") {
      const days = daysUntil(rec.effective_until ?? rec.expiry_date);
      if (days !== null && days >= 0 && days < 14)
        alerts.push({ severity: "warning", message: `Expires in ${days} day${days !== 1 ? "s" : ""}` });
      else if (days !== null && days >= 14 && days < 90)
        alerts.push({ severity: "info",    message: `Expires ${formatDate(rec.effective_until ?? rec.expiry_date)}` });
    } else if (rule === "tax_missing_id") {
      const hasTaxId = rec.tax_number || rec.vat_number || rec.tax_id;
      if (!hasTaxId) alerts.push({ severity: "warning", message: "Tax ID not provided" });
    }
  }
  return (
    alerts.find((a) => a.severity === "critical") ??
    alerts.find((a) => a.severity === "warning")  ??
    alerts[0] ?? null
  );
}

// ── AlertStrip ────────────────────────────────────────────────────────────────

const ALERT_ICON: Record<AlertSeverity, ReactNode> = {
  info:     <Info     className="size-3 shrink-0" />,
  warning:  <AlertTriangle className="size-3 shrink-0" />,
  critical: <AlertCircle  className="size-3 shrink-0" />,
};

const ALERT_CLASS: Record<AlertSeverity, string> = {
  info:     "text-info",
  warning:  "text-warning",
  critical: "text-destructive",
};

function AlertStrip({ alert }: { alert: RecordAlert }) {
  return (
    <div className={cn("mt-1 flex items-center gap-1", ALERT_CLASS[alert.severity])}>
      {ALERT_ICON[alert.severity]}
      <span className="text-xs leading-none">{alert.message}</span>
    </div>
  );
}

// ── RecordBadge ───────────────────────────────────────────────────────────────

function RecordBadge({ kind, label }: { kind: BadgeKind; label: string }) {
  return (
    <Badge variant={BADGE_KIND_VARIANT[kind]} size="sm">
      {label}
    </Badge>
  );
}

// ── Action menu ───────────────────────────────────────────────────────────────

function RecordActionMenu({
  onEdit,
  onMarkPrimary,
  onDelete,
}: {
  onEdit?:        () => void;
  onMarkPrimary?: () => void;
  onDelete?:      () => void;
}) {
  if (!onEdit && !onMarkPrimary && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        aria-label="Record actions"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Edit2 className="size-3.5 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {onMarkPrimary && (
          <DropdownMenuItem onSelect={onMarkPrimary}>
            <Star className="size-3.5 mr-2" /> Mark as primary
          </DropdownMenuItem>
        )}
        {(onEdit || onMarkPrimary) && onDelete && (
          <DropdownMenuSeparator />
        )}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="size-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── RecordSummaryCard ─────────────────────────────────────────────────────────
// Five-zone card: Identity · Facts · Badges · Alert · Actions
// Card body click → detail drawer. Badges and menu stop propagation.

// -- Certification summary renderer ------------------------------------------

const CERT_EXPIRING_SOON_DAYS = 90;

interface ParameterSnapshotResponse {
  values?: Record<string, unknown>;
}

type CertificationState = "active" | "expiring_soon" | "expired" | "revoked" | "other";

interface CertificationMetrics {
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
}

const CERTIFICATION_STATE_THEME: Record<CertificationState, { progress: string }> = {
  active:        { progress: "bg-foreground" },
  expiring_soon: { progress: "bg-foreground" },
  expired:       { progress: "bg-foreground" },
  revoked:       { progress: "bg-foreground" },
  other:         { progress: "bg-foreground" },
};

function certificationTitle(rec: ChildRecord): string {
  return String(
    rec.certification_display_name ??
    rec.certification_type_name ??
    rec.custom_name ??
    "Certification",
  );
}

function certificationCategory(rec: ChildRecord): string | null {
  const raw = rec.certification_category ?? rec.category;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function certificationIssuer(rec: ChildRecord): string | null {
  const raw = rec.certified_by ?? rec.certification_issuing_body;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function certificationState(rec: ChildRecord, expiringSoonDays: number = CERT_EXPIRING_SOON_DAYS): CertificationState {
  const status = typeof rec.status === "string" ? rec.status.toLowerCase() : "";
  const days = daysUntil(rec.effective_until ?? rec.expiry_date ?? rec.expires_at);
  if (status === "revoked") return "revoked";
  if (status === "expired" || (days !== null && days < 0)) return "expired";
  if (days !== null && days <= expiringSoonDays) return "expiring_soon";
  if (status === "active") return "active";
  return "other";
}

function numberParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function certificationBadges(rec: ChildRecord, expiringSoonDays: number = CERT_EXPIRING_SOON_DAYS): BadgeEntry[] {
  const state = certificationState(rec, expiringSoonDays);
  if (state === "expired") return [{ kind: "expired", label: "Expired" }];
  if (state === "revoked") return [{ kind: "rejected", label: "Revoked" }];
  if (state === "expiring_soon") return [{ kind: "expiring_soon", label: "Expiring Soon" }];
  if (state === "active") return [{ kind: "active", label: "Active" }];
  const status = typeof rec.status === "string" ? rec.status : "Other";
  return [{ kind: "inactive", label: titleCase(status) }];
}

function certificationBarClasses(state: CertificationState): string {
  return CERTIFICATION_STATE_THEME[state].progress;
}

function certificationValidityProgress(rec: ChildRecord): number | null {
  const from = dateMs(rec.effective_from);
  const until = dateMs(rec.effective_until);
  if (from === null || until === null || until <= from) return null;
  const pct = ((Date.now() - from) / (until - from)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function certificationExpiryLabel(rec: ChildRecord): string {
  const days = daysUntil(rec.effective_until);
  if (days === null) return "No expiry date";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d remaining`;
}

function CertificationMetricTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  const toneClass = {
    success: "text-success bg-success/10 border-success/30",
    warning: "text-warning bg-warning/10 border-warning/30",
    destructive: "text-destructive bg-destructive/10 border-destructive/30",
    muted: "text-muted-foreground bg-muted/60 border-border",
  }[tone];

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={CHILD_FIELD_LABEL_CLASS}>{label}</p>
          <p className={cn("mt-1 tabular-nums", CHILD_KPI_VALUE_CLASS)}>{value}</p>
        </div>
        <div className={cn("flex size-7 items-center justify-center rounded-md border", toneClass)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function CertificationSummaryCard({
  rec,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
  canEdit,
  expiringSoonDays = CERT_EXPIRING_SOON_DAYS,
}: {
  rec:               ChildRecord;
  onView:            () => void;
  onEdit:            () => void;
  onDelete:          () => void;
  onMarkPrimary:     () => void;
  canEdit:           boolean;
  expiringSoonDays?: number;
}) {
  const state = certificationState(rec, expiringSoonDays);
  const category = certificationCategory(rec);
  const issuer = certificationIssuer(rec);
  const progress = certificationValidityProgress(rec);
  const certNo = typeof rec.certificate_number === "string" ? rec.certificate_number : null;
  const location = typeof rec.certified_location === "string" ? rec.certified_location : null;
  const hasPrimaryField = "is_primary" in rec;
  const isPrimary = rec.is_primary === true;

  return (
    <RowCard
      onClick={onView}
      className="group overflow-hidden"
    >
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <Award className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("truncate", CHILD_ITEM_TITLE_CLASS)}>{certificationTitle(rec)}</p>
              {category && (
                <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
                  {humanizeIfCode(category)}
                </Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {issuer && (
                <span className="inline-flex items-center gap-1">
                  <FileBadge className="size-3" />
                  {issuer}
                </span>
              )}
              {certNo && <span>{maskIfNumeric(certNo)}</span>}
              {location && <span>{location}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {certificationBadges(rec, expiringSoonDays).map((badge, i) => (
              <RecordBadge key={i} kind={badge.kind} label={badge.label} />
            ))}
            <RecordActionMenu
              onEdit={canEdit ? onEdit : undefined}
              onMarkPrimary={hasPrimaryField && !isPrimary && canEdit ? onMarkPrimary : undefined}
              onDelete={canEdit ? onDelete : undefined}
            />
          </div>
        </div>

        <div className="pl-12">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {formatDate(rec.effective_from)} - {formatDate(rec.effective_until)}
            </span>
            <span>{certificationExpiryLabel(rec)}</span>
          </div>
          {progress !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", certificationBarClasses(state))}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </RowCard>
  );
}

function CertificationSummaryView({
  records,
  tab,
  canAdd,
  canEdit,
  onAdd,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
  expiringSoonDays = CERT_EXPIRING_SOON_DAYS,
}: {
  records:           ChildRecord[];
  tab:               MasterTab;
  canAdd:            boolean;
  canEdit:           boolean;
  onAdd:             () => void;
  onView:            (rec: ChildRecord) => void;
  onEdit:            (rec: ChildRecord) => void;
  onDelete:          (rec: ChildRecord) => void;
  onMarkPrimary:     (rec: ChildRecord) => void;
  expiringSoonDays?: number;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  const metrics = records.reduce<CertificationMetrics>(
    (acc, rec) => {
      const state = certificationState(rec, expiringSoonDays);
      if (state === "active") acc.active += 1;
      else if (state === "expiring_soon") acc.expiring += 1;
      else if (state === "expired") acc.expired += 1;
      else if (state === "revoked") acc.revoked += 1;
      return acc;
    },
    { active: 0, expiring: 0, expired: 0, revoked: 0 },
  );

  const statusItems = [
    { value: "active", label: "Active", count: metrics.active },
    { value: "expiring_soon", label: "Expiring", count: metrics.expiring },
    { value: "expired", label: "Expired", count: metrics.expired },
    { value: "revoked", label: "Revoked", count: metrics.revoked },
  ];

  const categoryItems = Array.from(
    records.reduce<Map<string, number>>((acc, rec) => {
      const category = certificationCategory(rec);
      if (category) acc.set(category, (acc.get(category) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => humanizeIfCode(a).localeCompare(humanizeIfCode(b)))
    .map(([value, count]) => ({ value, label: humanizeIfCode(value), count }));

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRecords = records.filter((rec) => {
    if (statusFilter && certificationState(rec, expiringSoonDays) !== statusFilter) return false;
    if (categoryFilter && certificationCategory(rec) !== categoryFilter) return false;
    if (!normalizedSearch) return true;
    const haystack = [
      certificationTitle(rec),
      certificationCategory(rec),
      certificationIssuer(rec),
      rec.certificate_number,
      rec.certified_location,
      rec.additional_info,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CertificationMetricTile label="Active" value={metrics.active} tone="success" icon={<CheckCircle2 className="size-3.5" />} />
        <CertificationMetricTile label="Expiring Soon" value={metrics.expiring} tone="warning" icon={<Clock3 className="size-3.5" />} />
        <CertificationMetricTile label="Expired" value={metrics.expired} tone="destructive" icon={<AlertTriangle className="size-3.5" />} />
        <CertificationMetricTile label="Revoked" value={metrics.revoked} tone="muted" icon={<AlertCircle className="size-3.5" />} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <FilterPillBar
            compact
            items={statusItems}
            value={statusFilter}
            onChange={setStatusFilter}
            allItem={{ label: "All status" }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onSearch={setSearch}
              placeholder="Cert no., body, type..."
              className="w-full sm:w-64"
            />
            {canAdd && (
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
                <Plus className="size-3 shrink-0" />
                {tab.add_label ?? "Add"}
              </Button>
            )}
          </div>
        </div>

        {categoryItems.length > 0 && (
          <FilterPillBar
            compact
            items={categoryItems}
            value={categoryFilter}
            onChange={setCategoryFilter}
            allItem={{ label: "All categories" }}
          />
        )}
      </div>

      {filteredRecords.length > 0 ? (
        <div className="space-y-3">
          {filteredRecords.map((rec) => (
            <CertificationSummaryCard
              key={String(rec["id"] ?? Math.random())}
              rec={rec}
              onView={() => onView(rec)}
              onEdit={() => onEdit(rec)}
              onDelete={() => onDelete(rec)}
              onMarkPrimary={() => onMarkPrimary(rec)}
              canEdit={canEdit}
              expiringSoonDays={expiringSoonDays}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">No certifications match the current filters.</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filteredRecords.length} of {records.length} certification{records.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// -- Governance summary renderer ----------------------------------------------

type GovernanceRosterFilter = "all" | "ownership" | "leadership" | "advisory" | "inactive";

const GOVERNANCE_OWNERSHIP_ROLES = new Set(["shareholder", "ubo"]);
const GOVERNANCE_LEADERSHIP_ROLES = new Set([
  "director", "board_member", "officer", "signatory", "authorized_representative",
]);
const GOVERNANCE_ADVISORY_ROLES = new Set(["company_secretary", "auditor", "advisor", "proxy"]);

const OWNERSHIP_BAR_CLASS = "bg-foreground";

function numValue(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function pctValue(rec: ChildRecord): number | null {
  return (
    numValue(rec.ownership_pct) ??
    numValue(rec.beneficial_ownership_pct) ??
    numValue(rec.voting_pct)
  );
}

function pctLabel(val: number | null): string {
  if (val === null) return "—";
  return `${Number(val.toFixed(4)).toString()}%`;
}

function governanceRole(rec: ChildRecord): string {
  return String(rec.relation_type ?? "other");
}

function isGovernanceActive(rec: ChildRecord): boolean {
  const status = String(rec.status ?? "active").toLowerCase();
  return status === "active";
}

function governanceCluster(rec: ChildRecord): GovernanceRosterFilter {
  if (!isGovernanceActive(rec)) return "inactive";
  const role = governanceRole(rec);
  if (GOVERNANCE_OWNERSHIP_ROLES.has(role)) return "ownership";
  if (GOVERNANCE_LEADERSHIP_ROLES.has(role)) return "leadership";
  if (GOVERNANCE_ADVISORY_ROLES.has(role)) return "advisory";
  return "advisory";
}

function governanceInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "BP";
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  return `${tokens[0]![0] ?? ""}${tokens[tokens.length - 1]![0] ?? ""}`.toUpperCase();
}

function governanceSearchText(rec: ChildRecord): string {
  return [
    rec.member_name,
    rec.company_name,
    rec.relation_type,
    rec.member_type,
    rec.member_country_code,
    rec.business_title,
    rec.control_nature,
    rec.directness,
  ].filter(Boolean).join(" ").toLowerCase();
}

function governanceStatusBadges(rec: ChildRecord): BadgeEntry[] {
  const kyc = String(rec.kyc_status ?? "not_started");
  const sanctions = String(rec.sanctions_status ?? "not_checked");
  const pep = String(rec.pep_status ?? "unknown");
  const evidence = String(rec.evidence_status ?? "missing");
  const status = String(rec.status ?? "active");

  const out: BadgeEntry[] = [];
  if (sanctions === "blocked") out.push({ kind: "blocked", label: "Sanctions blocked" });
  else if (sanctions === "flagged") out.push({ kind: "sanctioned", label: "Sanctions flagged" });
  if (pep === "pep") out.push({ kind: "on_hold", label: "PEP" });
  if (kyc === "failed") out.push({ kind: "rejected", label: "KYC failed" });
  if (kyc === "expired" || evidence === "expired") out.push({ kind: "expired", label: "Evidence expired" });

  const allClear =
    (kyc === "verified" || kyc === "passed") &&
    sanctions === "clear" &&
    (pep === "no_pep" || pep === "not_applicable") &&
    (evidence === "verified" || evidence === "waived");

  if (out.length === 0 && allClear) {
    out.push({ kind: "verified", label: "Governance clear" });
  } else if (out.length === 0) {
    const pendingCount = [
      !(kyc === "verified" || kyc === "passed"),
      sanctions !== "clear",
      pep === "unknown",
      !(evidence === "verified" || evidence === "waived"),
    ].filter(Boolean).length;
    if (pendingCount > 0) out.push({ kind: "pending", label: `${pendingCount} checks pending` });
  }

  if (status !== "active") out.push({ kind: "inactive", label: humanizeIfCode(status) });
  else out.push({ kind: "active", label: "Active" });
  return out.slice(0, 3);
}

function GovernanceMetric({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className={CHILD_FIELD_LABEL_CLASS}>{label}</p>
          <p className={cn("mt-1", CHILD_KPI_VALUE_CLASS)}>{value}</p>
          {helper && <p className={cn("mt-1", CHILD_FIELD_HELPER_CLASS)}>{helper}</p>}
        </div>
      </div>
    </div>
  );
}

function GovernanceAvatar({ name }: { name: string; memberType?: unknown }) {
  return (
    <div className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
      {governanceInitials(name)}
    </div>
  );
}

function OwnershipComposition({ records }: { records: ChildRecord[] }) {
  const ownershipRecords = records
    .filter((rec) => GOVERNANCE_OWNERSHIP_ROLES.has(governanceRole(rec)) && pctValue(rec) !== null)
    .sort((a, b) => (pctValue(b) ?? 0) - (pctValue(a) ?? 0));
  const disclosedPct = Math.min(
    100,
    ownershipRecords
      .filter((rec) => governanceRole(rec) === "shareholder")
      .reduce((sum, rec) => sum + (pctValue(rec) ?? 0), 0),
  );

  if (ownershipRecords.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h4 className={CHILD_ITEM_TITLE_CLASS}>Ownership composition</h4>
          <p className={CHILD_FIELD_HELPER_CLASS}>Equity, beneficial ownership, and direct control</p>
        </div>
        <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
          {pctLabel(disclosedPct)} disclosed
        </Badge>
      </div>
      <div className="space-y-3 p-4">
        {ownershipRecords.map((rec, idx) => {
          const pct = pctValue(rec) ?? 0;
          const name = String(rec.member_name ?? rec.company_name ?? "Unnamed member");
          const barClass = OWNERSHIP_BAR_CLASS;
          return (
            <div key={String(rec.id ?? `${name}-${idx}`)} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("size-2 rounded-full", barClass)} />
                  <span className={cn("truncate", CHILD_FIELD_VALUE_CLASS)}>{name}</span>
                  <Badge variant="default" size="sm" className={CHILD_RELATION_BADGE_CLASS}>
                    {humanizeIfCode(governanceRole(rec))}
                  </Badge>
                </div>
                <span className={cn("shrink-0 tabular-nums", CHILD_ITEM_TITLE_CLASS)}>{pctLabel(pct)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GovernanceRow({
  rec,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
  canEdit,
}: {
  rec:           ChildRecord;
  onView:        () => void;
  onEdit:        () => void;
  onDelete:      () => void;
  onMarkPrimary: () => void;
  canEdit:       boolean;
}) {
  const name = String(rec.member_name ?? rec.company_name ?? "Unnamed member");
  const role = governanceRole(rec);
  const type = rec.member_type ? humanizeIfCode(String(rec.member_type)) : null;
  const since = rec.appointed_date ? `Since ${formatDate(rec.appointed_date)}` : null;
  const title = rec.business_title ? String(rec.business_title) : null;
  const country = rec.member_country_code ? String(rec.member_country_code) : null;
  const hasPrimaryField = "is_primary" in rec;
  const isPrimary = rec.is_primary === true;
  const statusValue = String(rec.status || "active");
  const statusBadge: BadgeEntry = {
    kind: statusKind(statusValue),
    label: statusValue.toLowerCase() === "active" ? "Active" : humanizeIfCode(statusValue),
  };
  const pendingBadges = governanceStatusBadges(rec).filter(
    (badge) => badge.kind !== statusBadge.kind || badge.label !== statusBadge.label,
  );

  return (
    <RowCard onClick={onView} className="group">
      <div className="flex items-start gap-3">
        <GovernanceAvatar name={name} memberType={rec.member_type} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("truncate", CHILD_ITEM_TITLE_CLASS)}>{name}</p>
            <Badge variant="default" size="sm" className={CHILD_RELATION_BADGE_CLASS}>
              {humanizeIfCode(role)}
            </Badge>
            <Badge variant={BADGE_KIND_VARIANT[statusBadge.kind]} size="sm" className="rounded-full px-2">
              {statusBadge.label}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {type && <span>{type}</span>}
            {since && <span>{since}</span>}
            {title && <span>{title}</span>}
            {country && <span>{country}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-start justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {pendingBadges.map((badge, i) => (
            <Badge key={i} variant={BADGE_KIND_VARIANT[badge.kind]} size="sm" className="rounded-full px-2">
              {badge.label}
            </Badge>
          ))}
          <RecordActionMenu
            onEdit={canEdit ? onEdit : undefined}
            onMarkPrimary={hasPrimaryField && !isPrimary && canEdit ? onMarkPrimary : undefined}
            onDelete={canEdit ? onDelete : undefined}
          />
        </div>
      </div>
    </RowCard>
  );
}

function GovernanceSection({
  title,
  description,
  icon,
  records,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
  canEdit,
}: {
  title:         string;
  description:   string;
  icon:          ReactNode;
  records:       ChildRecord[];
  onView:        (rec: ChildRecord) => void;
  onEdit:        (rec: ChildRecord) => void;
  onDelete:      (rec: ChildRecord) => void;
  onMarkPrimary: (rec: ChildRecord) => void;
  canEdit:       boolean;
}) {
  if (records.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="flex size-5 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
          {icon}
        </span>
        <h4 className={CHILD_ITEM_TITLE_CLASS}>{title}</h4>
        <Badge variant="muted" size="sm">{records.length}</Badge>
        <span className={CHILD_FIELD_HELPER_CLASS}>{description}</span>
      </div>
      <div className="space-y-2">
        {records.map((rec) => (
          <GovernanceRow
            key={String(rec.id ?? Math.random())}
            rec={rec}
            onView={() => onView(rec)}
            onEdit={() => onEdit(rec)}
            onDelete={() => onDelete(rec)}
            onMarkPrimary={() => onMarkPrimary(rec)}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}

function GovernanceSummaryView({
  records,
  tab,
  canAdd,
  canEdit,
  onAdd,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
}: {
  records:       ChildRecord[];
  tab:           MasterTab;
  canAdd:        boolean;
  canEdit:       boolean;
  onAdd:         () => void;
  onView:        (rec: ChildRecord) => void;
  onEdit:        (rec: ChildRecord) => void;
  onDelete:      (rec: ChildRecord) => void;
  onMarkPrimary: (rec: ChildRecord) => void;
}) {
  const [filter, setFilter] = useState<GovernanceRosterFilter>("all");
  const [search, setSearch] = useState("");

  const activeRecords = records.filter(isGovernanceActive);
  const disclosedPct = Math.min(
    100,
    activeRecords
      .filter((rec) => governanceRole(rec) === "shareholder")
      .reduce((sum, rec) => sum + (numValue(rec.ownership_pct) ?? 0), 0),
  );
  const uboCount = activeRecords.filter((rec) => governanceRole(rec) === "ubo").length;
  const leadershipCount = activeRecords.filter((rec) => governanceCluster(rec) === "leadership").length;
  const unresolvedCount = activeRecords.filter((rec) => {
    const badges = governanceStatusBadges(rec);
    return badges.some((b) => ["pending", "blocked", "sanctioned", "on_hold", "rejected", "expired"].includes(b.kind));
  }).length;
  const nextReview = activeRecords
    .map((rec) => rec.next_review_at)
    .filter(Boolean)
    .map((v) => String(v))
    .sort()[0];

  const filterItems = [
    { value: "all" as const, label: "All", count: records.length },
    { value: "ownership" as const, label: "Ownership", count: records.filter((r) => governanceCluster(r) === "ownership").length },
    { value: "leadership" as const, label: "Leadership", count: records.filter((r) => governanceCluster(r) === "leadership").length },
    { value: "advisory" as const, label: "Advisory", count: records.filter((r) => governanceCluster(r) === "advisory").length },
    { value: "inactive" as const, label: "Inactive", count: records.filter((r) => governanceCluster(r) === "inactive").length },
  ];

  const q = search.trim().toLowerCase();
  const filtered = records.filter((rec) => {
    if (filter !== "all" && governanceCluster(rec) !== filter) return false;
    if (!q) return true;
    return governanceSearchText(rec).includes(q);
  });

  const byCluster = {
    ownership: filtered.filter((rec) => governanceCluster(rec) === "ownership"),
    leadership: filtered.filter((rec) => governanceCluster(rec) === "leadership"),
    advisory: filtered.filter((rec) => governanceCluster(rec) === "advisory"),
    inactive: filtered.filter((rec) => governanceCluster(rec) === "inactive"),
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GovernanceMetric
          label="Disclosed ownership"
          value={pctLabel(disclosedPct)}
          helper={disclosedPct >= 100 ? "Threshold met" : "Disclosure incomplete"}
          icon={<Scale className="size-3.5" />}
        />
        <GovernanceMetric
          label="Beneficial owners"
          value={String(uboCount)}
          helper={uboCount === 1 ? "1 owner current" : `${uboCount} owners current`}
          icon={<Users className="size-3.5" />}
        />
        <GovernanceMetric
          label="Leadership roles"
          value={String(leadershipCount)}
          helper="Board, officers, and signatories"
          icon={<Building2 className="size-3.5" />}
        />
        <GovernanceMetric
          label="Compliance posture"
          value={unresolvedCount === 0 ? "Clear" : `${unresolvedCount} pending`}
          helper={nextReview ? `Next review ${formatDate(nextReview)}` : "No review date"}
          icon={<ShieldCheck className="size-3.5" />}
        />
      </div>

      <OwnershipComposition records={activeRecords} />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className={CHILD_ITEM_TITLE_CLASS}>Governance roster</h4>
            <p className={CHILD_FIELD_HELPER_CLASS}>{filtered.length} of {records.length} records</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <FilterPillBar
              compact
              items={filterItems}
              value={filter}
              onChange={setFilter}
            />
            <SearchInput
              value={search}
              onSearch={setSearch}
              placeholder="Search members..."
              className="w-full sm:w-56"
            />
            {canAdd && (
              <Button variant="primary" size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
                <Plus className="size-3 shrink-0" />
                {tab.add_label ?? "Add member"}
              </Button>
            )}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-4">
            <GovernanceSection
              title="Ownership & Beneficial Interest"
              description="Equity holders and ultimate beneficial owners"
              icon={<Scale className="size-3" />}
              records={byCluster.ownership}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkPrimary={onMarkPrimary}
              canEdit={canEdit}
            />
            <GovernanceSection
              title="Board & Leadership"
              description="Directors, officers, and authority holders"
              icon={<Building2 className="size-3" />}
              records={byCluster.leadership}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkPrimary={onMarkPrimary}
              canEdit={canEdit}
            />
            <GovernanceSection
              title="Advisory & Assurance"
              description="Auditors, advisors, secretaries, and proxies"
              icon={<ShieldCheck className="size-3" />}
              records={byCluster.advisory}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkPrimary={onMarkPrimary}
              canEdit={canEdit}
            />
            <GovernanceSection
              title="Inactive"
              description="Former or terminated governance relationships"
              icon={<Clock3 className="size-3" />}
              records={byCluster.inactive}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkPrimary={onMarkPrimary}
              canEdit={canEdit}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">No governance records match the current filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordSummaryCard({
  rec,
  config,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
  canEdit,
}: {
  rec:           ChildRecord;
  config:        SummaryCardsConfig;
  onView:        () => void;
  onEdit:        () => void;
  onDelete:      () => void;
  onMarkPrimary: () => void;
  canEdit:       boolean;
}) {
  const titleVal = config.title ? rec[config.title] : null;
  const title = titleVal ? String(titleVal) : "—";

  const factsStr = (config.facts ?? [])
    .map((f) => {
      const v = rec[f];
      return formatFactValue(f, v);
    })
    .filter(Boolean)
    .join(" · ");

  const badges  = evaluateBadges(config.badges ?? [], rec);
  const alert   = evaluateAlerts(config.alertRules ?? [], rec);
  const hasPrimaryField = "is_primary" in rec;
  const isPrimary       = rec.is_primary === true;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative flex items-start gap-3 bg-card px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={onView}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(); } }}
    >
      {/* Zone 1+2: Identity + Facts */}
      <div className="flex-1 min-w-0">
        <p className={cn("truncate", CHILD_ITEM_TITLE_CLASS)}>{title}</p>
        {factsStr && (
          <p className={cn("mt-0.5 truncate", CHILD_FIELD_HELPER_CLASS)}>{factsStr}</p>
        )}
        {/* Zone 4: Alert */}
        {alert && <AlertStrip alert={alert} />}
      </div>

      {/* Zone 3: Badges | Zone 5: Actions
          The wrapper div stops propagation so badges/menu never open the detail drawer. */}
      <div
        className="flex items-center gap-1.5 shrink-0 mt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {badges.map((b, i) => (
          <RecordBadge key={i} kind={b.kind} label={b.label} />
        ))}
        <RecordActionMenu
          onEdit={canEdit ? onEdit : undefined}
          onMarkPrimary={hasPrimaryField && !isPrimary && canEdit ? onMarkPrimary : undefined}
          onDelete={canEdit ? onDelete : undefined}
        />
      </div>
    </div>
  );
}

// ── RecordDetailDrawer ─────────────────────────────────────────────────────────
// Read mode: labels + values grid. Never renders disabled inputs.

function FieldGrid({
  entries,
  rec,
}: {
  entries: [string, unknown][];
  rec: ChildRecord;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      {entries.map(([key, val]) => (
        <div key={key}>
          <dt className={cn("mb-1", CHILD_FIELD_LABEL_CLASS)}>
            <OperationalFieldLabel field={key} fallback={titleCase(key.replace(/_id$/, ""))} />
          </dt>
          <dd className={CHILD_FIELD_VALUE_CLASS}>
            <OperationalFieldValue rec={rec} field={key} value={val} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecordDetailDrawer({
  open,
  onOpenChange,
  rec,
  entityTypeLabel,
  entityCode,
  entity,
  config,
  displayFields,
  onEdit,
  canEdit,
}: {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  rec:             ChildRecord | null;
  entityTypeLabel: string;
  entityCode:      string;
  entity?:         CompiledEntity;
  config:          SummaryCardsConfig;
  /** Ordered whitelist from tab.display_fields. When supplied, only these fields
   *  are shown. Metadata audit fields are moved to a collapsed section. */
  displayFields?:  string[];
  onEdit:          () => void;
  canEdit:         boolean;
}) {
  const [auditOpen, setAuditOpen] = useState(false);
  if (!rec) return null;

  const titleField = config.title;
  const rawTitle = titleField ? rec[titleField] : null;
  const title = rawTitle && titleField
    ? <OperationalFieldValue rec={rec} field={titleField} value={rawTitle} />
    : titleCase(entityTypeLabel);

  let mainEntries: [string, unknown][];
  let auditEntries: [string, unknown][];
  const auditFields = configuredDetailAuditFields(config, entity);
  const isVisible = (k: string, v: unknown) => configuredDetailFieldVisible(k, v, config, entity);

  if (displayFields && displayFields.length > 0) {
    // Respect the explicit field whitelist — show only listed fields in listed order.
    const mainKeys  = displayFields.filter((k) => !auditFields.has(k));
    const auditKeys = displayFields.filter((k) => auditFields.has(k));
    mainEntries  = mainKeys.filter((k) => isVisible(k, rec[k])).map((k) => [k, rec[k]]);
    auditEntries = auditKeys.filter((k) => isVisible(k, rec[k])).map((k) => [k, rec[k]]);
  } else {
    // Fallback: all non-system, non-empty fields. Audit fields split to bottom section.
    const all = Object.entries(rec).filter(([k, v]) => {
      return isVisible(k, v);
    });
    mainEntries  = all.filter(([k]) => !auditFields.has(k));
    auditEntries = all.filter(([k]) =>  auditFields.has(k));
  }

  return (
    <OperationalDisplayMetadataProvider entityCode={entityCode} config={config}>
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`master:child-detail:${entityTypeLabel.toLowerCase().replace(/\s+/g, "_")}`}
      defaultWidth={480}
      minWidth={380}
      resizable
      badge={entityTypeLabel.toUpperCase()}
      title={title}
      footerEnd={
        canEdit ? (
          <Button size="sm" onClick={onEdit}>
            <Edit2 className="size-3.5 mr-1.5" /> Edit
          </Button>
        ) : undefined
      }
    >
      <div className="px-5 py-4 space-y-5">
        <FieldGrid entries={mainEntries} rec={rec} />

        {auditEntries.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setAuditOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("size-3 transition-transform", auditOpen && "rotate-90")} />
              Audit
            </button>
            {auditOpen && (
              <div className="mt-3">
                <FieldGrid entries={auditEntries} rec={rec} />
              </div>
            )}
          </div>
        )}
      </div>
    </DrawerShell>
    </OperationalDisplayMetadataProvider>
  );
}

// ── RecordFormDrawer ──────────────────────────────────────────────────────────
// Handles create + edit with dirty-guard on close.

function RecordFormDrawer({
  open,
  onOpenChange,
  mode,
  entityCode,
  createEntityCode,
  linkEntityCode,
  linkOwnerType,
  ownerTypeFilter,
  partyTypeFilter,
  parentId,
  initialData,
  addLabel,
  entityTypeLabel,
  onSuccess,
}: {
  open:             boolean;
  onOpenChange:     (open: boolean) => void;
  mode:             "create" | "edit";
  entityCode:       string;
  createEntityCode: string;
  linkEntityCode?:  string;
  linkOwnerType?:   string;
  ownerTypeFilter?: string;
  partyTypeFilter?: string;
  parentId:         string;
  initialData?:     ChildRecord;
  addLabel?:        string;
  entityTypeLabel:  string;
  onSuccess:        () => void;
}) {
  const formRef   = useRef<EntityFormHandle>(null);
  const [isDirty,      setIsDirty]      = useState(false);
  const [discardOpen,  setDiscardOpen]  = useState(false);
  const [isPending,    setIsPending]    = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v && isDirty) { setDiscardOpen(true); return; }
    if (!v) { setIsDirty(false); }
    onOpenChange(v);
  }

  function handleDiscard() {
    setDiscardOpen(false);
    setIsDirty(false);
    onOpenChange(false);
  }

  const drawerTitle =
    mode === "create"
      ? (addLabel ?? `New ${titleCase(entityTypeLabel)}`)
      : `Edit ${titleCase(entityTypeLabel)}`;

  async function handleSubmit(formData: Record<string, unknown>) {
    setIsPending(true);
    try {
      if (mode === "create") {
        const scopedFormData = applyScopeFilters(formData, ownerTypeFilter, partyTypeFilter);
        const primaryBody = linkEntityCode
          ? { data: scopedFormData }
          : { data: { ...scopedFormData, parent_id: parentId } };

        const res = await fetch(
          `/api/relay/api/records/${encodeURIComponent(createEntityCode)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(primaryBody) },
        );
        if (!res.ok) {
          const err = await res.json() as { message?: string };
          throw new Error(err.message ?? "Failed to create record");
        }

        if (linkEntityCode && linkOwnerType) {
          const created = await res.json() as Record<string, unknown>;
          const newId   = String(created["id"] ?? "");
          const linkRes = await fetch(
            `/api/relay/api/records/${encodeURIComponent(linkEntityCode)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data: {
                  [`${createEntityCode}_id`]: newId,
                  owner_id:                  parentId,
                  owner_type:                linkOwnerType,
                },
              }),
            },
          );
          if (!linkRes.ok) {
            const err = await linkRes.json() as { message?: string };
            throw new Error(err.message ?? "Failed to link record");
          }
        }
      } else {
        const linkedPrimaryIdField = `${createEntityCode}_id`;
        const recId = String(
          linkEntityCode
            ? (initialData?.[linkedPrimaryIdField] ?? initialData?.["id"] ?? "")
            : (initialData?.["id"] ?? ""),
        );
        const res   = await fetch(
          `/api/relay/api/records/${encodeURIComponent(createEntityCode)}/${encodeURIComponent(recId)}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: formData }) },
        );
        if (!res.ok) {
          const err = await res.json() as { message?: string };
          throw new Error(err.message ?? "Failed to update record");
        }
      }
      setIsDirty(false);
      onOpenChange(false);
      onSuccess();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <DrawerShell
        open={open}
        onOpenChange={handleOpenChange}
        intent="transactional"
        widthKey={`master:child-form:${createEntityCode}`}
        defaultWidth={520}
        minWidth={400}
        resizable
        badge={entityTypeLabel.toUpperCase()}
        title={drawerTitle}
        footerEnd={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={isPending}
              onClick={() => void formRef.current?.submit()}
            >
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="px-5 py-4">
          <EntityForm
            ref={formRef}
            entityCode={createEntityCode}
            initialData={mode === "edit" ? initialData : undefined}
            onSubmit={handleSubmit}
            onChange={() => setIsDirty(true)}
            submitting={isPending}
            hideActions
            noFrame
          />
        </div>
      </DrawerShell>

      {/* Dirty-edit guard — triggered by X, outside click, or Escape */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes haven&apos;t been saved. Closing will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardOpen(false)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyCanAdd({
  title, description, addLabel, onAdd,
}: { title?: string; description?: string; addLabel?: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
      <p className="text-sm text-muted-foreground">{title ?? "No records"}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-xs">{description}</p>
      )}
      <Button size="sm" variant="outline" onClick={onAdd} className="mt-1">
        <Plus className="size-3.5 mr-1.5" />
        {addLabel ?? "Add"}
      </Button>
    </div>
  );
}

function EmptyPermissionDenied({
  title, description, addLabel,
}: { title?: string; description?: string; addLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
      <p className="text-sm text-muted-foreground">{title ?? "No records"}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-xs">{description}</p>
      )}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-1 inline-block">
              <Button size="sm" variant="outline" disabled>
                <Plus className="size-3.5 mr-1.5" />
                {addLabel ?? "Add"}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>You don&apos;t have permission to add records here.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function EmptyRuleManaged({
  title, description,
}: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      <p className="text-sm text-muted-foreground">{title ?? "No records"}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-xs">{description}</p>
      )}
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open:        boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm:   () => void;
  isPending:   boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── ChildSummaryCardsPanel ────────────────────────────────────────────────────
// Public export — wired from MasterDetailPage for renderer="summary_cards_with_drawer".

export function ChildSummaryCardsPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
  certExpiringSoonDays,
}: {
  tab:                   MasterTab;
  recordUuid:            string;
  editMode:              boolean;
  viewOnlyReason:        ViewOnlyReason | null;
  certExpiringSoonDays?: number;
}) {
  const entityCode       = tab.entity_code!;
  const createEntityCode = tab.create_entity_code ?? entityCode;
  const mutationEntityCode = tab.link_entity_code ?? createEntityCode;
  const config           = tab.config ?? { title: tab.display_fields?.[0] ?? "id" };
  const { data: childEntity } = useCompiledEntity(entityCode);

  const queryClient = useQueryClient();

  // through_entity is resolved server-side via a subquery — no client-side fetch needed.
  const childQueryKey = ["child-entity", entityCode, recordUuid, childScopeKey(tab)] as const;

  const [detailOpen,   setDetailOpen]   = useState(false);
  const [formOpen,     setFormOpen]     = useState(false);
  const [formMode,     setFormMode]     = useState<"create" | "edit">("create");
  const [activeRecord, setActiveRecord] = useState<ChildRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChildRecord | null>(null);
  const [activeGroup,  setActiveGroup]  = useState<string>("__all");

  const { data, isLoading, isError } = useQuery<{ data: ChildRecord[] }>({
    queryKey: childQueryKey,
    queryFn: async ({ signal }) => {
      const res = await fetch(buildChildRecordsUrl(entityCode, recordUuid, tab), { signal });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ChildRecord[] }>;
    },
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (rec: ChildRecord) => {
      const recId = String(rec["id"] ?? "");
      const res   = await fetch(
        `/api/relay/api/records/${encodeURIComponent(mutationEntityCode)}/${encodeURIComponent(recId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to delete record");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: childQueryKey });
      setDeleteTarget(null);
    },
  });

  const markPrimaryMutation = useMutation({
    mutationFn: async (rec: ChildRecord) => {
      const recId = String(rec["id"] ?? "");
      const res   = await fetch(
        `/api/relay/api/records/${encodeURIComponent(mutationEntityCode)}/${encodeURIComponent(recId)}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ data: { is_primary: true } }),
        },
      );
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to mark as primary");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: childQueryKey });
    },
  });

  const rawRecords = data?.data ?? [];

  // Apply client-side sort from config.defaultSort before rendering.
  const records = useMemo(
    () => applyDefaultSort(rawRecords, config.defaultSort ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawRecords, (config.defaultSort ?? []).join(",")],
  );

  const groupedSections = useMemo(
    () => groupRecords(records, config),
    [records, config],
  );
  const hasGroups = Boolean(config.group_by_field);
  const filteredSections = hasGroups && activeGroup !== "__all"
    ? groupedSections.filter((section) => section.key === activeGroup)
    : groupedSections;
  const visibleSections = filteredSections.length > 0 ? filteredSections : groupedSections;

  // Permission model: mutation actions require edit mode, no view-only lock, and
  // an add surface where creation is supported.
  // viewOnlyReason.label === "View only" → permission denied.
  // viewOnlyReason.label contains lifecycle state → rule-managed section.
  const canMutate = editMode && !viewOnlyReason;
  const canAdd = canMutate && !!tab.add_href_template;
  const canEdit = canMutate;
  const isBankingPanel = entityCode === "business_partner_bank_account" || entityCode === "supplier_bank_account";
  const isTaxProfilePanel = entityCode === "business_partner_tax_profile";
  const isCertificationPanel = entityCode === "business_partner_certification";
  const isGovernancePanel = entityCode === "business_partner_governance";

  const certParameterQuery = useQuery<ParameterSnapshotResponse>({
    queryKey: ["iam", "parameters", "effective", "governance.cert"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/iam/parameters/effective?namespace=governance.cert", {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return { values: {} };
      return res.json() as Promise<ParameterSnapshotResponse>;
    },
    staleTime: 300_000,
    retry: false,
    enabled: isCertificationPanel && certExpiringSoonDays === undefined,
  });

  const resolvedCertExpiringSoonDays = certExpiringSoonDays ?? numberParam(
    certParameterQuery.data?.values?.["governance.cert.expiring_soon_days"],
    CERT_EXPIRING_SOON_DAYS,
  );

  function handleViewRecord(rec: ChildRecord) {
    setActiveRecord(rec);
    setDetailOpen(true);
  }

  function handleEditRecord(rec: ChildRecord) {
    setActiveRecord(rec);
    setFormMode("edit");
    setDetailOpen(false);
    setFormOpen(true);
  }

  function handleAddNew() {
    setActiveRecord(null);
    setFormMode("create");
    setFormOpen(true);
  }

  function handleFormSuccess() {
    void queryClient.invalidateQueries({ queryKey: childQueryKey });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-sm text-destructive">Failed to load records.</p>
      </div>
    );
  }

  // Empty state — three variants
  if (records.length === 0) {
    if (!editMode) {
      return (
        <EmptyRuleManaged
          title={tab.empty_title}
          description={tab.empty_description}
        />
      );
    }
    if (!tab.add_href_template) {
      return (
        <EmptyRuleManaged
          title={tab.empty_title}
          description={tab.empty_description}
        />
      );
    }
    if (!canAdd) {
      const isLifecycleLock =
        viewOnlyReason !== null &&
        viewOnlyReason.label !== "View only";
      return isLifecycleLock ? (
        <EmptyRuleManaged
          title={tab.empty_title}
          description={tab.empty_description}
        />
      ) : (
        <EmptyPermissionDenied
          title={tab.empty_title}
          description={tab.empty_description}
          addLabel={tab.add_label}
        />
      );
    }
    return (
      <EmptyCanAdd
        title={tab.empty_title}
        description={tab.empty_description}
        addLabel={tab.add_label}
        onAdd={handleAddNew}
      />
    );
  }

  if (supportsOperationalPresentation(config.presentation)) {
    return (
      <>
        <OperationalPresentationView
          records={records}
          tab={tab}
          config={config}
          canAdd={canAdd}
          canEdit={canEdit}
          onAdd={handleAddNew}
          onView={handleViewRecord}
          onEdit={handleEditRecord}
          onDelete={setDeleteTarget}
          onMarkPrimary={(rec) => void markPrimaryMutation.mutate(rec)}
        />

        <RecordDetailDrawer
          open={detailOpen}
          onOpenChange={setDetailOpen}
          rec={activeRecord}
          entityTypeLabel={tab.label}
          entityCode={entityCode}
          entity={childEntity}
          config={config}
          displayFields={tab.display_fields}
          onEdit={() => { if (activeRecord) handleEditRecord(activeRecord); }}
          canEdit={canEdit}
        />

        <RecordFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          entityCode={entityCode}
          createEntityCode={createEntityCode}
          linkEntityCode={tab.link_entity_code}
          linkOwnerType={tab.link_owner_type}
          ownerTypeFilter={tab.owner_type_filter}
          partyTypeFilter={tab.party_type_filter}
          parentId={recordUuid}
          initialData={activeRecord ?? undefined}
          addLabel={tab.add_label}
          entityTypeLabel={tab.label}
          onSuccess={handleFormSuccess}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
          isPending={deleteMutation.isPending}
        />
      </>
    );
  }

  if (isBankingPanel) {
    return (
      <>
        <BankingSummaryPanel
          records={records}
          tab={tab}
          editMode={editMode}
          canAdd={canAdd}
          canEdit={canEdit}
          onAdd={handleAddNew}
          onEdit={handleEditRecord}
          onMarkPrimary={(rec) => void markPrimaryMutation.mutate(rec)}
        />

        <RecordFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          entityCode={entityCode}
          createEntityCode={createEntityCode}
          linkEntityCode={tab.link_entity_code}
          linkOwnerType={tab.link_owner_type}
          ownerTypeFilter={tab.owner_type_filter}
          partyTypeFilter={tab.party_type_filter}
          parentId={recordUuid}
          initialData={activeRecord ?? undefined}
          addLabel={tab.add_label}
          entityTypeLabel={tab.label}
          onSuccess={handleFormSuccess}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
          isPending={deleteMutation.isPending}
        />
      </>
    );
  }

  if (isTaxProfilePanel) {
    return (
      <>
        <TaxProfileSummaryPanel
          records={records}
          tab={tab}
          auditFields={childEntity ? configuredAuditFieldNames(childEntity) : undefined}
          statusFields={childEntity ? configuredStatusFieldNames(childEntity) : undefined}
          canAdd={canAdd}
          canEdit={canEdit}
          onAdd={handleAddNew}
          onEdit={handleEditRecord}
          onDelete={setDeleteTarget}
        />

        <RecordFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          entityCode={entityCode}
          createEntityCode={createEntityCode}
          linkEntityCode={tab.link_entity_code}
          linkOwnerType={tab.link_owner_type}
          ownerTypeFilter={tab.owner_type_filter}
          partyTypeFilter={tab.party_type_filter}
          parentId={recordUuid}
          initialData={activeRecord ?? undefined}
          addLabel={tab.add_label}
          entityTypeLabel={tab.label}
          onSuccess={handleFormSuccess}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
          isPending={deleteMutation.isPending}
        />
      </>
    );
  }

  if (isCertificationPanel) {
    return (
      <>
        <CertificationSummaryView
          records={records}
          tab={tab}
          canAdd={canAdd}
          canEdit={canEdit}
          onAdd={handleAddNew}
          onView={handleViewRecord}
          onEdit={handleEditRecord}
          onDelete={setDeleteTarget}
          onMarkPrimary={(rec) => void markPrimaryMutation.mutate(rec)}
          expiringSoonDays={resolvedCertExpiringSoonDays}
        />

        <RecordDetailDrawer
          open={detailOpen}
          onOpenChange={setDetailOpen}
          rec={activeRecord}
          entityTypeLabel={tab.label}
          entityCode={entityCode}
          entity={childEntity}
          config={config}
          displayFields={tab.display_fields}
          onEdit={() => { if (activeRecord) handleEditRecord(activeRecord); }}
          canEdit={canEdit}
        />

        <RecordFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          entityCode={entityCode}
          createEntityCode={createEntityCode}
          linkEntityCode={tab.link_entity_code}
          linkOwnerType={tab.link_owner_type}
          ownerTypeFilter={tab.owner_type_filter}
          partyTypeFilter={tab.party_type_filter}
          parentId={recordUuid}
          initialData={activeRecord ?? undefined}
          addLabel={tab.add_label}
          entityTypeLabel={tab.label}
          onSuccess={handleFormSuccess}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
          isPending={deleteMutation.isPending}
        />
      </>
    );
  }

  if (isGovernancePanel) {
    return (
      <>
        <GovernanceSummaryView
          records={records}
          tab={tab}
          canAdd={canAdd}
          canEdit={canEdit}
          onAdd={handleAddNew}
          onView={handleViewRecord}
          onEdit={handleEditRecord}
          onDelete={setDeleteTarget}
          onMarkPrimary={(rec) => void markPrimaryMutation.mutate(rec)}
        />

        <RecordDetailDrawer
          open={detailOpen}
          onOpenChange={setDetailOpen}
          rec={activeRecord}
          entityTypeLabel={tab.label}
          entityCode={entityCode}
          entity={childEntity}
          config={config}
          displayFields={tab.display_fields}
          onEdit={() => { if (activeRecord) handleEditRecord(activeRecord); }}
          canEdit={canEdit}
        />

        <RecordFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          entityCode={entityCode}
          createEntityCode={createEntityCode}
          linkEntityCode={tab.link_entity_code}
          linkOwnerType={tab.link_owner_type}
          ownerTypeFilter={tab.owner_type_filter}
          partyTypeFilter={tab.party_type_filter}
          parentId={recordUuid}
          initialData={activeRecord ?? undefined}
          addLabel={tab.add_label}
          entityTypeLabel={tab.label}
          onSuccess={handleFormSuccess}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
          isPending={deleteMutation.isPending}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </p>
            {hasGroups && (
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveGroup("__all")}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                    activeGroup === "__all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  All
                </button>
                {groupedSections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveGroup(section.key)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                      activeGroup === section.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {section.label} {section.records.length}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canAdd && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleAddNew}>
              <Plus className="size-3 shrink-0" />
              {tab.add_label ?? "Add"}
            </Button>
          )}
        </div>

        {/* Card list */}
        <div className="space-y-3">
          {visibleSections.map((section) => (
            <section key={section.key} className="overflow-hidden rounded-lg border border-border">
              {hasGroups && (
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                  <h4 className={CHILD_ITEM_TITLE_CLASS}>
                    {section.label}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {section.records.length} record{section.records.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              <div className="divide-y divide-border">
                {section.records.map((rec) => (
                  <RecordSummaryCard
                    key={String(rec["id"] ?? Math.random())}
                    rec={rec}
                    config={config}
                    onView={() => handleViewRecord(rec)}
                    onEdit={() => handleEditRecord(rec)}
                    onDelete={() => setDeleteTarget(rec)}
                    onMarkPrimary={() => void markPrimaryMutation.mutate(rec)}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Tier 2: Read-mode detail drawer */}
      <RecordDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        rec={activeRecord}
        entityTypeLabel={tab.label}
        entityCode={entityCode}
        entity={childEntity}
        config={config}
        displayFields={tab.display_fields}
        onEdit={() => { if (activeRecord) handleEditRecord(activeRecord); }}
        canEdit={canEdit}
      />

      {/* Tier 3: Create/edit form drawer */}
      <RecordFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        entityCode={entityCode}
        createEntityCode={createEntityCode}
        linkEntityCode={tab.link_entity_code}
        linkOwnerType={tab.link_owner_type}
        ownerTypeFilter={tab.owner_type_filter}
        partyTypeFilter={tab.party_type_filter}
        parentId={recordUuid}
        initialData={activeRecord ?? undefined}
        addLabel={tab.add_label}
        entityTypeLabel={tab.label}
        onSuccess={handleFormSuccess}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) void deleteMutation.mutate(deleteTarget); }}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
