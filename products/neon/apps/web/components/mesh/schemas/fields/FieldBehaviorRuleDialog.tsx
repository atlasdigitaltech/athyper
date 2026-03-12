"use client";

import { HelpCircle, LayoutTemplate } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConditionTreeBuilder } from "../validation/ConditionTreeBuilder";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  ConditionGroup,
  EditabilityContext,
  EditabilityRule,
  EditabilityState,
  VisibilityContext,
  VisibilityRule,
  VisibilityState,
} from "@/lib/schema-manager/types";

// ─── Constants ──────────────────────────────────────────────

const VISIBILITY_STATES: { value: VisibilityState; label: string; desc: string }[] = [
  { value: "visible", label: "Visible", desc: "Field is shown to the user" },
  { value: "hidden", label: "Hidden", desc: "Field is hidden from the user but still exists" },
  { value: "internal", label: "Internal", desc: "System-only field, never shown in UI" },
];

const EDITABILITY_STATES: { value: EditabilityState; label: string; desc: string }[] = [
  { value: "editable", label: "Editable", desc: "User can modify this field" },
  { value: "read_only", label: "Read-only", desc: "Field is visible but cannot be changed" },
  { value: "system_managed", label: "System Managed", desc: "Managed by system logic, user cannot edit" },
  { value: "computed", label: "Computed", desc: "Derived value, calculated automatically" },
];

const VISIBILITY_CONTEXTS: { value: VisibilityContext; label: string }[] = [
  { value: "create", label: "Create" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

const EDITABILITY_CONTEXTS: { value: EditabilityContext; label: string }[] = [
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
];

// ─── Rule Templates ─────────────────────────────────────────

interface RuleTemplate {
  name: string;
  desc: string;
  mode: "visibility" | "editability" | "both";
  condition: ConditionGroup;
  thenVisibility?: VisibilityState;
  thenEditability?: EditabilityState;
  contexts: string[];
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    name: "Lock after approval",
    desc: "Make field read-only when status is approved",
    mode: "editability",
    condition: {
      operator: "and",
      conditions: [{ field: "status", operator: "eq", value: "approved" }],
    },
    thenEditability: "read_only",
    contexts: ["edit"],
  },
  {
    name: "Hide when inactive",
    desc: "Hide field when the record is inactive",
    mode: "visibility",
    condition: {
      operator: "and",
      conditions: [{ field: "is_active", operator: "eq", value: "false" }],
    },
    thenVisibility: "hidden",
    contexts: ["view", "edit"],
  },
  {
    name: "Read-only when closed",
    desc: "Prevent edits after record is closed",
    mode: "editability",
    condition: {
      operator: "and",
      conditions: [{ field: "status", operator: "eq", value: "closed" }],
    },
    thenEditability: "read_only",
    contexts: ["edit"],
  },
  {
    name: "Show only on create",
    desc: "Visible during creation, hidden after",
    mode: "visibility",
    condition: {
      operator: "and",
      conditions: [{ field: "id", operator: "not_empty", value: "" }],
    },
    thenVisibility: "hidden",
    contexts: ["view", "edit"],
  },
  {
    name: "Lock after submission",
    desc: "Make field read-only once submitted",
    mode: "editability",
    condition: {
      operator: "and",
      conditions: [
        { field: "status", operator: "in", value: "submitted,approved,closed" },
      ],
    },
    thenEditability: "read_only",
    contexts: ["edit"],
  },
  {
    name: "Hide internal from view",
    desc: "Mark as internal when viewing completed records",
    mode: "visibility",
    condition: {
      operator: "and",
      conditions: [{ field: "status", operator: "eq", value: "completed" }],
    },
    thenVisibility: "internal",
    contexts: ["view"],
  },
];

// ─── Types ──────────────────────────────────────────────────

export type BehaviorMode = "visibility" | "editability";

interface FieldBehaviorRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: BehaviorMode;
  /** Available field names for the condition builder */
  fields?: string[];
  /** Existing rule to edit (null = create new) */
  rule: VisibilityRule | EditabilityRule | null;
  /** Existing rule count (for default priority) */
  ruleCount: number;
  onSubmit: (rule: VisibilityRule | EditabilityRule) => void;
}

const EMPTY_CONDITION: ConditionGroup = {
  operator: "and",
  conditions: [{ field: "", operator: "eq", value: "" }],
};

// ─── Component ──────────────────────────────────────────────

export function FieldBehaviorRuleDialog({
  open,
  onOpenChange,
  mode,
  fields,
  rule,
  ruleCount,
  onSubmit,
}: FieldBehaviorRuleDialogProps) {
  const isEditing = rule !== null;
  const isVisibility = mode === "visibility";

  const states = isVisibility ? VISIBILITY_STATES : EDITABILITY_STATES;
  const contexts = isVisibility ? VISIBILITY_CONTEXTS : EDITABILITY_CONTEXTS;

  // ── Local form state ────────────────────────────────────
  const [name, setName] = useState("");
  const [thenState, setThenState] = useState<string>(
    isVisibility ? "hidden" : "read_only",
  );
  const [selectedContexts, setSelectedContexts] = useState<string[]>(
    contexts.map((c) => c.value),
  );
  const [priority, setPriority] = useState(0);
  const [condition, setCondition] =
    useState<ConditionGroup>(EMPTY_CONDITION);
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Available templates for this mode ───────────────────
  const availableTemplates = useMemo(
    () =>
      RULE_TEMPLATES.filter(
        (t) => t.mode === mode || t.mode === "both",
      ),
    [mode],
  );

  // ── Reset on open / rule change ─────────────────────────
  useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setThenState(rule.then);
      setSelectedContexts([...rule.contexts]);
      setPriority(rule.priority);
      setCondition(rule.when);
    } else {
      setName("");
      setThenState(isVisibility ? "hidden" : "read_only");
      setSelectedContexts(contexts.map((c) => c.value));
      setPriority(ruleCount + 1);
      setCondition({
        ...EMPTY_CONDITION,
        conditions: [{ field: "", operator: "eq", value: "" }],
      });
    }
    setShowTemplates(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id]);

  // ── Apply template ─────────────────────────────────────
  const applyTemplate = (template: RuleTemplate) => {
    setName(template.name);
    setCondition(template.condition);
    setSelectedContexts(template.contexts);
    if (isVisibility && template.thenVisibility) {
      setThenState(template.thenVisibility);
    } else if (!isVisibility && template.thenEditability) {
      setThenState(template.thenEditability);
    }
    setShowTemplates(false);
  };

  // ── Validation ──────────────────────────────────────────
  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (selectedContexts.length === 0) return false;
    const hasCondition = condition.conditions.some((c) => {
      if ("conditions" in c) return true;
      return (c as { field: string }).field.trim() !== "";
    });
    return hasCondition;
  }, [name, selectedContexts, condition]);

  // ── Context toggle ──────────────────────────────────────
  const toggleContext = (ctx: string) => {
    setSelectedContexts((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx],
    );
  };

  // ── Submit ──────────────────────────────────────────────
  const handleSubmit = () => {
    const base = {
      id: rule?.id ?? crypto.randomUUID(),
      name: name.trim(),
      when: condition,
      then: thenState,
      contexts: selectedContexts,
      priority,
    };

    onSubmit(base as VisibilityRule | EditabilityRule);
    onOpenChange(false);
  };

  const title = isEditing
    ? `Edit ${isVisibility ? "Visibility" : "Editability"} Rule`
    : `Add ${isVisibility ? "Visibility" : "Editability"} Rule`;

  const description = isVisibility
    ? "Define when this field should change visibility based on other field values."
    : "Define when this field should change editability based on other field values.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <TooltipProvider delayDuration={300}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Template picker (only for new rules) */}
            {!isEditing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={showTemplates ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowTemplates(!showTemplates)}
                  >
                    <LayoutTemplate className="size-3" />
                    {showTemplates ? "Hide Templates" : "Start from Template"}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Pre-built patterns to get started quickly
                  </span>
                </div>

                {showTemplates && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableTemplates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className="flex flex-col gap-0.5 rounded-md border p-2.5 text-left text-xs hover:bg-accent hover:border-accent-foreground/20 transition-colors"
                      >
                        <span className="font-medium">{template.name}</span>
                        <span className="text-muted-foreground">
                          {template.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <Separator />
              </div>
            )}

            {/* Rule Name */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs max-w-[200px]">
                    A short, descriptive name for this rule. Shown in the rule list and audit logs.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isVisibility
                    ? "e.g. Hide when status is approved"
                    : "e.g. Lock after submission"
                }
              />
            </div>

            {/* When (Condition) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>When (Condition)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs max-w-[220px]">
                    The condition that triggers this rule. When all conditions match, the &quot;Then&quot; state is applied. Use AND/OR to combine multiple conditions.
                  </TooltipContent>
                </Tooltip>
              </div>
              <ConditionTreeBuilder
                value={condition}
                onChange={setCondition}
                fields={fields}
                maxDepth={3}
              />
            </div>

            {/* Then (Effect) + Priority */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label>Then (Set State To)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs max-w-[200px]">
                      {isVisibility
                        ? "The visibility state to apply when the condition matches."
                        : "The editability state to apply when the condition matches."}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select value={thenState} onValueChange={setThenState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <span>{s.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            — {s.desc}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="rule-priority">Priority</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs max-w-[200px]">
                      Higher priority rules win when multiple rules match. You can also drag-to-reorder rules in the list to adjust priority.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="rule-priority"
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
                <p className="text-[10px] text-muted-foreground">
                  Higher priority rules override lower ones.
                </p>
              </div>
            </div>

            {/* Applies To (Contexts) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Applies To</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs max-w-[200px]">
                    Select which form modes this rule should affect. Unselected modes keep their default behavior.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-3">
                {contexts.map((ctx) => (
                  <label
                    key={ctx.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedContexts.includes(ctx.value)}
                      onCheckedChange={() => toggleContext(ctx.value)}
                    />
                    <Badge
                      variant={
                        selectedContexts.includes(ctx.value)
                          ? "default"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {ctx.label}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid}>
              {isEditing ? "Update Rule" : "Add Rule"}
            </Button>
          </DialogFooter>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
