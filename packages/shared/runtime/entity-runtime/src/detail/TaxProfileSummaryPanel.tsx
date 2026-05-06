"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Stamp,
} from "lucide-react";

import { cn } from "@athyper/theme/utils";
import { Badge, Button, Switch } from "@athyper/ui/primitives";
import type { MasterTab } from "@athyper/metadata-client/compiled-reader";

type TaxRecord = Record<string, unknown>;
type HealthTone = "success" | "warning" | "destructive" | "muted";

interface TaxProfileSummaryPanelProps {
  records:  TaxRecord[];
  tab:      MasterTab;
  canAdd:   boolean;
  canEdit:  boolean;
  onAdd:    () => void;
  onEdit:   (rec: TaxRecord) => void;
  onDelete: (rec: TaxRecord) => void;
}

interface Requirement {
  label: string;
  keys: string[];
  optional?: boolean;
  when?: "vat" | "clearance";
}

interface RequirementStatus extends Requirement {
  state: "done" | "missing" | "optional";
}

const COUNTRY_NAMES: Record<string, string> = {
  AE: "UAE",
  AU: "Australia",
  CN: "China",
  DE: "Germany",
  EG: "Egypt",
  FR: "France",
  GB: "United Kingdom",
  ID: "Indonesia",
  IN: "India",
  JP: "Japan",
  MY: "Malaysia",
  NL: "Netherlands",
  PH: "Philippines",
  SA: "Saudi Arabia",
  SG: "Singapore",
  TH: "Thailand",
  US: "United States",
  VN: "Vietnam",
};

const IDENTIFIER_FIELDS = [
  { label: "Tax ID", keys: ["tax_number", "tax_id"] },
  { label: "VAT / GST Number", keys: ["vat_number", "vat_id"] },
  { label: "State Tax ID", keys: ["state_tax_number", "state_tax_id"] },
  { label: "Sales Tax ID", keys: ["sales_tax_number", "sales_tax_id"] },
  { label: "Service Tax ID", keys: ["service_tax_number", "service_tax_id"] },
  { label: "Regional Tax ID", keys: ["regional_tax_number", "regional_tax_id"] },
];

const REQUIREMENTS_BY_COUNTRY: Record<string, Requirement[]> = {
  AE: [
    { label: "TRN", keys: ["vat_number", "vat_id"] },
    { label: "Tax registration document", keys: ["vat_registration_doc_id"], when: "vat" },
    { label: "Clearance number", keys: ["tax_clearance_number"], when: "clearance" },
  ],
  EG: [
    { label: "Tax card number", keys: ["tax_number", "tax_id"] },
    { label: "VAT number", keys: ["vat_number", "vat_id"], when: "vat" },
    { label: "Clearance certificate", keys: ["tax_clearance_doc_id"], when: "clearance" },
  ],
  IN: [
    { label: "PAN / Tax ID", keys: ["tax_number", "tax_id"] },
    { label: "GSTIN", keys: ["vat_number", "vat_id"], when: "vat" },
    { label: "State GST ID", keys: ["state_tax_number", "state_tax_id"], optional: true },
  ],
  MY: [
    { label: "Tax identification number", keys: ["tax_number", "tax_id"] },
    { label: "SST / Service Tax ID", keys: ["service_tax_number", "service_tax_id"], optional: true },
    { label: "Clearance certificate", keys: ["tax_clearance_doc_id"], when: "clearance" },
  ],
  SA: [
    { label: "VAT number", keys: ["vat_number", "vat_id"], when: "vat" },
    { label: "VAT certificate", keys: ["vat_registration_doc_id"], when: "vat" },
    { label: "GS1 GLN", keys: ["global_location_number"], optional: true },
  ],
  SG: [
    { label: "Tax ID / UEN", keys: ["tax_number", "tax_id"] },
    { label: "GST number", keys: ["vat_number", "vat_id"], when: "vat" },
    { label: "GST certificate", keys: ["vat_registration_doc_id"], when: "vat" },
    { label: "GLN", keys: ["global_location_number"], optional: true },
  ],
};

const TAX_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const TAX_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const TAX_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const TAX_ITEM_TITLE_CLASS = "text-sm font-semibold leading-snug text-foreground";
const TAX_KPI_VALUE_CLASS = "text-xl font-semibold leading-none text-foreground";

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function firstValue(rec: TaxRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = rec[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
}

function firstString(rec: TaxRecord, keys: string[]): string {
  return stringValue(firstValue(rec, keys)).trim();
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function vatRegistered(rec: TaxRecord): boolean {
  return boolValue(firstValue(rec, ["is_vat_registered", "vat_registered"]));
}

function hasTaxClearance(rec: TaxRecord): boolean {
  return boolValue(rec.has_tax_clearance);
}

function countryCode(rec: TaxRecord): string {
  return firstString(rec, ["country_code"]).toUpperCase() || "--";
}

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

function humanize(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw) return "-";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function daysUntil(value: unknown): number | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function statusVariant(status: unknown): "success" | "warning" | "muted" | "destructive" {
  const raw = stringValue(status).toLowerCase();
  if (raw === "active") return "success";
  if (raw === "inactive") return "muted";
  if (raw === "blocked" || raw === "archived") return "destructive";
  return "warning";
}

function hasAnyIdentifier(rec: TaxRecord): boolean {
  return IDENTIFIER_FIELDS.some((field) => firstString(rec, field.keys));
}

function missingVatDocument(rec: TaxRecord): boolean {
  return vatRegistered(rec) && !firstString(rec, ["vat_registration_doc_id"]);
}

function missingClearanceFields(rec: TaxRecord): boolean {
  return hasTaxClearance(rec) && (
    !firstString(rec, ["tax_clearance_number"]) ||
    !firstString(rec, ["tax_clearance_doc_id"])
  );
}

function clearanceTone(rec: TaxRecord): HealthTone {
  if (!hasTaxClearance(rec)) return "muted";
  if (missingClearanceFields(rec)) return "destructive";
  const days = daysUntil(rec.tax_clearance_expiry_date);
  if (days !== null && days < 0) return "destructive";
  if (days !== null && days <= 30) return "warning";
  return "success";
}

function profileTone(rec: TaxRecord): HealthTone {
  if (!hasAnyIdentifier(rec) || missingVatDocument(rec) || missingClearanceFields(rec)) {
    return "destructive";
  }
  const clearTone = clearanceTone(rec);
  if (clearTone === "destructive") return "destructive";
  if (clearTone === "warning") return "warning";
  return "success";
}

function toneClass(tone: HealthTone): string {
  switch (tone) {
    case "success": return "bg-success";
    case "warning": return "bg-warning";
    case "destructive": return "bg-destructive";
    default: return "bg-muted-foreground/45";
  }
}

function profileIssueLabel(rec: TaxRecord): string {
  if (!hasAnyIdentifier(rec)) return "Missing tax identifier";
  if (missingVatDocument(rec)) return "Missing VAT document";
  if (missingClearanceFields(rec)) return "Clearance incomplete";
  const days = daysUntil(rec.tax_clearance_expiry_date);
  if (hasTaxClearance(rec) && days !== null && days < 0) return "Clearance expired";
  if (hasTaxClearance(rec) && days !== null && days <= 30) return "Clearance expiring";
  return "Ready";
}

function requirementStatus(rec: TaxRecord): RequirementStatus[] {
  const code = countryCode(rec);
  const requirements = REQUIREMENTS_BY_COUNTRY[code] ?? [
    { label: "Tax ID", keys: ["tax_number", "tax_id"] },
    { label: "VAT / GST number", keys: ["vat_number", "vat_id"], when: "vat" },
    { label: "Clearance number", keys: ["tax_clearance_number"], when: "clearance" },
    { label: "GS1 GLN", keys: ["global_location_number"], optional: true },
  ];

  return requirements
    .filter((requirement) => {
      if (requirement.when === "vat") return vatRegistered(rec);
      if (requirement.when === "clearance") return hasTaxClearance(rec);
      return true;
    })
    .map((requirement) => {
      if (firstString(rec, requirement.keys)) return { ...requirement, state: "done" };
      return { ...requirement, state: requirement.optional ? "optional" : "missing" };
    });
}

function copyText(value: string) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

function MetricCard({
  label,
  value,
  detail,
  tone = "muted",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: HealthTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <p className={TAX_FIELD_LABEL_CLASS}>{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className={TAX_KPI_VALUE_CLASS}>{value}</p>
        <span className={cn("mb-1 size-2 rounded-sm", toneClass(tone))} aria-hidden />
      </div>
      <p className={cn("mt-3", TAX_FIELD_HELPER_CLASS)}>{detail}</p>
    </div>
  );
}

function CountryTabs({
  records,
  selectedId,
  onSelect,
  canAdd,
  onAdd,
  addLabel,
}: {
  records: TaxRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  canAdd: boolean;
  onAdd: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-1 overflow-x-auto">
        {records.map((rec) => {
          const id = stringValue(rec.id);
          const code = countryCode(rec);
          const selected = id === selectedId;
          const tone = profileTone(rec);
          return (
            <button
              key={id || code}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[11px] font-semibold">{code}</span>
              <span>{countryName(code)}</span>
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                {code}
              </span>
              <span className={cn("size-2 rounded-sm", toneClass(tone))} aria-label={profileIssueLabel(rec)} />
            </button>
          );
        })}
      </div>
      {canAdd && (
        <Button variant="outline" size="sm" className="h-8 self-start text-xs lg:self-auto" onClick={onAdd}>
          <Plus className="size-3" />
          {addLabel ?? "Add country profile"}
        </Button>
      )}
    </div>
  );
}

function SectionShell({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            {icon}
          </span>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const TAX_POSITION_FALLBACK_FIELDS = [
  "country_code",
  "tax_classification",
  "taxation_type",
  "global_location_number",
];

function propertyLabel(field: string): string {
  return humanize(field.replace(/_id$/, "").replace(/_/g, " "));
}

function propertyValue(rec: TaxRecord, field: string): string {
  const raw = rec[field];
  if (raw === null || raw === undefined || raw === "") return "-";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDate(raw);
  return humanize(raw);
}

function taxPositionFields(displayFields?: string[]): string[] {
  const configured = displayFields?.filter((field) => TAX_POSITION_FALLBACK_FIELDS.includes(field)) ?? [];
  return configured.length ? configured : TAX_POSITION_FALLBACK_FIELDS;
}

function TaxPosition({ rec, fields }: { rec: TaxRecord; fields: string[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
      {fields.map((field) => (
        <div key={field} className="min-w-0">
          <dt className={TAX_FIELD_LABEL_CLASS}>{propertyLabel(field)}</dt>
          <dd className={cn("mt-1 break-words", TAX_FIELD_VALUE_CLASS)}>
            {propertyValue(rec, field)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function IdentifierCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const populated = Boolean(value);
  return (
    <div className="min-h-28 rounded-lg border border-border bg-background px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={TAX_FIELD_LABEL_CLASS}>{label}</p>
          {populated ? (
            <p className={cn("mt-2 break-all", TAX_FIELD_VALUE_CLASS)}>{value}</p>
          ) : (
            <p className={cn("mt-2 italic", TAX_FIELD_HELPER_CLASS)}>Not captured</p>
          )}
        </div>
        {populated && (
          <button
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => copyText(value)}
            aria-label={`Copy ${label}`}
          >
            <Copy className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PropertyCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-h-24 rounded-lg border border-border bg-background px-4 py-4">
      <p className={TAX_FIELD_LABEL_CLASS}>{label}</p>
      <div className={cn("mt-1 break-words", TAX_FIELD_VALUE_CLASS)}>
        {value || "-"}
      </div>
    </div>
  );
}

function Identifiers({
  rec,
}: {
  rec: TaxRecord;
}) {
  const populated = IDENTIFIER_FIELDS.filter((field) => firstString(rec, field.keys)).length;
  return (
    <SectionShell
      title="Tax Identifiers"
      icon={<Stamp className="size-4" />}
      right={<p className="text-xs text-muted-foreground">{populated} of {IDENTIFIER_FIELDS.length} populated</p>}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {IDENTIFIER_FIELDS.map((field) => (
          <IdentifierCard
            key={field.label}
            label={field.label}
            value={firstString(rec, field.keys)}
          />
        ))}
      </div>
    </SectionShell>
  );
}

function ToggleBand({
  label,
  detail,
  checked,
}: {
  label: string;
  detail: string;
  checked: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
      <div>
        <p className={TAX_ITEM_TITLE_CLASS}>{label}</p>
        <p className={cn("mt-1", TAX_FIELD_HELPER_CLASS)}>{detail}</p>
      </div>
      <Switch checked={checked} disabled aria-label={label} />
    </div>
  );
}

function DocumentSlot({
  label,
  docId,
  missingLabel,
  required,
  canEdit,
  onEdit,
}: {
  label: string;
  docId: string;
  missingLabel: string;
  required: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const content = docId ? (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
        <FileCheck2 className="size-4" />
      </div>
      <div className="min-w-0">
        <p className={cn("truncate", TAX_ITEM_TITLE_CLASS)}>{label}</p>
        <p className={cn("mt-1 truncate", TAX_FIELD_HELPER_CLASS)}>{docId}</p>
      </div>
    </>
  ) : (
    <>
      <div className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        required ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
      )}>
        <FileText className="size-4" />
      </div>
      <div className="min-w-0">
        <p className={TAX_ITEM_TITLE_CLASS}>{missingLabel}</p>
        <p className={cn("mt-1", TAX_FIELD_HELPER_CLASS)}>{required ? "Required for this state" : "Optional"}</p>
      </div>
    </>
  );

  if (!docId && canEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card px-3 py-3 text-left transition-colors hover:border-muted-foreground/50"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
      {content}
    </div>
  );
}

function VatRegistration({
  rec,
  canEdit,
  onEdit,
}: {
  rec: TaxRecord;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const registered = vatRegistered(rec);
  const vatId = firstString(rec, ["vat_number", "vat_id"]);
  const docId = firstString(rec, ["vat_registration_doc_id"]);

  return (
    <SectionShell title="VAT / GST Registration" icon={<ReceiptText className="size-4" />}>
      <div className="space-y-4">
        <ToggleBand
          label="VAT / GST registered"
          detail={registered ? "Partner may issue or recover indirect tax." : "Partner is not registered for indirect tax."}
          checked={registered}
        />
        {registered && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <PropertyCard label="Registration Number" value={vatId || "-"} />
            <DocumentSlot
              label="Registration certificate"
              docId={docId}
              missingLabel="Registration certificate missing"
              required
              canEdit={canEdit}
              onEdit={onEdit}
            />
          </div>
        )}
      </div>
    </SectionShell>
  );
}

function ClearanceStatus({ rec }: { rec: TaxRecord }) {
  const days = daysUntil(rec.tax_clearance_expiry_date);
  if (!hasTaxClearance(rec)) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className={TAX_FIELD_LABEL_CLASS}>Status</p>
        <p className={cn("mt-1", TAX_FIELD_VALUE_CLASS)}>No clearance held</p>
      </div>
    );
  }

  const tone = clearanceTone(rec);
  const label = days === null
    ? "Expiry not captured"
    : days < 0
      ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
      : `Expires in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <div className={cn(
      "rounded-lg border px-4 py-3",
      tone === "success" && "border-success/30 bg-success/10",
      tone === "warning" && "border-warning/30 bg-warning/10",
      tone === "destructive" && "border-destructive/30 bg-destructive/10",
    )}>
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold", toneClass(tone), "text-white")}>
          {days === null ? "?" : Math.max(days, 0)}
        </span>
        <div>
          <p className={TAX_FIELD_LABEL_CLASS}>Status</p>
          <p className={cn("mt-1", TAX_FIELD_VALUE_CLASS)}>{label}</p>
          <p className={cn("mt-1", TAX_FIELD_HELPER_CLASS)}>{formatDate(rec.tax_clearance_expiry_date)}</p>
        </div>
      </div>
    </div>
  );
}

function TaxClearance({
  rec,
  canEdit,
  onEdit,
}: {
  rec: TaxRecord;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const clearance = hasTaxClearance(rec);
  const clearanceNumber = firstString(rec, ["tax_clearance_number"]);
  const docId = firstString(rec, ["tax_clearance_doc_id"]);

  return (
    <SectionShell title="Tax Clearance Certificate" icon={<ShieldCheck className="size-4" />}>
      <div className="space-y-4">
        <ToggleBand
          label="Holds valid tax clearance"
          detail={clearance ? "Clearance certificate is tracked for payments and tenders." : "No clearance certificate is tracked."}
          checked={clearance}
        />
        {clearance && (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.9fr)]">
              <PropertyCard label="Clearance Number" value={clearanceNumber || "-"} />
              <PropertyCard label="Expiry Date" value={formatDate(rec.tax_clearance_expiry_date)} />
              <ClearanceStatus rec={rec} />
            </div>
            <DocumentSlot
              label="Clearance certificate document"
              docId={docId}
              missingLabel="Clearance certificate missing"
              required
              canEdit={canEdit}
              onEdit={onEdit}
            />
          </>
        )}
      </div>
    </SectionShell>
  );
}

function NotesPanel({ rec }: { rec: TaxRecord }) {
  const penalty = firstString(rec, ["penalty_information"]);
  const discount = firstString(rec, ["discount_information"]);
  return (
    <SectionShell title="Notes and Special Instructions" icon={<ClipboardCheck className="size-4" />}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextBlock label="Penalty Information" value={penalty} />
        <TextBlock label="Discount Information" value={discount} />
      </div>
    </SectionShell>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={TAX_FIELD_LABEL_CLASS}>{label}</p>
      <div className={cn("mt-1 min-h-24 rounded-lg border border-border bg-background px-4 py-4 leading-relaxed", TAX_FIELD_VALUE_CLASS)}>
        {value || <span className={cn("italic", TAX_FIELD_HELPER_CLASS)}>No notes captured</span>}
      </div>
    </div>
  );
}

function RequirementsRail({ rec }: { rec: TaxRecord }) {
  const requirements = requirementStatus(rec);
  const code = countryCode(rec);

  return (
    <aside className="space-y-3">
      <RailBox title={`${countryName(code)} Requirements`} badge={code}>
        <div className="space-y-2">
          {requirements.map((requirement) => (
            <div key={requirement.label} className="flex items-start gap-2">
              {requirement.state === "done" && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />}
              {requirement.state === "missing" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />}
              {requirement.state === "optional" && <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <p className={TAX_FIELD_LABEL_CLASS}>{requirement.label}</p>
                <p className={cn("mt-1", TAX_FIELD_HELPER_CLASS)}>
                  {requirement.state === "done" ? "Populated" : requirement.state === "missing" ? "Missing" : "Optional"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </RailBox>
      <AuditRail rec={rec} />
      <ActivityRail rec={rec} />
    </aside>
  );
}

function RailBox({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className={TAX_ITEM_TITLE_CLASS}>{title}</h4>
        {badge && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function AuditRail({ rec }: { rec: TaxRecord }) {
  return (
    <RailBox title="Record Audit" badge="META">
      <dl className="space-y-3">
        <AuditRow label="Created" value={formatAuditValue(rec.created_at, rec.created_by)} />
        <AuditRow label="Last updated" value={formatAuditValue(rec.updated_at, rec.updated_by)} />
        <AuditRow label="Status changed" value={formatAuditValue(rec.status_changed_at, rec.status_changed_by)} />
        <AuditRow label="Profile ID" value={shortId(firstString(rec, ["id"]))} />
      </dl>
    </RailBox>
  );
}

function formatAuditValue(dateValue: unknown, actorValue: unknown): ReactNode {
  const date = formatDate(dateValue);
  const actor = shortId(stringValue(actorValue));
  if (date === "-" && !actor) return "-";
  return (
    <>
      {date}
      {actor && <span className="text-muted-foreground"> by {actor}</span>}
    </>
  );
}

function AuditRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className={TAX_FIELD_HELPER_CLASS}>{label}</dt>
      <dd className="max-w-[150px] text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ActivityRail({ rec }: { rec: TaxRecord }) {
  const activity = [
    rec.created_at ? { label: "Profile created", date: rec.created_at } : null,
    vatRegistered(rec) ? { label: "VAT / GST registration captured", date: rec.updated_at ?? rec.created_at } : null,
    hasTaxClearance(rec) ? { label: "Tax clearance tracked", date: rec.tax_clearance_expiry_date } : null,
    rec.updated_at ? { label: "Profile updated", date: rec.updated_at } : null,
  ].filter(Boolean) as Array<{ label: string; date: unknown }>;

  return (
    <RailBox title="Recent Activity">
      {activity.length > 0 ? (
        <ol className="space-y-3">
          {activity.slice(0, 4).map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex gap-2">
              <span className={cn("mt-1 size-2 shrink-0 rounded-sm", index === 0 ? "bg-primary" : "bg-border")} />
              <div>
                <p className={TAX_ITEM_TITLE_CLASS}>{item.label}</p>
                <p className={TAX_FIELD_HELPER_CLASS}>{formatDate(item.date)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={TAX_FIELD_HELPER_CLASS}>No activity timestamps on this profile.</p>
      )}
    </RailBox>
  );
}

function shortId(id: string): string {
  if (!id) return "";
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

export function TaxProfileSummaryPanel({
  records,
  tab,
  canAdd,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: TaxProfileSummaryPanelProps) {
  const orderedRecords = useMemo(
    () => [...records].sort((a, b) => countryCode(a).localeCompare(countryCode(b))),
    [records],
  );
  const [selectedId, setSelectedId] = useState(() => stringValue(orderedRecords[0]?.id));
  const selectedRecord =
    orderedRecords.find((rec) => stringValue(rec.id) === selectedId) ??
    orderedRecords[0] ??
    null;

  const vatCount = records.filter(vatRegistered).length;
  const activeCount = records.filter((rec) => stringValue(rec.status).toLowerCase() === "active").length;
  const docGaps = records.filter((rec) => missingVatDocument(rec) || missingClearanceFields(rec)).length;
  const clearanceRisk = records.filter((rec) => {
    const tone = clearanceTone(rec);
    return tone === "warning" || tone === "destructive";
  }).length;

  if (!selectedRecord) return null;

  const selectedCode = countryCode(selectedRecord);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {countryName(selectedCode)} profile for country-specific identifiers, VAT, clearance, and notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onEdit(selectedRecord)}>
                <Pencil className="size-3" />
                Edit profile
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => onDelete(selectedRecord)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Country profiles" value={String(records.length)} detail={`${activeCount} active`} tone="success" />
        <MetricCard label="VAT / GST registered" value={`${vatCount} / ${records.length}`} detail="formal indirect tax profiles" tone={vatCount ? "success" : "muted"} />
        <MetricCard label="Clearance risk" value={String(clearanceRisk)} detail={clearanceRisk ? "expiry or evidence attention" : "no urgent clearance issues"} tone={clearanceRisk ? "warning" : "success"} />
        <MetricCard label="Document gaps" value={String(docGaps)} detail={docGaps ? "registration or clearance docs" : "documents linked"} tone={docGaps ? "destructive" : "success"} />
      </div>

      <CountryTabs
        records={orderedRecords}
        selectedId={stringValue(selectedRecord.id)}
        onSelect={setSelectedId}
        canAdd={canAdd}
        onAdd={onAdd}
        addLabel={tab.add_label}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <SectionShell title="Tax Position" icon={<Landmark className="size-4" />}>
            <TaxPosition rec={selectedRecord} fields={taxPositionFields(tab.display_fields)} />
          </SectionShell>
          <Identifiers rec={selectedRecord} />
          <VatRegistration rec={selectedRecord} canEdit={canEdit} onEdit={() => onEdit(selectedRecord)} />
          <TaxClearance rec={selectedRecord} canEdit={canEdit} onEdit={() => onEdit(selectedRecord)} />
          <NotesPanel rec={selectedRecord} />
        </div>

        <RequirementsRail rec={selectedRecord} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe2 className="size-3.5" />
          <span className={cn("size-2 rounded-sm", toneClass(profileTone(selectedRecord)))} />
          <span>{selectedCode}: {profileIssueLabel(selectedRecord)}</span>
        </div>
        {canAdd && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAdd}>
            <Plus className="size-3" />
            {tab.add_label ?? "Add country profile"}
          </Button>
        )}
      </div>
    </div>
  );
}
