"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PolicyConditionBuilder } from "./PolicyConditionBuilder";
import { ScopePicker } from "./ScopePicker";
import { SubjectKeyPicker } from "./SubjectKeyPicker";

import type { PolicyConditions } from "./PolicyConditionBuilder";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

export interface RuleFormData {
  subjectType: "kc_role" | "kc_group" | "user" | "service";
  subjectKey: string;
  effect: "allow" | "deny";
  operations: string[];
  scopeType: string;
  scopeKey: string;
  priority: number;
  conditions: PolicyConditions;
  isActive: boolean;
}

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: Partial<RuleFormData> | null;
  onSubmit: (data: RuleFormData) => void;
  loading?: boolean;
}

// ─── Constants ───────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: "kc_role", label: "Keycloak Role" },
  { value: "kc_group", label: "Keycloak Group" },
  { value: "user", label: "User" },
  { value: "service", label: "Service" },
] as const;

const OPERATION_GROUPS = [
  {
    label: "Entity",
    operations: [
      "ENTITY.READ",
      "ENTITY.CREATE",
      "ENTITY.UPDATE",
      "ENTITY.DELETE",
      "ENTITY.LIST",
      "ENTITY.EXPORT",
    ],
  },
  {
    label: "Workflow",
    operations: [
      "WORKFLOW.SUBMIT",
      "WORKFLOW.APPROVE",
      "WORKFLOW.REJECT",
      "WORKFLOW.CANCEL",
      "WORKFLOW.ESCALATE",
    ],
  },
  {
    label: "Delegation",
    operations: ["DELEGATION.DELEGATE", "DELEGATION.REVOKE"],
  },
  {
    label: "Collaboration",
    operations: ["COLLAB.COMMENT", "COLLAB.SHARE", "COLLAB.ASSIGN"],
  },
  {
    label: "Utility",
    operations: ["UTIL.IMPORT", "UTIL.BULK_UPDATE", "UTIL.AUDIT_VIEW"],
  },
] as const;

const DEFAULT_FORM: RuleFormData = {
  subjectType: "kc_role",
  subjectKey: "",
  effect: "allow",
  operations: [],
  scopeType: "global",
  scopeKey: "",
  priority: 100,
  conditions: null,
  isActive: true,
};

// ─── Helpers ─────────────────────────────────────────────────

function parseConditions(raw: unknown): PolicyConditions {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as ConditionGroup)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as ConditionGroup;
  return null;
}

// ─── Component ───────────────────────────────────────────────

export function RuleFormDialog({
  open,
  onOpenChange,
  rule,
  onSubmit,
  loading,
}: RuleFormDialogProps) {
  const [form, setForm] = useState<RuleFormData>(DEFAULT_FORM);

  useEffect(() => {
    if (open) {
      if (rule) {
        setForm({
          subjectType: rule.subjectType ?? "kc_role",
          subjectKey: rule.subjectKey ?? "",
          effect: rule.effect ?? "allow",
          operations: rule.operations ?? [],
          scopeType: rule.scopeType ?? "global",
          scopeKey: rule.scopeKey ?? "",
          priority: rule.priority ?? 100,
          conditions: parseConditions(rule.conditions),
          isActive: rule.isActive ?? true,
        });
      } else {
        setForm(DEFAULT_FORM);
      }
    }
  }, [open, rule]);

  const handleSubmit = useCallback(() => {
    if (!form.subjectKey.trim() || form.operations.length === 0) return;
    onSubmit(form);
  }, [form, onSubmit]);

  const toggleOperation = useCallback((op: string) => {
    setForm((prev) => ({
      ...prev,
      operations: prev.operations.includes(op)
        ? prev.operations.filter((o) => o !== op)
        : [...prev.operations, op],
    }));
  }, []);

  const removeOperation = useCallback((op: string) => {
    setForm((prev) => ({
      ...prev,
      operations: prev.operations.filter((o) => o !== op),
    }));
  }, []);

  const isEditing = !!rule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Subject Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Subject Type</label>
            <div className="flex gap-1.5">
              {SUBJECT_TYPES.map((st) => (
                <Button
                  key={st.value}
                  variant={
                    form.subjectType === st.value ? "default" : "outline"
                  }
                  size="sm"
                  className="text-xs"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, subjectType: st.value }))
                  }
                >
                  {st.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Subject Key (searchable picker) */}
          <SubjectKeyPicker
            subjectType={form.subjectType}
            value={form.subjectKey}
            onChange={(v) => setForm((prev) => ({ ...prev, subjectKey: v }))}
          />

          {/* Effect */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Effect</label>
            <div className="flex gap-2">
              <Button
                variant={form.effect === "allow" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  setForm((prev) => ({ ...prev, effect: "allow" }))
                }
              >
                Allow
              </Button>
              <Button
                variant={form.effect === "deny" ? "destructive" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setForm((prev) => ({ ...prev, effect: "deny" }))}
              >
                Deny
              </Button>
            </div>
          </div>

          {/* Operations (multi-select with grouped popover) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Operations</label>
            <OperationsMultiSelect
              selected={form.operations}
              onToggle={toggleOperation}
            />
            {form.operations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.operations.map((op) => (
                  <Badge
                    key={op}
                    variant="secondary"
                    className="text-xs font-mono gap-1"
                  >
                    {op}
                    <button
                      type="button"
                      title={`Remove ${op}`}
                      onClick={() => removeOperation(op)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Scope (type + key picker) */}
          <ScopePicker
            scopeType={form.scopeType}
            scopeKey={form.scopeKey}
            onScopeTypeChange={(v) =>
              setForm((prev) => ({ ...prev, scopeType: v }))
            }
            onScopeKeyChange={(v) =>
              setForm((prev) => ({ ...prev, scopeKey: v }))
            }
          />

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Priority</label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  priority: parseInt(e.target.value) || 0,
                }))
              }
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Lower number = higher priority. Default: 100.
            </p>
          </div>

          {/* Conditions (ABAC visual builder) */}
          <PolicyConditionBuilder
            value={form.conditions}
            onChange={(v) => setForm((prev) => ({ ...prev, conditions: v }))}
          />

          {/* Active */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isActive: e.target.checked }))
              }
              className="rounded border-input"
            />
            Rule is active
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading || !form.subjectKey.trim() || form.operations.length === 0
            }
            className="gap-1.5"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {isEditing ? "Update Rule" : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Operations Multi-Select ─────────────────────────────────

function OperationsMultiSelect({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (op: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-xs font-normal"
        >
          {selected.length === 0
            ? "Select operations..."
            : `${selected.length} operation${selected.length === 1 ? "" : "s"} selected`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search operations..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No operations found.</CommandEmpty>
            {OPERATION_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.operations.map((op) => (
                  <CommandItem
                    key={op}
                    value={op}
                    onSelect={() => onToggle(op)}
                    className="text-xs"
                  >
                    <div
                      className={`mr-2 flex size-3.5 items-center justify-center rounded-sm border ${selected.includes(op) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}
                    >
                      {selected.includes(op) && (
                        <span className="text-[10px]">✓</span>
                      )}
                    </div>
                    <span className="font-mono">{op}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
