"use client";

/**
 * ScopeChips — compact header chips showing operating context.
 *
 * Spec: Center-left header zone · Company code · Fiscal year · (Book — hidden by default)
 *
 * Co  → entity code from active org (e.g. "CC-100")
 * FY  → last-used fiscal year from FinanceContextBar (localStorage: finance_scope_v1),
 *       falling back to current calendar year
 *
 * These chips are intentionally lightweight read-only pills.
 * Clicking a chip is a future enhancement (scope selector dropdown).
 */

import { useEffect, useState } from "react";
import { useShellSession } from "@/components/providers/SessionProvider";

const FINANCE_SCOPE_KEY = "finance_scope_v1";

interface ChipProps {
  label: string;
  value: string;
}

function Chip({ label, value }: ChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-[10.5px] leading-none whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

export function ScopeChips() {
  const { bff } = useShellSession();
  const [fy, setFy] = useState<string>(() => String(new Date().getFullYear()));

  // After hydration: read last-used FY from FinanceContextBar's localStorage scope
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FINANCE_SCOPE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { fiscalYear?: number };
        if (parsed.fiscalYear && typeof parsed.fiscalYear === "number") {
          setFy(String(parsed.fiscalYear));
        }
      }
    } catch {
      // Keep default
    }
  }, []);

  const entityCode = bff.activeOrg?.split("--")[1] ?? null;
  if (!entityCode) return null;

  return (
    <div className="flex items-center gap-1">
      <Chip label="Co" value={entityCode} />
      <Chip label="FY" value={fy} />
    </div>
  );
}
