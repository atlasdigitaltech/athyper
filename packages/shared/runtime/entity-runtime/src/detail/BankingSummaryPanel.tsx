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
  records:       BankingRecord[];
  tab:           MasterTab;
  editMode:      boolean;
  canAdd:        boolean;
  canEdit:       boolean;
  onAdd:         () => void;
  onEdit:        (rec: BankingRecord) => void;
  onMarkPrimary: (rec: BankingRecord) => void;
}

type DetailTab = "details" | "linkages" | "verification" | "activity" | "audit";

const CURRENCY_NAMES: Record<string, string> = {
  AED: "UAE Dirham",
  EUR: "Euro",
  GBP: "Pound Sterling",
  INR: "Indian Rupee",
  MYR: "Malaysian Ringgit",
  SAR: "Saudi Riyal",
  USD: "US Dollar",
};

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

function formatRange(rec: BankingRecord): string {
  const from = formatDate(rec.effective_from);
  const until = stringValue(rec.effective_until) ? formatDate(rec.effective_until) : "open";
  return `${from} - ${until}`;
}

function isActiveLink(rec: BankingRecord): boolean {
  const status = stringValue(rec.status).toLowerCase();
  if (status === "inactive" || status === "archived") return false;
  const until = stringValue(rec.effective_until);
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

function bankName(rec: BankingRecord): string {
  return (
    stringValue(rec.bank_name) ||
    stringValue(rec.bank_name_override) ||
    "Bank account"
  );
}

function accountNumber(rec: BankingRecord): string {
  return (
    stringValue(rec.account_number) ||
    stringValue(rec.account_id_value) ||
    stringValue(rec.account_id_value_masked)
  );
}

function last4(rec: BankingRecord): string {
  const explicit = stringValue(rec.account_last4);
  if (explicit) return explicit;
  const compact = accountNumber(rec).replace(/[^A-Za-z0-9]/g, "");
  return compact.slice(-4);
}

function maskedAccount(rec: BankingRecord): string {
  const masked = stringValue(rec.account_id_value_masked);
  if (masked) return masked;
  const raw = accountNumber(rec);
  const tail = last4(rec);
  if (!raw) return "-";
  if (!tail) return raw;
  const prefix = raw.slice(0, Math.max(0, raw.length - tail.length));
  return `${prefix.replace(/[A-Za-z0-9]/g, "*")}${tail}`;
}

function currencyLabel(rec: BankingRecord): string {
  const code = stringValue(rec.currency_code).toUpperCase();
  if (!code) return "-";
  const name = stringValue(rec.currency_name) || CURRENCY_NAMES[code];
  return name ? `${code} - ${name}` : code;
}

function companyScopeLabel(rec: BankingRecord): string {
  const code = stringValue(rec.company_code);
  const name = stringValue(rec.company_code_name) || stringValue(rec.company_code_display);
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return "All company codes";
}

function bicValue(rec: BankingRecord): string {
  return stringValue(rec.bic) || stringValue(rec.bic_override) || "-";
}

function bankCountry(rec: BankingRecord): string {
  return (
    stringValue(rec.bank_country_code) ||
    stringValue(rec.bank_country_override) ||
    stringValue(rec.country_code) ||
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

function verificationLabel(rec: BankingRecord): string {
  if (boolValue(rec.is_verified)) return "Verified";
  return "Pending Verification";
}

function verificationVariant(rec: BankingRecord): "success" | "warning" {
  return boolValue(rec.is_verified) ? "success" : "warning";
}

function accountStatusLabel(rec: BankingRecord): string {
  return isActiveLink(rec) ? "Active" : "Inactive";
}

function accountStatusVariant(rec: BankingRecord): "success" | "muted" {
  return isActiveLink(rec) ? "success" : "muted";
}

function searchHaystack(rec: BankingRecord): string {
  return [
    bankName(rec),
    accountNumber(rec),
    maskedAccount(rec),
    last4(rec),
    rec.account_holder_name,
    rec.currency_code,
    rec.account_id_type,
    rec.account_nature,
    rec.purpose,
    bicValue(rec),
    companyScopeLabel(rec),
  ].filter(Boolean).join(" ").toLowerCase();
}

function copyAccountNumber(rec: BankingRecord) {
  const value = accountNumber(rec);
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

const BANK_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const BANK_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const BANK_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const BANK_ITEM_TITLE_CLASS = "text-sm font-semibold leading-snug text-foreground";
const BANK_KPI_VALUE_CLASS = "text-xl font-semibold leading-none text-foreground";

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

function BankAccountAvatar({ rec, size = "md" }: { rec: BankingRecord; size?: "sm" | "md" }) {
  return (
    <div className={cn(
      "flex shrink-0 select-none items-center justify-center rounded-full bg-foreground font-semibold text-background",
      size === "sm" ? "size-8 text-[11px]" : "size-9 text-xs",
    )}>
      {initials(bankName(rec))}
    </div>
  );
}

function AccountIdentity({ rec }: { rec: BankingRecord }) {
  const name = bankName(rec);
  const isPrimary = boolValue(rec.is_primary);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <BankAccountAvatar rec={rec} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("truncate", BANK_ITEM_TITLE_CLASS)}>{name}</p>
          {isPrimary && (
            <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
              Primary
            </Badge>
          )}
          <Badge variant={accountStatusVariant(rec)} size="sm" className="rounded-full px-2">
            {accountStatusLabel(rec)}
          </Badge>
          <Badge variant={verificationVariant(rec)} size="sm" className="rounded-full px-2">
            {verificationLabel(rec)}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>BIC: {bicValue(rec)}</span>
          <span>Branch: {stringValue(rec.branch_name) || stringValue(rec.bank_branch_name) || "-"}</span>
          {stringValue(rec.national_bank_code) && (
            <span>National code: {stringValue(rec.national_bank_code)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BankAccountCard({
  rec,
  selected,
  canEdit,
  onSelect,
  onEdit,
  onMarkPrimary,
}: {
  rec:           BankingRecord;
  selected:      boolean;
  canEdit:       boolean;
  onSelect:      () => void;
  onEdit:        () => void;
  onMarkPrimary: () => void;
}) {
  const isPrimary = boolValue(rec.is_primary);
  const pending = !boolValue(rec.is_verified);

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
        <AccountIdentity rec={rec} />
      </div>

      <div className="grid border-y border-border bg-muted/20 sm:grid-cols-4">
        <FieldBlock label={`Account number (${stringValue(rec.account_id_type) || "ID"})`}>
          <span>{maskedAccount(rec)}</span>
          {last4(rec) && (
            <span className="ml-1 rounded bg-muted px-1 text-foreground">{last4(rec)}</span>
          )}
          <span className="ml-2 inline-flex gap-1 align-middle">
            <span className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground">
              <Eye className="size-3" />
            </span>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground"
              onClick={(event) => { event.stopPropagation(); copyAccountNumber(rec); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  copyAccountNumber(rec);
                }
              }}
            >
              <Copy className="size-3" />
            </span>
          </span>
        </FieldBlock>
        <FieldBlock label="Holder">{stringValue(rec.account_holder_name) || "-"}</FieldBlock>
        <FieldBlock label="Currency">{currencyLabel(rec)}</FieldBlock>
        <FieldBlock label="ID type">{humanize(rec.account_id_type)}</FieldBlock>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Purpose: <strong className="font-medium text-foreground">{humanize(rec.purpose)}</strong></span>
          <span>Scope: <strong className="font-medium text-foreground">{companyScopeLabel(rec)}</strong></span>
          <span>Effective: <strong className="font-medium text-foreground">{formatRange(rec)}</strong></span>
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
  detailTab,
  onDetailTabChange,
}: {
  rec: BankingRecord | null;
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
        <BankAccountAvatar rec={rec} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={BANK_FIELD_LABEL_CLASS}>Bank account detail</p>
          <p className={cn("mt-1 truncate", BANK_ITEM_TITLE_CLASS)}>
            {bankName(rec)} {last4(rec) ? `...${last4(rec)}` : ""}
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
              <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[650px] overflow-y-auto px-4 py-4">
        {detailTab === "details" && <DetailsTab rec={rec} />}
        {detailTab === "linkages" && <LinkagesTab rec={rec} />}
        {detailTab === "verification" && <VerificationTab rec={rec} />}
        {detailTab === "activity" && <EmptyDetailTab label="No activity events for this account." />}
        {detailTab === "audit" && <AuditTab rec={rec} />}
      </div>
    </aside>
  );
}

function DetailsTab({ rec }: { rec: BankingRecord }) {
  const verified = boolValue(rec.is_verified);
  const networkOptions: Array<[string, unknown]> = [
    ["SWIFT", rec.supports_swift],
    ["Local clearing", rec.supports_local_clearing],
    ["SEPA", rec.supports_sepa],
    ["ACH", rec.supports_ach],
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
              {verified ? humanize(rec.verification_method || "Verified") : "Action required"}
            </p>
            <p className={cn("mt-1", BANK_FIELD_HELPER_CLASS)}>
              {verified
                ? `Verified on ${formatDate(rec.verified_at)}`
                : "Upload or confirm verification evidence before payment use."}
            </p>
          </div>
        </div>
      </div>

      <DetailSection title="Bank institution" icon={<Landmark className="size-3.5" />}>
        <dl className="grid grid-cols-2 gap-3">
          <DetailRow label="Bank name" value={bankName(rec)} />
          <DetailRow label="Institution type" value={humanize(rec.institution_type || rec.bank_institution_type || "bank")} />
          <DetailRow label="BIC / SWIFT" value={bicValue(rec)} />
          <DetailRow label="Country" value={bankCountry(rec)} />
          <DetailRow label="Branch" value={stringValue(rec.branch_name) || stringValue(rec.bank_branch_name) || "-"} />
          <DetailRow label="National code" value={stringValue(rec.national_bank_code) || "-"} />
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
          <DetailRow label="Account holder" value={stringValue(rec.account_holder_name) || "-"} />
          <DetailRow label="Currency" value={currencyLabel(rec)} />
          <DetailRow label="ID type" value={humanize(rec.account_id_type)} />
          <DetailRow label="Account nature" value={humanize(rec.account_nature)} />
          <DetailRow label="Account number" value={maskedAccount(rec)} />
          <DetailRow label="Last 4" value={last4(rec) || "-"} />
        </dl>
      </DetailSection>

      <LinkagesTab rec={rec} compact />
    </div>
  );
}

function LinkagesTab({ rec, compact = false }: { rec: BankingRecord; compact?: boolean }) {
  return (
    <DetailSection title={compact ? "Linkages" : "Linkages - how this account is used"} icon={<Star className="size-3.5" />}>
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={BANK_ITEM_TITLE_CLASS}>
              {boolValue(rec.is_primary) ? "Primary" : "Secondary"} - {humanize(rec.purpose)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner: {humanize(rec.owner_type || "business_partner")} - Scope: {companyScopeLabel(rec)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Effective: {formatRange(rec)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {boolValue(rec.is_primary) && (
              <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
                Primary
              </Badge>
            )}
            <Badge variant={accountStatusVariant(rec)} size="sm" className="rounded-full px-2">
              {accountStatusLabel(rec)}
            </Badge>
          </div>
        </div>
      </div>
    </DetailSection>
  );
}

function VerificationTab({ rec }: { rec: BankingRecord }) {
  return (
    <DetailSection title="Verification" icon={<ShieldCheck className="size-3.5" />}>
      <dl className="grid grid-cols-2 gap-3">
        <DetailRow label="Status" value={verificationLabel(rec)} />
        <DetailRow label="Method" value={humanize(rec.verification_method)} />
        <DetailRow label="Verified at" value={formatDate(rec.verified_at)} />
        <DetailRow label="Verified by" value={stringValue(rec.verified_by) || "-"} />
      </dl>
    </DetailSection>
  );
}

function AuditTab({ rec }: { rec: BankingRecord }) {
  return (
    <DetailSection title="Audit" icon={<CreditCard className="size-3.5" />}>
      <dl className="grid grid-cols-2 gap-3">
        <DetailRow label="Created" value={formatDate(rec.created_at)} />
        <DetailRow label="Updated" value={formatDate(rec.updated_at)} />
        <DetailRow label="Link ID" value={stringValue(rec.id) || "-"} />
        <DetailRow label="Account ID" value={stringValue(rec.bank_account_id) || "-"} />
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
  editMode,
  canAdd,
  canEdit,
  onAdd,
  onEdit,
  onMarkPrimary,
}: BankingSummaryPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(() => stringValue(records[0]?.id));
  const [detailTab, setDetailTab] = useState<DetailTab>("details");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRecords = useMemo(
    () => normalizedSearch
      ? records.filter((rec) => searchHaystack(rec).includes(normalizedSearch))
      : records,
    [normalizedSearch, records],
  );

  const selectedRecord =
    records.find((rec) => stringValue(rec.id) === selectedId) ??
    filteredRecords[0] ??
    records[0] ??
    null;

  const activeRecords = records.filter(isActiveLink);
  const verifiedCount = records.filter((rec) => boolValue(rec.is_verified)).length;
  const primaryCount = records.filter((rec) => boolValue(rec.is_primary)).length;
  const pendingCount = Math.max(records.length - verifiedCount, 0);
  const currencies = Array.from(new Set(records.map((rec) => stringValue(rec.currency_code)).filter(Boolean))).sort();
  const purposes = Array.from(new Set(records.filter((rec) => boolValue(rec.is_primary)).map((rec) => stringValue(rec.purpose)).filter(Boolean)));
  const companyScopes = Array.from(new Set(records.map(companyScopeLabel))).filter(Boolean);
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
              const recId = stringValue(rec.id);
              return (
                <BankAccountCard
                  key={recId || `${bankName(rec)}-${accountNumber(rec)}`}
                  rec={rec}
                  selected={selectedRecord ? stringValue(selectedRecord.id) === recId : false}
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
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
        />
      </div>
    </div>
  );
}
