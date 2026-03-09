"use client";

// components/finance/ReleasePreflightDialog.tsx
//
// Preflight confirmation dialog for destructive release actions.
// Shows impact summary before the user confirms supersede, cancel,
// release (with exceptions), or recall.

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
} from "@neon/ui";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Send,
  Trash2,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { PreflightSummary, ReleaseCommandResult } from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReleasePreflightDialogProps {
  preflight: PreflightSummary;
  action: "release" | "supersede" | "cancel";
  onConfirm: () => Promise<ReleaseCommandResult | null>;
  onCancel: () => void;
  executing?: boolean;
  // Extra inputs for supersede
  supersessionReason?: string;
  onSupersessionReasonChange?: (reason: string) => void;
}

const ACTION_CONFIG = {
  release: {
    title: "Confirm Release",
    icon: Send,
    confirmLabel: "Release Pack",
    confirmVariant: "default" as const,
    description: "This will finalize the release and make it available to recipients.",
  },
  supersede: {
    title: "Confirm Supersession",
    icon: RefreshCw,
    confirmLabel: "Supersede Release",
    confirmVariant: "outline" as const,
    description: "This will mark the current release as SUPERSEDED and create a new correction release.",
  },
  cancel: {
    title: "Confirm Cancellation",
    icon: Trash2,
    confirmLabel: "Cancel Release",
    confirmVariant: "outline" as const,
    description: "This will permanently cancel the release. This action cannot be undone.",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReleasePreflightDialog({
  preflight: pf,
  action,
  onConfirm,
  onCancel,
  executing = false,
  supersessionReason,
  onSupersessionReasonChange,
}: ReleasePreflightDialogProps) {
  const [result, setResult] = useState<ReleaseCommandResult | null>(null);
  const cfg = ACTION_CONFIG[action];
  const ActionIcon = cfg.icon;

  const hasWarnings = pf.warnings.length > 0;
  const isHighImpact = pf.impactedDistributions > 0 || pf.impactedCertifications > 0;

  const handleConfirm = async () => {
    const r = await onConfirm();
    setResult(r);
  };

  // Show result after execution
  if (result) {
    return (
      <Card className={cn(
        "p-5 border-2",
        result.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
      )}>
        <div className="flex items-center gap-2 mb-2">
          {result.ok ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <h3 className="font-medium text-sm">{result.ok ? "Success" : "Failed"}</h3>
        </div>
        <p className="text-sm mb-3">{result.message}</p>

        {result.blockers.length > 0 && (
          <div className="space-y-1 mb-3">
            {result.blockers.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-700">
                <XCircle className="h-3 w-3 shrink-0" />
                <span>{b.message}</span>
              </div>
            ))}
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="space-y-1 mb-3">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        <Button size="sm" variant="outline" onClick={onCancel}>
          Close
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-2 border-slate-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <ActionIcon className="h-5 w-5 text-slate-700" />
        <h3 className="font-medium">{cfg.title}</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">{cfg.description}</p>

      {/* Release identity */}
      <div className="bg-slate-50 rounded-md p-3 mb-4 text-sm">
        <div className="font-medium">{pf.releaseName}</div>
        <div className="text-xs text-muted-foreground">{pf.releaseCode} &middot; {pf.status}</div>
      </div>

      {/* Impact summary */}
      <div className="space-y-2 mb-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Impact Summary</h4>

        <ImpactRow
          label="Certifications affected"
          value={pf.impactedCertifications}
          highlight={pf.impactedCertifications > 0}
        />
        <ImpactRow
          label="Distributions affected"
          value={`${pf.impactedDistributions} (${pf.distributionRecipientCount} recipients)`}
          highlight={pf.impactedDistributions > 0}
        />
        <ImpactRow
          label="Close overrides"
          value={pf.overrideCount > 0
            ? `${pf.overrideCount} ($${parseFloat(pf.overrideImpactTotal ?? "0").toLocaleString()})`
            : "None"}
          highlight={pf.overrideCount > 0}
        />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Governance posture</span>
          <span className="ml-auto flex items-center gap-1">
            {pf.isCleanClose ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700 text-xs font-medium">Clean Close</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-amber-700 text-xs font-medium">Non-Clean</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Integrity</span>
          <span className="ml-auto text-xs">
            {pf.integrityPassed === true ? (
              <Badge className="bg-emerald-100 text-emerald-700">PASS</Badge>
            ) : pf.integrityPassed === false ? (
              <Badge className="bg-red-100 text-red-700">FAIL</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500">Not checked</Badge>
            )}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 space-y-1">
          {pf.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Supersession reason input */}
      {action === "supersede" && onSupersessionReasonChange && (
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Supersession reason (required)
          </label>
          <input
            type="text"
            value={supersessionReason ?? ""}
            onChange={(e) => onSupersessionReasonChange(e.target.value)}
            placeholder="Describe why this release is being superseded..."
            className="w-full px-3 py-1.5 text-sm border rounded-md"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={executing}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={cfg.confirmVariant}
          className={action !== "release" ? "text-red-600 border-red-200 hover:bg-red-50" : undefined}
          onClick={handleConfirm}
          disabled={executing || (action === "supersede" && !supersessionReason?.trim())}
        >
          {executing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {cfg.confirmLabel}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Impact row
// ---------------------------------------------------------------------------

function ImpactRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        "ml-auto text-xs font-mono",
        highlight ? "text-amber-700 font-medium" : "text-slate-600",
      )}>
        {value}
      </span>
    </div>
  );
}
