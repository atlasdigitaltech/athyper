"use client";

// components/finance/admin/EvidenceRequestPanel.tsx
//
// Phase 15: Evidence request workspace & PBC fulfillment tracking.
// Lists audit/evidence requests with severity, assignment, due dates,
// and status actions (acknowledge, start, fulfill, reject, resubmit).

import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  FileSearch,
  Loader2,
  Plus,
  RefreshCw,
  User,
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
  EvidenceRequestDTO,
  EvidenceRequestCreateInput,
} from "@/lib/finance/use-assurance-hub";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EvidenceRequestPanelProps {
  requests: EvidenceRequestDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreate: (input: EvidenceRequestCreateInput) => Promise<string>;
  onUpdateStatus: (id: string, action: string, notes?: string) => Promise<void>;
  mutationLoading: boolean;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  info: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  acknowledged: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  resolved: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-gray-100 text-gray-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvidenceRequestPanel({
  requests,
  loading,
  error,
  onRefresh,
  onCreate,
  onUpdateStatus,
  mutationLoading,
  entityCode,
  fiscalYear,
  periodNumber,
}: EvidenceRequestPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDetail, setFormDetail] = useState("");
  const [formSeverity, setFormSeverity] = useState("medium");
  const [formOrg, setFormOrg] = useState("");
  const [formDueAt, setFormDueAt] = useState("");

  const openCount = requests.filter((r) => !["resolved", "dismissed"].includes(r.status)).length;
  const overdueCount = requests.filter(
    (r) => r.due_at && new Date(r.due_at) < new Date() && !["resolved", "dismissed"].includes(r.status),
  ).length;

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    await onCreate({
      entityCode,
      title: formTitle.trim(),
      detail: formDetail || undefined,
      severity: formSeverity,
      requestedByOrg: formOrg || undefined,
      dueAt: formDueAt || undefined,
      fiscalYear,
      periodNumber,
    });
    setShowForm(false);
    setFormTitle("");
    setFormDetail("");
    setFormSeverity("medium");
    setFormOrg("");
    setFormDueAt("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            Evidence Requests
            {openCount > 0 && (
              <Badge variant="secondary" className="text-[9px] ml-1">
                {openCount} open
              </Badge>
            )}
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-[9px] ml-1">
                {overdueCount} overdue
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        {showForm && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <input
              className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
              placeholder="Request title *"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <textarea
              className="w-full text-xs border rounded-md px-2 py-1.5 bg-background min-h-[40px]"
              placeholder="Detail / description"
              value={formDetail}
              onChange={(e) => setFormDetail(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Severity</label>
                <select
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value)}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="info">Info</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Requesting Org</label>
                <input
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  placeholder="e.g. Deloitte"
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Due Date</label>
                <input
                  type="date"
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formDueAt}
                  onChange={(e) => setFormDueAt(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={mutationLoading || !formTitle.trim()}>
                {mutationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create
              </Button>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading && requests.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Empty */}
        {!loading && requests.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No evidence requests for this period.
          </p>
        )}

        {/* List */}
        {requests.map((req) => {
          const isExpanded = expandedId === req.id;
          const isOverdue = req.due_at && new Date(req.due_at) < new Date() && !["resolved", "dismissed"].includes(req.status);
          const org = req.structured_data?.requested_by_org;

          return (
            <div key={req.id} className={`border rounded-md ${isOverdue ? "border-red-300" : ""}`}>
              <button
                className="w-full flex items-start gap-2 px-3 py-2 text-xs text-left hover:bg-muted/50"
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-[8px] ${SEVERITY_COLORS[req.severity] ?? ""}`}>
                      {req.severity}
                    </Badge>
                    <Badge className={`text-[8px] ${STATUS_COLORS[req.status] ?? ""}`}>
                      {req.status.replace(/_/g, " ")}
                    </Badge>
                    {org && (
                      <Badge variant="outline" className="text-[8px]">
                        {org}
                      </Badge>
                    )}
                    {isOverdue && (
                      <Badge variant="destructive" className="text-[8px]">overdue</Badge>
                    )}
                  </div>
                  <p className="font-medium mt-0.5 truncate">{req.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
                    {req.due_at && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(req.due_at).toLocaleDateString()}
                      </span>
                    )}
                    {req.assigned_role && (
                      <span className="flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5" />
                        {req.assigned_role}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-3 w-3 mt-1" /> : <ChevronDown className="h-3 w-3 mt-1" />}
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 space-y-2">
                  {req.detail && (
                    <p className="text-[10px] text-muted-foreground whitespace-pre-line">{req.detail}</p>
                  )}
                  {req.resolution_note && (
                    <p className="text-[10px] text-emerald-600">Resolution: {req.resolution_note}</p>
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {req.status === "open" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(req.id, "acknowledge")} disabled={mutationLoading}>
                        Acknowledge
                      </Button>
                    )}
                    {["open", "acknowledged"].includes(req.status) && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(req.id, "start")} disabled={mutationLoading}>
                        Start
                      </Button>
                    )}
                    {["open", "acknowledged", "in_progress"].includes(req.status) && (
                      <Button size="sm" variant="default" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(req.id, "fulfill")} disabled={mutationLoading}>
                        <Check className="h-3 w-3 mr-0.5" /> Fulfill
                      </Button>
                    )}
                    {["open", "acknowledged", "in_progress"].includes(req.status) && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600"
                        onClick={() => onUpdateStatus(req.id, "reject")} disabled={mutationLoading}>
                        Reject
                      </Button>
                    )}
                    {["resolved", "dismissed"].includes(req.status) && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(req.id, "resubmit")} disabled={mutationLoading}>
                        Resubmit
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
