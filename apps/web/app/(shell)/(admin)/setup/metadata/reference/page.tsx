"use client";

/**
 * Reference Data Browser — /setup/metadata/reference
 *
 * Read-only browser for Tier 1 reference tables and Tier 2 crosswalks.
 * Import buttons require PLATFORM.REFERENCE.IMPORT / PLATFORM.TAXONOMY.IMPORT
 * and PLATFORM_CATALOG_WRITABLE=true on the server side.
 * The UI shows the button always; the backend returns 403/CATALOG_LOCKED if
 * either gate is closed.
 */

import { useState } from "react";
import {
  Globe, Upload, CheckCircle2, Loader2,
  ChevronLeft, ChevronRight, ArrowLeftRight,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import {
  SearchInput, StatusPill, EmptyState, LoadingRows,
  relayFetch, useRelayQuery, CodeBadge,
} from "../../_components/admin-ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ─── Shared types ────────────────────────────────────────────────────────────

interface RefPage<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

interface Country     { id: string; code: string; code3: string; numeric3: string | null; name: string; calling_code: string | null; status: string; }
interface Currency    { id: string; code: string; name: string; symbol: string | null; decimals: number; status: string; }
interface Language    { id: string; code: string; name: string; native_name: string | null; status: string; }
interface Locale      { id: string; code: string; name: string; language_code: string; country_code: string | null; status: string; }
interface Timezone    { id: string; code: string; name: string | null; utc_offset_minutes: number | null; is_alias: boolean; canonical_code: string | null; status: string; }
interface Uom         { id: string; code: string; name: string; quantity_type: string | null; symbol: string | null; status: string; }
interface StateRegion { id: string; code: string; name: string; country_code: string; status: string; }
interface Crosswalk   { id: string; source_domain_code: string; source_code: string; target_domain_code: string; target_code: string; confidence: number | null; notes: string | null; }

// ─── DataTable ────────────────────────────────────────────────────────────────

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b last:border-0 hover:bg-muted/20">{children}</tr>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2 ${mono ? "font-mono text-primary text-2xs" : ""}`}>{children ?? "—"}</td>;
}

// ─── Pager ───────────────────────────────────────────────────────────────────

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
      <span>{total.toLocaleString()} rows</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-3.5" />
        </Button>
        <span>Page {page} / {totalPages}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── ImportDialog ─────────────────────────────────────────────────────────────

type ImportStep = "select" | "preview" | "done";

interface PreviewResult {
  preview: true;
  rows: number;
  valid: Record<string, unknown>[];
  invalid: Array<{ row: number; errors: string[] }>;
}
interface ImportResult { inserted: number; updated: number; skipped: number; invalid: number; }

function ImportDialog({
  open, onOpenChange, endpoint, label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  endpoint: string;
  label: string;
}) {
  const [step, setStep]       = useState<ImportStep>("select");
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult]   = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function reset() {
    setStep("select"); setFile(null); setPreview(null);
    setResult(null); setLoading(false); setError(null);
  }

  async function doPreview() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/relay${endpoint}?preview=true`, { method: "POST", body: fd });
      const body = await res.json() as PreviewResult | { error?: string; hint?: string };
      if (!res.ok) {
        const b = body as { error?: string; hint?: string };
        setError(b.hint ?? b.error ?? `HTTP ${res.status}`);
        return;
      }
      setPreview(body as PreviewResult); setStep("preview");
    } catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setLoading(false); }
  }

  async function doImport() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/relay${endpoint}`, { method: "POST", body: fd });
      const body = await res.json() as ImportResult | { error?: string; hint?: string };
      if (!res.ok) {
        const b = body as { error?: string; hint?: string };
        setError(b.hint ?? b.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(body as ImportResult); setStep("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import {label} — CSV</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with correct column headers. The server validates each row before committing.
              Duplicate rows are upserted; invalid rows are rejected without blocking valid ones.
            </p>
            <div>
              <Label htmlFor="import-file" className="text-xs mb-1.5 block">CSV file</Label>
              <Input id="import-file" type="file" accept=".csv,text/csv" className="text-xs"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
            </div>
            {error && <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/5 px-3 py-2">{error}</p>}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded border p-2">
                <p className="text-base font-semibold">{preview.rows}</p>
                <p className="text-xs text-muted-foreground">Rows parsed</p>
              </div>
              <div className="rounded border border-green-200 bg-green-50/50 p-2">
                <p className="text-base font-semibold text-green-700">{preview.valid.length}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className={`rounded border p-2 ${preview.invalid.length ? "border-destructive/30 bg-destructive/5" : ""}`}>
                <p className={`text-base font-semibold ${preview.invalid.length ? "text-destructive" : ""}`}>{preview.invalid.length}</p>
                <p className="text-xs text-muted-foreground">Invalid</p>
              </div>
            </div>
            {preview.invalid.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded border bg-muted/30 p-2 space-y-0.5 text-xs">
                {preview.invalid.slice(0, 15).map((inv) => (
                  <p key={inv.row} className="text-destructive">Row {inv.row}: {inv.errors.join("; ")}</p>
                ))}
                {preview.invalid.length > 15 && (
                  <p className="text-muted-foreground">…and {preview.invalid.length - 15} more</p>
                )}
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-green-500" />
            <p className="font-medium">Import complete</p>
            <div className="flex justify-center gap-5 text-sm">
              <span className="text-green-600 font-medium">{result.inserted} inserted</span>
              <span className="text-blue-600 font-medium">{result.updated} updated</span>
              <span className="text-muted-foreground">{result.skipped} skipped</span>
              {result.invalid > 0 && <span className="text-destructive font-medium">{result.invalid} invalid</span>}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "select" && (
            <>
              <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button onClick={() => void doPreview()} disabled={!file || loading}>
                {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}Preview
              </Button>
            </>
          )}
          {step === "preview" && preview && (
            <>
              <Button variant="ghost" onClick={() => { setStep("select"); setPreview(null); }}>Back</Button>
              <Button onClick={() => void doImport()} disabled={loading || preview.valid.length === 0}>
                {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                Import {preview.valid.length} rows
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  search, onSearch, placeholder, importEndpoint, importLabel, extra,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  importEndpoint: string;
  importLabel: string;
  extra?: React.ReactNode;
}) {
  const [importing, setImporting] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {extra}
        <SearchInput value={search} onChange={onSearch} placeholder={placeholder} className="max-w-xs" />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
          <Upload className="mr-1.5 size-3.5" />Import CSV
        </Button>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} endpoint={importEndpoint} label={importLabel} />
    </>
  );
}

// ─── Countries tab ────────────────────────────────────────────────────────────

function CountriesTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Country>>(["ref","countries",search,page], `/platform/ref/countries?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search countries…"
        importEndpoint="/platform/ref/country/import" importLabel="Countries" />
      {isLoading ? <LoadingRows rows={6} cols={6} /> : (
        <DataTable headers={["Code","ISO-3","Numeric","Name","Calling Code","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td mono>{r.code3}</Td><Td mono>{r.numeric3}</Td>
              <Td>{r.name}</Td><Td>{r.calling_code}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── Currencies tab ───────────────────────────────────────────────────────────

function CurrenciesTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Currency>>(["ref","currencies",search,page], `/platform/ref/currencies?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search currencies…"
        importEndpoint="/platform/ref/currency/import" importLabel="Currencies" />
      {isLoading ? <LoadingRows rows={6} cols={5} /> : (
        <DataTable headers={["Code","Name","Symbol","Decimals","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td>
              <Td mono>{r.symbol}</Td><Td>{r.decimals}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── Languages tab ────────────────────────────────────────────────────────────

function LanguagesTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Language>>(["ref","languages",search,page], `/platform/ref/languages?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search languages…"
        importEndpoint="/platform/ref/language/import" importLabel="Languages" />
      {isLoading ? <LoadingRows rows={6} cols={4} /> : (
        <DataTable headers={["Code","Name","Native Name","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td><Td>{r.native_name}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── Locales tab ──────────────────────────────────────────────────────────────

function LocalesTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Locale>>(["ref","locales",search,page], `/platform/ref/locales?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search locales…"
        importEndpoint="/platform/ref/locale/import" importLabel="Locales" />
      {isLoading ? <LoadingRows rows={6} cols={5} /> : (
        <DataTable headers={["Code","Name","Language","Country","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td>
              <Td mono>{r.language_code}</Td><Td mono>{r.country_code}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── Timezones tab ────────────────────────────────────────────────────────────

function offsetLabel(mins: number | null) {
  if (mins == null) return "—";
  const sign  = mins >= 0 ? "+" : "-";
  const abs   = Math.abs(mins);
  const h     = String(Math.floor(abs / 60)).padStart(2, "0");
  const m     = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

function TimezonesTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Timezone>>(["ref","timezones",search,page], `/platform/ref/timezones?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search timezones…"
        importEndpoint="/platform/ref/timezone/import" importLabel="Timezones" />
      {isLoading ? <LoadingRows rows={6} cols={5} /> : (
        <DataTable headers={["Code","Name","Offset","Alias Of","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td>
              <Td mono>{offsetLabel(r.utc_offset_minutes)}</Td>
              <Td mono>{r.is_alias ? (r.canonical_code ?? "—") : "—"}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── UoM tab ─────────────────────────────────────────────────────────────────

function UomTab() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  const { data, isLoading } = useRelayQuery<RefPage<Uom>>(["ref","uom",search,page], `/platform/ref/uom?${q}`);
  return (
    <div className="space-y-3">
      <Toolbar search={search} onSearch={(v)=>{ setSearch(v); setPage(1); }} placeholder="Search units of measure…"
        importEndpoint="/platform/ref/uom/import" importLabel="Units of Measure" />
      {isLoading ? <LoadingRows rows={6} cols={5} /> : (
        <DataTable headers={["Code","Name","Quantity Type","Symbol","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td>
              <Td>{r.quantity_type}</Td><Td mono>{r.symbol}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}
    </div>
  );
}

// ─── State/Regions tab ────────────────────────────────────────────────────────

function StateRegionsTab() {
  const [search, setSearch]         = useState("");
  const [page, setPage]             = useState(1);
  const [countryCode, setCountryCode] = useState("");
  const [importing, setImporting]   = useState(false);

  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);
  if (countryCode) q.set("country", countryCode);

  const { data: countries } = useRelayQuery<RefPage<Country>>(
    ["ref", "countries", "all"],
    "/platform/ref/countries?pageSize=300&status=active",
  );

  const { data, isLoading } = useRelayQuery<RefPage<StateRegion>>(
    ["ref", "state-regions", countryCode, search, page],
    `/platform/ref/state-regions?${q}`,
    { enabled: !!countryCode },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={countryCode} onValueChange={(v) => { setCountryCode(v); setPage(1); }}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue placeholder="Select country…" />
          </SelectTrigger>
          <SelectContent>
            {(countries?.data ?? []).map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-xs">
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search regions…" className="max-w-xs" />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
          <Upload className="mr-1.5 size-3.5" />Import CSV
        </Button>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} endpoint="/platform/ref/state_region/import" label="State / Regions" />

      {!countryCode ? (
        <EmptyState
          icon={<Globe className="size-8 text-muted-foreground/30" />}
          title="Select a country"
          description="Choose a country above to browse its states and regions."
        />
      ) : isLoading ? (
        <LoadingRows rows={6} cols={4} />
      ) : (
        <DataTable headers={["Code","Name","Country","Status"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.code}</Td><Td>{r.name}</Td>
              <Td mono>{r.country_code}</Td>
              <Td><StatusPill value={r.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && countryCode && (
        <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />
      )}
    </div>
  );
}

// ─── Crosswalks tab ───────────────────────────────────────────────────────────

function CrosswalksTab() {
  const [family, setFamily] = useState<"commodity" | "industry">("commodity");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [importing, setImporting] = useState(false);

  const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) q.set("search", search);

  const { data, isLoading } = useRelayQuery<RefPage<Crosswalk>>(
    ["ref", "crosswalks", family, search, page],
    `/platform/taxonomy/${family}/crosswalks/browse?${q}`,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden">
          {(["commodity", "industry"] as const).map((f) => (
            <button key={f} onClick={() => { setFamily(f); setPage(1); setSearch(""); }}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors
                ${family === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {f}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder={`Search ${family} crosswalks…`} className="max-w-xs" />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
          <Upload className="mr-1.5 size-3.5" />Import CSV
        </Button>
      </div>

      {isLoading ? <LoadingRows rows={6} cols={5} /> : (
        <DataTable headers={["Source Domain","Source Code","→ Target Domain","Target Code","Confidence"]}>
          {(data?.data ?? []).map((r) => (
            <Tr key={r.id}>
              <Td mono>{r.source_domain_code}</Td>
              <Td mono>{r.source_code}</Td>
              <Td mono>{r.target_domain_code}</Td>
              <Td mono>{r.target_code}</Td>
              <Td>{r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : "—"}</Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {data?.meta && <Pager page={data.meta.page} total={data.meta.total} pageSize={data.meta.pageSize} onPage={setPage} />}

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        endpoint={`/platform/taxonomy/${family}/crosswalks/import`}
        label={`${family.charAt(0).toUpperCase() + family.slice(1)} Crosswalks`}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReferencePage() {
  return (
    <PageFrame
      title="Reference Data"
      description="Platform reference tables — countries, currencies, units of measure, taxonomy crosswalks. Read-only browser; import requires PLATFORM.REFERENCE.IMPORT permission."
      width="full"
    >
      <Tabs defaultValue="countries">
        <TabsList className="flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="countries">Countries</TabsTrigger>
          <TabsTrigger value="currencies">Currencies</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="locales">Locales</TabsTrigger>
          <TabsTrigger value="timezones">Timezones</TabsTrigger>
          <TabsTrigger value="uom">Units of Measure</TabsTrigger>
          <TabsTrigger value="regions">State / Regions</TabsTrigger>
          <TabsTrigger value="crosswalks">
            <ArrowLeftRight className="mr-1.5 size-3.5" />Crosswalks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="countries"  className="mt-0"><CountriesTab /></TabsContent>
        <TabsContent value="currencies" className="mt-0"><CurrenciesTab /></TabsContent>
        <TabsContent value="languages"  className="mt-0"><LanguagesTab /></TabsContent>
        <TabsContent value="locales"    className="mt-0"><LocalesTab /></TabsContent>
        <TabsContent value="timezones"  className="mt-0"><TimezonesTab /></TabsContent>
        <TabsContent value="uom"        className="mt-0"><UomTab /></TabsContent>
        <TabsContent value="regions"    className="mt-0"><StateRegionsTab /></TabsContent>
        <TabsContent value="crosswalks" className="mt-0"><CrosswalksTab /></TabsContent>
      </Tabs>
    </PageFrame>
  );
}
