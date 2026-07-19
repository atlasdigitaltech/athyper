"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Hash, Pencil, Plus } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { formatRecordValue, toNonBlankString } from "@athyper/runtime-shared/meta-entity";
import type { HeaderIdentity } from "./types";

type AuditStatusIntent = HeaderIdentity["status"]["intent"];

export interface AuditSummaryActor {
  name?: string;
  id?: string;
}

export interface AuditSummaryData {
  identifier?: string;
  status?: HeaderIdentity["status"] | string;
  isActive?: boolean | string | null;
  createdAt?: unknown;
  createdBy?: string;
  createdById?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedById?: string;
  statusChangedAt?: unknown;
  statusChangedBy?: string;
  statusChangedById?: string;
}

export interface AuditSummaryStripProps extends AuditSummaryData {
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}

export interface ResolveAuditSummaryInput {
  record?: Record<string, unknown>;
  recordId?: string;
  status?: HeaderIdentity["status"] | string;
}

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const STATUS_INTENT_CLASS: Record<AuditStatusIntent, string> = {
  success: "text-success [--audit-status-dot:theme(colors.success.DEFAULT)]",
  warning: "text-warning [--audit-status-dot:theme(colors.warning.DEFAULT)]",
  error: "text-destructive [--audit-status-dot:theme(colors.destructive.DEFAULT)]",
  info: "text-info [--audit-status-dot:theme(colors.info.DEFAULT)]",
  primary: "text-primary [--audit-status-dot:theme(colors.primary.DEFAULT)]",
  accent: "text-primary [--audit-status-dot:theme(colors.primary.DEFAULT)]",
  muted: "text-muted-foreground [--audit-status-dot:theme(colors.muted.foreground)]",
  neutral: "text-foreground [--audit-status-dot:theme(colors.muted.foreground)]",
};

export function AuditSummaryStrip({
  title = "Audit Summary",
  defaultOpen = false,
  className,
  ...data
}: AuditSummaryStripProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const status = normalizeStatus(data.status, data.isActive);
  const identifier = toNonBlankString(data.identifier);
  const createdSummary = formatWhenWho(data.createdAt, data.createdBy, data.createdById, "compact");
  const updatedSummary = formatWhenWho(data.updatedAt, data.updatedBy, data.updatedById, "compact");
  const details = useMemo(() => buildDetailLayout(data, status), [data, status]);
  const allDetailRows = [
    ...details.statusRows,
    ...details.auditColumns.flatMap((column) => column.rows),
  ];

  const hasContent = status || identifier || createdSummary || updatedSummary || allDetailRows.some((row) => row.value !== "-");
  if (!hasContent) return null;

  async function copyIdentifier() {
    if (!identifier) return;
    try {
      await navigator.clipboard.writeText(identifier);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be unavailable in hardened browser contexts.
    }
  }

  return (
    <section aria-label={title} className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex min-h-10 flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap">
        {status ? <StatusIndicator status={status} /> : null}

        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Collapse audit summary" : "Expand audit summary"}
          onClick={() => setOpen((value) => !value)}
          className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none"
        >
          {createdSummary ? (
            <HeaderAuditFact icon="created" value={createdSummary} />
          ) : null}
          {updatedSummary ? (
            <HeaderAuditFact icon="updated" value={updatedSummary} />
          ) : null}
          {open ? (
            <ChevronUp aria-hidden className="size-4 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          )}
        </button>
      </div>

      {open ? (
        <div className="border-t bg-muted/20 px-4 py-3">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {identifier ? (
              <IdentifierField
                identifier={identifier}
                copied={copied}
                onCopy={() => void copyIdentifier()}
              />
            ) : null}
            {details.statusRows.map((row) => (
              <DetailField key={row.label} row={row} />
            ))}
          </dl>

          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.auditColumns.map((column) => (
              <dl key={column.key} className="grid min-w-0 gap-3">
                {column.rows.map((row) => (
                  <DetailField key={row.label} row={row} />
                ))}
              </dl>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function resolveAuditSummaryData({
  record,
  recordId,
  status,
}: ResolveAuditSummaryInput): AuditSummaryData {
  const source = flattenRecord(record);
  const createdActor = resolveActor(source, "created");
  const updatedActor = resolveActor(source, "updated");
  const statusActor = resolveActor(source, "status_changed");

  return {
    identifier: firstText(source, ["id", "record_id", "recordId", "uuid"]) ?? recordId,
    status: status ?? firstText(source, ["status", "lifecycle_state", "lifecycleState", "state"]),
    isActive: firstRaw(source, ["is_active", "isActive", "active", "enabled"]) as AuditSummaryData["isActive"],
    createdAt: firstRaw(source, ["created_at", "createdAt", "created_on", "createdOn"]),
    createdBy: createdActor.name,
    createdById: createdActor.id,
    updatedAt: firstRaw(source, ["updated_at", "updatedAt", "modified_at", "modifiedAt"]),
    updatedBy: updatedActor.name,
    updatedById: updatedActor.id,
    statusChangedAt: firstRaw(source, ["status_changed_at", "statusChangedAt", "state_changed_at", "stateChangedAt"]),
    statusChangedBy: statusActor.name,
    statusChangedById: statusActor.id,
  };
}

function StatusIndicator({ status }: { status: HeaderIdentity["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-2 rounded-md px-1 text-sm font-semibold leading-none",
        STATUS_INTENT_CLASS[status.intent],
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--audit-status-dot)]" />
      <span className="max-w-32 truncate">{status.label}</span>
    </span>
  );
}

function HeaderAuditFact({
  icon,
  value,
}: {
  icon: "created" | "updated";
  value: string;
}) {
  const Icon = icon === "created" ? Plus : Pencil;
  return (
    <span className="hidden min-w-0 max-w-56 items-center gap-1.5 sm:inline-flex">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
}

interface DetailRow {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
  intent?: AuditStatusIntent;
}

interface DetailColumn {
  key: string;
  rows: DetailRow[];
}

interface DetailLayout {
  statusRows: DetailRow[];
  auditColumns: DetailColumn[];
}

function DetailField({ row }: { row: DetailRow }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium leading-5 text-muted-foreground">
        {row.label}
      </dt>
      <dd
        title={row.title ?? row.value}
        className={cn(
          "mt-0.5 min-w-0 truncate text-sm leading-5 text-foreground",
          row.mono && "font-mono text-xs font-medium",
          row.intent === "success" && "text-success",
          row.intent === "warning" && "text-warning",
          row.intent === "error" && "text-destructive",
          row.value === "-" && "font-medium text-muted-foreground",
        )}
      >
        {row.value}
      </dd>
    </div>
  );
}

function IdentifierField({
  identifier,
  copied,
  onCopy,
}: {
  identifier: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium leading-5 text-muted-foreground">
        UUID
      </dt>
      <dd className="mt-1 min-w-0">
        <button
          type="button"
          onClick={onCopy}
          title={`Copy ${identifier}`}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Hash aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 max-w-40 truncate font-mono tabular-nums">
            {shortIdentifier(identifier)}
          </span>
          {copied ? (
            <Check aria-hidden className="size-3.5 shrink-0 text-success" />
          ) : (
            <Copy aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </dd>
    </div>
  );
}

function buildDetailLayout(
  data: AuditSummaryData,
  status: HeaderIdentity["status"] | null,
): DetailLayout {
  return {
    statusRows: [
      { label: "Status", value: status?.label ?? "-", intent: status?.intent },
      { label: "Is Active", value: formatActiveValue(data.isActive) },
    ],
    auditColumns: [
      {
        key: "created",
        rows: [
          { label: "Created At", value: formatAuditDate(data.createdAt, "detail") },
          actorRow("Created By", data.createdBy, data.createdById),
        ],
      },
      {
        key: "updated",
        rows: [
          { label: "Updated At", value: formatAuditDate(data.updatedAt, "detail") },
          actorRow("Updated By", data.updatedBy, data.updatedById),
        ],
      },
      {
        key: "status-changed",
        rows: [
          { label: "Status Changed At", value: formatAuditDate(data.statusChangedAt, "detail") },
          actorRow("Status Changed By", data.statusChangedBy, data.statusChangedById),
        ],
      },
    ],
  };
}

function actorRow(label: string, name: string | undefined, id: string | undefined): DetailRow {
  const value = formatActor(name, id);
  return {
    label,
    value,
    title: value === "-" ? undefined : [name, id].filter(Boolean).join(" - "),
    mono: Boolean(!name && id),
  };
}

function formatWhenWho(
  at: unknown,
  by: string | undefined,
  byId: string | undefined,
  density: "compact" | "detail",
): string | null {
  const when = formatAuditDate(at, density);
  const who = formatActor(by, byId);
  if (when !== "-" && who !== "-") return `${when} - ${who}`;
  if (when !== "-") return when;
  if (who !== "-") return who;
  return null;
}

function formatActor(name: string | undefined, id: string | undefined): string {
  const displayName = toNonBlankString(name);
  const displayId = toNonBlankString(id);
  if (displayName) return displayName;
  if (displayId) return shortIdentifier(displayId);
  return "-";
}

function formatAuditDate(value: unknown, density: "compact" | "detail"): string {
  if (value === null || value === undefined || value === "") return "-";

  const date = parseDate(value);
  if (!date) {
    const fallback = toNonBlankString(value) ?? formatRecordValue(value);
    return fallback === "-" ? "-" : fallback;
  }

  const options: Intl.DateTimeFormatOptions = density === "compact"
    ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }
    : {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      };

  try {
    return new Intl.DateTimeFormat("en-GB", options)
      .format(date)
      .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
  } catch {
    return toNonBlankString(value) ?? formatRecordValue(value);
  }
}

function formatActiveValue(value: AuditSummaryData["isActive"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = toNonBlankString(value);
  if (!text) return "-";
  const normalized = text.toLowerCase();
  if (["true", "1", "yes", "y", "active", "enabled"].includes(normalized)) return "Yes";
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(normalized)) return "No";
  return text;
}

function normalizeStatus(
  value: AuditSummaryData["status"],
  isActive: AuditSummaryData["isActive"],
): HeaderIdentity["status"] | null {
  if (isStatusObject(value)) {
    return {
      label: titleCase(value.label),
      intent: value.intent,
    };
  }

  const label = toNonBlankString(value);
  if (!label) return activeFallbackStatus(isActive);
  return {
    label: titleCase(label),
    intent: statusIntent(label, isActive),
  };
}

function activeFallbackStatus(isActive: AuditSummaryData["isActive"]): HeaderIdentity["status"] | null {
  const active = coerceBoolean(isActive);
  if (active === true) return { label: "Active", intent: "success" };
  if (active === false) return { label: "Inactive", intent: "error" };
  return null;
}

function statusIntent(label: string, isActive: AuditSummaryData["isActive"]): AuditStatusIntent {
  const active = coerceBoolean(isActive);
  if (active === false) return "error";

  const normalized = label.toLowerCase().replace(/[\s_-]+/g, "_");
  if (["active", "posted", "approved", "complete", "completed", "success", "enabled"].includes(normalized)) return "success";
  if (["draft", "pending", "in_review", "review", "open"].includes(normalized)) return "info";
  if (["blocked", "on_hold", "warning", "suspended"].includes(normalized)) return "warning";
  if (["inactive", "failed", "error", "rejected", "void", "deleted", "disabled"].includes(normalized)) return "error";
  return active === true ? "success" : "neutral";
}

function resolveActor(source: Record<string, unknown>, prefix: "created" | "updated" | "status_changed"): AuditSummaryActor {
  const camelPrefix = prefix.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const display = firstText(source, [
    `${prefix}_by_name`,
    `${camelPrefix}ByName`,
    `${prefix}_by_display`,
    `${camelPrefix}ByDisplay`,
    `${prefix}_actor_name`,
    `${camelPrefix}ActorName`,
  ]);
  const id = firstText(source, [
    `${prefix}_by_id`,
    `${camelPrefix}ById`,
    `${prefix}_by_uuid`,
    `${camelPrefix}ByUuid`,
    `${prefix}_actor_id`,
    `${camelPrefix}ActorId`,
  ]);
  const direct = actorFromValue(firstRaw(source, [`${prefix}_by`, `${camelPrefix}By`]));

  return normalizeActor({
    name: display ?? direct.name,
    id: id ?? direct.id,
  });
}

function actorFromValue(value: unknown): AuditSummaryActor {
  if (isRecord(value)) {
    return normalizeActor({
      name: firstText(value, ["display_name", "displayName", "name", "label", "login_email", "email", "code"]),
      id: firstText(value, ["id", "uuid", "principal_id", "principalId"]),
    });
  }

  const text = toNonBlankString(value);
  if (!text) return {};
  if (text === SYSTEM_UUID) return { name: "System", id: text };
  return isUuidLike(text) ? { id: text } : { name: text };
}

function normalizeActor(actor: AuditSummaryActor): AuditSummaryActor {
  if (actor.id === SYSTEM_UUID && !actor.name) return { ...actor, name: "System" };
  if (actor.name === SYSTEM_UUID) return { name: "System", id: actor.id ?? SYSTEM_UUID };
  return actor;
}

function firstRaw(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(source, key)) return source[key];
  }
  return undefined;
}

function firstText(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = toNonBlankString(source[key]);
    if (text) return text;
  }
  return undefined;
}

function flattenRecord(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) return {};
  const data = isRecord(record["data"]) ? record["data"] : {};
  return { ...record, ...data };
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function coerceBoolean(value: AuditSummaryData["isActive"]): boolean | null {
  if (typeof value === "boolean") return value;
  const text = toNonBlankString(value)?.toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y", "active", "enabled"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(text)) return false;
  return null;
}

function shortIdentifier(value: string): string {
  const text = value.trim();
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isStatusObject(value: unknown): value is HeaderIdentity["status"] {
  return isRecord(value)
    && typeof value["label"] === "string"
    && typeof value["intent"] === "string";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
