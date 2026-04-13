"use client";

/**
 * Platform Reference Data Hooks
 *
 * React Query hooks for shared.* ISO/code-list reference tables.
 * All hooks target the general-tier endpoints (any authenticated user).
 * staleTime = 1 hour — these are seeded reference tables that change rarely.
 *
 * Endpoints consumed (via Next.js relay → /api/platform/ref/*):
 *   GET /api/platform/ref/currencies
 *   GET /api/platform/ref/countries
 *   GET /api/platform/ref/state-regions
 *   GET /api/platform/ref/languages
 *   GET /api/platform/ref/locales
 *   GET /api/platform/ref/timezones
 *   GET /api/platform/ref/uom
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@athyper/api-contracts/query-keys";

// ─── Response types ───────────────────────────────────────────────────────────

export interface RefMeta {
  total:  number;
  page:   number;
  limit:  number;
  pages:  number;
}

export interface RefCurrency {
  id:           string;
  code:         string;
  name:         string;
  symbol:       string | null;
  minor_units:  number | null;
  numeric3:     string | null;
  status:       string;
}

export interface RefCountry {
  id:                   string;
  code:                 string;
  name:                 string;
  code3:                string | null;
  region:               string | null;
  subregion:            string | null;
  calling_code:         string | null;
  has_postal_codes:     boolean;
  postal_code_label:    string;
  postal_code_example:  string | null;
  region_label:         string;
  address_format:       string | null;
  status:               string;
}

export interface RefStateRegion {
  id:           string;
  code:         string;
  name:         string;
  country_code: string;
  category:     string | null;
  parent_code:  string | null;
  status:       string;
}

export interface RefLanguage {
  id:          string;
  code:        string;
  name:        string;
  native_name: string | null;
  iso639_2:    string | null;
  direction:   string;
  status:      string;
}

export interface RefLocale {
  id:            string;
  code:          string;
  name:          string;
  language_code: string;
  country_code:  string | null;
  script:        string | null;
  direction:     string | null;
  status:        string;
}

export interface RefTimezone {
  id:                  string;
  code:                string;
  name:                string | null;
  utc_offset_minutes:  number | null;
  is_alias:            boolean;
  canonical_code:      string | null;
  status:              string;
}

export interface RefUom {
  id:            string;
  code:          string;
  name:          string;
  symbol:        string | null;
  quantity_type: string | null;
  status:        string;
}

interface RefPage<T> {
  data: T[];
  meta: RefMeta;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchRef<T>(path: string, params: Record<string, string>): Promise<RefPage<T>> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "")),
  ).toString();
  const url = `/api/platform/ref/${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ref/${path} failed: ${res.status}`);
  return res.json() as Promise<RefPage<T>>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const STALE_1H = 60 * 60 * 1000;

// ── Currencies ────────────────────────────────────────────────────────────────

export interface UseRefCurrenciesOpts {
  search?: string;
  status?: string;
  active?: boolean;
  page?:   number;
  limit?:  number;
}

export function useRefCurrencies(opts: UseRefCurrenciesOpts = {}) {
  const { search = "", status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.currencies({ search, status, active, page, limit }),
    queryFn:  () => fetchRef<RefCurrency>("currencies", {
      search,
      ...(status !== undefined ? { status }            : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}

// ── Countries ─────────────────────────────────────────────────────────────────

export interface UseRefCountriesOpts {
  search?: string;
  status?: string;
  active?: boolean;
  page?:   number;
  limit?:  number;
}

export function useRefCountries(opts: UseRefCountriesOpts = {}) {
  const { search = "", status, active, page = 1, limit = 300 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.countries({ search, status, active, page, limit }),
    queryFn:  () => fetchRef<RefCountry>("countries", {
      search,
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}

// ── State / Regions ───────────────────────────────────────────────────────────

export interface UseRefStateRegionsOpts {
  search?: string;
  status?: string;
  active?: boolean;
  page?:   number;
  limit?:  number;
}

/**
 * Returns state/region subdivisions for a given ISO 3166-1 alpha-2 country code.
 * Disabled (returns empty) when countryCode is blank — safe for uninitialised pickers.
 */
export function useRefStateRegions(countryCode: string, opts: UseRefStateRegionsOpts = {}) {
  const { search = "", status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.stateRegions(countryCode, { search, status, active, page, limit }),
    queryFn:  () => fetchRef<RefStateRegion>("state-regions", {
      country: countryCode,
      search,
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    enabled:   !!countryCode,
    staleTime: STALE_1H,
  });
}

// ── Languages ─────────────────────────────────────────────────────────────────

export interface UseRefLanguagesOpts {
  search?: string;
  status?: string;
  active?: boolean;
  page?:   number;
  limit?:  number;
}

export function useRefLanguages(opts: UseRefLanguagesOpts = {}) {
  const { search = "", status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.languages({ search, status, active, page, limit }),
    queryFn:  () => fetchRef<RefLanguage>("languages", {
      search,
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}

// ── Locales ───────────────────────────────────────────────────────────────────

export interface UseRefLocalesOpts {
  search?:   string;
  language?: string;
  status?:   string;
  active?:   boolean;
  page?:     number;
  limit?:    number;
}

/**
 * BCP 47 locales. Optionally filtered by language code (ISO 639).
 * language, timezone, and country are usually configured together in
 * tenant/user profile flows.
 */
export function useRefLocales(opts: UseRefLocalesOpts = {}) {
  const { search = "", language = "", status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.locales({ search, language, status, active, page, limit }),
    queryFn:  () => fetchRef<RefLocale>("locales", {
      search,
      language,
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}

// ── Timezones ─────────────────────────────────────────────────────────────────

export interface UseRefTimezonesOpts {
  search?:        string;
  canonicalOnly?: boolean;
  status?:        string;
  active?:        boolean;
  page?:          number;
  limit?:         number;
}

/**
 * IANA timezones. canonicalOnly=true (default for pickers) filters out alias entries.
 */
export function useRefTimezones(opts: UseRefTimezonesOpts = {}) {
  const { search = "", canonicalOnly = true, status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.timezones({ search, canonicalOnly, status, active, page, limit }),
    queryFn:  () => fetchRef<RefTimezone>("timezones", {
      search,
      canonical_only: canonicalOnly ? "true" : "false",
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}

// ── UOM ───────────────────────────────────────────────────────────────────────

export interface UseRefUomOpts {
  search?:       string;
  quantityType?: string;
  status?:       string;
  active?:       boolean;
  page?:         number;
  limit?:        number;
}

export function useRefUom(opts: UseRefUomOpts = {}) {
  const { search = "", quantityType = "", status, active, page = 1, limit = 200 } = opts;
  return useQuery({
    queryKey: queryKeys.ref.uom({ search, quantityType, status, active, page, limit }),
    queryFn:  () => fetchRef<RefUom>("uom", {
      search,
      quantity_type: quantityType,
      ...(status !== undefined ? { status }                : {}),
      ...(active !== undefined ? { active: String(active) } : {}),
      page:  String(page),
      limit: String(limit),
    }),
    staleTime: STALE_1H,
  });
}
