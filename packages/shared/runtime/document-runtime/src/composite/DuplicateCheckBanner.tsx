"use client";

/**
 * DuplicateCheckBanner — pre-submit duplicate check for composite intake.
 *
 * Calls POST /api/relay/api/records/supplier/check-duplicates on debounced
 * changes to key identity fields and renders results using ValidationBanner.
 *
 * Three severity tiers:
 *   exact_match  → blocked (red) — must resolve before submit
 *   strong_match → warning (amber) — visible but not blocking
 *   weak_match   → info — informational only
 *
 * Generic — entityCode and the check endpoint are configurable.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { ValidationBanner } from "../validation/ValidationBanner";
import type { DuplicateCheckResult, DuplicateMatch } from "./types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DuplicateCheckBannerProps {
  /** Flat fields to run the check against. Watches for changes. */
  flatFields: Record<string, unknown>;
  /** Identifiers array from child rows (for exact identifier match). */
  identifiers?: Record<string, unknown>[];
  /** Check endpoint (default: /api/relay/api/records/supplier/check-duplicates). */
  checkEndpoint?: string;
  /** Debounce delay in ms (default 600). */
  debounceMs?: number;
  /** Called with true when blockers exist (parent can gate the submit button). */
  onBlockerChange?: (hasBlocker: boolean) => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DuplicateCheckBanner({
  flatFields,
  identifiers = [],
  checkEndpoint = "/api/relay/api/records/supplier/check-duplicates",
  debounceMs = 600,
  onBlockerChange,
  className,
}: DuplicateCheckBannerProps) {
  const [result, setResult]   = useState<DuplicateCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runCheck = useCallback(async () => {
    const body = {
      name:                      flatFields["name"]                      ?? "",
      legal_name:                flatFields["legal_name"]                ?? "",
      registration_no:           flatFields["registration_no"]           ?? "",
      registration_country_code: flatFields["registration_country_code"] ?? "",
      tax_number:                flatFields["tax_number"]                ?? "",
      identifiers: identifiers.map(id => ({
        scheme: id["scheme"],
        value:  id["value"],
      })).filter(id => id.scheme && id.value),
    };

    // Skip if nothing to check
    if (!body.name && !body.legal_name && !body.registration_no) {
      setResult(null);
      onBlockerChange?.(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const resp = await fetch(checkEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json() as DuplicateCheckResult;
      setResult(data);
      const hasBlocker = data.notices.some(n => n.level === "blocked");
      onBlockerChange?.(hasBlocker);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResult(null);
        onBlockerChange?.(false);
      }
    } finally {
      setLoading(false);
    }
  }, [flatFields, identifiers, checkEndpoint, onBlockerChange]);

  // Debounce on field changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runCheck, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runCheck, debounceMs]);

  if (!result && !loading) return null;

  const notices = (result?.notices ?? []).map(n => ({
    code: n.code,
    level: n.level as "blocked" | "warning",
    message: n.message,
    action_hint: n.action_hint ?? null,
  })).filter(n => n.level === "blocked" || n.level === "warning");

  const blockerMatches   = (result?.matches ?? []).filter(m => m.severity === "blocker");
  const warningMatches   = (result?.matches ?? []).filter(m => m.severity === "warning");
  const infoMatches      = (result?.matches ?? []).filter(m => m.severity === "info");

  return (
    <div className={cn("space-y-3", className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Duplicate check</p>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {!loading && result && result.notices.length === 0 && (
          <span className="text-xs text-emerald-600 font-medium">No duplicates found</span>
        )}
      </div>

      {/* Blocked + warning notices */}
      {notices.length > 0 && (
        <ValidationBanner notices={notices} />
      )}

      {/* Match detail cards */}
      {blockerMatches.length > 0 && (
        <MatchList title="Exact matches — resolve before submitting" matches={blockerMatches} intent="destructive" />
      )}
      {warningMatches.length > 0 && (
        <MatchList title="Similar suppliers — review before submitting" matches={warningMatches} intent="warning" />
      )}
      {infoMatches.length > 0 && (
        <MatchList title="Related records — for reference" matches={infoMatches} intent="neutral" />
      )}
    </div>
  );
}

// ── Match list ────────────────────────────────────────────────────────────────

function MatchList({
  title,
  matches,
  intent,
}: {
  title: string;
  matches: DuplicateMatch[];
  intent: "destructive" | "warning" | "neutral";
}) {
  const borderColor =
    intent === "destructive" ? "border-destructive/40 bg-destructive/5"
    : intent === "warning"   ? "border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20"
    : "border-border bg-muted/30";

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", borderColor)}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {matches.map(m => (
        <div key={`${m.supplier_id}-${m.matched_field}`} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
            <p className="text-2xs text-muted-foreground">{m.code} · match on {m.matched_field}</p>
          </div>
          <a
            href={`/app/supplier/${m.supplier_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-2xs text-primary hover:underline"
          >
            View
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ))}
    </div>
  );
}
