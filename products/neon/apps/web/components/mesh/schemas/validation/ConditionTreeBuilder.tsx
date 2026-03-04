"use client";

import { Plus, Trash2, GitBranchPlus } from "lucide-react";
import { useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────

interface ConditionLeaf {
  field: string;
  operator: string;
  value: unknown;
}

interface ConditionGroup {
  operator?: "and" | "or";
  conditions: Array<ConditionLeaf | ConditionGroup>;
}

interface ConditionTreeBuilderProps {
  value: ConditionGroup;
  onChange: (value: ConditionGroup) => void;
  /** Available field paths from entity schema */
  fields?: string[];
  /** Maximum nesting depth (default: 3) */
  maxDepth?: number;
  /** Current depth (internal, do not set externally) */
  _depth?: number;
}

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "ne", label: "not equals" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "matches", label: "matches" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "not exists" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
  { value: "between", label: "between" },
  { value: "date_before", label: "date before" },
  { value: "date_after", label: "date after" },
] as const;

const NO_VALUE_OPERATORS = new Set([
  "exists",
  "not_exists",
  "empty",
  "not_empty",
]);

// ─── Type Guard ──────────────────────────────────────────────

function isGroup(node: ConditionLeaf | ConditionGroup): node is ConditionGroup {
  return (
    "conditions" in node && Array.isArray((node as ConditionGroup).conditions)
  );
}

// ─── Component ───────────────────────────────────────────────

export function ConditionTreeBuilder({
  value,
  onChange,
  fields,
  maxDepth = 3,
  _depth = 0,
}: ConditionTreeBuilderProps) {
  const canNest = _depth < maxDepth;

  const updateCondition = useCallback(
    (index: number, updated: ConditionLeaf | ConditionGroup) => {
      const newConditions = [...value.conditions];
      newConditions[index] = updated;
      onChange({ ...value, conditions: newConditions });
    },
    [value, onChange],
  );

  const removeCondition = useCallback(
    (index: number) => {
      const newConditions = value.conditions.filter((_, i) => i !== index);
      onChange({ ...value, conditions: newConditions });
    },
    [value, onChange],
  );

  const addLeaf = useCallback(() => {
    const newLeaf: ConditionLeaf = { field: "", operator: "eq", value: "" };
    onChange({ ...value, conditions: [...value.conditions, newLeaf] });
  }, [value, onChange]);

  const addGroup = useCallback(() => {
    const newGroup: ConditionGroup = {
      operator: "and",
      conditions: [{ field: "", operator: "eq", value: "" }],
    };
    onChange({ ...value, conditions: [...value.conditions, newGroup] });
  }, [value, onChange]);

  const toggleOperator = useCallback(() => {
    onChange({ ...value, operator: value.operator === "or" ? "and" : "or" });
  }, [value, onChange]);

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      {/* Group header */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="cursor-pointer select-none uppercase text-xs"
          onClick={toggleOperator}
        >
          {value.operator ?? "and"}
        </Badge>
        <span className="text-xs text-muted-foreground">Click to toggle</span>
      </div>

      {/* Condition rows */}
      {value.conditions.map((condition, index) => (
        <div key={index}>
          {isGroup(condition) ? (
            <div className="ml-4">
              <ConditionTreeBuilder
                value={condition}
                onChange={(updated) => updateCondition(index, updated)}
                fields={fields}
                maxDepth={maxDepth}
                _depth={_depth + 1}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-destructive"
                onClick={() => removeCondition(index)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove Group
              </Button>
            </div>
          ) : (
            <ConditionRow
              condition={condition}
              fields={fields}
              onChange={(updated) => updateCondition(index, updated)}
              onRemove={() => removeCondition(index)}
            />
          )}
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addLeaf}>
          <Plus className="mr-1 h-3 w-3" />
          Add Condition
        </Button>
        {canNest && (
          <Button variant="outline" size="sm" onClick={addGroup}>
            <GitBranchPlus className="mr-1 h-3 w-3" />
            Add Group
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Condition Row ───────────────────────────────────────────

interface ConditionRowProps {
  condition: ConditionLeaf;
  fields?: string[];
  onChange: (updated: ConditionLeaf) => void;
  onRemove: () => void;
}

function ConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const showValue = !NO_VALUE_OPERATORS.has(condition.operator);

  return (
    <div className="flex items-center gap-2">
      {/* Field */}
      {fields && fields.length > 0 ? (
        <Select
          value={condition.field}
          onValueChange={(v) => onChange({ ...condition, field: v })}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Field…" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f} value={f} className="text-xs">
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={condition.field}
          onChange={(e) => onChange({ ...condition, field: e.target.value })}
          placeholder="field_path"
          className="w-[160px] h-8 text-xs"
        />
      )}

      {/* Operator */}
      <Select
        value={condition.operator}
        onValueChange={(v) => onChange({ ...condition, operator: v })}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      {showValue && (
        <Input
          value={String(condition.value ?? "")}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="value"
          className="flex-1 h-8 text-xs"
        />
      )}

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
