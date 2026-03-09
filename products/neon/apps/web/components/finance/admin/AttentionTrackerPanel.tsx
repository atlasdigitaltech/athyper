"use client";

// components/finance/admin/AttentionTrackerPanel.tsx
//
// Action item tracker for CFO workspace — view, create, and manage
// attention items across the close pipeline.

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Plus,
  ShieldAlert,
  Target,
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

import type {
  ActionItemDTO,
  ActionItemCreateInput,
} from "@/lib/finance/use-cfo-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AttentionTrackerPanelProps {
  items: ActionItemDTO[];
  loading?: boolean;
  mutationLoading?: boolean;
  onCreate: (input: ActionItemCreateInput) => Promise<string>;
  onUpdateStatus: (id: string, action: string, note?: string) => Promise<void>;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string; border: string }> = {
  critical: { icon: ShieldAlert, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  high: { icon: AlertTriangle, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  medium: { icon: AlertCircle, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  low: { icon: Info, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  info: { icon: Info, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttentionTrackerPanel({
  items,
  loading,
  mutationLoading,
  onCreate,
  onUpdateStatus,
  entityCode,
  fiscalYear,
  periodNumber,
}: AttentionTrackerPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSeverity, setCreateSeverity] = useState("medium");
  const [createDetail, setCreateDetail] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            Attention Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading items...</span>
        </CardContent>
      </Card>
    );
  }

  const openItems = items.filter((i) => !["resolved", "dismissed"].includes(i.status));
  const resolvedItems = items.filter((i) => ["resolved", "dismissed"].includes(i.status));

  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    await onCreate({
      entityCode,
      targetKind: "period_close",
      title: createTitle,
      detail: createDetail || undefined,
      severity: createSeverity,
      fiscalYear,
      periodNumber,
    });
    setShowCreate(false);
    setCreateTitle("");
    setCreateDetail("");
    setCreateSeverity("medium");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" />
              Attention Tracker
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {openItems.length} open · {resolvedItems.length} resolved
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Create form */}
        {showCreate && (
          <div className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={createSeverity}
                onChange={(e) => setCreateSeverity(e.target.value)}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
              <input
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                placeholder="Attention item title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
              />
            </div>
            <input
              className="w-full text-xs border rounded px-2 py-1 bg-background"
              placeholder="Detail (optional)"
              value={createDetail}
              onChange={(e) => setCreateDetail(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!createTitle.trim() || mutationLoading}
                onClick={handleCreate}
              >
                {mutationLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Open items */}
        {openItems.length === 0 && !showCreate && (
          <div className="flex items-center gap-2 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-emerald-700">No open attention items</span>
          </div>
        )}

        {openItems.map((item) => {
          const config = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.info;
          const Icon = config.icon;
          const isExpanded = expandedId === item.id;

          return (
            <div
              key={item.id}
              className={`border rounded-md ${config.bg} ${config.border}`}
            >
              <div
                className="flex items-start gap-2 p-2 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${config.color}`}>{item.title}</span>
                  </div>
                  {item.detail && !isExpanded && (
                    <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[9px]">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-2 pb-2 pt-0 space-y-2 border-t">
                  {item.detail && (
                    <p className="text-xs text-foreground/80 pt-2">{item.detail}</p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {item.source !== "manual" && <Badge variant="outline" className="text-[9px]">{item.source}</Badge>}
                    {item.created_by_name && <span>by {item.created_by_name}</span>}
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {item.status === "open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        disabled={mutationLoading}
                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(item.id, "acknowledge"); }}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {(item.status === "open" || item.status === "acknowledged") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        disabled={mutationLoading}
                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(item.id, "start"); }}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] text-emerald-700"
                      disabled={mutationLoading}
                      onClick={(e) => { e.stopPropagation(); onUpdateStatus(item.id, "resolve"); }}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                      Resolve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground"
                      disabled={mutationLoading}
                      onClick={(e) => { e.stopPropagation(); onUpdateStatus(item.id, "dismiss"); }}
                    >
                      <XCircle className="h-3 w-3 mr-0.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Resolved count */}
        {resolvedItems.length > 0 && (
          <div className="pt-2 border-t text-[10px] text-muted-foreground">
            {resolvedItems.length} resolved/dismissed item{resolvedItems.length !== 1 ? "s" : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
