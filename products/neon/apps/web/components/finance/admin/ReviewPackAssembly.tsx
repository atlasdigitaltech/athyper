"use client";

// components/finance/admin/ReviewPackAssembly.tsx
//
// Phase 13: Full-page review pack view with formal sections.
// Renders the assembled review pack DTO as a structured document
// suitable for CFO review, board prep, or export.

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Scale,
  Send,
  Shield,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ReviewPackDTO, ReviewSectionDTO } from "@/lib/finance/use-review-pack";
import { ReviewSnapshotBar } from "./ReviewSnapshotBar";
import type {
  ReviewSnapshotSummaryDTO,
  SnapshotCaptureInput,
} from "@/lib/finance/use-review-pack";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReviewPackAssemblyProps {
  data: ReviewPackDTO | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  // Snapshot props
  snapshots: ReviewSnapshotSummaryDTO[];
  snapshotsLoading: boolean;
  onCaptureSnapshot: (input: SnapshotCaptureInput) => Promise<string>;
  onAdvanceStatus: (id: string, action: string, notes?: string) => Promise<void>;
  mutationLoading: boolean;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Section icons
// ---------------------------------------------------------------------------

const SECTION_ICONS: Record<string, typeof BookOpen> = {
  executive_summary: BookOpen,
  key_exceptions: AlertTriangle,
  material_movements: BarChart3,
  controls_overrides: Shield,
  decisions_followup: Scale,
  distribution_status: Send,
};

const SECTION_COLORS: Record<string, string> = {
  executive_summary: "border-l-blue-500",
  key_exceptions: "border-l-red-500",
  material_movements: "border-l-amber-500",
  controls_overrides: "border-l-purple-500",
  decisions_followup: "border-l-emerald-500",
  distribution_status: "border-l-cyan-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewPackAssembly({
  data,
  loading,
  error,
  onRefresh,
  snapshots,
  snapshotsLoading,
  onCaptureSnapshot,
  onAdvanceStatus,
  mutationLoading,
  entityCode,
  fiscalYear,
  periodNumber,
}: ReviewPackAssemblyProps) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Assembling review pack...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onRefresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Review Pack — {entityCode} P{periodNumber} FY{fiscalYear}
          </h2>
          <p className="text-sm text-muted-foreground">
            Assembled {new Date(data.assembledAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Snapshot controls */}
      <ReviewSnapshotBar
        snapshots={snapshots}
        snapshotsLoading={snapshotsLoading}
        reviewPack={data}
        onCapture={onCaptureSnapshot}
        onAdvanceStatus={onAdvanceStatus}
        mutationLoading={mutationLoading}
        entityCode={entityCode}
        fiscalYear={fiscalYear}
        periodNumber={periodNumber}
      />

      {/* Readiness overview strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          icon={Target}
          label="Readiness"
          value={`${data.readinessScore}%`}
          color={data.readinessScore >= 80 ? "text-emerald-600" : data.readinessScore >= 50 ? "text-amber-600" : "text-red-600"}
        />
        <MetricCard
          icon={Clock}
          label="Phase"
          value={formatPhase(data.phase)}
          color="text-blue-600"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Blockers"
          value={String(data.blockers.length)}
          color={data.blockers.length > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <MetricCard
          icon={FileText}
          label="Action Items"
          value={String(data.openActionItemCount)}
          color={data.openActionItemCount > 0 ? "text-amber-600" : "text-emerald-600"}
        />
        <MetricCard
          icon={Scale}
          label="Decisions"
          value={String(data.decisionCount)}
          color="text-blue-600"
        />
      </div>

      {/* Formal sections */}
      <div className="space-y-3">
        {data.sections.map((section) => (
          <SectionCard key={section.sectionKey} section={section} />
        ))}
      </div>

      {/* Empty state */}
      {data.sections.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No report sections generated. The review pack will populate as workspace data becomes available.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function SectionCard({ section }: { section: ReviewSectionDTO }) {
  const Icon = SECTION_ICONS[section.sectionKey] ?? FileText;
  const borderColor = SECTION_COLORS[section.sectionKey] ?? "border-l-gray-400";

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {section.title}
          <div className="flex items-center gap-1.5 ml-auto">
            {section.itemCount != null && section.itemCount > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {section.itemCount} item{section.itemCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[9px]"
            >
              {section.sourceType === "commentary" ? "manual" : section.sourceType}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-line">
          {section.body}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 text-center">
        <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
        <div className={`text-lg font-semibold ${color}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhase(phase: string): string {
  switch (phase) {
    case "close": return "Close";
    case "packGeneration": return "Pack Gen";
    case "certification": return "Cert";
    case "distribution": return "Dist";
    default: return phase;
  }
}
