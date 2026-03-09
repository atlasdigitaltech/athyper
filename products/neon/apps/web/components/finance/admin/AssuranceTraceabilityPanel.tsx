"use client";

// components/finance/admin/AssuranceTraceabilityPanel.tsx
//
// Phase 14: Assurance traceability panel showing section-level
// provenance evidence linking review content to system sources.

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Hash,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  SectionProvenanceDTO,
  EvidenceLinkDTO,
} from "@/lib/finance/use-review-governance";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AssuranceTraceabilityPanelProps {
  provenance: SectionProvenanceDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Source type styling
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  readiness_snapshot: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  certification: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  close_tasks: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  commentary: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  action_item: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  publication_manifest: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  override: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  decision: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  activity: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssuranceTraceabilityPanel({
  provenance,
  loading,
  error,
  onRefresh,
}: AssuranceTraceabilityPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const totalEvidence = provenance.reduce((sum, s) => sum + s.evidence.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Assurance Traceability
            {totalEvidence > 0 && (
              <Badge variant="secondary" className="text-[9px] ml-1">
                {totalEvidence} evidence link{totalEvidence !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && provenance.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading provenance...</span>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {!loading && provenance.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No provenance data available for this period.
          </p>
        )}

        {provenance.map((section) => {
          const isExpanded = expandedSection === section.sectionKey;
          return (
            <div key={section.sectionKey} className="border rounded-md">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50"
                onClick={() =>
                  setExpandedSection(isExpanded ? null : section.sectionKey)
                }
              >
                <span className="flex items-center gap-2 font-medium">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  {section.title}
                  <Badge variant="outline" className="text-[9px]">
                    {section.evidence.length}
                  </Badge>
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 space-y-1.5">
                  {section.evidence.map((ev, idx) => (
                    <EvidenceRow key={idx} evidence={ev} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Evidence Row
// ---------------------------------------------------------------------------

function EvidenceRow({ evidence }: { evidence: EvidenceLinkDTO }) {
  const colorClass = SOURCE_COLORS[evidence.sourceType] ?? SOURCE_COLORS.activity;

  return (
    <div className="flex items-start gap-2 text-[11px] border-l-2 border-muted pl-2 py-1">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={`text-[8px] shrink-0 ${colorClass}`}>
            {evidence.sourceType.replace(/_/g, " ")}
          </Badge>
          <span className="font-medium truncate">{evidence.label}</span>
        </div>
        <p className="text-muted-foreground mt-0.5">{evidence.detail}</p>
        <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
          {evidence.timestamp && (
            <span>{new Date(evidence.timestamp).toLocaleString()}</span>
          )}
          {evidence.integrity && (
            <span className="flex items-center gap-0.5">
              <Hash className="h-2.5 w-2.5" />
              {evidence.integrity.slice(0, 12)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
