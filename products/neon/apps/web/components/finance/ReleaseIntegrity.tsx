"use client";

// components/finance/ReleaseIntegrity.tsx
//
// Displays release integrity verification results —
// individual check pass/fail with expected vs actual values.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { IntegrityCheckResult } from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReleaseIntegrityProps {
  result: IntegrityCheckResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReleaseIntegrity({ result }: ReleaseIntegrityProps) {
  const passCount = result.checks.filter((c) => c.passed).length;
  const failCount = result.checks.length - passCount;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {result.overallPass ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-600" />
          )}
          <h4 className="text-sm font-medium">
            Integrity Verification
          </h4>
          <Badge className={cn(
            "text-xs",
            result.overallPass
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700",
          )}>
            {result.overallPass ? "PASS" : "FAIL"}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {passCount}/{result.checks.length} passed
          {result.checkedAt && ` | ${new Date(result.checkedAt).toLocaleString()}`}
        </span>
      </div>

      {/* Check rows */}
      <div className="space-y-2">
        {result.checks.map((check, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-2 rounded-md text-sm",
              check.passed ? "bg-emerald-50" : "bg-red-50",
            )}
          >
            {check.passed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs">{check.checkName}</div>

              {!check.passed && (check.expected || check.actual) && (
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  {check.expected && (
                    <div>
                      <span className="text-muted-foreground">Expected: </span>
                      <code className="bg-white px-1 rounded">{check.expected}</code>
                    </div>
                  )}
                  {check.actual && (
                    <div>
                      <span className="text-muted-foreground">Actual: </span>
                      <code className="bg-white px-1 rounded">{check.actual}</code>
                    </div>
                  )}
                </div>
              )}

              {check.detail && (
                <p className="text-xs text-muted-foreground mt-1">{check.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      {failCount > 0 && (
        <div className="mt-3 pt-3 border-t text-xs text-red-600">
          {failCount} check{failCount !== 1 ? "s" : ""} failed.
          Release integrity is compromised — review and correct before proceeding.
        </div>
      )}
    </Card>
  );
}
