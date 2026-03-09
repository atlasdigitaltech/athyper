"use client";

// components/finance/admin/DecisionLogPanel.tsx
//
// Immutable decision log timeline for CFO workspace.
// Shows recorded decisions with type badges, rationale, and context snapshots.

import { useState } from "react";
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  Plus,
  Scale,
  Send,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { DecisionDTO, DecisionCreateInput } from "@/lib/finance/use-cfo-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DecisionLogPanelProps {
  decisions: DecisionDTO[];
  loading?: boolean;
  onRecord: (input: DecisionCreateInput) => Promise<string>;
  recordLoading?: boolean;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Decision type config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, { icon: typeof Check; color: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  approve: { icon: Check, color: "text-emerald-600", badge: "default" },
  reject: { icon: XCircle, color: "text-red-600", badge: "destructive" },
  override: { icon: Scale, color: "text-amber-600", badge: "secondary" },
  escalate: { icon: Send, color: "text-blue-600", badge: "secondary" },
  defer: { icon: Clock, color: "text-gray-600", badge: "outline" },
  note: { icon: FileText, color: "text-gray-600", badge: "outline" },
  waive: { icon: Check, color: "text-amber-600", badge: "outline" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DecisionLogPanel({
  decisions,
  loading,
  onRecord,
  recordLoading,
  entityCode,
  fiscalYear,
  periodNumber,
}: DecisionLogPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("note");
  const [formTitle, setFormTitle] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookMarked className="h-4 w-4" />
            Decision Log
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading decisions...</span>
        </CardContent>
      </Card>
    );
  }

  const handleRecord = async () => {
    if (!formTitle.trim()) return;
    await onRecord({
      entityCode,
      targetKind: "period_close",
      decisionType: formType,
      title: formTitle,
      rationale: formRationale || undefined,
      fiscalYear,
      periodNumber,
    });
    setShowForm(false);
    setFormTitle("");
    setFormRationale("");
    setFormType("note");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BookMarked className="h-4 w-4" />
              Decision Log
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {decisions.length} decision{decisions.length !== 1 ? "s" : ""} recorded
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Record
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Record form */}
        {showForm && (
          <div className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="override">Override</option>
                <option value="escalate">Escalate</option>
                <option value="defer">Defer</option>
                <option value="waive">Waive</option>
                <option value="note">Note</option>
              </select>
              <input
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                placeholder="Decision title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <input
              className="w-full text-xs border rounded px-2 py-1 bg-background"
              placeholder="Rationale (optional)"
              value={formRationale}
              onChange={(e) => setFormRationale(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!formTitle.trim() || recordLoading}
                onClick={handleRecord}
              >
                {recordLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Record"}
              </Button>
            </div>
          </div>
        )}

        {/* Decision timeline */}
        {decisions.length === 0 && !showForm && (
          <div className="flex items-center gap-2 py-3">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No decisions recorded for this period.</span>
          </div>
        )}

        {decisions.map((d) => {
          const config = TYPE_CONFIG[d.decision_type] ?? TYPE_CONFIG.note;
          const Icon = config.icon;
          const isExpanded = expandedId === d.id;

          return (
            <div
              key={d.id}
              className="flex gap-2 p-2 border rounded-md hover:bg-muted/20 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : d.id)}
            >
              <div className="flex flex-col items-center">
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                <div className="w-px flex-1 bg-border mt-1" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge variant={config.badge} className="text-[9px]">
                    {d.decision_type}
                  </Badge>
                  <span className="text-xs font-medium truncate">{d.title}</span>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
                  )}
                </div>

                {!isExpanded && d.rationale && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{d.rationale}</p>
                )}

                {isExpanded && (
                  <div className="mt-1.5 space-y-1">
                    {d.rationale && (
                      <p className="text-xs text-foreground/80">{d.rationale}</p>
                    )}
                    {d.related_item_title && (
                      <div className="text-[10px] text-muted-foreground">
                        Related: {d.related_item_title}
                        {d.related_item_status && (
                          <Badge variant="outline" className="text-[8px] ml-1">{d.related_item_status}</Badge>
                        )}
                      </div>
                    )}
                    {d.context_snapshot && (
                      <details className="text-[10px]">
                        <summary className="text-muted-foreground cursor-pointer">Context snapshot</summary>
                        <pre className="mt-1 p-1 bg-muted rounded text-[9px] overflow-auto max-h-24">
                          {JSON.stringify(d.context_snapshot, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                  {d.decided_by_name && <span>{d.decided_by_name}</span>}
                  <span>{new Date(d.decided_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
