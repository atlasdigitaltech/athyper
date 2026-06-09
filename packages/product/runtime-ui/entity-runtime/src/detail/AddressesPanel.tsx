"use client";

/**
 * AddressesPanel — rich address accordion for master entity detail pages.
 *
 * Generic via owner_type / owner_id — works for business_partner, supplier,
 * customer, employee, or any future owner. Rendered when a MasterTab has
 * renderer = "addresses_accordion".
 *
 * Card design per address (one physical address, potentially multiple purposes):
 *   • Header: type icon · purpose pill(s) · primary/status badge · geocoded badge
 *   • Hero: formatted or computed address text + city/country subline
 *   • Chips: city · country · postal · type (always visible)
 *   • Expanded: ADDRESS BREAKDOWN · VALIDATION & JURISDICTION · EFFECTIVE PERIOD · actions
 *
 * CSS: semantic tokens only — no hardcoded colours, font sizes or font families.
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Home, Package, Landmark, MapPin,
  CheckCircle2, ChevronDown, ChevronUp,
  Copy, ExternalLink, Plus, AlertCircle,
  CalendarX, Crown, Star, Globe2, History, User,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Badge, Button, DrawerShell, Skeleton,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@athyper/ui/primitives";
import type { MasterTab } from "@athyper/metadata-client/compiled-reader";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import type { ViewOnlyReason } from "./ChildSummaryCardsPanel";
import { titleCase } from "@athyper/runtime-shared/core";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddressLinkInfo {
  link_id:         string;
  purpose:         string;
  is_primary:      boolean;
  effective_from:  string;
  effective_until: string | null;
}

interface AddressGrouped {
  address_id:        string;
  code:              string | null;
  status:            string;
  address_type:      string | null;
  attention_line:    string | null;
  line1:             string | null;
  line2:             string | null;
  line3:             string | null;
  city:              string | null;
  region:            string | null;
  postal_code:       string | null;
  country_code:      string | null;
  formatted_address: string | null;
  latitude:          number | null;
  longitude:         number | null;
  metadata:          Record<string, unknown>;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_name: string | null;
  status_changed_count: number;
  created_at:        string;
  created_by:        string;
  created_by_name:   string | null;
  updated_at:        string | null;
  updated_by:        string | null;
  updated_by_name:   string | null;
  links:             AddressLinkInfo[];
  is_primary:        boolean;
}

interface AddressesResponse {
  addresses: AddressGrouped[];
  summary:   { total_addresses: number; primary_count: number; geocoded_count: number };
}

interface AddressMetadataKeyMap {
  district?: string;
  zatcaRegion?: string;
  taxJurisdiction?: string;
  postalValid?: string;
  geocodingAccuracy?: string;
  geocodingAccuracyMeters?: string;
}

// ── Country name lookup (client-side; extends as needed) ──────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  SA: "Saudi Arabia", AE: "United Arab Emirates", GB: "United Kingdom",
  US: "United States", IN: "India", DE: "Germany", FR: "France",
  IT: "Italy", ES: "Spain", NL: "Netherlands", BE: "Belgium",
  CH: "Switzerland", AT: "Austria", PL: "Poland", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", PT: "Portugal",
  BR: "Brazil", MX: "Mexico", CA: "Canada", AU: "Australia",
  NZ: "New Zealand", JP: "Japan", CN: "China", SG: "Singapore",
  MY: "Malaysia", OM: "Oman", KW: "Kuwait", QA: "Qatar",
  BH: "Bahrain", EG: "Egypt", JO: "Jordan", LB: "Lebanon",
  TR: "Turkey", ZA: "South Africa", KE: "Kenya", NG: "Nigeria",
  PK: "Pakistan", BD: "Bangladesh", ID: "Indonesia", PH: "Philippines",
  TH: "Thailand", VN: "Vietnam", KR: "South Korea",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADDRESS_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const ADDRESS_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const ADDRESS_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const ADDRESS_ITEM_TITLE_CLASS = "text-sm font-medium leading-snug text-foreground";

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textSetting(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function addressPresentationSettings(tab: MasterTab): Record<string, unknown> {
  return asPlainRecord(tab.config?.presentation_config) ?? {};
}

function addressMetadataKeyMap(tab: MasterTab): AddressMetadataKeyMap {
  const settings = addressPresentationSettings(tab);
  const raw = asPlainRecord(settings.address_metadata_keys) ?? asPlainRecord(settings.metadata_keys) ?? {};
  return {
    district:                textSetting(raw.district),
    zatcaRegion:             textSetting(raw.zatcaRegion ?? raw.zatca_region),
    taxJurisdiction:         textSetting(raw.taxJurisdiction ?? raw.tax_jurisdiction),
    postalValid:             textSetting(raw.postalValid ?? raw.postal_valid),
    geocodingAccuracy:       textSetting(raw.geocodingAccuracy ?? raw.geocoding_accuracy),
    geocodingAccuracyMeters: textSetting(raw.geocodingAccuracyMeters ?? raw.geocoding_accuracy_meters),
  };
}

function metadataValue(addr: AddressGrouped, key?: string): unknown {
  return key ? addr.metadata[key] : undefined;
}

function countryName(code: string | null): string {
  if (!code) return "";
  return COUNTRY_NAMES[code.toUpperCase()] ?? code;
}

function countryFlag(code: string | null): string | null {
  const normalized = code?.toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return null;
  return String.fromCodePoint(
    ...normalized.split("").map((char) => 127397 + char.charCodeAt(0)),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDate(val: string | null): string {
  if (!val) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(val));
  } catch { return val; }
}

function formatShortDate(val: string | null): string {
  if (!val) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(val));
  } catch { return val; }
}

function computeDuration(from: string | null, until: string | null): string {
  if (!from) return "";
  const start  = new Date(from);
  const end    = until ? new Date(until) : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  const years  = Math.floor(months / 12);
  const rem    = months % 12;
  const parts: string[] = [];
  if (years > 0)  parts.push(`${years} yr`);
  if (rem > 0)    parts.push(`${rem} mo`);
  return parts.join(" ") || "< 1 mo";
}

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}° ${latDir}, ${Math.abs(lng).toFixed(3)}° ${lngDir}`;
}

function buildHeroAddress(addr: AddressGrouped): string {
  if (addr.formatted_address) return addr.formatted_address;
  return [addr.line1, addr.line2, addr.line3].filter(Boolean).join(", ");
}

function buildSubLine(addr: AddressGrouped, metadataKeys: AddressMetadataKeyMap): string {
  const district = metadataValue(addr, metadataKeys.district) as string | undefined;
  return [
    district,
    addr.city,
    addr.postal_code,
    countryName(addr.country_code),
  ].filter(Boolean).join(", ");
}

function buildAddressCopyText(addr: AddressGrouped): string {
  return [
    addr.attention_line,
    addr.formatted_address ?? [addr.line1, addr.line2, addr.line3].filter(Boolean).join(", "),
    [addr.city, addr.region, addr.postal_code].filter(Boolean).join(", "),
    addr.country_code ? countryName(addr.country_code) : null,
  ].filter(Boolean).join("\n");
}

function geocodingLabel(addr: AddressGrouped, metadataKeys: AddressMetadataKeyMap): string {
  const accuracy = metadataValue(addr, metadataKeys.geocodingAccuracy);
  const meters = metadataValue(addr, metadataKeys.geocodingAccuracyMeters);
  const accuracyText = typeof accuracy === "string" && accuracy
    ? titleCase(accuracy.replace(/_/g, " "))
    : (addr.latitude != null && addr.longitude != null ? "Geocoded" : "Not geocoded");
  if (typeof meters === "number") return `${accuracyText} - ~${meters}m`;
  if (typeof meters === "string" && meters) return `${accuracyText} - ~${meters}m`;
  return accuracyText;
}

function getInitialsFromWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "--";
}

function actorInitials(name: string | null, id: string | null): string {
  if (name) return getInitialsFromWords(name);
  if (!id) return "--";
  if (id === "00000000-0000-0000-0000-000000000000") return "SY";
  return id.replace(/-/g, "").slice(0, 2).toUpperCase();
}

function actorLabel(name: string | null, id: string | null): string {
  if (name) return name;
  if (!id) return "Unknown";
  if (id === "00000000-0000-0000-0000-000000000000") return "System";
  return `User ${id.slice(-4)}`;
}

function purposeLabel(code: string): string {
  const overrides: Record<string, string> = {
    hq:           "Headquarters",
    shipping:     "Ship-to",
    ship_to:      "Ship-to",
    billing:      "Billing",
    remittance:   "Remittance",
    legal:        "Legal",
    registered:   "Registered",
    tax:          "Tax",
    statements:   "Statements",
    mailing:      "Mailing",
    regulatory:   "Regulatory",
    home:         "Home",
    work:         "Work",
    payroll:      "Payroll",
    office:       "Office",
    trading:      "Trading",
    warehouse:    "Warehouse",
    installation: "Installation",
    receiving:    "Receiving",
    returns:      "Returns",
    emergency:    "Emergency",
    default:      "Default",
    other:        "Other",
  };
  return overrides[code] ?? titleCase(code);
}

// Primary link = first link where is_primary=true, else first link overall.
function primaryLink(links: AddressLinkInfo[]): AddressLinkInfo | undefined {
  return links.find((l) => l.is_primary) ?? links[0];
}

// Effective_from/until for display: earliest from, null if any link is open-ended.
function effectivePeriod(links: AddressLinkInfo[]): { from: string | null; until: string | null } {
  const from  = links.reduce<string | null>((min, l) => {
    if (!min) return l.effective_from;
    return l.effective_from < min ? l.effective_from : min;
  }, null);
  const until = links.some((l) => l.effective_until === null) ? null
    : links.reduce<string | null>((max, l) => {
        if (!max) return l.effective_until;
        return (l.effective_until ?? "") > max ? l.effective_until : max;
      }, null);
  return { from, until };
}

function isExpiredPeriod(until: string | null): boolean {
  if (!until) return false;
  return new Date(until) < new Date();
}

function isAddressActive(addr: AddressGrouped): boolean {
  const { until } = effectivePeriod(addr.links);
  return !isExpiredPeriod(until);
}

function addressStatusVariant(addr: AddressGrouped): "success" | "muted" {
  return isAddressActive(addr) ? "success" : "muted";
}

function addressStatusLabel(addr: AddressGrouped): string {
  return isAddressActive(addr) ? "Active" : "Inactive";
}

// ── Address type icon ─────────────────────────────────────────────────────────

function AddressTypeIcon({ type, className = "size-4" }: { type: string | null; className?: string }) {
  switch (type) {
    case "po_box":
    case "parcel_locker":
    case "freight_depot":
      return <Package className={className} />;
    case "residential":
    case "residential_apt":
      return <Home className={className} />;
    case "government":
      return <Landmark className={className} />;
    case "commercial":
    case "retail":
    case "industrial":
    case "warehouse":
    case "virtual_office":
    case "coworking":
    case "customs_zone":
      return <Building2 className={className} />;
    default:
      return <MapPin className={className} />;
  }
}

// ── Chip — small info pill ─────────────────────────────────────────────────────

function InfoChip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Badge variant="outline" size="sm" className="gap-1 bg-muted/40 text-muted-foreground">
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </Badge>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn("mb-2", ADDRESS_FIELD_LABEL_CLASS)}>
      {children}
    </p>
  );
}

// ── Breakdown row — two-column label / value grid item ────────────────────────

function BreakdownRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt className={ADDRESS_FIELD_LABEL_CLASS}>{label}</dt>
      <dd className={ADDRESS_FIELD_VALUE_CLASS}>{value}</dd>
    </>
  );
}

// ── Effective period bar ──────────────────────────────────────────────────────

function EffectivePeriodBar({ from, until }: { from: string | null; until: string | null }) {
  if (!from) return null;

  const expired  = isExpiredPeriod(until);
  const isActive = !until || !expired;
  const duration = computeDuration(from, until);

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="relative flex items-center h-3">
        {/* Track */}
        <div className={cn(
          "absolute inset-y-1/2 -translate-y-1/2 w-full h-0.5 rounded-full",
          isActive ? "bg-success/25" : "bg-muted",
        )} />
        {/* Fill */}
        <div className={cn(
          "absolute inset-y-1/2 -translate-y-1/2 h-0.5 rounded-full w-full",
          isActive ? "bg-success" : "bg-muted-foreground/30",
        )} />
        {/* Start dot */}
        <span className={cn(
          "absolute left-0 size-2.5 rounded-full border-2 border-background",
          isActive ? "bg-success" : "bg-muted-foreground/40",
        )} />
        {/* End dot */}
        <span className={cn(
          "absolute right-0 size-2.5 rounded-full border-2 border-background",
          isActive ? "bg-success" : "bg-muted-foreground/40",
        )} />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatShortDate(from)}</span>
        <span className={cn("text-center", isActive && "text-success/80")}>
          {duration}{isActive ? " · current" : ""}
        </span>
        <span>{until ? formatShortDate(until) : "—"}</span>
      </div>
    </div>
  );
}

// ── AddressCard ───────────────────────────────────────────────────────────────

function AddressCard({
  addr,
  metadataKeys,
  expanded,
  onToggle,
  canMutate,
  onSetPrimary,
  onEndDate,
  settingPrimary,
  endDating,
}: {
  addr:           AddressGrouped;
  metadataKeys:   AddressMetadataKeyMap;
  expanded:       boolean;
  onToggle:       () => void;
  canMutate:      boolean;
  onSetPrimary:   (linkId: string) => void;
  onEndDate:      (linkId: string) => void;
  settingPrimary: boolean;
  endDating:      boolean;
}) {
  const isGeocoded = addr.latitude != null;
  const heroText   = buildHeroAddress(addr);
  const subLine    = buildSubLine(addr, metadataKeys);

  // Purpose pills: split into primary display + secondary tags
  const sortedLinks = [...addr.links].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.purpose.localeCompare(b.purpose);
  });
  const [mainLink, ...secondaryLinks] = sortedLinks;
  const mainPurpose = mainLink?.purpose ?? "default";

  // Effective period across all links
  const { from: periodFrom, until: periodUntil } = effectivePeriod(addr.links);
  const expired = isExpiredPeriod(periodUntil);
  const statusLabel = addressStatusLabel(addr);

  // Metadata extras
  const district        = metadataValue(addr, metadataKeys.district) as string | undefined;
  const zatcaRegion     = metadataValue(addr, metadataKeys.zatcaRegion) as string | undefined;
  const taxJurisdiction = metadataValue(addr, metadataKeys.taxJurisdiction) as string | undefined;
  const postalValid     = metadataValue(addr, metadataKeys.postalValid) as boolean | undefined;

  // The link to use for set-primary / end-date actions
  const actionLink = primaryLink(addr.links);

  function handleCopy() {
    const text = addr.formatted_address
      ?? [addr.line1, addr.line2, addr.city, addr.country_code].filter(Boolean).join(", ");
    void navigator.clipboard.writeText(text);
  }

  function mapsUrl(): string {
    if (isGeocoded) {
      return `https://maps.google.com/?q=${addr.latitude},${addr.longitude}`;
    }
    const query = encodeURIComponent(addr.formatted_address ?? addr.line1 ?? "");
    return `https://maps.google.com/?q=${query}`;
  }

  return (
    <div className={cn(
      "border border-border rounded-lg overflow-hidden transition-colors",
      expired && "opacity-60",
    )}>
      {/* ── Always-visible header ──────────────────────────────────────────── */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
      >
        {/* Type icon tile */}
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <AddressTypeIcon type={addr.address_type} className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Purpose + state badges */}
          <div className="flex flex-wrap items-center gap-2">
            {heroText && (
              <p className={cn("min-w-0 truncate", ADDRESS_ITEM_TITLE_CLASS)}>
                {heroText}
              </p>
            )}
            {/* Primary purpose — prominent pill */}
            <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
              {purposeLabel(mainPurpose)}
            </Badge>

            {/* Secondary purposes */}
            {secondaryLinks.map((l) => (
              <Badge key={l.link_id} variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">
                {purposeLabel(l.purpose)}
              </Badge>
            ))}

            {/* Primary/status badges — match Contacts tab treatment */}
            {addr.is_primary && (
              <Badge variant="outline" size="sm" className="bg-muted/40 text-muted-foreground">Primary</Badge>
            )}

            <Badge variant={addressStatusVariant(addr)} size="sm">{statusLabel}</Badge>

            {/* Geocoded badge */}
            {isGeocoded && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3" />
                Geocoded
              </span>
            )}

            {/* Expired indicator */}
            {expired && (
              <Badge variant="muted" size="sm">Expired</Badge>
            )}
          </div>

          {/* City / country subline */}
          {subLine && (
            <p className={cn("mt-1 line-clamp-1", ADDRESS_FIELD_HELPER_CLASS)}>{subLine}</p>
          )}
        </div>

        {/* Header quick-actions + chevron */}
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                >
                  <Copy className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy address</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={mapsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in maps</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="ml-1.5 text-muted-foreground">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
        </div>
      </div>

      {/* ── At-a-glance chips (always visible) ─────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 -mt-1">
        {addr.city && (
          <InfoChip icon={<MapPin className="size-3" />}>{addr.city}</InfoChip>
        )}
        {addr.country_code && (
          <InfoChip>
            <span className="font-medium">{addr.country_code}</span>
            {COUNTRY_NAMES[addr.country_code] && (
              <span className="text-muted-foreground/70">{COUNTRY_NAMES[addr.country_code]}</span>
            )}
          </InfoChip>
        )}
        {addr.postal_code && (
          <InfoChip>Postal {addr.postal_code}</InfoChip>
        )}
        {addr.address_type && (
          <InfoChip>Type {titleCase(addr.address_type.replace(/_/g, " "))}</InfoChip>
        )}
      </div>

      {/* ── Expanded section ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-border px-4 pt-4 pb-5 space-y-5">

          {/* ADDRESS BREAKDOWN */}
          <div>
            <SectionLabel>Address Breakdown</SectionLabel>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              {addr.attention_line && (
                <BreakdownRow label="Attention" value={addr.attention_line} />
              )}
              <BreakdownRow label="Line 1"   value={addr.line1} />
              <BreakdownRow label="Line 2"   value={addr.line2} />
              {addr.line3 && <BreakdownRow label="Line 3" value={addr.line3} />}
              {district    && <BreakdownRow label="District" value={district} />}
              <BreakdownRow label="City"     value={addr.city} />
              <BreakdownRow label="Region"   value={addr.region} />
              <BreakdownRow label="Postal"   value={addr.postal_code} />
              <BreakdownRow
                label="Country"
                value={addr.country_code
                  ? `${addr.country_code}${COUNTRY_NAMES[addr.country_code] ? ` — ${COUNTRY_NAMES[addr.country_code]}` : ""}`
                  : null}
              />
            </dl>
          </div>

          {/* VALIDATION & JURISDICTION — only render when there's data */}
          {(isGeocoded || postalValid !== undefined || zatcaRegion || taxJurisdiction) && (
            <div>
              <SectionLabel>Validation &amp; Jurisdiction</SectionLabel>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {/* Geocoded */}
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 className={cn(
                    "size-3.5 mt-0.5 shrink-0",
                    isGeocoded ? "text-success" : "text-muted-foreground/30",
                  )} />
                  <div className="min-w-0">
                    <p className={ADDRESS_FIELD_VALUE_CLASS}>
                      {isGeocoded ? "Geocoded" : "Not geocoded"}
                    </p>
                    {isGeocoded && addr.latitude != null && addr.longitude != null && (
                      <p className="text-xs text-muted-foreground">
                        {formatCoords(addr.latitude, addr.longitude)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Postal valid */}
                {postalValid !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className={cn(
                      "size-3.5 shrink-0",
                      postalValid ? "text-success" : "text-muted-foreground/30",
                    )} />
                    <p className={ADDRESS_FIELD_VALUE_CLASS}>
                      {postalValid ? "Postal valid" : "Postal invalid"}
                    </p>
                  </div>
                )}

                {/* ZATCA region */}
                {zatcaRegion && (
                  <>
                    <dt className={ADDRESS_FIELD_LABEL_CLASS}>ZATCA region</dt>
                    <dd className={ADDRESS_FIELD_VALUE_CLASS}>{zatcaRegion}</dd>
                  </>
                )}

                {/* Tax jurisdiction */}
                {taxJurisdiction && (
                  <>
                    <dt className={ADDRESS_FIELD_LABEL_CLASS}>Tax jurisdiction</dt>
                    <dd className={ADDRESS_FIELD_VALUE_CLASS}>{taxJurisdiction}</dd>
                  </>
                )}
              </div>
            </div>
          )}

          {/* EFFECTIVE PERIOD */}
          <div>
            <SectionLabel>Effective Period</SectionLabel>
            <EffectivePeriodBar from={periodFrom} until={periodUntil} />
          </div>

          {/* ACTIONS — mutation-only; Copy/Maps live in header */}
          {canMutate && actionLink && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <TooltipProvider delayDuration={300}>
                {/* Set as primary */}
                {!addr.is_primary && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        loading={settingPrimary}
                        onClick={(e) => { e.stopPropagation(); onSetPrimary(actionLink.link_id); }}
                      >
                        <Crown className="size-3" />
                        Set as primary
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark this address as primary for its purpose</TooltipContent>
                  </Tooltip>
                )}

                {/* End-date */}
                {!actionLink.effective_until && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50"
                        loading={endDating}
                        onClick={(e) => { e.stopPropagation(); onEndDate(actionLink.link_id); }}
                      >
                        <CalendarX className="size-3" />
                        End-date
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close the validity window to today (preserves audit trail)</TooltipContent>
                  </Tooltip>
                )}
              </TooltipProvider>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AddressesPanel ────────────────────────────────────────────────────────────

export function AddressesPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  tab:            MasterTab;
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const qc = useQueryClient();

  const ownerType = tab.owner_type_filter ?? "business_partner";
  const queryKey  = ["addresses", ownerType, recordUuid] as const;

  const { data, isLoading, isError } = useQuery<AddressesResponse>({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ owner_type: ownerType, owner_id: recordUuid });
      const res = await fetch(`/api/relay/api/master/addresses?${params}`, { signal });
      if (!res.ok) throw new Error("Failed to load addresses");
      return res.json() as Promise<AddressesResponse>;
    },
    staleTime: 60_000,
  });

  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [addOpen,         setAddOpen]         = useState(false);
  const [endDateLinkId,   setEndDateLinkId]   = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
  const [endDatingId,      setEndDatingId]     = useState<string | null>(null);
  const [addPending,       setAddPending]      = useState(false);
  const [addPurpose,       setAddPurpose]      = useState("default");

  const addressFormRef = useRef<EntityFormHandle>(null);

  const canMutate = editMode && !viewOnlyReason;

  // ── Set primary mutation ────────────────────────────────────────────────────
  const setPrimaryMutation = useMutation({
    mutationFn: async (linkId: string) => {
      setSettingPrimaryId(linkId);
      const res = await fetch(
        `/api/relay/api/master/addresses/links/${encodeURIComponent(linkId)}/set-primary`,
        { method: "PATCH", headers: { "Content-Type": "application/json" } },
      );
      if (!res.ok) throw new Error("Failed to set primary");
    },
    onSettled: () => {
      setSettingPrimaryId(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  // ── End-date mutation ───────────────────────────────────────────────────────
  const endDateMutation = useMutation({
    mutationFn: async (linkId: string) => {
      setEndDatingId(linkId);
      const res = await fetch(
        `/api/relay/api/master/addresses/links/${encodeURIComponent(linkId)}/end-date`,
        { method: "PATCH", headers: { "Content-Type": "application/json" } },
      );
      if (!res.ok) throw new Error("Failed to end-date address");
    },
    onSettled: () => {
      setEndDatingId(null);
      setEndDateLinkId(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  // ── Add address (2-step: address then address_link) ─────────────────────────
  async function handleAddAddress(formData: Record<string, unknown>) {
    setAddPending(true);
    try {
      // Step 1: create the physical address record
      const addrRes = await fetch("/api/relay/api/records/address", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ data: formData }),
      });
      if (!addrRes.ok) {
        const err = await addrRes.json() as { message?: string };
        throw new Error(err.message ?? "Failed to create address");
      }
      const created = await addrRes.json() as Record<string, unknown>;
      const addressId = String(created["id"] ?? "");

      // Step 2: create the polymorphic link
      const linkRes = await fetch("/api/relay/api/records/address_link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          data: {
            address_id:  addressId,
            owner_type:  ownerType,
            owner_id:    recordUuid,
            purpose:     addPurpose,
            is_primary:  false,
            effective_from: new Date().toISOString().slice(0, 10),
          },
        }),
      });
      if (!linkRes.ok) {
        const err = await linkRes.json() as { message?: string };
        throw new Error(err.message ?? "Failed to link address");
      }

      setAddOpen(false);
      setAddPurpose("default");
      void qc.invalidateQueries({ queryKey });
    } finally {
      setAddPending(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        Failed to load addresses.
      </div>
    );
  }

  const addresses = data?.addresses ?? [];
  const summary   = data?.summary ?? { total_addresses: 0, primary_count: 0, geocoded_count: 0 };
  const metadataKeys = addressMetadataKeyMap(tab);

  // Summary text
  function summaryText(): string {
    if (summary.total_addresses === 0) return tab.empty_title ?? "No addresses registered";
    const activeCount = addresses.filter(isAddressActive).length;
    const parts = [`${summary.total_addresses} address${summary.total_addresses !== 1 ? "es" : ""}`];
    parts.push(`${activeCount} active`);
    if (summary.primary_count === 0) parts.push("no primary");
    if (summary.geocoded_count === summary.total_addresses && summary.total_addresses > 1)
      parts.push("all geocoded");
    else if (summary.geocoded_count > 0 && summary.geocoded_count < summary.total_addresses)
      parts.push(`${summary.geocoded_count} geocoded`);
    else if (summary.geocoded_count === summary.total_addresses && summary.total_addresses === 1)
      parts.push("geocoded");
    return parts.join(" · ");
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-4">
        <p className={ADDRESS_FIELD_HELPER_CLASS}>{summaryText()}</p>
        {canMutate && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5 mr-1.5" />
            {tab.add_label ?? "Add address"}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <MapPin className="size-8 text-muted-foreground/25" />
          <p className={ADDRESS_FIELD_HELPER_CLASS}>
            {tab.empty_title ?? "No addresses registered"}
          </p>
          {tab.empty_description && (
            <p className="text-xs text-muted-foreground/60 max-w-xs">{tab.empty_description}</p>
          )}
          {canMutate && (
            <Button size="sm" variant="outline" className="mt-1" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5 mr-1.5" />
              {tab.add_label ?? "Add address"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <AddressCard
              key={addr.address_id}
              addr={addr}
              metadataKeys={metadataKeys}
              expanded={expandedId === addr.address_id}
              onToggle={() => setExpandedId(expandedId === addr.address_id ? null : addr.address_id)}
              canMutate={canMutate}
              onSetPrimary={(linkId) => setPrimaryMutation.mutate(linkId)}
              onEndDate={(linkId) => setEndDateLinkId(linkId)}
              settingPrimary={settingPrimaryId === (primaryLink(addr.links)?.link_id ?? "")}
              endDating={endDatingId === (primaryLink(addr.links)?.link_id ?? "")}
            />
          ))}
        </div>
      )}

      {/* Add Address drawer */}
      <DrawerShell
        open={addOpen}
        onOpenChange={setAddOpen}
        intent="transactional"
        widthKey="master:address:create"
        defaultWidth={560}
        minWidth={420}
        resizable
        badge="ADDRESS"
        title="Add Address"
        footerEnd={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(false)}
              disabled={addPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={addPending}
              onClick={() => void addressFormRef.current?.submit()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="px-5 py-4 space-y-5">
          {/* Purpose selector — sits above EntityForm so user always sees it */}
          <div className="space-y-1.5">
            <label className={ADDRESS_FIELD_LABEL_CLASS}>
              Purpose <span className="text-destructive">*</span>
            </label>
            <select
              value={addPurpose}
              onChange={(e) => setAddPurpose(e.target.value)}
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2",
                "text-sm text-foreground",
                "focus:outline-none focus:ring-1 focus:ring-ring",
              )}
            >
              {[
                "default", "billing", "remittance", "tax", "statements",
                "shipping", "receiving", "returns", "warehouse", "installation",
                "mailing", "legal", "regulatory", "notices", "home", "work",
                "emergency", "payroll", "hq", "office", "trading", "other",
              ].map((p) => (
                <option key={p} value={p}>{purposeLabel(p)}</option>
              ))}
            </select>
          </div>

          {/* Address detail fields via EntityForm */}
          <EntityForm
            ref={addressFormRef}
            entityCode="address"
            onSubmit={handleAddAddress}
            onChange={() => {}}
            submitting={addPending}
            hideActions
            noFrame
          />
        </div>
      </DrawerShell>

      {/* End-date confirmation dialog */}
      <AlertDialog
        open={endDateLinkId !== null}
        onOpenChange={(open) => { if (!open) setEndDateLinkId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End-date this address?</AlertDialogTitle>
            <AlertDialogDescription>
              The address link will be closed as of today. The address record is
              preserved — this only ends the validity window. The change cannot be
              undone without creating a new link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (endDateLinkId) endDateMutation.mutate(endDateLinkId);
              }}
            >
              End-date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
