"use client";

// components/finance/admin/RemediationPortfolioPanel.tsx
//
// Phase 18: Control Program Management & Remediation Portfolio.
// Shows program portfolio with milestone progress, health indicators,
// create form, status actions, and impact tracking.

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FolderKanban,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Target,
  User,
  Zap,
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
  ControlProgramDTO,
  ProgramDetailDTO,
  ProgramImpactDTO,
  ProgramCreateInput,
  MilestoneCreateInput,
} from "@/lib/finance/use-control-programs";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RemediationPortfolioPanelProps {
  programs: ControlProgramDTO[];
  selectedDetail: ProgramDetailDTO | null;
  impact: ProgramImpactDTO | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectProgram: (id: string | null) => void;
  onCreate: (input: ProgramCreateInput) => Promise<string>;
  onUpdateStatus: (programId: string, action: string, extra?: Record<string, any>) => Promise<void>;
  onAddMilestone: (programId: string, input: MilestoneCreateInput) => Promise<string>;
  mutationLoading: boolean;
  entityCode: string;
  fiscalYear: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-purple-100 text-purple-700",
  closed: "bg-gray-200 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

const HEALTH_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  improvement: "Improvement",
  remediation: "Remediation",
  optimization: "Optimization",
  compliance: "Compliance",
  transformation: "Transformation",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RemediationPortfolioPanel({
  programs,
  selectedDetail,
  impact,
  loading,
  detailLoading,
  error,
  onRefresh,
  onSelectProgram,
  onCreate,
  onUpdateStatus,
  onAddMilestone,
  mutationLoading,
  entityCode,
  fiscalYear,
}: RemediationPortfolioPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("improvement");
  const [formPriority, setFormPriority] = useState("medium");
  const [formSponsor, setFormSponsor] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [msTitle, setMsTitle] = useState("");
  const [msDue, setMsDue] = useState("");
  const [msSeverity, setMsSeverity] = useState("medium");

  const activeCount = programs.filter((p) => p.status === "active").length;
  const overdueCount = programs.filter((p) => p.isOverdue).length;
  const redCount = programs.filter((p) => p.health === "red").length;

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    await onCreate({
      entityCode,
      title: formTitle.trim(),
      description: formDesc || undefined,
      programType: formType,
      priority: formPriority,
      sponsorName: formSponsor || undefined,
      ownerName: formOwner || undefined,
      plannedStart: formStart || undefined,
      plannedEnd: formEnd || undefined,
      fiscalYear,
    });
    setShowCreateForm(false);
    setFormTitle("");
    setFormDesc("");
    setFormType("improvement");
    setFormPriority("medium");
    setFormSponsor("");
    setFormOwner("");
    setFormStart("");
    setFormEnd("");
  };

  const handleAddMilestone = async () => {
    if (!msTitle.trim() || !selectedDetail) return;
    await onAddMilestone(selectedDetail.id, {
      title: msTitle.trim(),
      severity: msSeverity,
      dueAt: msDue || undefined,
    });
    setShowMilestoneForm(false);
    setMsTitle("");
    setMsDue("");
    setMsSeverity("medium");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            Remediation Portfolio
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-[9px]">{activeCount} active</Badge>
            )}
            {redCount > 0 && (
              <Badge variant="destructive" className="text-[9px]">{redCount} at risk</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        {showCreateForm && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <input
              className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
              placeholder="Program title *"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <textarea
              className="w-full text-xs border rounded-md px-2 py-1.5 bg-background min-h-[40px]"
              placeholder="Description"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Type</label>
                <select className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formType} onChange={(e) => setFormType(e.target.value)}>
                  <option value="improvement">Improvement</option>
                  <option value="remediation">Remediation</option>
                  <option value="optimization">Optimization</option>
                  <option value="compliance">Compliance</option>
                  <option value="transformation">Transformation</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Priority</label>
                <select className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formPriority} onChange={(e) => setFormPriority(e.target.value)}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Sponsor</label>
                <input className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  placeholder="Executive sponsor" value={formSponsor}
                  onChange={(e) => setFormSponsor(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Owner</label>
                <input className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  placeholder="Program owner" value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Planned Start</label>
                <input type="date" className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Planned End</label>
                <input type="date" className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={mutationLoading || !formTitle.trim()}>
                {mutationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create
              </Button>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading && programs.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Empty state */}
        {!loading && programs.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No control programs. Create one to track improvement initiatives.
          </p>
        )}

        {/* Program list */}
        {programs.map((prog) => {
          const isSelected = selectedDetail?.id === prog.id;

          return (
            <div key={prog.id} className={`border rounded-md ${isSelected ? "ring-2 ring-blue-400" : ""}`}>
              <button
                className="w-full flex items-start gap-2 px-3 py-2 text-xs text-left hover:bg-muted/50"
                onClick={() => onSelectProgram(isSelected ? null : prog.id)}
              >
                {/* Health dot */}
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1 ${HEALTH_COLORS[prog.health] ?? "bg-gray-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-[7px] ${STATUS_COLORS[prog.status] ?? ""}`}>
                      {prog.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge className={`text-[7px] ${PRIORITY_COLORS[prog.priority] ?? ""}`}>
                      {prog.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[7px]">
                      {TYPE_LABELS[prog.programType] ?? prog.programType}
                    </Badge>
                    {prog.isOverdue && (
                      <Badge variant="destructive" className="text-[7px]">overdue</Badge>
                    )}
                  </div>
                  <p className="font-medium mt-0.5 truncate">{prog.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
                    {prog.ownerName && (
                      <span className="flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5" />{prog.ownerName}
                      </span>
                    )}
                    {prog.totalMilestones > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ClipboardList className="h-2.5 w-2.5" />
                        {prog.completedMilestones}/{prog.totalMilestones}
                      </span>
                    )}
                    {prog.linkedGapCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Target className="h-2.5 w-2.5" />
                        {prog.linkedGapCount} gaps
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  {prog.totalMilestones > 0 && (
                    <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(Number(prog.milestoneCompletionPct), 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                {isSelected ? <ChevronUp className="h-3 w-3 mt-1" /> : <ChevronDown className="h-3 w-3 mt-1" />}
              </button>

              {/* Expanded detail */}
              {isSelected && selectedDetail && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  {detailLoading && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {/* Description */}
                  {selectedDetail.description && (
                    <p className="text-[10px] text-muted-foreground pt-2">{selectedDetail.description}</p>
                  )}

                  {/* Status actions */}
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    {selectedDetail.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(selectedDetail.id, "approve")} disabled={mutationLoading}>
                        Approve
                      </Button>
                    )}
                    {selectedDetail.status === "approved" && (
                      <Button size="sm" variant="default" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(selectedDetail.id, "activate")} disabled={mutationLoading}>
                        <Zap className="h-3 w-3 mr-0.5" />Activate
                      </Button>
                    )}
                    {selectedDetail.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]"
                          onClick={() => onUpdateStatus(selectedDetail.id, "hold")} disabled={mutationLoading}>
                          Hold
                        </Button>
                        <Button size="sm" variant="default" className="h-6 text-[10px]"
                          onClick={() => onUpdateStatus(selectedDetail.id, "complete")} disabled={mutationLoading}>
                          <Check className="h-3 w-3 mr-0.5" />Complete
                        </Button>
                      </>
                    )}
                    {selectedDetail.status === "on_hold" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(selectedDetail.id, "resume")} disabled={mutationLoading}>
                        Resume
                      </Button>
                    )}
                    {selectedDetail.status === "completed" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => onUpdateStatus(selectedDetail.id, "close")} disabled={mutationLoading}>
                        Close & Archive
                      </Button>
                    )}
                    {["draft", "approved", "active", "on_hold"].includes(selectedDetail.status) && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600"
                        onClick={() => onUpdateStatus(selectedDetail.id, "cancel")} disabled={mutationLoading}>
                        Cancel
                      </Button>
                    )}
                  </div>

                  {/* Milestones */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium">Milestones ({selectedDetail.milestones.length})</p>
                      {["active", "approved", "draft"].includes(selectedDetail.status) && (
                        <Button variant="ghost" size="sm" className="h-5 text-[9px]"
                          onClick={() => setShowMilestoneForm(!showMilestoneForm)}>
                          <Plus className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>

                    {showMilestoneForm && (
                      <div className="border rounded-md p-2 space-y-1.5 bg-muted/30 mt-1">
                        <input className="w-full text-[10px] border rounded px-2 py-1 bg-background"
                          placeholder="Milestone title *" value={msTitle}
                          onChange={(e) => setMsTitle(e.target.value)} />
                        <div className="grid grid-cols-2 gap-1.5">
                          <input type="date" className="text-[10px] border rounded px-2 py-1 bg-background"
                            value={msDue} onChange={(e) => setMsDue(e.target.value)} />
                          <select className="text-[10px] border rounded px-2 py-1 bg-background"
                            value={msSeverity} onChange={(e) => setMsSeverity(e.target.value)}>
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-5 text-[9px]"
                            onClick={() => setShowMilestoneForm(false)}>Cancel</Button>
                          <Button size="sm" className="h-5 text-[9px]"
                            onClick={handleAddMilestone} disabled={mutationLoading || !msTitle.trim()}>
                            Add
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 mt-1">
                      {selectedDetail.milestones.map((ms) => {
                        const isOverdue = ms.dueAt && new Date(ms.dueAt) < new Date() && ms.status !== "resolved";
                        return (
                          <div key={ms.id} className={`flex items-center gap-2 text-[10px] border rounded px-2 py-1 ${isOverdue ? "border-red-300" : ""}`}>
                            {ms.status === "resolved" ? (
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                            ) : (
                              <div className="h-3 w-3 rounded-full border-2 border-gray-300 shrink-0" />
                            )}
                            <span className={`flex-1 truncate ${ms.status === "resolved" ? "line-through text-muted-foreground" : ""}`}>
                              {ms.title}
                            </span>
                            {ms.dueAt && (
                              <span className={`text-[8px] shrink-0 ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                                <Calendar className="h-2 w-2 inline mr-0.5" />
                                {new Date(ms.dueAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Impact tracker */}
                  {impact && impact.impact.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium mb-1">Impact Tracker</p>
                      <div className="space-y-1">
                        {impact.impact.map((m) => {
                          const improvementNum = m.improvement ? Number(m.improvement) : 0;
                          return (
                            <div key={m.metricCode} className="flex items-center gap-2 text-[10px] border rounded px-2 py-1">
                              {/* Traffic light change indicator */}
                              {m.trafficLightChanged ? (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <div className={`h-2 w-2 rounded-full ${HEALTH_COLORS[m.baselineTrafficLight ?? ""] ?? "bg-gray-300"}`} />
                                  <ArrowDown className="h-2 w-2 text-muted-foreground" style={{ transform: "rotate(-90deg)" }} />
                                  <div className={`h-2 w-2 rounded-full ${HEALTH_COLORS[m.currentTrafficLight ?? ""] ?? "bg-gray-300"}`} />
                                </div>
                              ) : (
                                <div className={`h-2 w-2 rounded-full shrink-0 ${HEALTH_COLORS[m.currentTrafficLight ?? ""] ?? "bg-gray-300"}`} />
                              )}
                              <span className="flex-1 truncate">{m.metricLabel}</span>
                              <span className="text-muted-foreground shrink-0">{m.baselineValue ?? "—"}</span>
                              <Minus className="h-2 w-2 text-muted-foreground shrink-0" />
                              <span className="font-medium shrink-0">{m.currentValue ?? "—"}</span>
                              {improvementNum !== 0 && (
                                <span className={`font-medium shrink-0 ${improvementNum > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {improvementNum > 0 ? "+" : ""}{m.improvement}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Linked gaps */}
                  {selectedDetail.linkedGaps.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium mb-1">Linked Control Gaps</p>
                      <div className="flex gap-1 flex-wrap">
                        {selectedDetail.linkedGaps.map((gap, i) => (
                          <Badge key={i} variant="outline" className="text-[7px]">
                            {gap.type.replace(/_/g, " ")}: {gap.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
