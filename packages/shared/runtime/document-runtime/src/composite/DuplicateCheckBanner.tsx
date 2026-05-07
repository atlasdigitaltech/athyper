"use client";

/**
 * DuplicateCheckBanner - debounced duplicate check for BP-first intake.
 *
 * The endpoint is configurable, but defaults to the Business Partner hard gate.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import { cn } from "@athyper/theme/utils";
import { ValidationBanner } from "../validation/ValidationBanner";
import type { DuplicateCheckResult, DuplicateMatch } from "./types";

export interface DuplicateCheckBannerProps {
  flatFields: Record<string, unknown>;
  identifiers?: Record<string, unknown>[];
  checkEndpoint?: string;
  entityLabel?: string;
  debounceMs?: number;
  timeoutMs?: number;
  onBlockerChange?: (hasBlocker: boolean) => void;
  onCheckingChange?: (isChecking: boolean) => void;
  reserveSpace?: boolean;
  className?: string;
}

export function DuplicateCheckBanner({
  flatFields,
  identifiers = [],
  checkEndpoint = "/api/relay/api/records/business_partner/check-duplicates",
  entityLabel = "business partners",
  debounceMs = 600,
  timeoutMs = 5000,
  onBlockerChange,
  onCheckingChange,
  reserveSpace = false,
  className,
}: DuplicateCheckBannerProps) {
  const [result, setResult] = useState<DuplicateCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkBody = useMemo(() => ({
    name: flatFields["name"] ?? "",
    legal_name: flatFields["legal_name"] ?? "",
    registration_no: flatFields["registration_no"] ?? "",
    registration_country_code: flatFields["registration_country_code"] ?? "",
    tax_number: flatFields["tax_number"] ?? "",
    identifiers: identifiers
      .map((id) => ({
        scheme: id["scheme"],
        value: id["value"],
      }))
      .filter((id) => id.scheme && id.value),
  }), [flatFields, identifiers]);

  const hasCheckSignal = Boolean(
    checkBody.name ||
    checkBody.legal_name ||
    checkBody.registration_no ||
    checkBody.tax_number ||
    checkBody.identifiers.length > 0,
  );

  const runCheck = useCallback(async () => {
    if (!hasCheckSignal) {
      abortRef.current?.abort();
      setResult(null);
      onBlockerChange?.(false);
      onCheckingChange?.(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    setLoading(true);
    onCheckingChange?.(true);
    try {
      const resp = await fetch(checkEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(checkBody),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json() as DuplicateCheckResult;
      setResult(data);
      const hasBlocker = data.blocking ?? data.notices.some((n) => n.level === "blocked");
      onBlockerChange?.(hasBlocker);
    } catch (err) {
      if ((err as Error).name === "AbortError" && didTimeout) {
        setResult(null);
        onBlockerChange?.(false);
      } else if ((err as Error).name !== "AbortError") {
        setResult(null);
        onBlockerChange?.(false);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        setLoading(false);
        onCheckingChange?.(false);
      }
    }
  }, [checkBody, checkEndpoint, hasCheckSignal, onBlockerChange, onCheckingChange, timeoutMs]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runCheck, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runCheck, debounceMs, hasCheckSignal, onCheckingChange]);

  useEffect(() => () => {
    abortRef.current?.abort();
    onCheckingChange?.(false);
  }, [onCheckingChange]);

  if (!result && !loading && !reserveSpace) return null;

  const notices = (result?.notices ?? [])
    .map((n) => ({
      code: n.code,
      level: n.level as "blocked" | "warning",
      message: n.message,
      action_hint: n.action_hint ?? null,
    }))
    .filter((n) => n.level === "blocked" || n.level === "warning");

  const blockerMatches = (result?.matches ?? []).filter((m) => m.severity === "blocker");
  const warningMatches = (result?.matches ?? []).filter((m) => m.severity === "warning");
  const infoMatches = (result?.matches ?? []).filter((m) => m.severity === "info");

  return (
    <div className={cn("space-y-3", reserveSpace && "min-h-[48px]", className)}>
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Duplicate check</p>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {!loading && result && result.notices.length === 0 && (
          <span className="text-xs font-medium text-success">No duplicates found</span>
        )}
      </div>

      {notices.length > 0 && (
        <ValidationBanner notices={notices} />
      )}

      {blockerMatches.length > 0 && (
        <MatchList title="Exact matches - resolve before submitting" matches={blockerMatches} intent="destructive" />
      )}
      {warningMatches.length > 0 && (
        <MatchList title={`Similar ${entityLabel} - review before submitting`} matches={warningMatches} intent="warning" />
      )}
      {infoMatches.length > 0 && (
        <MatchList title="Related records - for reference" matches={infoMatches} intent="neutral" />
      )}
    </div>
  );
}

function matchHref(m: DuplicateMatch): string {
  if (m.href) return m.href;
  if (m.business_partner_code) return `/app/business_partner/${encodeURIComponent(m.business_partner_code)}`;
  if (m.business_partner_id) return `/app/business_partner/${encodeURIComponent(m.business_partner_id)}`;
  if (m.supplier_id) return `/app/supplier/${encodeURIComponent(m.supplier_id)}`;
  if (m.customer_id) return `/app/customer/${encodeURIComponent(m.customer_id)}`;
  return "#";
}

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
      : intent === "warning" ? "border-warning/40 bg-warning/10"
        : "border-border bg-muted/30";

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", borderColor)}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {matches.map((m) => {
        const targetId = m.business_partner_id ?? m.supplier_id ?? m.customer_id ?? m.code;
        const roles = (m.role_codes ?? [])
          .filter((role) => role !== "business_partner")
          .join(", ");
        return (
          <div key={`${targetId}-${m.matched_field}`} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{m.name}</p>
              <p className="text-2xs text-muted-foreground">
                {m.code} - match on {m.matched_field}{roles ? ` - ${roles}` : ""}
              </p>
            </div>
            <a
              href={matchHref(m)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-2xs text-primary hover:underline"
            >
              View
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        );
      })}
    </div>
  );
}
