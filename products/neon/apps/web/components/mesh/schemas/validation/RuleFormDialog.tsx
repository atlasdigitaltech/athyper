"use client";

import { useCallback, useEffect, useState } from "react";

import { ConditionTreeBuilder } from "./ConditionTreeBuilder";

import type { ValidationRule } from "@/lib/schema-manager/use-entity-validation";

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

// ─── Constants ───────────────────────────────────────────────

const RULE_KINDS = [
  { value: "required", label: "Required" },
  { value: "min_max", label: "Min / Max" },
  { value: "length", label: "Length" },
  { value: "regex", label: "Regex Pattern" },
  { value: "enum", label: "Enum Constraint" },
  { value: "cross_field", label: "Cross-Field Comparison" },
  { value: "conditional", label: "Conditional (IF / THEN)" },
  { value: "date_range", label: "Date Range" },
  { value: "referential", label: "Referential Integrity" },
  { value: "unique", label: "Unique" },
] as const;

const TRIGGER_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "transition", label: "Transition" },
  { value: "all", label: "All" },
] as const;

// ─── Props ───────────────────────────────────────────────────

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: ValidationRule | null;
  fields?: string[];
  onSubmit: (rule: ValidationRule) => void;
}

// ─── Component ───────────────────────────────────────────────

export function RuleFormDialog({
  open,
  onOpenChange,
  rule,
  fields,
  onSubmit,
}: RuleFormDialogProps) {
  const isEdit = !!rule;

  const [form, setForm] = useState<ValidationRule>(getDefaultRule());

  useEffect(() => {
    if (rule) {
      setForm({ ...rule });
    } else {
      setForm(getDefaultRule());
    }
  }, [rule, open]);

  const update = useCallback((patch: Partial<ValidationRule>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(form);
    onOpenChange(false);
  }, [form, onSubmit, onOpenChange]);

  const toggleTrigger = useCallback((trigger: string, checked: boolean) => {
    setForm((prev) => {
      const current = new Set(prev.appliesOn);
      if (checked) current.add(trigger);
      else current.delete(trigger);
      return { ...prev, appliesOn: Array.from(current) };
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Add Rule"}</DialogTitle>
          <DialogDescription>
            Configure a validation rule for this entity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs">Rule Name</Label>
            <Input
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. Amount must be positive"
              className="h-8 text-sm"
            />
          </div>

          {/* Kind + Field Path */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Rule Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => update({ kind: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_KINDS.map((k) => (
                    <SelectItem
                      key={k.value}
                      value={k.value}
                      className="text-xs"
                    >
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Target Field</Label>
              {fields && fields.length > 0 ? (
                <Select
                  value={form.fieldPath}
                  onValueChange={(v) => update({ fieldPath: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select field…" />
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
                  value={form.fieldPath}
                  onChange={(e) => update({ fieldPath: e.target.value })}
                  placeholder="field_name"
                  className="h-8 text-xs"
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Kind-specific fields */}
          {form.kind === "min_max" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  value={form.min ?? ""}
                  onChange={(e) =>
                    update({
                      min: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  value={form.max ?? ""}
                  onChange={(e) =>
                    update({
                      max: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {form.kind === "length" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min Length</Label>
                <Input
                  type="number"
                  value={form.minLength ?? ""}
                  onChange={(e) =>
                    update({
                      minLength: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Length</Label>
                <Input
                  type="number"
                  value={form.maxLength ?? ""}
                  onChange={(e) =>
                    update({
                      maxLength: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {form.kind === "regex" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Pattern</Label>
                <Input
                  value={form.pattern ?? ""}
                  onChange={(e) => update({ pattern: e.target.value })}
                  placeholder="^[A-Z]{2}\\d{4}$"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Flags</Label>
                <Input
                  value={form.flags ?? ""}
                  onChange={(e) => update({ flags: e.target.value })}
                  placeholder="i"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {form.kind === "enum" && (
            <div className="space-y-1">
              <Label className="text-xs">
                Allowed Values (comma-separated)
              </Label>
              <Input
                value={(form.allowedValues ?? []).join(", ")}
                onChange={(e) =>
                  update({
                    allowedValues: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="active, inactive, pending"
                className="h-8 text-xs"
              />
            </div>
          )}

          {form.kind === "cross_field" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Compare Field</Label>
                <Input
                  value={form.compareField ?? ""}
                  onChange={(e) => update({ compareField: e.target.value })}
                  placeholder="other_field"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Operator</Label>
                <Select
                  value={form.operator ?? "eq"}
                  onValueChange={(v) => update({ operator: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["eq", "ne", "gt", "gte", "lt", "lte"].map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {form.kind === "conditional" && (
            <div className="space-y-2">
              <Label className="text-xs">When (Condition)</Label>
              <ConditionTreeBuilder
                value={
                  (form.when as any) ?? { operator: "and", conditions: [] }
                }
                onChange={(when) => update({ when: when as any })}
                fields={fields}
              />
            </div>
          )}

          {form.kind === "date_range" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">After Field</Label>
                <Input
                  value={form.afterField ?? ""}
                  onChange={(e) =>
                    update({ afterField: e.target.value || undefined })
                  }
                  placeholder="start_date"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Before Field</Label>
                <Input
                  value={form.beforeField ?? ""}
                  onChange={(e) =>
                    update({ beforeField: e.target.value || undefined })
                  }
                  placeholder="end_date"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {form.kind === "referential" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Target Entity</Label>
                <Input
                  value={form.targetEntity ?? ""}
                  onChange={(e) => update({ targetEntity: e.target.value })}
                  placeholder="customer"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target Field</Label>
                <Input
                  value={form.targetField ?? ""}
                  onChange={(e) =>
                    update({ targetField: e.target.value || undefined })
                  }
                  placeholder="id (default)"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {form.kind === "unique" && (
            <div className="space-y-1">
              <Label className="text-xs">
                Scope Fields (comma-separated, optional)
              </Label>
              <Input
                value={(form.scope ?? []).join(", ")}
                onChange={(e) =>
                  update({
                    scope: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="tenant_id, status"
                className="h-8 text-xs"
              />
            </div>
          )}

          <Separator />

          {/* Severity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) =>
                  update({ severity: v as "error" | "warning" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="error" className="text-xs">
                    Error (blocks save)
                  </SelectItem>
                  <SelectItem value="warning" className="text-xs">
                    Warning (advisory)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phase</Label>
              <Select
                value={form.phase}
                onValueChange={(v) =>
                  update({ phase: v as "beforePersist" | "beforeTransition" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beforePersist" className="text-xs">
                    Before Persist
                  </SelectItem>
                  <SelectItem value="beforeTransition" className="text-xs">
                    Before Transition
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Triggers */}
          <div className="space-y-1">
            <Label className="text-xs">Applies On</Label>
            <div className="flex items-center gap-4">
              {TRIGGER_OPTIONS.map((t) => (
                <label
                  key={t.value}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Checkbox
                    checked={form.appliesOn.includes(t.value)}
                    onCheckedChange={(checked) =>
                      toggleTrigger(t.value, !!checked)
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Custom message */}
          <div className="space-y-1">
            <Label className="text-xs">Custom Error Message (optional)</Label>
            <Input
              value={form.message ?? ""}
              onChange={(e) => update({ message: e.target.value || undefined })}
              placeholder="Use {field} and {value} as placeholders"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.name || !form.fieldPath}
          >
            {isEdit ? "Update Rule" : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Default Rule ────────────────────────────────────────────

function getDefaultRule(): ValidationRule {
  return {
    id: crypto.randomUUID(),
    name: "",
    kind: "required",
    severity: "error",
    appliesOn: ["create", "update"],
    phase: "beforePersist",
    fieldPath: "",
  };
}
