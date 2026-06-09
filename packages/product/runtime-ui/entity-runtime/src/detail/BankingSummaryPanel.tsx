"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  Eye,
  Landmark,
  Plus,
  ShieldCheck,
  Star,
} from "lucide-react";

import { cn } from "@athyper/theme/utils";
import { Badge, Button } from "@athyper/ui/primitives";
import { SearchInput } from "@athyper/ui/composites";
import type { MasterTab } from "@athyper/metadata-client/compiled-reader";

type BankingRecord = Record<string, unknown>;

interface BankingSummaryPanelProps {
  records:            BankingRecord[];
  tab:                MasterTab;
  fieldMap?:          BankingFieldMap;
  fieldMapDefaults?:  BankingFieldMap;
  editMode:           boolean;
  canAdd:             boolean;
  canEdit:            boolean;
  onAdd:              () => void;
  onEdit:             (rec: BankingRecord) => void;
  onMarkPrimary:      (rec: BankingRecord) => void;
}

type DetailTab = "details" | "linkages" | "verification" | "activity" | "audit";

type BankingFieldKey =
  | "recordId"
  | "bankAccountId"
  | "bankName"
  | "bankNameOverride"
  | "bankInstitutionType"
  | "institutionType"
  | "bic"
  | "bicOverride"
  | "bankCountryCode"
  | "bankCountryOverride"
  | "countryCode"
  | "branchName"
  | "bankBranchName"
  | "nationalBankCode"
  | "accountNumber"
  | "accountIdValue"
  | "accountIdValueMasked"
  | "accountLast4"
  | "accountHolderName"
  | "accountIdType"
  | "accountNature"
  | "currencyCode"
  | "currencyName"
  | "companyCode"
  | "companyCodeName"
  | "companyCodeDisplay"
  | "purpose"
  | "ownerType"
  | "status"
  | "effectiveFrom"
  | "effectiveUntil"
  | "isPrimary"
  | "isVerified"
  | "verificationMethod"
  | "verifiedAt"
  | "verifiedBy"
  | "supportsSwift"
  | "supportsLocalClearing"
  | "supportsSepa"
  | "supportsAch"
  | "createdAt"
  | "updatedAt";

export type BankingFieldMap = Partial<Record<BankingFieldKey, string | string[]>>;

const CURRENCY_NAMES: Record<string, string> = {
  AED: "UAE Dirham",
  EUR: "Euro",
  GBP: "Pound Sterling",
  INR: "Indian Rupee",
  MYR: "Malaysian Ringgit",
  SAR: "Saudi Riyal",
  USD: "US Dollar",
};

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeFieldMap(raw: unknown): BankingFieldMap {
  const source = asPlainRecord(raw);
  if (!source) return {};
  const entries = Object.entries(source).filter((entry): entry is [BankingFieldKey, string | string[]] => {
    const value = entry[1];
    return typeof value === "string"
      || (Array.isArray(value) && value.every((item) => typeof item === "string"));
  });
  return Object.fromEntries(entries) as BankingFieldMap;
}

function bankingFieldMapFromTab(tab: MasterTab, defaults?: BankingFieldMap, override?: BankingFieldMap): BankingFieldMap {
  const settings = asPlainRecord(tab.config?.presentation_config) ?? {};
  const configured = normalizeFieldMap(settings.banking_field_map ?? settings.field_map);
  return {
    ...(defaults ?? {}),
    ...configured,
    ...(override ?? {}),
  };
}

function fieldNames(fieldMap: BankingFieldMap, key: BankingFieldKey): string[] {
  const value = fieldMap[key];
  if (Array.isArray(value)) return value.filter(Boolean);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function fieldValue(rec: BankingRecord, fieldMap: BankingFieldMap, key: BankingFieldKey): unknown {
  for (const fieldName of fieldNames(fieldMap, key)) {
    const value = rec[fieldName];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function firstFieldValue(rec: BankingRecord, fieldMap: BankingFieldMap, keys: BankingFieldKey[]): unknown {
  for (const key of keys) {
    const value = fieldValue(rec, fieldMap, key);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function humanize(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw) return "-";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatRange(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  const from = formatDate(fieldValue(rec, fieldMap, "effectiveFrom"));
  const untilValue = fieldValue(rec, fieldMap, "effectiveUntil");
  const until = stringValue(untilValue) ? formatDate(untilValue) : "open";
  return `${from} - ${until}`;
}

function isActiveLink(rec: BankingRecord, fieldMap: BankingFieldMap): boolean {
  const status = stringValue(fieldValue(rec, fieldMap, "status")).toLowerCase();
  if (status === "inactive" || status === "archived") return false;
  const until = stringValue(fieldValue(rec, fieldMap, "effectiveUntil"));
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

function bankName(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return (
    stringValue(fieldValue(rec, fieldMap, "bankName")) ||
    stringValue(fieldValue(rec, fieldMap, "bankNameOverride")) ||
    "Bank account"
  );
}

function accountNumber(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return (
    stringValue(fieldValue(rec, fieldMap, "accountNumber")) ||
    stringValue(fieldValue(rec, fieldMap, "accountIdValue")) ||
    stringValue(fieldValue(rec, fieldMap, "accountIdValueMasked"))
  );
}

function last4(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  const explicit = stringValue(fieldValue(rec, fieldMap, "accountLast4"));
  if (explicit) return explicit;
  const compact = accountNumber(rec, fieldMap).replace(/[^A-Za-z0-9]/g, "");
  return compact.slice(-4);
}

function maskedAccount(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  const masked = stringValue(fieldValue(rec, fieldMap, "accountIdValueMasked"));
  if (masked) return masked;
  const raw = accountNumber(rec, fieldMap);
  const tail = last4(rec, fieldMap);
  if (!raw) return "-";
  if (!tail) return raw;
  const prefix = raw.slice(0, Math.max(0, raw.length - tail.length));
  return `${prefix.replace(/[A-Za-z0-9]/g, "*")}${tail}`;
}

function currencyLabel(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  const code = stringValue(fieldValue(rec, fieldMap, "currencyCode")).toUpperCase();
  if (!code) return "-";
  const name = stringValue(fieldValue(rec, fieldMap, "currencyName")) || CURRENCY_NAMES[code];
  return name ? `${code} - ${name}` : code;
}

function companyScopeLabel(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  const code = stringValue(fieldValue(rec, fieldMap, "companyCode"));
  const name = stringValue(fieldValue(rec, fieldMap, "companyCodeName")) || stringValue(fieldValue(rec, fieldMap, "companyCodeDisplay"));
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return "All company codes";
}

function bicValue(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return stringValue(fieldValue(rec, fieldMap, "bic")) || stringValue(fieldValue(rec, fieldMap, "bicOverride")) || "-";
}

function bankCountry(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return (
    stringValue(fieldValue(rec, fieldMap, "bankCountryCode")) ||
    stringValue(fieldValue(rec, fieldMap, "bankCountryOverride")) ||
    stringValue(fieldValue(rec, fieldMap, "countryCode")) ||
    "-"
  );
}

function initials(label: string): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "BA";
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
}

function verificationLabel(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  if (boolValue(fieldValue(rec, fieldMap, "isVerified"))) return "Verified";
  return "Pending Verification";
}

function verificationVariant(rec: BankingRecord, fieldMap: BankingFieldMap): "success" | "warning" {
  return boolValue(fieldValue(rec, fieldMap, "isVerified")) ? "success" : "warning";
}

function accountStatusLabel(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return isActiveLink(rec, fieldMap) ? "Active" : "Inactive";
}

function accountStatusVariant(rec: BankingRecord, fieldMap: BankingFieldMap): "success" | "muted" {
  return isActiveLink(rec, fieldMap) ? "success" : "muted";
}

function searchHaystack(rec: BankingRecord, fieldMap: BankingFieldMap): string {
  return [
    bankName(rec, fieldMap),
    accountNumber(rec, fieldMap),
    maskedAccount(rec, fieldMap),
    last4(rec, fieldMap),
    fieldValue(rec, fieldMap, "accountHolderName"),
    fieldValue(rec, fieldMap, "currencyCode"),
    fieldValue(rec, fieldMap, "accountIdType"),
    fieldValue(rec, fieldMap, "accountNature"),
    fieldValue(rec, fieldMap, "purpose"),
    bicValue(rec, fieldMap),
    companyScopeLabel(rec, fieldMap),
  ].filter(Boolean).join(" ").toLowerCase();
}

function copyAccountNumber(rec: BankingRecord, fieldMap: BankingFieldMap) {
  const value = accountNumber(rec, fieldMap);
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

const BANK_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const BANK_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const BANK_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const BANK_ITEM_TITLE_CLASS = "text-sm font-medium leading-snug text-foreground";
const BANK_KPI_VALUE_CLASS = "text-xl font-medium leading-none text-foreground";

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className={BANK_FIELD_LABEL_CLASS}>{label}</p>
      <p className={cn(
        "mt-2",
        BANK_KPI_VALUE_CLASS,
        tone === "warning" && "text-warning",
      )}>
        {value}
      </p>
      {detail && <p className={cn("mt-2", BANK_FIELD_HELPER_CLASS)}>{detail}</p>}
    </div>
  );
}

function BankAccountAvatar({ rec, fieldMap, size = "md" }: { rec: BankingRecord; fieldMap: BankingFieldMap; size?: "sm" | "md" }) {
  return (
    <div className={cn(
      "flex shrink-0 select-none items-center justify-center rounded-full bg-foreground font-medium text-background",
      size === "sm" ? "size-8 text-xs" : "size-9 text-xs",
    )}>
      {initials(bankName(rec, fieldMap))}
    </div>
  );
}

function AccountIdentity({ rec, fieldMap }: { rec: BankingRecord; fieldMap: BankingFieldMap }) {
  const name = bankName(rec, fieldMap);
  const isPrimary = boolValue(fieldValue(rec, fieldMap, "isPrimary"));
  return (
    <div className="flex min-w-0 items-start gap-3">
      <BankAccountAvatar rec={rec} fieldMap={fieldMap} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("truncate", BANK_ITEM_TITLE_CLASS)}>{name}</p>
          {isPrimary && (
            <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
              Primary
            </Badge>
          )}
          <Badge variant={accountStatusVariant(rec, fieldMap)} size="sm" className="rounded-full px-2">
            {accountStatusLabel(rec, fieldMap)}
          </Badge>
          <Badge variant={verificationVariant(rec, fieldMap)} size="sm" className="rounded-full px-2">
            {verificationLabel(rec, fieldMap)}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>BIC: {bicValue(rec, fieldMap)}</span>
          <span>Branch: {stringValue(firstFieldValue(rec, fieldMap, ["branchName", "bankBranchName"])) || "-"}</span>
          {stringValue(fieldValue(rec, fieldMap, "nationalBankCode")) && (
            <span>National code: {stringValue(fieldValue(rec, fieldMap, "nationalBankCode"))}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BankAccountCard({
  rec,
  fieldMap,
  selected,
  canEdit,
  onSelect,
  onEdit,
  onMarkPrimary,
}: {
  rec:           BankingRecord;
  fieldMap:      BankingFieldMap;
  selected:      boolean;
  canEdit:       boolean;
  onSelect:      () => void;
  onEdit:        () => void;
  onMarkPrimary: () => void;
}) {
  const isPrimary = boolValue(fieldValue(rec, fieldMap, "isPrimary"));
  const pending = !boolValue(fieldValue(rec, fieldMap, "isVerified"));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group w-full overflow-hidden rounded-lg border bg-card text-left transition-colors",
        selected ? "border-foreground shadow-sm" : "border-border hover:border-muted-foreground/40",
      )}
    >
      <div className="px-4 py-3">
        <AccountIdentity rec={rec} fieldMap={fieldMap} />
      </div>

      <div className="grid border-y border-border bg-muted/20 sm:grid-cols-4">
        <FieldBlock label={`Account number (${stringValue(fieldValue(rec, fieldMap, "accountIdType")) || "ID"})`}>
          <span>{maskedAccount(rec, fieldMap)}</span>
          {last4(rec, fieldMap) && (
            <span className="ml-1 rounded bg-muted px-1 text-foreground">{last4(rec, fieldMap)}</span>
          )}
          <span className="ml-2 inline-flex gap-1 align-middle">
            <span className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground">
              <Eye className="size-3" />
            </span>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground"
              onClick={(event) => { event.stopPropagation(); copyAccountNumber(rec, fieldMap); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  copyAccountNumber(rec, fieldMap);
                }
              }}
            >
              <Copy className="size-3" />
            </span>
          </span>
        </FieldBlock>
        <FieldBlock label="Holder">{stringValue(fieldValue(rec, fieldMap, "accountHolderName")) || "-"}</FieldBlock>
        <FieldBlock label="Currency">{currencyLabel(rec, fieldMap)}</FieldBlock>
        <FieldBlock label="ID type">{humanize(fieldValue(rec, fieldMap, "accountIdType"))}</FieldBlock>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Purpose: <strong className="font-medium text-foreground">{humanize(fieldValue(rec, fieldMap, "purpose"))}</strong></span>
          <span>Scope: <strong className="font-medium text-foreground">{companyScopeLabel(rec, fieldMap)}</strong></span>
          <span>Effective: <strong className="font-medium text-foreground">{formatRange(rec, fieldMap)}</strong></span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          {pending && canEdit && (
            <Button size="sm" className="h-7 px-2 text-xs">
              <ShieldCheck className="mr-1 size-3" />
              Verify Now
            </Button>
          )}
          {!isPrimary && canEdit && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onMarkPrimary}>
              <Star className="mr-1 size-3" />
              Make Primary
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className={BANK_FIELD_LABEL_CLASS}>{label}</p>
      <div className={cn("mt-1 break-words", BANK_FIELD_VALUE_CLASS)}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className={BANK_FIELD_LABEL_CLASS}>{label}</dt>
      <dd className={cn("mt-1 break-words", BANK_FIELD_VALUE_CLASS)}>{value}</dd>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
        <span className="text-muted-foreground">{icon}</span>
        <h4 className={BANK_ITEM_TITLE_CLASS}>{title}</h4>
      </div>
      {children}
    </section>
  );
}

function DetailPanel({
  rec,
  fieldMap,
  detailTab,
  onDetailTabChange,
}: {
  rec: BankingRecord | null;
  fieldMap: BankingFieldMap;
  detailTab: DetailTab;
  onDetailTabChange: (tab: DetailTab) => void;
}) {
  if (!rec) {
    return (
      <aside className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Select a bank account to inspect details.
      </aside>
    );
  }

  const tabs: Array<{ id: DetailTab; label: string; count?: number }> = [
    { id: "details", label: "Details" },
    { id: "linkages", label: "Linkages", count: 1 },
    { id: "verification", label: "Verification" },
    { id: "activity", label: "Activity" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <aside className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <BankAccountAvatar rec={rec} fieldMap={fieldMap} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={BANK_FIELD_LABEL_CLASS}>Bank account detail</p>
          <p className={cn("mt-1 truncate", BANK_ITEM_TITLE_CLASS)}>
            {bankName(rec, fieldMap)} {last4(rec, fieldMap) ? `...${last4(rec, fieldMap)}` : ""}
          </p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onDetailTabChange(tab.id)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 border-b-2 text-xs font-medium transition-colors",
              detailTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[650px] overflow-y-auto px-4 py-4">
        {detailTab === "details" && <DetailsTab rec={rec} fieldMap={fieldMap} />}
        {detailTab === "linkages" && <LinkagesTab rec={rec} fieldMap={fieldMap} />}
        {detailTab === "verification" && <VerificationTab rec={rec} fieldMap={fieldMap} />}
        {detailTab === "activity" && <EmptyDetailTab label="No activity events for this account." />}
        {detailTab === "audit" && <AuditTab rec={rec} fieldMap={fieldMap} />}
      </div>
    </aside>
  );
}

function DetailsTab({ rec, fieldMap }: { rec: BankingRecord; fieldMap: BankingFieldMap }) {
  const verified = boolValue(fieldValue(rec, fieldMap, "isVerified"));
  const networkOptions: Array<[string, unknown]> = [
    ["SWIFT", fieldValue(rec, fieldMap, "supportsSwift")],
    ["Local clearing", fieldValue(rec, fieldMap, "supportsLocalClearing")],
    ["SEPA", fieldValue(rec, fieldMap, "supportsSepa")],
    ["ACH", fieldValue(rec, fieldMap, "supportsAch")],
  ];
  const networks = networkOptions.filter(([, enabled]) => boolValue(enabled));

  return (
    <div className="space-y-5">
      <div className={cn(
        "rounded-lg border px-3 py-3",
        verified ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10",
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            verified ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground",
          )}>
            {verified ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
          </div>
          <div className="min-w-0">
            <p className={BANK_FIELD_LABEL_CLASS}>
              {verified ? "Verified" : "Pending verification"}
            </p>
            <p className={cn("mt-1", BANK_ITEM_TITLE_CLASS)}>
              {verified ? humanize(fieldValue(rec, fieldMap, "verificationMethod") || "Verified") : "Action required"}
            </p>
            <p className={cn("mt-1", BANK_FIELD_HELPER_CLASS)}>
              {verified
                ? `Verified on ${formatDate(fieldValue(rec, fieldMap, "verifiedAt"))}`
                : "Upload or confirm verification evidence before payment use."}
            </p>
          </div>
        </div>
      </div>

      <DetailSection title="Bank institution" icon={<Landmark className="size-3.5" />}>
        <dl className="grid grid-cols-2 gap-3">
          <DetailRow label="Bank name" value={bankName(rec, fieldMap)} />
          <DetailRow label="Institution type" value={humanize(firstFieldValue(rec, fieldMap, ["institutionType", "bankInstitutionType"]) || "bank")} />
          <DetailRow label="BIC / SWIFT" value={bicValue(rec, fieldMap)} />
          <DetailRow label="Country" value={bankCountry(rec, fieldMap)} />
          <DetailRow label="Branch" value={stringValue(firstFieldValue(rec, fieldMap, ["branchName", "bankBranchName"])) || "-"} />
          <DetailRow label="National code" value={stringValue(fieldValue(rec, fieldMap, "nationalBankCode")) || "-"} />
        </dl>
        {networks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {networks.map(([label]) => (
              <Badge key={String(label)} variant="success" size="sm" className="bg-success/10 text-success">
                {String(label)}
              </Badge>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Account identity" icon={<CreditCard className="size-3.5" />}>
        <dl className="grid grid-cols-2 gap-3">
          <DetailRow label="Account holder" value={stringValue(fieldValue(rec, fieldMap, "accountHolderName")) || "-"} />
          <DetailRow label="Currency" value={currencyLabel(rec, fieldMap)} />
          <DetailRow label="ID type" value={humanize(fieldValue(rec, fieldMap, "accountIdType"))} />
          <DetailRow label="Account nature" value={humanize(fieldValue(rec, fieldMap, "accountNature"))} />
          <DetailRow label="Account number" value={maskedAccount(rec, fieldMap)} />
          <DetailRow label="Last 4" value={last4(rec, fieldMap) || "-"} />
        </dl>
      </DetailSection>

      <LinkagesTab rec={rec} fieldMap={fieldMap} compact />
    </div>
  );
}

function LinkagesTab({ rec, fieldMap, compact = false }: { rec: BankingRecord; fieldMap: BankingFieldMap; compact?: boolean }) {
  return (
    <DetailSection title={compact ? "Linkages" : "Linkages - how this account is used"} icon={<Star className="size-3.5" />}>
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={BANK_ITEM_TITLE_CLASS}>
              {boolValue(fieldValue(rec, fieldMap, "isPrimary")) ? "Primary" : "Secondary"} - {humanize(fieldValue(rec, fieldMap, "purpose"))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner: {humanize(fieldValue(rec, fieldMap, "ownerType") || "business_partner")} - Scope: {companyScopeLabel(rec, fieldMap)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Effective: {formatRange(rec, fieldMap)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {boolValue(fieldValue(rec, fieldMap, "isPrimary")) && (
              <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
                Primary
              </Badge>
            )}
            <Badge variant={accountStatusVariant(rec, fieldMap)} size="sm" className="rounded-full px-2">
              {accountStatusLabel(rec, fieldMap)}
            </Badge>
          </div>
        </div>
      </div>
    </DetailSection>
  );
}

function VerificationTab({ rec, fieldMap }: { rec: BankingRecord; fieldMap: BankingFieldMap }) {
  return (
    <DetailSection title="Verification" icon={<ShieldCheck className="size-3.5" />}>
      <dl className="grid grid-cols-2 gap-3">
        <DetailRow label="Status" value={verificationLabel(rec, fieldMap)} />
        <DetailRow label="Method" value={humanize(fieldValue(rec, fieldMap, "verificationMethod"))} />
        <DetailRow label="Verified at" value={formatDate(fieldValue(rec, fieldMap, "verifiedAt"))} />
        <DetailRow label="Verified by" value={stringValue(fieldValue(rec, fieldMap, "verifiedBy")) || "-"} />
      </dl>
    </DetailSection>
  );
}

function AuditTab({ rec, fieldMap }: { rec: BankingRecord; fieldMap: BankingFieldMap }) {
  return (
    <DetailSection title="Audit" icon={<CreditCard className="size-3.5" />}>
      <dl className="grid grid-cols-2 gap-3">
        <DetailRow label="Created" value={formatDate(fieldValue(rec, fieldMap, "createdAt"))} />
        <DetailRow label="Updated" value={formatDate(fieldValue(rec, fieldMap, "updatedAt"))} />
        <DetailRow label="Link ID" value={stringValue(fieldValue(rec, fieldMap, "recordId")) || "-"} />
        <DetailRow label="Account ID" value={stringValue(fieldValue(rec, fieldMap, "bankAccountId")) || "-"} />
      </dl>
    </DetailSection>
  );
}

function EmptyDetailTab({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function BankingSummaryPanel({
  records,
  tab,
  fieldMap: fieldMapOverride,
  fieldMapDefaults,
  editMode,
  canAdd,
  canEdit,
  onAdd,
  onEdit,
  onMarkPrimary,
}: BankingSummaryPanelProps) {
  const fieldMap = useMemo(
    () => bankingFieldMapFromTab(tab, fieldMapDefaults, fieldMapOverride),
    [tab, fieldMapDefaults, fieldMapOverride],
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(() => stringValue(records[0] ? fieldValue(records[0], fieldMap, "recordId") : ""));
  const [detailTab, setDetailTab] = useState<DetailTab>("details");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRecords = useMemo(
    () => normalizedSearch
      ? records.filter((rec) => searchHaystack(rec, fieldMap).includes(normalizedSearch))
      : records,
    [normalizedSearch, records, fieldMap],
  );

  const selectedRecord =
    records.find((rec) => stringValue(fieldValue(rec, fieldMap, "recordId")) === selectedId) ??
    filteredRecords[0] ??
    records[0] ??
    null;

  const activeRecords = records.filter((rec) => isActiveLink(rec, fieldMap));
  const verifiedCount = records.filter((rec) => boolValue(fieldValue(rec, fieldMap, "isVerified"))).length;
  const primaryCount = records.filter((rec) => boolValue(fieldValue(rec, fieldMap, "isPrimary"))).length;
  const pendingCount = Math.max(records.length - verifiedCount, 0);
  const currencies = Array.from(new Set(records.map((rec) => stringValue(fieldValue(rec, fieldMap, "currencyCode"))).filter(Boolean))).sort();
  const purposes = Array.from(new Set(records.filter((rec) => boolValue(fieldValue(rec, fieldMap, "isPrimary"))).map((rec) => stringValue(fieldValue(rec, fieldMap, "purpose"))).filter(Boolean)));
  const companyScopes = Array.from(new Set(records.map((rec) => companyScopeLabel(rec, fieldMap)))).filter(Boolean);
  const canMutate = editMode && canEdit;
  const canCreate = editMode && canAdd;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Bank accounts linked to this partner with usage scope, verification, and routing details.
          </p>
        </div>
        {canCreate && (
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
            <Plus className="size-3" />
            {tab.add_label ?? "Add bank account"}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Active accounts" value={String(activeRecords.length)} detail={`across ${currencies.length} currencies`} />
        <MetricCard label="Verified" value={`${verifiedCount} / ${records.length}`} detail={records.length ? `${Math.round((verifiedCount / records.length) * 100)}% verified` : "No accounts"} />
        <MetricCard label="Pending verify" value={String(pendingCount)} detail={pendingCount ? "action required" : "clear"} tone={pendingCount ? "warning" : "default"} />
        <MetricCard label="Primary set" value={`${primaryCount} / ${records.length}`} detail={purposes.length ? purposes.map(humanize).join(" - ") : "No primary purpose"} />
        <MetricCard label="Currencies" value={currencies.length ? currencies.join(" - ") : "-"} detail={`${currencies.length} unique`} />
        <MetricCard label="Company codes" value={String(companyScopes.length)} detail={companyScopes.slice(0, 2).join(" - ") || "All scopes"} />
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Search by IBAN, BIC, account holder..."
          className="w-full md:max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          Showing {filteredRecords.length} of {records.length} account{records.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((rec) => {
              const recId = stringValue(fieldValue(rec, fieldMap, "recordId"));
              return (
                <BankAccountCard
                  key={recId || `${bankName(rec, fieldMap)}-${accountNumber(rec, fieldMap)}`}
                  rec={rec}
                  fieldMap={fieldMap}
                  selected={selectedRecord ? stringValue(fieldValue(selectedRecord, fieldMap, "recordId")) === recId : false}
                  canEdit={canMutate}
                  onSelect={() => {
                    setSelectedId(recId);
                    setDetailTab("details");
                  }}
                  onEdit={() => onEdit(rec)}
                  onMarkPrimary={() => onMarkPrimary(rec)}
                />
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground">No bank accounts match the current search.</p>
            </div>
          )}
        </div>

        <DetailPanel
          rec={selectedRecord}
          fieldMap={fieldMap}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
        />
      </div>
    </div>
  );
}
