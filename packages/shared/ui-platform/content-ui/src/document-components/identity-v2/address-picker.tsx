/**
 * @athyper/content-ui — AddressPicker (Phase 4: generic, reused everywhere)
 *
 * ONE component drives every address selection across the procurement and
 * sales documents (PI, PO, GR, SES, PR, SI, SO). Configure with ownerWalk +
 * purposeChain — it loads candidates, surfaces a tiered dropdown, defaults to
 * the first match, and exposes a [Change] action.
 *
 * Backed by /api/master/addresses/candidates and /api/master/addresses/default.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { csrfFetch } from "@athyper/runtime-shared/client";
import { JurisdictionChip } from "./jurisdiction-chip";

const ADDRESS_CANDIDATE_CACHE_TTL_MS = 5 * 60_000;
const ADDRESS_DEFAULT_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const candidateCache = new Map<string, CacheEntry<AddressCandidate[]>>();
const candidateInflight = new Map<string, Promise<AddressCandidate[]>>();
const defaultCache = new Map<string, CacheEntry<AddressDefaultPick | null>>();
const defaultInflight = new Map<string, Promise<AddressDefaultPick | null>>();
const ADDRESS_PICKER_TELEMETRY_DEBUG_STORAGE_KEY = "athyper:address-picker-debug";
const addressPickerTelemetryCounters = new Map<string, number>();
const addressPickerTelemetryStartedAt = Date.now();
let addressPickerTelemetryUpdatedAt = addressPickerTelemetryStartedAt;

export interface AddressPickerTelemetrySnapshot {
  startedAt: number;
  updatedAt: number;
  counters: Record<string, number>;
}

declare global {
  interface Window {
    __athyperAddressPickerTelemetry?: () => AddressPickerTelemetrySnapshot;
    __athyperAddressPickerTelemetryCounters?: () => Record<string, number>;
    __athyperAddressPickerTelemetryEnabled?: boolean;
  }
}

exposeAddressPickerTelemetry();

export function incrementAddressPickerTelemetryCounter(name: string, delta = 1): void {
  addressPickerTelemetryCounters.set(name, (addressPickerTelemetryCounters.get(name) ?? 0) + delta);
  addressPickerTelemetryUpdatedAt = Date.now();
  exposeAddressPickerTelemetry();
}

export function readAddressPickerTelemetryCounters(): Record<string, number> {
  return Object.fromEntries(addressPickerTelemetryCounters.entries());
}

export function readAddressPickerTelemetrySnapshot(): AddressPickerTelemetrySnapshot {
  return {
    startedAt: addressPickerTelemetryStartedAt,
    updatedAt: addressPickerTelemetryUpdatedAt,
    counters: readAddressPickerTelemetryCounters(),
  };
}

export function resetAddressPickerTelemetryCounters(): void {
  addressPickerTelemetryCounters.clear();
  addressPickerTelemetryUpdatedAt = Date.now();
  exposeAddressPickerTelemetry();
}

function exposeAddressPickerTelemetry(): void {
  if (typeof window === "undefined") return;
  if (!isAddressPickerTelemetryEnabled()) {
    delete window.__athyperAddressPickerTelemetry;
    delete window.__athyperAddressPickerTelemetryCounters;
    return;
  }
  window.__athyperAddressPickerTelemetry = readAddressPickerTelemetrySnapshot;
  window.__athyperAddressPickerTelemetryCounters = readAddressPickerTelemetryCounters;
}

function isAddressPickerTelemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__athyperAddressPickerTelemetryEnabled === true) return true;
  try {
    const addressFlag = window.localStorage.getItem(ADDRESS_PICKER_TELEMETRY_DEBUG_STORAGE_KEY);
    const documentEditFlag = window.localStorage.getItem("athyper:document-edit-debug");
    const queryFlag = new URLSearchParams(window.location.search).get("addressPickerDebug");
    return isTruthyDebugFlag(addressFlag) || isTruthyDebugFlag(documentEditFlag) || isTruthyDebugFlag(queryFlag);
  } catch {
    return false;
  }
}

function isTruthyDebugFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on";
}

// ─── Public types ──────────────────────────────────────────────────────

export interface OwnerRef {
  ownerType: string;          // "company_code" | "site" | "supplier" | "customer" | "business_partner" | …
  ownerId:   string;
}

export interface AddressCandidate {
  address_id:           string;
  purpose:              string;
  is_primary:           boolean | null;
  code:                 string | null;
  name:                 string | null;
  line1:                string | null;
  city:                 string | null;
  region:               string | null;
  country_code:         string | null;
  formatted_address:    string | null;
  tax_jurisdiction_id:  string | null;
  jurisdiction_name:    string | null;
  jurisdiction_code:    string | null;
}

export interface AddressDefaultPick {
  address_id:           string;
  tax_jurisdiction_id:  string | null;
  owner_type:           string | null;
  owner_id:             string | null;
  purpose:              string | null;
}

export type ProvenanceBadge = "default" | "manual" | "locked";

export interface AddressPickerDataRequest {
  cacheKey: string;
  tenantId: string;
  ownerWalk: OwnerRef[];
  purposeChain: string[];
}

export interface AddressPickerDataProvider {
  loadCandidates: (request: AddressPickerDataRequest) => Promise<AddressCandidate[]>;
  resolveDefault: (request: AddressPickerDataRequest) => Promise<AddressDefaultPick | null>;
}

export interface AddressPickerProps {
  /** The role this picker represents (used for the title and the default-search). */
  label: string;
  /** Owner walk: tier 1 → tier N, first match wins. */
  ownerWalk: OwnerRef[];
  /** Purpose chain: most-specific to fallback (e.g. ["ship_to","default"]). */
  purposeChain: string[];
  /** Tenant id (header sent with API calls). */
  tenantId: string;
  /** Current value. NULL = "no pick yet"; component will auto-resolve default at mount. */
  selectedAddressId: string | null;
  /** Optional selected summary from edit/core or section data; avoids candidate fetch for closed/read-only display. */
  selectedAddressSummary?: AddressCandidate | null | undefined;
  /** Called when user picks or default resolves. jurisdictionId is the derived snapshot. */
  onChange: (addressId: string | null, jurisdictionId: string | null) => void;
  /** When true, picker is read-only (e.g. document submitted) — shows "locked" badge. */
  readOnly?: boolean;
  /** When true, manual override flag — shows "manual" badge. */
  manualOverride?: boolean;
  /** Legacy opt-in. Defaults should come from Meta Entity/service resolvers. */
  autoSelectDefault?: boolean;
  /** When true, allow expanding to tenant-wide tier 3 (drop-ship). Default: false. */
  allowFreeAddressFromTenant?: boolean;
  /** When true, show the "+ Add new address" affordance. Default: true. */
  allowAddNew?: boolean;
  /** Called when user clicks "Add new address" — opens an external dialog. */
  onAddNew?: () => void;
  /** Optional page-level data provider; falls back to the legacy endpoints when omitted. */
  addressDataProvider?: AddressPickerDataProvider | undefined;
  /**
   * Compatibility switch for old pages that relied on a closed picker fetching
   * candidates to hydrate the selected label. Meta-driven edit pages should
   * pass selectedAddressSummary and leave this disabled so mount/scroll never
   * fans out address candidate requests.
   */
  legacyMountFetch?: boolean;
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export function AddressPicker(props: AddressPickerProps) {
  const {
    label,
    ownerWalk,
    purposeChain,
    tenantId,
    selectedAddressId,
    selectedAddressSummary = null,
    onChange,
    readOnly = false,
    manualOverride = false,
    autoSelectDefault = false,
    allowAddNew = true,
    onAddNew,
    addressDataProvider,
    legacyMountFetch = true,
    className,
  } = props;

  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [resolved, setResolved] = useState<AddressCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [provenance, setProvenance] = useState<ProvenanceBadge>(manualOverride ? "manual" : "default");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const ownerWalkKey = useMemo(
    () => JSON.stringify(ownerWalk.map(o => ({ ownerType: o.ownerType, ownerId: o.ownerId }))),
    [ownerWalk],
  );
  const purposeChainKey = useMemo(
    () => JSON.stringify(purposeChain),
    [purposeChain],
  );
  const ownerWalkSnapshot = useMemo(
    () => JSON.parse(ownerWalkKey) as OwnerRef[],
    [ownerWalkKey],
  );
  const purposeChainSnapshot = useMemo(
    () => JSON.parse(purposeChainKey) as string[],
    [purposeChainKey],
  );
  const candidateKey = useMemo(
    () => `tenant:${tenantId}|owners:${ownerWalkKey}|purposes:${purposeChainKey}`,
    [tenantId, ownerWalkKey, purposeChainKey],
  );
  const shouldLoadCandidates =
    open
    || (legacyMountFetch && Boolean(selectedAddressId) && !addressDataProvider && !selectedAddressSummary);

  // ── Load candidates (tier by tier, merge) ─────────────────────────────
  const loadCandidates = useCallback(async () => {
    if (ownerWalkSnapshot.length === 0) return;
    setLoading(true);
    try {
      const loaded = addressDataProvider
        ? await addressDataProvider.loadCandidates({
            cacheKey: candidateKey,
            tenantId,
            ownerWalk: ownerWalkSnapshot,
            purposeChain: purposeChainSnapshot,
          })
        : await fetchAddressCandidates(candidateKey, ownerWalkSnapshot, purposeChainSnapshot);
      setCandidates(loaded);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [addressDataProvider, candidateKey, ownerWalkSnapshot, purposeChainSnapshot, tenantId]);

  // ── Resolve default (only when selectedAddressId is empty AND autoSelectDefault) ──
  const resolveDefault = useCallback(async () => {
    if (!autoSelectDefault) return;
    if (readOnly) return;
    if (ownerWalkSnapshot.length === 0) return;
    try {
      const hit = addressDataProvider
        ? await addressDataProvider.resolveDefault({
            cacheKey: candidateKey,
            tenantId,
            ownerWalk: ownerWalkSnapshot,
            purposeChain: purposeChainSnapshot,
          })
        : await fetchAddressDefault(candidateKey, ownerWalkSnapshot, purposeChainSnapshot);
      if (hit?.address_id) {
        setProvenance("default");
        onChange(hit.address_id, hit.tax_jurisdiction_id);
      }
    } catch { /* swallow — empty default is fine */ }
  }, [addressDataProvider, candidateKey, ownerWalkSnapshot, purposeChainSnapshot, autoSelectDefault, onChange, readOnly, tenantId]);

  // ── Mount + ownerWalk change effects ─────────────────────────────────
  useEffect(() => {
    if (!shouldLoadCandidates) return;
    void loadCandidates();
  }, [candidateKey, shouldLoadCandidates, loadCandidates]);

  useEffect(() => {
    if (!selectedAddressId && autoSelectDefault && ownerWalkSnapshot.length > 0) {
      void resolveDefault();
    }
  }, [candidateKey, selectedAddressId, autoSelectDefault, resolveDefault, ownerWalkSnapshot.length]);

  // ── Update resolved view when candidates / selection change ──────────
  useEffect(() => {
    if (!selectedAddressId) { setResolved(null); return; }
    const found = candidates.find(c => c.address_id === selectedAddressId);
    if (found) {
      setResolved(found);
      return;
    }
    if (selectedAddressSummary?.address_id === selectedAddressId) {
      setResolved(selectedAddressSummary);
      return;
    }
    setResolved(null);
  }, [candidates, selectedAddressId, selectedAddressSummary]);

  // ── Close dropdown on outside click ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // ── Render ────────────────────────────────────────────────────────────

  const badgeLabel: Record<ProvenanceBadge, string> = {
    default: "DEFAULT",
    manual:  "MANUAL",
    locked:  "LOCKED",
  };
  const badgeClass: Record<ProvenanceBadge, string> = {
    default: "bg-slate-100 text-slate-600 ring-slate-200",
    manual:  "bg-amber-100 text-amber-700 ring-amber-200",
    locked:  "bg-rose-100 text-rose-700 ring-rose-200",
  };
  const effectiveProvenance: ProvenanceBadge = readOnly ? "locked" : (manualOverride ? "manual" : "default");

  return (
    <div
      ref={containerRef}
      data-testid={`address-picker-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "relative rounded border border-slate-200 bg-white p-3 flex flex-col gap-2 min-h-[140px]",
        readOnly && "bg-slate-50",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">{label}</h4>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset",
            badgeClass[effectiveProvenance],
          )}
        >
          {badgeLabel[effectiveProvenance]}
        </span>
      </div>

      {/* Resolved address display */}
      <div className="flex-1 min-h-[60px] flex flex-col gap-1">
        {!resolved ? (
          <div className="text-xs text-slate-400 italic">
            {loading ? "Loading…" : "Pick a value"}
          </div>
        ) : (
          <>
            {resolved.name && (
              <div className="text-xs font-medium text-slate-700 truncate">{resolved.name}</div>
            )}
            <div className="text-xs text-slate-800 leading-snug">
              {resolved.line1 ?? "—"}
              {resolved.city && <span className="text-slate-500"> · {resolved.city}</span>}
              {resolved.region && <span className="text-slate-500">, {resolved.region}</span>}
              {resolved.country_code && <span className="text-slate-500"> {resolved.country_code}</span>}
            </div>
            <div className="mt-1">
              <JurisdictionChip
                code={resolved.jurisdiction_code}
                name={resolved.jurisdiction_name}
                unresolved={!resolved.tax_jurisdiction_id}
              />
            </div>
          </>
        )}
      </div>

      {/* Action row */}
      {!readOnly && (
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          >
            Change…
          </button>
          {allowAddNew && onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900"
            >
              + Add new
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && !readOnly && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-72 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
          {candidates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 italic">No candidates found</div>
          ) : (
            <ul className="py-1">
              {candidates.map(c => (
                <li key={c.address_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProvenance("manual");
                      onChange(c.address_id, c.tax_jurisdiction_id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2 border-b border-slate-50 last:border-b-0",
                      c.address_id === selectedAddressId && "bg-sky-50",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">
                        {c.name ?? c.line1 ?? "(no name)"}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.line1 && <span>{c.line1}</span>}
                        {c.city && <span> · {c.city}</span>}
                        {c.country_code && <span> · {c.country_code}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] uppercase tracking-wide text-slate-400">
                          {c.purpose}
                        </span>
                        {c.is_primary && (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1">
                            PRIMARY
                          </span>
                        )}
                        <JurisdictionChip
                          code={c.jurisdiction_code}
                          name={c.jurisdiction_name}
                          unresolved={!c.tax_jurisdiction_id}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

async function fetchAddressCandidates(
  cacheKey: string,
  ownerWalk: OwnerRef[],
  purposeChain: string[],
): Promise<AddressCandidate[]> {
  const cached = candidateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    incrementAddressPickerTelemetryCounter("legacy.address.candidates.cache_hit");
    return cached.value;
  }

  const inflight = candidateInflight.get(cacheKey);
  if (inflight) {
    incrementAddressPickerTelemetryCounter("legacy.address.candidates.inflight_dedupe_hit");
    return inflight;
  }

  const request = (async () => {
    incrementAddressPickerTelemetryCounter("legacy.address.candidates.network_fetch");
    const all: AddressCandidate[] = [];
    const purposesCsv = purposeChain.join(",");
    for (const owner of ownerWalk) {
      const r = await fetch(
        `/api/relay/master/addresses/candidates`
          + `?owner_type=${encodeURIComponent(owner.ownerType)}`
          + `&owner_id=${encodeURIComponent(owner.ownerId)}`
          + `&purposes=${encodeURIComponent(purposesCsv)}`,
        { credentials: "include" },
      );
      if (!r.ok) continue;
      const json = await r.json() as { data: AddressCandidate[] };
      all.push(...(json.data ?? []));
    }

    const seen = new Set<string>();
    const unique = all.filter(a => {
      if (seen.has(a.address_id)) return false;
      seen.add(a.address_id);
      return true;
    });
    candidateCache.set(cacheKey, {
      expiresAt: Date.now() + ADDRESS_CANDIDATE_CACHE_TTL_MS,
      value: unique,
    });
    return unique;
  })();

  candidateInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    candidateInflight.delete(cacheKey);
  }
}

async function fetchAddressDefault(
  cacheKey: string,
  ownerWalk: OwnerRef[],
  purposeChain: string[],
): Promise<AddressDefaultPick | null> {
  const cached = defaultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    incrementAddressPickerTelemetryCounter("legacy.address.default.cache_hit");
    return cached.value;
  }

  const inflight = defaultInflight.get(cacheKey);
  if (inflight) {
    incrementAddressPickerTelemetryCounter("legacy.address.default.inflight_dedupe_hit");
    return inflight;
  }

  const request = (async () => {
    incrementAddressPickerTelemetryCounter("legacy.address.default.network_fetch");
    const r = await csrfFetch(`/api/relay/master/addresses/default`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        owner_walk: ownerWalk.map(o => ({ owner_type: o.ownerType, owner_id: o.ownerId })),
        purposes: purposeChain,
      }),
    });
    if (!r.ok) return null;
    const json = await r.json() as { data: AddressDefaultPick | null };
    const hit = json.data ?? null;
    defaultCache.set(cacheKey, {
      expiresAt: Date.now() + ADDRESS_DEFAULT_CACHE_TTL_MS,
      value: hit,
    });
    return hit;
  })();

  defaultInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    defaultInflight.delete(cacheKey);
  }
}
