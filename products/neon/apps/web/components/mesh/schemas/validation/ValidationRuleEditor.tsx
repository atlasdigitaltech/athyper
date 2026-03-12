"use client";

import {
  Plus,
  Save,
  Trash2,
  Pencil,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Beaker,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { RuleFormDialog } from "./RuleFormDialog";
import { ValidationTestPanel } from "./ValidationTestPanel";

import type {
  ValidationRule,
  ValidationTestResult,
} from "@/lib/schema-manager/use-entity-validation";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Props ───────────────────────────────────────────────────

interface ValidationRuleEditorProps {
  rules: ValidationRule[];
  /** Auto-compiled rules from field-level constraints (read-only, provenance="field") */
  fieldDerivedRules?: ValidationRule[];
  fields?: string[];
  loading?: boolean;
  onSave: (rules: ValidationRule[]) => Promise<unknown>;
  onTest: (
    payload: Record<string, unknown>,
    rules?: ValidationRule[],
    trigger?: string,
  ) => Promise<ValidationTestResult>;
}

// ─── Kind Labels & Colors ────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  required: "Required",
  min_max: "Min/Max",
  length: "Length",
  regex: "Regex",
  enum: "Enum",
  cross_field: "Cross-Field",
  conditional: "Conditional",
  date_range: "Date Range",
  referential: "Referential",
  unique: "Unique",
};

const SEVERITY_CONFIG = {
  error: {
    icon: ShieldAlert,
    className: "text-destructive border-destructive/30",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    className: "text-warning border-warning",
    label: "Warning",
  },
} as const;

// ─── Component ───────────────────────────────────────────────

export function ValidationRuleEditor({
  rules,
  fieldDerivedRules = [],
  fields,
  loading,
  onSave,
  onTest,
}: ValidationRuleEditorProps) {
  const [localRules, setLocalRules] = useState<ValidationRule[]>(rules);
  const [showFieldRules, setShowFieldRules] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);

  // Sync when parent rules change (e.g., after refresh)
  useMemo(() => {
    setLocalRules(rules);
  }, [rules]);

  const isDirty = useMemo(() => {
    return JSON.stringify(localRules) !== JSON.stringify(rules);
  }, [localRules, rules]);

  const handleAdd = useCallback(() => {
    setEditingRule(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((rule: ValidationRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  }, []);

  const handleSubmitRule = useCallback((rule: ValidationRule) => {
    setLocalRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = rule;
        return updated;
      }
      return [...prev, rule];
    });
  }, []);

  const handleDelete = useCallback((ruleId: string) => {
    setLocalRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(localRules);
    } finally {
      setSaving(false);
    }
  }, [localRules, onSave]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Validation Rules</h2>
          <Badge variant="secondary" className="text-xs">
            {localRules.length + fieldDerivedRules.length}
          </Badge>
          {isDirty && (
            <Badge
              variant="outline"
              className="text-xs text-warning border-warning"
            >
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTestPanel(!showTestPanel)}
          >
            <Beaker className="mr-1 h-3.5 w-3.5" />
            {showTestPanel ? "Hide Test" : "Test"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Rule
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Test panel (collapsible) */}
      {showTestPanel && (
        <>
          <Card>
            <CardContent className="p-4">
              <ValidationTestPanel rules={localRules} onTest={onTest} />
            </CardContent>
          </Card>
          <Separator />
        </>
      )}

      {/* Field-derived rules (auto-compiled from field constraints) */}
      {fieldDerivedRules.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowFieldRules(!showFieldRules)}
          >
            <span>{showFieldRules ? "▾" : "▸"}</span>
            Field Constraints
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {fieldDerivedRules.length}
            </Badge>
            <span className="font-normal text-muted-foreground">
              — auto-derived from field definitions
            </span>
          </button>

          {showFieldRules && (
            <div className="space-y-1.5 pl-1">
              {fieldDerivedRules.map((rule) => {
                const severityConfig =
                  SEVERITY_CONFIG[rule.severity] ?? SEVERITY_CONFIG.error;
                const SeverityIcon = severityConfig.icon;

                return (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 rounded-lg border border-dashed p-2.5 bg-muted/20"
                  >
                    <SeverityIcon
                      className={`h-3.5 w-3.5 shrink-0 ${severityConfig.className}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {rule.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {KIND_LABELS[rule.kind] ?? rule.kind}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-0">
                          Field
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {rule.fieldPath}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Separator />
        </div>
      )}

      {/* Custom rules list */}
      {localRules.length === 0 && fieldDerivedRules.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No Validation Rules"
          description="Add rules to enforce data quality constraints on this entity."
          action={
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add First Rule
            </Button>
          }
        />
      ) : localRules.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">
            No custom rules. Add rules for cross-field validation, conditional logic, and more.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {localRules.map((rule) => {
            const severityConfig =
              SEVERITY_CONFIG[rule.severity] ?? SEVERITY_CONFIG.error;
            const SeverityIcon = severityConfig.icon;

            return (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <SeverityIcon
                  className={`h-4 w-4 shrink-0 ${severityConfig.className}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {rule.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {KIND_LABELS[rule.kind] ?? rule.kind}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-0">
                      Custom
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">
                      {rule.fieldPath}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {rule.appliesOn.join(", ")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleEdit(rule)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rule form dialog */}
      <RuleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editingRule}
        fields={fields}
        onSubmit={handleSubmitRule}
      />
    </div>
  );
}
