"use client";

import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { FieldBehaviorRuleDialog } from "./FieldBehaviorRuleDialog";

import type { BehaviorMode } from "./FieldBehaviorRuleDialog";
import type {
  ConditionGroup,
  ConditionLeaf,
  EditabilityRule,
  VisibilityRule,
} from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

type AnyRule = VisibilityRule | EditabilityRule;

type FieldBehaviorRuleListProps =
  | {
      mode: "visibility";
      rules: VisibilityRule[];
      onChange: (rules: VisibilityRule[]) => void;
      fields?: string[];
    }
  | {
      mode: "editability";
      rules: EditabilityRule[];
      onChange: (rules: EditabilityRule[]) => void;
      fields?: string[];
    };

// ─── Helpers ────────────────────────────────────────────────

function isLeaf(node: unknown): node is ConditionLeaf {
  return (
    typeof node === "object" &&
    node !== null &&
    "field" in node &&
    !("conditions" in node)
  );
}

/** Produce a human-readable summary of a condition group */
function summarizeCondition(group: ConditionGroup, maxItems = 2): string {
  const parts: string[] = [];
  for (const c of group.conditions) {
    if (isLeaf(c)) {
      const val =
        c.value !== undefined && c.value !== "" ? ` ${c.value}` : "";
      parts.push(`${c.field} ${c.operator}${val}`);
    } else {
      parts.push(`(${summarizeCondition(c as ConditionGroup, 1)})`);
    }
  }
  const op = ` ${(group.operator ?? "and").toUpperCase()} `;
  if (parts.length <= maxItems) return parts.join(op);
  return (
    parts.slice(0, maxItems).join(op) + ` +${parts.length - maxItems} more`
  );
}

const THEN_LABELS: Record<string, string> = {
  visible: "Visible",
  hidden: "Hidden",
  internal: "Internal",
  editable: "Editable",
  read_only: "Read-only",
  system_managed: "System Managed",
  computed: "Computed",
};

const THEN_COLORS: Record<string, string> = {
  visible: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  hidden: "bg-red-500/10 text-red-600 border-red-500/20",
  internal: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  editable: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  read_only: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  system_managed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  computed: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

const CTX_COLORS: Record<string, string> = {
  create: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  view: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  edit: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

// ─── Component ──────────────────────────────────────────────

export function FieldBehaviorRuleList({
  mode,
  rules,
  onChange,
  fields,
}: FieldBehaviorRuleListProps) {
  const [expanded, setExpanded] = useState(rules.length > 0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AnyRule | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort rules by priority (desc) for display; drag reorder updates priority
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  const handleAdd = useCallback(() => {
    setEditingRule(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((rule: AnyRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    (ruleId: string) => {
      (onChange as (rules: AnyRule[]) => void)(
        rules.filter((r) => r.id !== ruleId),
      );
    },
    [rules, onChange],
  );

  const handleDuplicate = useCallback(
    (rule: AnyRule) => {
      const dup = {
        ...rule,
        id: crypto.randomUUID(),
        name: `${rule.name} (copy)`,
        priority: rule.priority - 1,
      };
      (onChange as (rules: AnyRule[]) => void)([...rules, dup]);
    },
    [rules, onChange],
  );

  const handleSubmit = useCallback(
    (rule: AnyRule) => {
      const idx = rules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        const updated = [...rules];
        updated[idx] = rule;
        (onChange as (rules: AnyRule[]) => void)(updated);
      } else {
        (onChange as (rules: AnyRule[]) => void)([...rules, rule]);
      }
    },
    [rules, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIdx = sortedRules.findIndex((r) => r.id === active.id);
      const newIdx = sortedRules.findIndex((r) => r.id === over.id);
      const reordered = arrayMove(sortedRules, oldIdx, newIdx);

      // Re-assign priorities based on new position (top = highest)
      const updated = reordered.map((r, i) => ({
        ...r,
        priority: reordered.length - i,
      }));

      (onChange as (rules: AnyRule[]) => void)(updated);
    },
    [sortedRules, onChange],
  );

  const label = mode === "visibility" ? "Visibility" : "Editability";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-2">
        {/* Collapsible header */}
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Conditional {label} Rules
          {rules.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0"
            >
              {rules.length}
            </Badge>
          )}
        </button>

        {expanded && (
          <div className="space-y-2 pl-1">
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No conditional rules. The static defaults above always apply.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedRules.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {sortedRules.map((rule) => (
                      <SortableRuleRow
                        key={rule.id}
                        rule={rule}
                        onEdit={() => handleEdit(rule)}
                        onDelete={() => handleDelete(rule.id)}
                        onDuplicate={() => handleDuplicate(rule)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAdd}
            >
              <Plus className="mr-1 size-3" />
              Add Rule
            </Button>
          </div>
        )}

        <FieldBehaviorRuleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={mode}
          fields={fields}
          rule={editingRule}
          ruleCount={rules.length}
          onSubmit={handleSubmit}
        />
      </div>
    </TooltipProvider>
  );
}

// ─── Sortable Rule Row ──────────────────────────────────────

function SortableRuleRow({
  rule,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  rule: AnyRule;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs transition-colors",
        isDragging && "opacity-50 shadow-lg ring-2 ring-ring",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      {/* Priority badge */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 shrink-0 font-mono tabular-nums"
          >
            P{rule.priority}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Priority {rule.priority} — higher wins. Drag to reorder.
        </TooltipContent>
      </Tooltip>

      {/* Name */}
      <span
        className="font-medium truncate min-w-0 flex-shrink"
        title={rule.name}
      >
        {rule.name}
      </span>

      {/* Condition summary */}
      <span
        className="text-muted-foreground truncate min-w-0 flex-1 font-mono"
        title={summarizeCondition(rule.when)}
      >
        {summarizeCondition(rule.when)}
      </span>

      {/* Effect badge */}
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 shrink-0 border",
          THEN_COLORS[rule.then],
        )}
      >
        {THEN_LABELS[rule.then] ?? rule.then}
      </Badge>

      {/* Context badges */}
      {rule.contexts.map((ctx) => (
        <Badge
          key={ctx}
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 shrink-0 border",
            CTX_COLORS[ctx],
          )}
        >
          {ctx}
        </Badge>
      ))}

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onDuplicate}
            >
              <Copy className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Duplicate rule
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onEdit}
            >
              <Pencil className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Edit rule
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Delete rule
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
