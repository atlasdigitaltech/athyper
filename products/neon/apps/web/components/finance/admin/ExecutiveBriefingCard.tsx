"use client";

// components/finance/admin/ExecutiveBriefingCard.tsx
//
// Executive narrative summary + top attention items for CFO workspace.
// Renders structured paragraphs from the briefing API and prioritized
// attention items with severity indicators.

import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Info,
  Loader2,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ExecutiveBriefDTO, AttentionItemDTO } from "@/lib/finance/use-pack-readiness";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExecutiveBriefingCardProps {
  brief: ExecutiveBriefDTO | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string; border: string }> = {
  critical: { icon: ShieldAlert, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  high: { icon: AlertTriangle, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  medium: { icon: AlertCircle, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  info: { icon: Info, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExecutiveBriefingCard({ brief, loading }: ExecutiveBriefingCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Generating briefing...</span>
        </CardContent>
      </Card>
    );
  }

  if (!brief || brief.paragraphs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Executive Summary
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              Generated {new Date(brief.generatedAt).toLocaleTimeString()}
            </CardDescription>
          </div>
          <Badge
            variant={brief.readinessScore >= 80 ? "default" : brief.readinessScore >= 50 ? "secondary" : "destructive"}
            className="text-xs"
          >
            {brief.readinessScore}% ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Narrative paragraphs */}
        <div className="space-y-2">
          {brief.paragraphs.map((p, i) => (
            <p key={i} className="text-xs leading-relaxed text-foreground/90">
              {p}
            </p>
          ))}
        </div>

        {/* Attention items */}
        {brief.attentionItems.length > 0 && (
          <div className="pt-2 border-t space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Requires Attention ({brief.attentionItems.length})
            </p>
            {brief.attentionItems.map((item) => (
              <AttentionRow key={item.priority} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attention item row
// ---------------------------------------------------------------------------

function AttentionRow({ item }: { item: AttentionItemDTO }) {
  const config = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-2 rounded-md border p-2 ${config.bg} ${config.border}`}>
      <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium ${config.color}`}>{item.title}</span>
        </div>
        {item.detail !== item.title && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
        )}
      </div>
      <Badge variant="outline" className="text-[9px] flex-shrink-0">
        #{item.priority}
      </Badge>
    </div>
  );
}
