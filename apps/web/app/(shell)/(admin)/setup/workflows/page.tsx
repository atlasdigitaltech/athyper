"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GitMerge, Plus, Trash2, ChevronUp, ChevronDown,
  CheckCircle2, Clock, Settings2, Play, Layers,
  Users, UserCheck, Shield, Network,
} from "lucide-react";
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge, Textarea, Switch,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@athyper/theme/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface SlaPolicy {
  id: string;
  code: string;
  name: string;
}

interface StageRule {
  id: string;
  priority: number;
  conditions: string; // JSON string
  assign_to: {
    type: "direct_principal" | "role_based" | "group_based" | "hierarchy_based";
    value: string;
  };
}

interface Stage {
  id: string;
  stage_no: number;
  name: string | null;
  mode: "serial" | "parallel";
  quorum: { strategy: "unanimous" | "count" | "percent"; required?: number } | null;
  sla_policy_id: string | null;
  rules: StageRule[];
}

interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  compiled_hash: string | null;
  behaviors: Record<string, unknown>;
  sla_policy_id: string | null;
  stages?: Stage[];
}

// ── Assign-to strategy meta ───────────────────────────────────────────────────

const ASSIGN_STRATEGIES = [
  {
    value: "direct_principal",
    label: "Direct Principal",
    hint: "Enter a principal UUID",
    icon: UserCheck,
  },
  {
    value: "role_based",
    label: "By Role",
    hint: "Enter a role code (e.g. finance_approver)",
    icon: Shield,
  },
  {
    value: "group_based",
    label: "By Group",
    hint: "Enter a group UUID or code",
    icon: Users,
  },
  {
    value: "hierarchy_based",
    label: "Hierarchy (Manager)",
    hint: 'Enter "manager" or leave blank',
    icon: Network,
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJson(val: string): object | null {
  try { return JSON.parse(val) || null; } catch { return null; }
}

function blankRule(priority: number): Omit<StageRule, "id"> {
  return {
    priority,
    conditions: "",
    assign_to: { type: "direct_principal", value: "" },
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssignToIcon({ type }: { type: string }) {
  const meta = ASSIGN_STRATEGIES.find((s) => s.value === type);
  const Icon = meta?.icon ?? UserCheck;
  return <Icon className="size-3.5 shrink-0" />;
}

function QuorumBadge({ quorum }: { quorum: Stage["quorum"] }) {
  if (!quorum) return <span className="text-muted-foreground text-xs">unanimous</span>;
  if (quorum.strategy === "count")
    return <span className="text-xs">{quorum.required ?? 1} required</span>;
  if (quorum.strategy === "percent")
    return <span className="text-xs">{quorum.required ?? 100}% required</span>;
  return <span className="text-muted-foreground text-xs">unanimous</span>;
}

// ── Rule editor ───────────────────────────────────────────────────────────────

function RuleEditor({
  rule,
  index,
  onChange,
  onRemove,
}: {
  rule: StageRule | Omit<StageRule, "id">;
  index: number;
  onChange: (updated: typeof rule) => void;
  onRemove: () => void;
}) {
  const assignMeta = ASSIGN_STRATEGIES.find((s) => s.value === rule.assign_to.type);

  return (
    <div className="border rounded p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Rule {index + 1}</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Conditions */}
      <div className="space-y-1">
        <Label className="text-xs">Conditions (JSONLogic, leave blank = always matches)</Label>
        <Textarea
          placeholder='{">=": [{"var": "amount"}, 10000]}'
          className="text-xs font-mono h-16 resize-none"
          value={rule.conditions}
          onChange={(e) => onChange({ ...rule, conditions: e.target.value })}
        />
      </div>

      {/* Assign-to */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Assign to</Label>
          <Select
            value={rule.assign_to.type}
            onValueChange={(v) =>
              onChange({
                ...rule,
                assign_to: {
                  type: v as StageRule["assign_to"]["type"],
                  value: v === "hierarchy_based" ? "manager" : rule.assign_to.value,
                },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGN_STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <s.icon className="size-3" />
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            className="h-8 text-xs"
            placeholder={assignMeta?.hint ?? ""}
            value={rule.assign_to.value}
            onChange={(e) =>
              onChange({ ...rule, assign_to: { ...rule.assign_to, value: e.target.value } })
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Priority</Label>
        <Input
          type="number"
          min={1}
          className="h-8 text-xs w-24"
          value={rule.priority}
          onChange={(e) => onChange({ ...rule, priority: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

// ── Stage editor ──────────────────────────────────────────────────────────────

function StageEditor({
  stage,
  index,
  total,
  slaPolicies,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  stage: Stage;
  index: number;
  total: number;
  slaPolicies: SlaPolicy[];
  onChange: (updated: Stage) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  function addRule() {
    const maxPriority = Math.max(0, ...stage.rules.map((r) => r.priority));
    const newRule: StageRule = {
      id: `new-${Date.now()}`,
      ...blankRule(maxPriority + 10),
    };
    onChange({ ...stage, rules: [...stage.rules, newRule] });
  }

  function updateRule(i: number, updated: StageRule) {
    const rules = [...stage.rules];
    rules[i] = updated;
    onChange({ ...stage, rules });
  }

  function removeRule(i: number) {
    onChange({ ...stage, rules: stage.rules.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Stage header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="size-6"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={index === 0}
          >
            <ChevronUp className="size-3" />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-6"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={index === total - 1}
          >
            <ChevronDown className="size-3" />
          </Button>
        </div>
        <span className="text-xs font-semibold text-muted-foreground w-6">{index + 1}.</span>
        <span className="font-medium text-sm flex-1">
          {stage.name ?? `Stage ${stage.stage_no}`}
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{stage.mode}</Badge>
          <QuorumBadge quorum={stage.quorum} />
          <span className="text-xs text-muted-foreground">{stage.rules.length} rule(s)</span>
          <Button
            variant="ghost" size="icon" className="size-6 text-destructive"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Stage body */}
      {expanded && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Stage name</Label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. Manager Approval"
                value={stage.name ?? ""}
                onChange={(e) => onChange({ ...stage, name: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select
                value={stage.mode}
                onValueChange={(v) => onChange({ ...stage, mode: v as Stage["mode"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="serial" className="text-xs">Serial</SelectItem>
                  <SelectItem value="parallel" className="text-xs">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quorum */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Quorum strategy</Label>
              <Select
                value={stage.quorum?.strategy ?? "unanimous"}
                onValueChange={(v) => {
                  if (v === "unanimous") onChange({ ...stage, quorum: null });
                  else onChange({ ...stage, quorum: { strategy: v as "count" | "percent", required: 1 } });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unanimous" className="text-xs">Unanimous</SelectItem>
                  <SelectItem value="count" className="text-xs">Count</SelectItem>
                  <SelectItem value="percent" className="text-xs">Percent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stage.quorum && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {stage.quorum.strategy === "percent" ? "Required %" : "Required count"}
                </Label>
                <Input
                  type="number" min={1} max={stage.quorum.strategy === "percent" ? 100 : 99}
                  className="h-8 text-xs"
                  value={stage.quorum.required ?? 1}
                  onChange={(e) =>
                    onChange({ ...stage, quorum: { ...stage.quorum!, required: Number(e.target.value) } })
                  }
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">SLA policy</Label>
              <Select
                value={stage.sla_policy_id ?? "__none__"}
                onValueChange={(v) =>
                  onChange({ ...stage, sla_policy_id: v === "__none__" ? null : v })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">None</SelectItem>
                  {slaPolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rules */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Approver rules</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRule}>
                <Plus className="size-3" /> Add rule
              </Button>
            </div>
            {stage.rules.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No rules — add at least one approver rule.
              </p>
            )}
            {stage.rules.map((rule, i) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                index={i}
                onChange={(u) => updateRule(i, u as StageRule)}
                onRemove={() => removeRule(i)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Template form dialog ──────────────────────────────────────────────────────

function TemplateDialog({
  open,
  onClose,
  onSaved,
  slaPolicies,
  editTemplate,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  slaPolicies: SlaPolicy[];
  editTemplate?: Template;
}) {
  const { toast } = useToast();
  const isEdit = !!editTemplate;

  const [code, setCode]         = useState(editTemplate?.code ?? "");
  const [name, setName]         = useState(editTemplate?.name ?? "");
  const [description, setDescription] = useState(editTemplate?.description ?? "");
  const [isActive, setIsActive] = useState(editTemplate?.is_active ?? true);
  const [slaPolicyId, setSlaPolicyId] = useState<string>(editTemplate?.sla_policy_id ?? "__none__");
  const [behaviors, setBehaviors] = useState(
    editTemplate ? JSON.stringify(editTemplate.behaviors ?? {}, null, 2) : "{}"
  );
  const [stages, setStages] = useState<Stage[]>(editTemplate?.stages ?? []);
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens for a different template
  useEffect(() => {
    if (open) {
      setCode(editTemplate?.code ?? "");
      setName(editTemplate?.name ?? "");
      setDescription(editTemplate?.description ?? "");
      setIsActive(editTemplate?.is_active ?? true);
      setSlaPolicyId(editTemplate?.sla_policy_id ?? "__none__");
      setBehaviors(editTemplate ? JSON.stringify(editTemplate.behaviors ?? {}, null, 2) : "{}");
      setStages(editTemplate?.stages ?? []);
    }
  }, [open, editTemplate]);

  function addStage() {
    const nextNo = stages.length + 1;
    setStages((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        stage_no: nextNo,
        name: null,
        mode: "serial",
        quorum: null,
        sla_policy_id: null,
        rules: [],
      },
    ]);
  }

  function moveStage(index: number, dir: -1 | 1) {
    const next = [...stages];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    // Re-number
    setStages(next.map((s, i) => ({ ...s, stage_no: i + 1 })));
  }

  async function handleSave() {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }

    const parsedBehaviors = safeJson(behaviors);
    if (parsedBehaviors === null && behaviors.trim() !== "{}") {
      toast({ title: "Behaviors must be valid JSON", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
        sla_policy_id: slaPolicyId === "__none__" ? null : slaPolicyId,
        behaviors: parsedBehaviors ?? {},
        stages: stages.map((s, i) => ({
          ...s,
          stage_no: i + 1,
          rules: s.rules.map((r) => ({
            priority: r.priority,
            conditions: r.conditions ? safeJson(r.conditions) : null,
            assign_to: r.assign_to,
          })),
        })),
      };

      const url = isEdit
        ? `/api/workflow/templates/${editTemplate!.id}`
        : "/api/workflow/templates";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }

      toast({ title: isEdit ? "Template updated" : "Template created" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            {isEdit ? "Edit template" : "New workflow template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                placeholder="e.g. purchase_order_approval"
                value={code}
                disabled={isEdit}
                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input placeholder="e.g. Purchase Order Approval" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              placeholder="What does this workflow template do?"
              className="h-16 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default SLA policy</Label>
              <Select value={slaPolicyId} onValueChange={setSlaPolicyId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {slaPolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active</Label>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Behaviors (JSON)</Label>
            <Textarea
              placeholder='{"allow_self_approval": false, "capture_entity_snapshot": true}'
              className="h-20 resize-none font-mono text-xs"
              value={behaviors}
              onChange={(e) => setBehaviors(e.target.value)}
            />
          </div>

          {/* Stages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Stages</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addStage}>
                <Plus className="size-3" /> Add stage
              </Button>
            </div>
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                No stages yet — add at least one stage.
              </p>
            )}
            {stages.map((stage, i) => (
              <StageEditor
                key={stage.id}
                stage={stage}
                index={i}
                total={stages.length}
                slaPolicies={slaPolicies}
                onChange={(updated) =>
                  setStages((prev) => prev.map((s, idx) => (idx === i ? updated : s)))
                }
                onMoveUp={() => moveStage(i, -1)}
                onMoveDown={() => moveStage(i, 1)}
                onRemove={() =>
                  setStages((prev) =>
                    prev
                      .filter((_, idx) => idx !== i)
                      .map((s, idx) => ({ ...s, stage_no: idx + 1 }))
                  )
                }
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Compile button ────────────────────────────────────────────────────────────

function CompileButton({ templateId, onCompiled }: { templateId: string; onCompiled: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleCompile() {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflow/templates/${templateId}/compile`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      toast({ title: "Template compiled successfully" });
      onCompiled();
    } catch (err) {
      toast({ title: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleCompile} disabled={loading}>
      <Play className="size-3" />
      {loading ? "Compiling…" : "Compile"}
    </Button>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  slaPolicies,
  onRefresh,
}: {
  template: Template;
  slaPolicies: SlaPolicy[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [fullTemplate, setFullTemplate] = useState<Template | null>(null);
  const [loadingStages, setLoadingStages] = useState(false);

  async function openEdit() {
    setLoadingStages(true);
    try {
      const res = await fetch(`/api/workflow/templates/${template.id}/stages`);
      const body = await res.json() as { stages?: Stage[] };
      setFullTemplate({ ...template, stages: body.stages ?? [] });
      setEditOpen(true);
    } catch {
      toast({ title: "Failed to load stages", variant: "destructive" });
    } finally {
      setLoadingStages(false);
    }
  }

  const isCompiled = !!template.compiled_hash;

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{template.name}</span>
              <Badge variant="outline" className="font-mono text-xs">{template.code}</Badge>
              {template.is_active
                ? <Badge variant="secondary" className="text-xs">Active</Badge>
                : <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
              {isCompiled
                ? (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="size-3" /> compiled
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <Clock className="size-3" /> not compiled
                  </span>
                )}
            </div>
            {template.description && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{template.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <CompileButton templateId={template.id} onCompiled={onRefresh} />
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={openEdit}
              disabled={loadingStages}
            >
              <Settings2 className="size-3" />
              {loadingStages ? "Loading…" : "Edit"}
            </Button>
          </div>
        </div>

        {/* Stage summary pills */}
        {(template.stages?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {template.stages!.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
                <span
                  className={cn(
                    "text-xs border rounded px-1.5 py-0.5 flex items-center gap-1",
                    "bg-muted/40"
                  )}
                >
                  {s.name ?? `Stage ${s.stage_no}`}
                  <span className="text-muted-foreground">
                    ({s.rules.length} rule{s.rules.length !== 1 ? "s" : ""})
                  </span>
                  {s.rules.map((r) => (
                    <AssignToIcon key={r.id} type={r.assign_to.type} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {editOpen && fullTemplate && (
        <TemplateDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={onRefresh}
          slaPolicies={slaPolicies}
          editTemplate={fullTemplate}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowTemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading]         = useState(true);
  const [createOpen, setCreateOpen]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, slaRes] = await Promise.all([
        fetch("/api/workflow/templates"),
        fetch("/api/workflow/sla-policies"),
      ]);
      const tplBody = await tplRes.json() as { items?: Template[] };
      const slaBody = await slaRes.json() as { items?: SlaPolicy[] };

      // Fetch stages for each template
      const templatesWithStages = await Promise.all(
        (tplBody.items ?? []).map(async (t) => {
          try {
            const stRes = await fetch(`/api/workflow/templates/${t.id}/stages`);
            const stBody = await stRes.json() as { stages?: Stage[] };
            return { ...t, stages: stBody.stages ?? [] };
          } catch {
            return { ...t, stages: [] };
          }
        })
      );

      setTemplates(templatesWithStages);
      setSlaPolicies(slaBody.items ?? []);
    } catch (err) {
      toast({ title: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Workflow Templates</h1>
            <p className="text-sm text-muted-foreground">
              Design multi-stage approval workflows with role, group, and hierarchy-based assignment.
            </p>
          </div>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New template
        </Button>
      </div>

      {/* Template list */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="border rounded-lg p-8 text-center space-y-2">
          <GitMerge className="size-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No templates yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              slaPolicies={slaPolicies}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <TemplateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
        slaPolicies={slaPolicies}
      />
    </div>
  );
}
