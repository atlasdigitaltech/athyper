"use client";

// components/finance/atlas/NarrativesPanel.tsx
//
// Dedicated narratives view — dashboard summary, CFO brief,
// and narrative provenance metadata.

import {
  Card,
  Badge,
} from "@neon/ui";
import {
  FileText,
  Loader2,
  Briefcase,
  LayoutDashboard,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AtlasDashboardData } from "@/lib/finance/use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NarrativesPanelProps {
  data: AtlasDashboardData | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NarrativesPanel({ data, loading }: NarrativesPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generating narratives...
      </div>
    );
  }

  if (!data) return null;

  const { narratives } = data;

  return (
    <div className="space-y-4">
      {/* Dashboard Summary */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <LayoutDashboard className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold">Dashboard Summary</span>
          {narratives.provenance && (
            <Badge variant="outline" className="text-[10px] ml-auto">
              {narratives.provenance.deterministic ? "deterministic" : "llm-polished"}
            </Badge>
          )}
        </div>
        <div className="px-4 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{narratives.dashboardSummary}</p>
        </div>
      </Card>

      {/* CFO Brief */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Briefcase className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold">CFO Brief</span>
        </div>
        <div className="px-4 py-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{narratives.cfoBrief}</pre>
        </div>
      </Card>

      {/* Provenance */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Info className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold">Narrative Provenance</span>
        </div>
        <div className="px-4 py-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <ProvenanceRow label="Provider" value={narratives.provider} />
            <ProvenanceRow label="Generated At" value={new Date(narratives.generatedAt).toLocaleString()} />
            <ProvenanceRow
              label="Mode"
              value={narratives.provenance?.deterministic ? "Deterministic (template)" : "LLM-polished"}
            />
            <ProvenanceRow
              label="Completeness"
              value={narratives.provenance?.completeness ?? "—"}
            />
          </div>

          {narratives.provenance?.sourceCounts && Object.keys(narratives.provenance.sourceCounts).length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Source Data Counts
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(narratives.provenance.sourceCounts).map(([source, count]) => (
                  <Badge key={source} variant="outline" className="text-[10px] tabular-nums">
                    {source}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
