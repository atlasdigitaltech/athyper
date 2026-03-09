"use client";

// components/finance/admin/ReviewSnapshotBar.tsx
//
// Phase 13: Snapshot capture, compare, and lifecycle controls.
// Sits above the review pack assembly and manages point-in-time snapshots.

import { useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Clock,
  Eye,
  FileCheck,
  Loader2,
  Send,
  Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import type {
  ReviewPackDTO,
  ReviewSnapshotSummaryDTO,
  SnapshotCaptureInput,
} from "@/lib/finance/use-review-pack";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReviewSnapshotBarProps {
  snapshots: ReviewSnapshotSummaryDTO[];
  snapshotsLoading: boolean;
  reviewPack: ReviewPackDTO;
  onCapture: (input: SnapshotCaptureInput) => Promise<string>;
  onAdvanceStatus: (id: string, action: string, notes?: string) => Promise<void>;
  mutationLoading: boolean;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; badge: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { icon: Clock, color: "text-gray-600", badge: "outline" },
  REVIEWED: { icon: Eye, color: "text-blue-600", badge: "secondary" },
  SIGNED_OFF: { icon: FileCheck, color: "text-emerald-600", badge: "default" },
  DISTRIBUTED: { icon: Send, color: "text-cyan-600", badge: "default" },
  SUPERSEDED: { icon: Clock, color: "text-gray-400", badge: "outline" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewSnapshotBar({
  snapshots,
  snapshotsLoading,
  reviewPack,
  onCapture,
  onAdvanceStatus,
  mutationLoading,
  entityCode,
  fiscalYear,
  periodNumber,
}: ReviewSnapshotBarProps) {
  const [showList, setShowList] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureType, setCaptureType] = useState("cfo_review");

  const handleCapture = async () => {
    setCapturing(false);
    await onCapture({
      entityCode,
      fiscalYear,
      periodNumber,
      reviewType: captureType,
      title: captureTitle || undefined,
      workspaceState: reviewPack,
      sections: reviewPack.sections,
      readinessScore: reviewPack.readinessScore,
      phase: reviewPack.phase,
      blockerCount: reviewPack.blockers.length,
      openActionItems: reviewPack.openActionItemCount,
      decisionCount: reviewPack.decisionCount,
      carryForwardCount: reviewPack.carryForwardCount,
      packInstanceId: reviewPack.pack?.id,
      certificationId: reviewPack.certification?.id,
      closeRunId: reviewPack.closeState?.close_run_id,
    });
    setCaptureTitle("");
    setCaptureType("cfo_review");
  };

  const latestSnapshot = snapshots[0] ?? null;

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: snapshot info */}
          <div className="flex items-center gap-3 min-w-0">
            <Camera className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {snapshotsLoading ? (
              <span className="text-xs text-muted-foreground">Loading snapshots...</span>
            ) : latestSnapshot ? (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{latestSnapshot.snapshot_code}</span>
                  <SnapshotStatusBadge status={latestSnapshot.status} />
                  {latestSnapshot.readiness_score != null && (
                    <Badge variant="outline" className="text-[9px]">
                      {latestSnapshot.readiness_score}%
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {latestSnapshot.created_by_name && `${latestSnapshot.created_by_name} · `}
                  {new Date(latestSnapshot.created_at).toLocaleString()}
                  {latestSnapshot.signed_off_by_name && ` · Signed off by ${latestSnapshot.signed_off_by_name}`}
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No snapshots captured yet</span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Advance status for latest snapshot */}
            {latestSnapshot && latestSnapshot.status === "DRAFT" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={mutationLoading}
                onClick={() => onAdvanceStatus(latestSnapshot.id, "review")}
              >
                <Eye className="h-3 w-3 mr-1" />
                Mark Reviewed
              </Button>
            )}
            {latestSnapshot && latestSnapshot.status === "REVIEWED" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={mutationLoading}
                onClick={() => onAdvanceStatus(latestSnapshot.id, "signoff")}
              >
                <Shield className="h-3 w-3 mr-1" />
                Sign Off
              </Button>
            )}
            {latestSnapshot && latestSnapshot.status === "SIGNED_OFF" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={mutationLoading}
                onClick={() => onAdvanceStatus(latestSnapshot.id, "distribute")}
              >
                <Send className="h-3 w-3 mr-1" />
                Mark Distributed
              </Button>
            )}

            {/* Capture new snapshot */}
            {!capturing ? (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCapturing(true)}
              >
                <Camera className="h-3 w-3 mr-1" />
                Capture Snapshot
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="text-xs border rounded px-2 py-1 bg-background h-7"
                  value={captureType}
                  onChange={(e) => setCaptureType(e.target.value)}
                >
                  <option value="cfo_review">CFO Review</option>
                  <option value="board_prep">Board Prep</option>
                  <option value="audit_committee">Audit Committee</option>
                  <option value="interim">Interim</option>
                </select>
                <input
                  className="text-xs border rounded px-2 py-1 bg-background h-7 w-40"
                  placeholder="Title (optional)"
                  value={captureTitle}
                  onChange={(e) => setCaptureTitle(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={mutationLoading}
                  onClick={handleCapture}
                >
                  {mutationLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCapturing(false)}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Toggle snapshot list */}
            {snapshots.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowList(!showList)}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showList ? "rotate-180" : ""}`} />
                {snapshots.length}
              </Button>
            )}
          </div>
        </div>

        {/* Snapshot list */}
        {showList && snapshots.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <SnapshotStatusBadge status={s.status} />
                  <span className="text-xs font-mono">{s.snapshot_code}</span>
                  {s.title && <span className="text-xs text-muted-foreground truncate">{s.title}</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-shrink-0">
                  {s.readiness_score != null && (
                    <Badge variant="outline" className="text-[9px]">{s.readiness_score}%</Badge>
                  )}
                  <span>
                    {s.open_action_items > 0 && `${s.open_action_items} items · `}
                    {s.decision_count > 0 && `${s.decision_count} decisions · `}
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function SnapshotStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <Badge variant={config.badge} className="text-[9px]">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
