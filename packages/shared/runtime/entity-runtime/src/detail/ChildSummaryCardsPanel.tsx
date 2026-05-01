"use client";

import { useState, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, Info, MoreHorizontal, Plus, Star, Trash2, Edit2,
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
import type { SummaryCardsConfig, RichMasterTab } from "@athyper/metadata-client/compiled-reader";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";

// ── Shared types ──────────────────────────────────────────────────────────────

type ChildRecord = Record<string, unknown>;

export interface ViewOnlyReason {
  label:   string;
  tooltip: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

const SYSTEM_FIELDS = new Set([
  "id", "tenant_id", "parent_id", "owner_id", "owner_type",
  "entity_code", "created_by", "updated_by",
]);

// ── Badge evaluators ──────────────────────────────────────────────────────────

const STATUS_TO_KIND: Record<string, BadgeKind> = {
  active: "active", inactive: "inactive", archived: "archived",
  draft: "draft", pending: "pending", blocked: "blocked",
  on_hold: "on_hold", "on-hold": "on_hold",
  sanctioned: "sanctioned", expired: "expired",
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
    }
  }
  return out;
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
      <span className="text-[11px] leading-none">{alert.message}</span>
    </div>
  );
}

// ── RecordBadge ───────────────────────────────────────────────────────────────

function RecordBadge({ kind, label }: { kind: BadgeKind; label: string }) {
  return (
    <Badge variant={BADGE_KIND_VARIANT[kind]} className="text-[10px] px-1.5 py-0 h-5 leading-none">
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
      if (v === null || v === undefined || v === "") return null;
      const str = String(v);
      return maskIfNumeric(str);
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
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {factsStr && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{factsStr}</p>
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

function RecordDetailDrawer({
  open,
  onOpenChange,
  rec,
  entityTypeLabel,
  config,
  onEdit,
  canEdit,
}: {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  rec:             ChildRecord | null;
  entityTypeLabel: string;
  config:          SummaryCardsConfig;
  onEdit:          () => void;
  canEdit:         boolean;
}) {
  if (!rec) return null;

  const title = config.title ? String(rec[config.title] ?? "—") : "Record";

  const fieldEntries = Object.entries(rec).filter(([k, v]) => {
    if (SYSTEM_FIELDS.has(k)) return false;
    if (k.endsWith("_id") && k !== "bank_account_id") return false;
    return v !== null && v !== undefined && v !== "";
  });

  return (
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
      <div className="px-5 py-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          {fieldEntries.map(([key, val]) => (
            <div key={key}>
              <dt className="mb-1 text-xs font-medium text-muted-foreground leading-normal">
                {titleCase(key)}
              </dt>
              <dd className="text-sm text-foreground leading-snug">
                {formatValue(key, val)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </DrawerShell>
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
        const primaryBody = linkEntityCode
          ? { data: formData }
          : { data: { ...formData, parent_id: parentId } };

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
        const recId = String(initialData?.["id"] ?? "");
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
// Public export — wired from RichMasterDetailPage for renderer="summary_cards_with_drawer".

export function ChildSummaryCardsPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  tab:            RichMasterTab;
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const entityCode       = tab.entity_code!;
  const createEntityCode = tab.create_entity_code ?? entityCode;
  const config           = tab.config ?? { title: tab.display_fields?.[0] ?? "id" };

  const queryClient  = useQueryClient();
  const childQueryKey = ["child-entity", entityCode, recordUuid] as const;

  const [detailOpen,   setDetailOpen]   = useState(false);
  const [formOpen,     setFormOpen]     = useState(false);
  const [formMode,     setFormMode]     = useState<"create" | "edit">("create");
  const [activeRecord, setActiveRecord] = useState<ChildRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChildRecord | null>(null);

  const { data, isLoading, isError } = useQuery<{ data: ChildRecord[] }>({
    queryKey: childQueryKey,
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}?parent_id=${encodeURIComponent(recordUuid)}`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ChildRecord[] }>;
    },
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (rec: ChildRecord) => {
      const recId = String(rec["id"] ?? "");
      const res   = await fetch(
        `/api/relay/api/records/${encodeURIComponent(createEntityCode)}/${encodeURIComponent(recId)}`,
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
        `/api/relay/api/records/${encodeURIComponent(createEntityCode)}/${encodeURIComponent(recId)}`,
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

  const records  = data?.data ?? [];

  // Permission model: canAdd = no viewOnlyReason AND tab exposes an add surface.
  // viewOnlyReason.label === "View only" → permission denied.
  // viewOnlyReason.label contains lifecycle state → rule-managed section.
  const canAdd = !viewOnlyReason && !!tab.add_href_template;
  const canEdit = !viewOnlyReason;

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

  return (
    <>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {records.length} record{records.length !== 1 ? "s" : ""}
          </p>
          {canAdd && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleAddNew}>
              <Plus className="size-3 shrink-0" />
              {tab.add_label ?? "Add"}
            </Button>
          )}
        </div>

        {/* Card list */}
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {records.map((rec) => (
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
      </div>

      {/* Tier 2: Read-mode detail drawer */}
      <RecordDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        rec={activeRecord}
        entityTypeLabel={tab.label}
        config={config}
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
