"use client";

import { type CSSProperties, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bffFetch } from "@/lib/bff-fetch";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Link2,
  ListChecks,
  Milestone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Split,
  TimerReset,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@athyper/ui/primitives";

type CompletionMode = "MANUAL" | "SYSTEM" | "HYBRID";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type DependencyType = "FINISH_TO_START" | "FINISH_TO_FINISH";
type DeviationType = "EXCEPTION" | "OVERRIDE" | "WAIVER";
type CarryforwardAction = "FORCE_CLOSE" | "AUTO_CARRY" | "EXPIRE";

interface CycleType {
  id: string;
  typeCode: string;
  typeName: string;
  description: string | null;
  frequency: string;
  domain: string;
  isActive: boolean;
}

interface CyclePhase {
  id: string;
  phaseCode: string;
  phaseName: string;
  sortOrder: number;
  description: string | null;
  isGateEnforced: boolean;
  minReadinessPct: number | null;
  targetHoursFromStart: number | null;
}

interface RawCategory {
  id: string;
  category_code?: string;
  categoryCode?: string;
  category_name?: string;
  categoryName?: string;
  sort_order?: number;
  sortOrder?: number;
  color_code?: string | null;
  colorCode?: string | null;
}

interface CycleCategory {
  id: string;
  categoryCode: string;
  categoryName: string;
  sortOrder: number;
  colorCode: string | null;
}

interface RawTemplate {
  id: string;
  entity_code?: string;
  entityCode?: string;
  phase_id?: string;
  phaseId?: string;
  category_id?: string;
  categoryId?: string;
  task_code?: string;
  taskCode?: string;
  task_name?: string;
  taskName?: string;
  description?: string | null;
  completion_mode?: CompletionMode;
  completionMode?: CompletionMode;
  system_check_handler?: string | null;
  systemCheckHandler?: string | null;
  is_mandatory?: boolean;
  isMandatory?: boolean;
  is_waivable?: boolean;
  isWaivable?: boolean;
  severity?: Severity | null;
  sort_order?: number;
  sortOrder?: number;
  sla_hours?: number | null;
  slaHours?: number | null;
  estimated_duration_min?: number | null;
  estimatedDurationMin?: number | null;
  reminder_lead_hours?: number | null;
  reminderLeadHours?: number | null;
  default_owner_role?: string | null;
  defaultOwnerRole?: string | null;
  is_auto_start_when_ready?: boolean;
  isAutoStartWhenReady?: boolean;
  orchestration_group?: string | null;
  orchestrationGroup?: string | null;
}

interface CycleTemplate {
  id: string;
  entityCode: string;
  phaseId: string;
  categoryId: string;
  taskCode: string;
  taskName: string;
  description: string | null;
  completionMode: CompletionMode;
  systemCheckHandler: string | null;
  isMandatory: boolean;
  isWaivable: boolean;
  severity: Severity | null;
  sortOrder: number;
  slaHours: number | null;
  estimatedDurationMin: number | null;
  reminderLeadHours: number | null;
  defaultOwnerRole: string | null;
  isAutoStartWhenReady: boolean;
  orchestrationGroup: string | null;
}

interface RawDependency {
  id: string;
  entity_code?: string;
  entityCode?: string;
  predecessor_template_id?: string;
  predecessorTemplateId?: string;
  successor_template_id?: string;
  successorTemplateId?: string;
  dependency_type?: DependencyType;
  dependencyType?: DependencyType;
  is_hard?: boolean;
  isHard?: boolean;
}

interface TaskDependency {
  id: string;
  entityCode: string;
  predecessorTemplateId: string;
  successorTemplateId: string;
  dependencyType: DependencyType;
  isHard: boolean;
}

interface RawCarryforwardRule {
  id: string;
  deviation_type?: DeviationType;
  deviationType?: DeviationType;
  action?: CarryforwardAction;
  max_carry_count?: number | null;
  maxCarryCount?: number | null;
  escalate_after_carries?: number | null;
  escalateAfterCarries?: number | null;
  description?: string | null;
}

interface CarryforwardRule {
  id: string;
  deviationType: DeviationType;
  action: CarryforwardAction;
  maxCarryCount: number | null;
  escalateAfterCarries: number | null;
  description: string | null;
}

interface CompanyOption {
  id: string;
  code: string;
  name: string;
  functionalCurrency: string;
  fiscalYearStartMonth: number;
}

const COMPLETION_MODES: CompletionMode[] = ["MANUAL", "SYSTEM", "HYBRID"];
const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const DEPENDENCY_TYPES: DependencyType[] = ["FINISH_TO_START", "FINISH_TO_FINISH"];
const DEVIATION_TYPES: DeviationType[] = ["EXCEPTION", "OVERRIDE", "WAIVER"];
const CARRYFORWARD_ACTIONS: CarryforwardAction[] = ["AUTO_CARRY", "FORCE_CLOSE", "EXPIRE"];

const SEVERITY_VARIANT: Record<Severity, "muted" | "warning" | "destructive" | "outline"> = {
  LOW: "muted",
  MEDIUM: "outline",
  HIGH: "warning",
  CRITICAL: "destructive",
};

function normalizeCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategory(row: RawCategory): CycleCategory {
  return {
    id: row.id,
    categoryCode: row.categoryCode ?? row.category_code ?? "",
    categoryName: row.categoryName ?? row.category_name ?? "",
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    colorCode: row.colorCode ?? row.color_code ?? null,
  };
}

function normalizeTemplate(row: RawTemplate): CycleTemplate {
  return {
    id: row.id,
    entityCode: row.entityCode ?? row.entity_code ?? "",
    phaseId: row.phaseId ?? row.phase_id ?? "",
    categoryId: row.categoryId ?? row.category_id ?? "",
    taskCode: row.taskCode ?? row.task_code ?? "",
    taskName: row.taskName ?? row.task_name ?? "",
    description: row.description ?? null,
    completionMode: row.completionMode ?? row.completion_mode ?? "MANUAL",
    systemCheckHandler: row.systemCheckHandler ?? row.system_check_handler ?? null,
    isMandatory: row.isMandatory ?? row.is_mandatory ?? true,
    isWaivable: row.isWaivable ?? row.is_waivable ?? false,
    severity: row.severity ?? null,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    slaHours: row.slaHours ?? row.sla_hours ?? null,
    estimatedDurationMin: row.estimatedDurationMin ?? row.estimated_duration_min ?? null,
    reminderLeadHours: row.reminderLeadHours ?? row.reminder_lead_hours ?? null,
    defaultOwnerRole: row.defaultOwnerRole ?? row.default_owner_role ?? null,
    isAutoStartWhenReady: row.isAutoStartWhenReady ?? row.is_auto_start_when_ready ?? false,
    orchestrationGroup: row.orchestrationGroup ?? row.orchestration_group ?? null,
  };
}

function normalizeDependency(row: RawDependency): TaskDependency {
  return {
    id: row.id,
    entityCode: row.entityCode ?? row.entity_code ?? "",
    predecessorTemplateId: row.predecessorTemplateId ?? row.predecessor_template_id ?? "",
    successorTemplateId: row.successorTemplateId ?? row.successor_template_id ?? "",
    dependencyType: row.dependencyType ?? row.dependency_type ?? "FINISH_TO_START",
    isHard: row.isHard ?? row.is_hard ?? true,
  };
}

function normalizeCarryforwardRule(row: RawCarryforwardRule): CarryforwardRule {
  return {
    id: row.id,
    deviationType: row.deviationType ?? row.deviation_type ?? "EXCEPTION",
    action: row.action ?? "AUTO_CARRY",
    maxCarryCount: row.maxCarryCount ?? row.max_carry_count ?? null,
    escalateAfterCarries: row.escalateAfterCarries ?? row.escalate_after_carries ?? null,
    description: row.description ?? null,
  };
}

async function fetchList<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const body = await res.json() as { data?: T[] };
  return body.data ?? [];
}

async function postJson(url: string, body: Record<string, unknown>) {
  return bffFetch(url, { method: "POST", body });
}

function useTypeInvalidator(typeId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["governance-cycle-type", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-phases", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-categories", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-templates", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-task-dependencies", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-carryforward-rules", typeId] });
  };
}

function categoryName(id: string, categories: CycleCategory[]) {
  return categories.find((category) => category.id === id)?.categoryName ?? "Unassigned category";
}

function templateLabel(id: string, templates: CycleTemplate[]) {
  const template = templates.find((item) => item.id === id);
  return template ? `${template.taskCode} - ${template.taskName}` : "Unknown task";
}

function SetupReadiness({
  phases,
  categories,
  templates,
  dependencies,
  carryforwardRules,
}: {
  phases: CyclePhase[];
  categories: CycleCategory[];
  templates: CycleTemplate[];
  dependencies: TaskDependency[];
  carryforwardRules: CarryforwardRule[];
}) {
  const checks = [
    { label: "Phases", ok: phases.length > 0, value: phases.length },
    { label: "Categories", ok: categories.length > 0, value: categories.length },
    { label: "Templates", ok: templates.length > 0, value: templates.length },
    { label: "Task links", ok: dependencies.length > 0, value: dependencies.length },
    { label: "Carryforward", ok: carryforwardRules.length > 0, value: carryforwardRules.length },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-5">
      {checks.map((check) => (
        <div key={check.label} className="rounded-lg border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{check.label}</span>
            {check.ok ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{check.value} configured</p>
        </div>
      ))}
    </div>
  );
}

function PhaseDialog({ typeId, open, onOpenChange }: {
  typeId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const invalidate = useTypeInvalidator(typeId);
  const [phaseCode, setPhaseCode] = useState("");
  const [phaseNameValue, setPhaseNameValue] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [minReadinessPct, setMinReadinessPct] = useState("");
  const [targetHoursFromStart, setTargetHoursFromStart] = useState("");
  const [isGateEnforced, setIsGateEnforced] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => postJson(`/api/governance/cycle-types/${typeId}/phases`, body),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      setPhaseCode("");
      setPhaseNameValue("");
      setDescription("");
      setSortOrder("10");
      setMinReadinessPct("");
      setTargetHoursFromStart("");
      setIsGateEnforced(true);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add phase"),
  });

  function submit() {
    setError(null);
    const code = normalizeCode(phaseCode);
    const order = Number(sortOrder);
    if (!code || !phaseNameValue.trim()) {
      setError("Phase code and name are required");
      return;
    }
    if (!Number.isFinite(order)) {
      setError("Sort order must be a number");
      return;
    }
    create.mutate({
      phaseCode: code,
      phaseName: phaseNameValue.trim(),
      description: description.trim() || null,
      sortOrder: order,
      isGateEnforced,
      minReadinessPct: optionalNumber(minReadinessPct),
      targetHoursFromStart: optionalNumber(targetHoursFromStart),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input value={phaseCode} onChange={(e) => setPhaseCode(normalizeCode(e.target.value))} className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={phaseNameValue} onChange={(e) => setPhaseNameValue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Readiness %</Label>
              <Input value={minReadinessPct} onChange={(e) => setMinReadinessPct(e.target.value)} type="number" min={0} max={100} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Target hours</Label>
              <Input value={targetHoursFromStart} onChange={(e) => setTargetHoursFromStart(e.target.value)} type="number" min={0} placeholder="optional" />
            </div>
          </div>
          <label className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">Gate enforced</span>
            <Switch checked={isGateEnforced} onCheckedChange={setIsGateEnforced} />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({ typeId, open, onOpenChange }: {
  typeId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const invalidate = useTypeInvalidator(typeId);
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryNameValue, setCategoryNameValue] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [colorCode, setColorCode] = useState("#3b82f6");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => postJson(`/api/governance/cycle-types/${typeId}/categories`, body),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      setCategoryCode("");
      setCategoryNameValue("");
      setSortOrder("10");
      setColorCode("#3b82f6");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add category"),
  });

  function submit() {
    setError(null);
    const code = normalizeCode(categoryCode);
    const order = Number(sortOrder);
    if (!code || !categoryNameValue.trim()) {
      setError("Category code and name are required");
      return;
    }
    create.mutate({
      categoryCode: code,
      categoryName: categoryNameValue.trim(),
      sortOrder: Number.isFinite(order) ? order : 0,
      colorCode,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input value={categoryCode} onChange={(e) => setCategoryCode(normalizeCode(e.target.value))} className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={categoryNameValue} onChange={(e) => setCategoryNameValue(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Input value={colorCode} onChange={(e) => setColorCode(e.target.value)} type="color" className="w-16 p-1" />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  typeId,
  open,
  onOpenChange,
  phases,
  categories,
  companies,
}: {
  typeId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  phases: CyclePhase[];
  categories: CycleCategory[];
  companies: CompanyOption[];
}) {
  const invalidate = useTypeInvalidator(typeId);
  const [entityCode, setEntityCode] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [taskCode, setTaskCode] = useState("");
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [completionMode, setCompletionMode] = useState<CompletionMode>("MANUAL");
  const [systemCheckHandler, setSystemCheckHandler] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [isWaivable, setIsWaivable] = useState(false);
  const [isAutoStartWhenReady, setIsAutoStartWhenReady] = useState(false);
  const [severity, setSeverity] = useState<Severity | "NONE">("MEDIUM");
  const [sortOrder, setSortOrder] = useState("10");
  const [slaHours, setSlaHours] = useState("");
  const [estimatedDurationMin, setEstimatedDurationMin] = useState("");
  const [reminderLeadHours, setReminderLeadHours] = useState("");
  const [defaultOwnerRole, setDefaultOwnerRole] = useState("");
  const [orchestrationGroup, setOrchestrationGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedEntity = entityCode || companies[0]?.code || "";
  const selectedPhase = phaseId || phases[0]?.id || "";
  const selectedCategory = categoryId || categories[0]?.id || "";

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => postJson(`/api/governance/cycle-types/${typeId}/templates`, body),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      setTaskCode("");
      setTaskName("");
      setDescription("");
      setCompletionMode("MANUAL");
      setSystemCheckHandler("");
      setIsMandatory(true);
      setIsWaivable(false);
      setIsAutoStartWhenReady(false);
      setSeverity("MEDIUM");
      setSortOrder("10");
      setSlaHours("");
      setEstimatedDurationMin("");
      setReminderLeadHours("");
      setDefaultOwnerRole("");
      setOrchestrationGroup("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add task template"),
  });

  function submit() {
    setError(null);
    const code = normalizeCode(taskCode);
    if (!selectedEntity || !selectedPhase || !selectedCategory) {
      setError("Company, phase, and category are required");
      return;
    }
    if (!code || !taskName.trim()) {
      setError("Task code and name are required");
      return;
    }
    if (completionMode !== "MANUAL" && !systemCheckHandler.trim()) {
      setError("System or hybrid tasks require a check handler");
      return;
    }
    create.mutate({
      entityCode: selectedEntity,
      phaseId: selectedPhase,
      categoryId: selectedCategory,
      taskCode: code,
      taskName: taskName.trim(),
      description: description.trim() || null,
      completionMode,
      systemCheckHandler: completionMode === "MANUAL" ? null : systemCheckHandler.trim(),
      isMandatory,
      isWaivable,
      severity: severity === "NONE" ? null : severity,
      sortOrder: Number(sortOrder) || 0,
      slaHours: optionalNumber(slaHours),
      estimatedDurationMin: optionalNumber(estimatedDurationMin),
      reminderLeadHours: optionalNumber(reminderLeadHours),
      defaultOwnerRole: defaultOwnerRole.trim() || null,
      isAutoStartWhenReady,
      orchestrationGroup: orchestrationGroup.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add Task Template</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-auto py-2 pr-1">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              {companies.length > 0 ? (
                <Select value={selectedEntity} onValueChange={setEntityCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.code}>
                        {company.code} - {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={entityCode} onChange={(e) => setEntityCode(normalizeCode(e.target.value))} className="font-mono uppercase" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phase</Label>
              <Select value={selectedPhase} onValueChange={setPhaseId} disabled={phases.length === 0}>
                <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
                <SelectContent>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>{phase.phaseName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={selectedCategory} onValueChange={setCategoryId} disabled={categories.length === 0}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.categoryName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-1">
              <Label className="text-xs">Task Code</Label>
              <Input value={taskCode} onChange={(e) => setTaskCode(normalizeCode(e.target.value))} className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Task Name</Label>
              <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={completionMode} onValueChange={(value) => setCompletionMode(value as CompletionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPLETION_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select value={severity} onValueChange={(value) => setSeverity(value as Severity | "NONE")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {SEVERITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SLA hours</Label>
              <Input value={slaHours} onChange={(e) => setSlaHours(e.target.value)} type="number" min={1} placeholder="optional" />
            </div>
          </div>
          {completionMode !== "MANUAL" && (
            <div className="space-y-1">
              <Label className="text-xs">System Check Handler</Label>
              <Input value={systemCheckHandler} onChange={(e) => setSystemCheckHandler(e.target.value)} className="font-mono" placeholder="finance.close.check_trial_balance" />
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Duration minutes</Label>
              <Input value={estimatedDurationMin} onChange={(e) => setEstimatedDurationMin(e.target.value)} type="number" min={1} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reminder lead hours</Label>
              <Input value={reminderLeadHours} onChange={(e) => setReminderLeadHours(e.target.value)} type="number" min={1} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Owner role</Label>
              <Input value={defaultOwnerRole} onChange={(e) => setDefaultOwnerRole(e.target.value)} placeholder="finance_controller" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orchestration group</Label>
            <Input value={orchestrationGroup} onChange={(e) => setOrchestrationGroup(e.target.value)} placeholder="Optional batch group" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Mandatory</span>
              <Switch checked={isMandatory} onCheckedChange={setIsMandatory} />
            </label>
            <label className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Waivable</span>
              <Switch checked={isWaivable} onCheckedChange={setIsWaivable} />
            </label>
            <label className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Auto start</span>
              <Switch checked={isAutoStartWhenReady} onCheckedChange={setIsAutoStartWhenReady} />
            </label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DependencyDialog({
  typeId,
  open,
  onOpenChange,
  templates,
  companies,
}: {
  typeId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  templates: CycleTemplate[];
  companies: CompanyOption[];
}) {
  const invalidate = useTypeInvalidator(typeId);
  const entityCodes = Array.from(new Set([...companies.map((company) => company.code), ...templates.map((template) => template.entityCode)].filter(Boolean)));
  const [entityCode, setEntityCode] = useState("");
  const [predecessorTemplateId, setPredecessorTemplateId] = useState("");
  const [successorTemplateId, setSuccessorTemplateId] = useState("");
  const [dependencyType, setDependencyType] = useState<DependencyType>("FINISH_TO_START");
  const [isHard, setIsHard] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedEntity = entityCode || entityCodes[0] || "";
  const scopedTemplates = templates.filter((template) => !selectedEntity || template.entityCode === selectedEntity);
  const selectedPredecessor = predecessorTemplateId || scopedTemplates[0]?.id || "";
  const selectedSuccessor = successorTemplateId || scopedTemplates.find((template) => template.id !== selectedPredecessor)?.id || "";

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => postJson(`/api/governance/cycle-types/${typeId}/task-dependencies`, body),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      setPredecessorTemplateId("");
      setSuccessorTemplateId("");
      setDependencyType("FINISH_TO_START");
      setIsHard(true);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add dependency"),
  });

  function submit() {
    setError(null);
    if (!selectedEntity || !selectedPredecessor || !selectedSuccessor) {
      setError("Entity and both tasks are required");
      return;
    }
    if (selectedPredecessor === selectedSuccessor) {
      setError("Predecessor and successor must be different");
      return;
    }
    create.mutate({
      entityCode: selectedEntity,
      predecessorTemplateId: selectedPredecessor,
      successorTemplateId: selectedSuccessor,
      dependencyType,
      isHard,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add Task Dependency</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Select value={selectedEntity} onValueChange={setEntityCode} disabled={entityCodes.length === 0}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {entityCodes.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dependency</Label>
              <Select value={dependencyType} onValueChange={(value) => setDependencyType(value as DependencyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPENDENCY_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Predecessor</Label>
              <Select value={selectedPredecessor} onValueChange={setPredecessorTemplateId} disabled={scopedTemplates.length < 2}>
                <SelectTrigger><SelectValue placeholder="Select task" /></SelectTrigger>
                <SelectContent>
                  {scopedTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.taskCode} - {template.taskName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Successor</Label>
              <Select value={selectedSuccessor} onValueChange={setSuccessorTemplateId} disabled={scopedTemplates.length < 2}>
                <SelectTrigger><SelectValue placeholder="Select task" /></SelectTrigger>
                <SelectContent>
                  {scopedTemplates.filter((template) => template.id !== selectedPredecessor).map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.taskCode} - {template.taskName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">Hard gate</span>
            <Switch checked={isHard} onCheckedChange={setIsHard} />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || scopedTemplates.length < 2}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CarryforwardDialog({
  typeId,
  open,
  onOpenChange,
}: {
  typeId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const invalidate = useTypeInvalidator(typeId);
  const [deviationType, setDeviationType] = useState<DeviationType>("EXCEPTION");
  const [action, setAction] = useState<CarryforwardAction>("AUTO_CARRY");
  const [maxCarryCount, setMaxCarryCount] = useState("");
  const [escalateAfterCarries, setEscalateAfterCarries] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => postJson(`/api/governance/cycle-types/${typeId}/carryforward-rules`, body),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      setDeviationType("EXCEPTION");
      setAction("AUTO_CARRY");
      setMaxCarryCount("");
      setEscalateAfterCarries("");
      setDescription("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add carryforward rule"),
  });

  function submit() {
    setError(null);
    create.mutate({
      deviationType,
      action,
      maxCarryCount: optionalNumber(maxCarryCount),
      escalateAfterCarries: optionalNumber(escalateAfterCarries),
      description: description.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Carryforward Rule</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Deviation type</Label>
              <Select value={deviationType} onValueChange={(value) => setDeviationType(value as DeviationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={(value) => setAction(value as CarryforwardAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARRYFORWARD_ACTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Max carry count</Label>
              <Input value={maxCarryCount} onChange={(e) => setMaxCarryCount(e.target.value)} type="number" min={1} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Escalate after</Label>
              <Input value={escalateAfterCarries} onChange={(e) => setEscalateAfterCarries(e.target.value)} type="number" min={1} placeholder="optional" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhasesTab({ typeId, phases }: { typeId: string; phases: CyclePhase[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Phase</Button>
      </div>
      {phases.length === 0 ? (
        <EmptyState icon={<Milestone className="h-10 w-10 text-muted-foreground/30" />} title="No phases configured." className="py-16" />
      ) : (
        <div className="space-y-2">
          {phases.map((phase) => (
            <RowCard
              key={phase.id}
              leading={<span className="block w-8 text-right font-mono text-xs text-muted-foreground">{phase.sortOrder}</span>}
              badge={<Badge variant="outline" size="sm" className="font-mono">{phase.phaseCode}</Badge>}
              title={phase.phaseName}
              metadata={
                <div className="flex flex-wrap gap-3">
                  <span>{phase.isGateEnforced ? "Gate enforced" : "Gate optional"}</span>
                  {phase.minReadinessPct !== null && <span>{phase.minReadinessPct}% readiness</span>}
                  {phase.targetHoursFromStart !== null && <span>{phase.targetHoursFromStart}h target</span>}
                  {phase.description && <span>{phase.description}</span>}
                </div>
              }
            />
          ))}
        </div>
      )}
      <PhaseDialog typeId={typeId} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CategoriesTab({ typeId, categories }: { typeId: string; categories: CycleCategory[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Category</Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState icon={<GitBranch className="h-10 w-10 text-muted-foreground/30" />} title="No categories configured." className="py-16" />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: category.colorCode ?? "transparent" } as CSSProperties}
                />
                <span className="text-sm font-medium">{category.categoryName}</span>
                <Badge variant="outline" size="sm" className="ml-auto font-mono">{category.categoryCode}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Sort {category.sortOrder}</p>
            </div>
          ))}
        </div>
      )}
      <CategoryDialog typeId={typeId} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function TemplatesTab({
  typeId,
  phases,
  categories,
  templates,
  companies,
}: {
  typeId: string;
  phases: CyclePhase[];
  categories: CycleCategory[];
  templates: CycleTemplate[];
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    return phases.map((phase) => ({
      phase,
      templates: templates
        .filter((template) => template.phaseId === phase.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.taskCode.localeCompare(b.taskCode)),
    }));
  }, [phases, templates]);
  const orphaned = templates.filter((template) => !phases.some((phase) => phase.id === template.phaseId));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} disabled={phases.length === 0 || categories.length === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Template
        </Button>
      </div>
      {templates.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-10 w-10 text-muted-foreground/30" />} title="No task templates configured." className="py-16" />
      ) : (
        <div className="space-y-4">
          {[...grouped, ...(orphaned.length ? [{ phase: null, templates: orphaned }] : [])].map((group) => (
            <div key={group.phase?.id ?? "orphaned"} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{group.phase?.phaseName ?? "Unassigned"}</span>
                <Badge variant="outline" size="sm">{group.templates.length}</Badge>
              </div>
              <div className="overflow-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Task</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Mode</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {group.templates.map((template) => (
                      <tr key={template.id}>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{template.taskCode}</span>
                            {template.isMandatory && <Badge variant="warning" size="sm">Mandatory</Badge>}
                            {template.isWaivable && <Badge variant="muted" size="sm">Waivable</Badge>}
                            {template.severity && <Badge variant={SEVERITY_VARIANT[template.severity]} size="sm">{template.severity}</Badge>}
                          </div>
                          <p className="mt-0.5 text-sm font-medium">{template.taskName}</p>
                        </td>
                        <td className="px-3 py-2 font-mono">{template.entityCode}</td>
                        <td className="px-3 py-2">{categoryName(template.categoryId, categories)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" size="sm">{template.completionMode}</Badge>
                        </td>
                        <td className="px-3 py-2">{template.defaultOwnerRole ?? "Unassigned"}</td>
                        <td className="px-3 py-2">{template.slaHours ? `${template.slaHours}h` : "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <TemplateDialog
        typeId={typeId}
        open={open}
        onOpenChange={setOpen}
        phases={phases}
        categories={categories}
        companies={companies}
      />
    </div>
  );
}

function DependenciesTab({
  typeId,
  dependencies,
  templates,
  companies,
}: {
  typeId: string;
  dependencies: TaskDependency[];
  templates: CycleTemplate[];
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} disabled={templates.length < 2}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Dependency
        </Button>
      </div>
      {dependencies.length === 0 ? (
        <EmptyState icon={<Link2 className="h-10 w-10 text-muted-foreground/30" />} title="No task dependencies configured." className="py-16" />
      ) : (
        <div className="space-y-2">
          {dependencies.map((dependency) => (
            <RowCard
              key={dependency.id}
              leading={<Link2 className="mt-0.5 h-4 w-4 text-muted-foreground" />}
              badge={<Badge variant={dependency.isHard ? "warning" : "muted"} size="sm">{dependency.isHard ? "Hard" : "Soft"}</Badge>}
              title={
                <span>
                  {templateLabel(dependency.predecessorTemplateId, templates)}
                  <span className="mx-2 text-muted-foreground">then</span>
                  {templateLabel(dependency.successorTemplateId, templates)}
                </span>
              }
              metadata={<span>{dependency.entityCode} - {dependency.dependencyType}</span>}
            />
          ))}
        </div>
      )}
      <DependencyDialog typeId={typeId} open={open} onOpenChange={setOpen} templates={templates} companies={companies} />
    </div>
  );
}

function CarryforwardTab({ typeId, rules }: { typeId: string; rules: CarryforwardRule[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <EmptyState icon={<TimerReset className="h-10 w-10 text-muted-foreground/30" />} title="No carryforward rules configured." className="py-16" />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" size="sm">{rule.deviationType}</Badge>
                <span className="text-sm font-medium">{rule.action}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Max carry: {rule.maxCarryCount ?? "none"}</span>
                <span>Escalate: {rule.escalateAfterCarries ?? "none"}</span>
              </div>
              {rule.description && <p className="mt-2 text-xs text-muted-foreground">{rule.description}</p>}
            </div>
          ))}
        </div>
      )}
      <CarryforwardDialog typeId={typeId} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function OverviewTab({
  cycleType,
  phases,
  categories,
  templates,
  dependencies,
  carryforwardRules,
}: {
  cycleType: CycleType | null;
  phases: CyclePhase[];
  categories: CycleCategory[];
  templates: CycleTemplate[];
  dependencies: TaskDependency[];
  carryforwardRules: CarryforwardRule[];
}) {
  const firstPhase = phases[0];
  const finalPhase = phases[phases.length - 1];
  const companyCodes = Array.from(new Set(templates.map((template) => template.entityCode).filter(Boolean)));

  return (
    <div className="space-y-4">
      <SetupReadiness
        phases={phases}
        categories={categories}
        templates={templates}
        dependencies={dependencies}
        carryforwardRules={carryforwardRules}
      />
      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Fiscal close path</span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            {[
              { label: "Period", value: "Open / soft close / hard close" },
              { label: "Book", value: "Per-book posting gate" },
              { label: "Cycle", value: cycleType?.typeCode ?? "Cycle type" },
              { label: "Evidence", value: "Tasks, deviations, certification" },
            ].map((item) => (
              <div key={item.label} className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-medium">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Template scope</span>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Companies</span>
              <span className="font-medium">{companyCodes.length ? companyCodes.join(", ") : "None"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">First phase</span>
              <span className="font-medium">{firstPhase?.phaseName ?? "None"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Final phase</span>
              <span className="font-medium">{finalPhase?.phaseName ?? "None"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Mandatory tasks</span>
              <span className="font-medium">{templates.filter((template) => template.isMandatory).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GovernanceCycleTypeDetailPage() {
  const params = useParams<{ id: string }>();
  const typeId = params.id;
  const qc = useQueryClient();

  const { data: allTypesData, isLoading: typeLoading } = useQuery<{ data: CycleType[] }>({
    queryKey: ["governance-cycle-type", typeId],
    queryFn: async () => {
      const res = await fetch("/api/governance/cycle-types?limit=200&isActive=true");
      if (!res.ok) throw new Error("Failed to load cycle type");
      return res.json() as Promise<{ data: CycleType[] }>;
    },
    staleTime: 60_000,
  });

  const { data: phases = [], isLoading: phasesLoading } = useQuery<CyclePhase[]>({
    queryKey: ["governance-phases", typeId],
    queryFn: () => fetchList<CyclePhase>(`/api/governance/cycle-types/${typeId}/phases`),
    staleTime: 30_000,
  });

  const { data: rawCategories = [], isLoading: categoriesLoading } = useQuery<RawCategory[]>({
    queryKey: ["governance-categories", typeId],
    queryFn: () => fetchList<RawCategory>(`/api/governance/cycle-types/${typeId}/categories`),
    staleTime: 30_000,
  });

  const { data: rawTemplates = [], isLoading: templatesLoading } = useQuery<RawTemplate[]>({
    queryKey: ["governance-templates", typeId],
    queryFn: () => fetchList<RawTemplate>(`/api/governance/cycle-types/${typeId}/templates`),
    staleTime: 30_000,
  });

  const { data: rawDependencies = [], isLoading: dependenciesLoading } = useQuery<RawDependency[]>({
    queryKey: ["governance-task-dependencies", typeId],
    queryFn: () => fetchList<RawDependency>(`/api/governance/cycle-types/${typeId}/task-dependencies`),
    staleTime: 30_000,
  });

  const { data: rawCarryforwardRules = [], isLoading: carryforwardLoading } = useQuery<RawCarryforwardRule[]>({
    queryKey: ["governance-carryforward-rules", typeId],
    queryFn: () => fetchList<RawCarryforwardRule>(`/api/governance/cycle-types/${typeId}/carryforward-rules`),
    staleTime: 30_000,
  });

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ["finance-master-companies"],
    queryFn: async () => {
      const res = await fetch("/api/finance/master/companies");
      if (!res.ok) return [];
      return res.json() as Promise<CompanyOption[]>;
    },
    staleTime: 120_000,
  });

  const cycleType = allTypesData?.data.find((item) => item.id === typeId) ?? null;
  const categories = useMemo(() => rawCategories.map(normalizeCategory), [rawCategories]);
  const templates = useMemo(() => rawTemplates.map(normalizeTemplate), [rawTemplates]);
  const dependencies = useMemo(() => rawDependencies.map(normalizeDependency), [rawDependencies]);
  const carryforwardRules = useMemo(() => rawCarryforwardRules.map(normalizeCarryforwardRule), [rawCarryforwardRules]);
  const isLoading = typeLoading || phasesLoading || categoriesLoading || templatesLoading || dependenciesLoading || carryforwardLoading;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["governance-cycle-type", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-phases", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-categories", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-templates", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-task-dependencies", typeId] });
    void qc.invalidateQueries({ queryKey: ["governance-carryforward-rules", typeId] });
  }

  return (
    <PageFrame
      width="full"
      title={cycleType?.typeName ?? "Cycle Type"}
      description={cycleType ? `${cycleType.typeCode} - ${cycleType.domain} - ${cycleType.frequency}` : "Governance model setup"}
      actions={
        <div className="flex items-center gap-2">
          {cycleType && <Badge variant={cycleType.isActive ? "success" : "muted"}>{cycleType.isActive ? "Active" : "Inactive"}</Badge>}
          <Button variant="ghost" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/setup/governance">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="overview"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="phases"><Milestone className="mr-1.5 h-3.5 w-3.5" />Phases</TabsTrigger>
            <TabsTrigger value="categories"><Split className="mr-1.5 h-3.5 w-3.5" />Categories</TabsTrigger>
            <TabsTrigger value="templates"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Templates</TabsTrigger>
            <TabsTrigger value="dependencies"><Link2 className="mr-1.5 h-3.5 w-3.5" />Dependencies</TabsTrigger>
            <TabsTrigger value="carryforward"><TimerReset className="mr-1.5 h-3.5 w-3.5" />Carryforward</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              cycleType={cycleType}
              phases={phases}
              categories={categories}
              templates={templates}
              dependencies={dependencies}
              carryforwardRules={carryforwardRules}
            />
          </TabsContent>
          <TabsContent value="phases">
            <PhasesTab typeId={typeId} phases={phases} />
          </TabsContent>
          <TabsContent value="categories">
            <CategoriesTab typeId={typeId} categories={categories} />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab
              typeId={typeId}
              phases={phases}
              categories={categories}
              templates={templates}
              companies={companies}
            />
          </TabsContent>
          <TabsContent value="dependencies">
            <DependenciesTab
              typeId={typeId}
              dependencies={dependencies}
              templates={templates}
              companies={companies}
            />
          </TabsContent>
          <TabsContent value="carryforward">
            <CarryforwardTab typeId={typeId} rules={carryforwardRules} />
          </TabsContent>
        </Tabs>
      )}
    </PageFrame>
  );
}
