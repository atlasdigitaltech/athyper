"use client";

/**
 * ReasonCodePicker — controlled-vocabulary dropdown for high-risk change
 * reasons (manual GL override, posting adjustment, restore-from-snapshot, …).
 *
 * Reads from `GET /api/runtime/v1/change-reason-codes?category=…`
 * (master.change_reason_code, Phase 3 DDL). Returns code strings to the
 * caller — the records-route resolver then maps code → UUID and writes
 * `log.audit_log.reason_code` as an FK.
 *
 * Caching: codes are tenant-scoped lookups that change rarely (system
 * seeds + occasional tenant additions). A module-level cache keyed by
 * category lives for the lifetime of the page; a fresh page load re-hits
 * the endpoint. No invalidation hook today — when tenants add custom
 * codes via the admin UI (future), the picker is one full-page refresh
 * away from seeing them.
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type {
  ChangeReasonCategory,
  ChangeReasonCodeSummary,
  ChangeReasonSeverity,
} from "@athyper/api-contracts/documents";

export interface ReasonCodePickerProps {
  /** Filters the lookup. Omit to fetch every active reason code. */
  category?: ChangeReasonCategory;
  /** Selected code (e.g. "manual_account_override"). */
  value: string | null;
  /** Fired on selection / clear. */
  onChange: (code: string | null, summary: ChangeReasonCodeSummary | null) => void;
  /** Optional label override (default: `Reason for change`). */
  label?: string;
  /** Optional placeholder when value is null (default: `Select a reason…`). */
  placeholder?: string;
  /** Optional required marker on the label (visual asterisk). */
  required?: boolean;
  disabled?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
}

// ── Module-level cache ────────────────────────────────────────────────────────

type CacheState =
  | { status: "loading"; promise: Promise<ChangeReasonCodeSummary[]> }
  | { status: "ready";   options: ChangeReasonCodeSummary[] }
  | { status: "error";   message: string };

const cache = new Map<string, CacheState>();

function cacheKey(category: ChangeReasonCategory | undefined): string {
  return category ?? "_all";
}

async function fetchReasonCodes(
  category: ChangeReasonCategory | undefined,
  signal: AbortSignal,
): Promise<ChangeReasonCodeSummary[]> {
  const res = await fetch(runtimePath.changeReasonCodes(category), {
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Reason codes API returned ${res.status}`);
  }
  const body = await res.json() as { data?: ChangeReasonCodeSummary[] };
  return Array.isArray(body.data) ? body.data : [];
}

function useReasonCodes(category: ChangeReasonCategory | undefined): {
  loading: boolean;
  error:   string | null;
  options: ChangeReasonCodeSummary[];
} {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [options, setOptions] = useState<ChangeReasonCodeSummary[]>([]);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const key   = cacheKey(category);
    const entry = cache.get(key);

    // Cache hit: ready
    if (entry && entry.status === "ready") {
      setLoading(false);
      setError(null);
      setOptions(entry.options);
      return;
    }
    // Cache hit: error
    if (entry && entry.status === "error") {
      setLoading(false);
      setError(entry.message);
      setOptions([]);
      return;
    }
    // Cache hit: in-flight — await
    if (entry && entry.status === "loading") {
      setLoading(true);
      entry.promise
        .then((opts) => {
          if (!mounted.current) return;
          setOptions(opts);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (!mounted.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
      return;
    }

    // Cache miss: fire fetch + record in-flight promise so concurrent mounts
    // (e.g. two AD drawers open in different lines) coalesce on one network
    // call instead of stampeding.
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setOptions([]);

    const promise = fetchReasonCodes(category, controller.signal);
    cache.set(key, { status: "loading", promise });

    promise
      .then((opts) => {
        cache.set(key, { status: "ready", options: opts });
        if (mounted.current) {
          setOptions(opts);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        cache.set(key, { status: "error", message });
        if (mounted.current) {
          setError(message);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [category]);

  return { loading, error, options };
}

// ── Severity chip ─────────────────────────────────────────────────────────────

function severityChipClasses(severity: ChangeReasonSeverity): string {
  switch (severity) {
    case "critical":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "elevated":
      return "border-warning/40 bg-warning/10 text-warning";
    case "normal":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

// ── Public component ─────────────────────────────────────────────────────────

export function ReasonCodePicker({
  category,
  value,
  onChange,
  label = "Reason for change",
  placeholder = "Select a reason…",
  required = false,
  disabled = false,
  className,
}: ReasonCodePickerProps) {
  const { loading, error, options } = useReasonCodes(category);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextCode = event.target.value || null;
      const summary = nextCode ? options.find((o) => o.code === nextCode) ?? null : null;
      onChange(nextCode, summary);
    },
    [onChange, options],
  );

  const selected = value ? options.find((o) => o.code === value) ?? null : null;

  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </span>
        {selected && (
          <span
            className={[
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              severityChipClasses(selected.severity),
            ].join(" ")}
            title={`Severity: ${selected.severity}`}
          >
            {selected.severity}
          </span>
        )}
      </div>
      <select
        value={value ?? ""}
        onChange={handleChange}
        disabled={disabled || loading || error !== null}
        className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {!value && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.id} value={opt.code} title={opt.description ?? undefined}>
            {opt.name}
          </option>
        ))}
      </select>
      {loading && (
        <span className="text-[11px] text-muted-foreground">Loading reasons…</span>
      )}
      {error && (
        <span className="text-[11px] text-destructive">Couldn't load reasons: {error}</span>
      )}
      {selected?.description && !loading && !error && (
        <span className="text-[11px] text-muted-foreground">{selected.description}</span>
      )}
    </div>
  );
}
