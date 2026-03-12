"use client";

import {
  ArrowUpDown,
  Eye,
  EyeOff,
  Filter,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FieldBehaviorRuleList } from "../fields/FieldBehaviorRuleList";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONSTRAINT_BADGE,
  EDITABILITY_STATE_BADGE,
  VALIDATION_BADGE,
  VISIBILITY_STATE_BADGE,
} from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

import type {
  EditabilityConfig,
  EditabilityState,
  FieldDefinition,
  VisibilityConfig,
  VisibilityState,
} from "@/lib/schema-manager/types";

// ─── Sub-tab definitions ────────────────────────────────────

type ControlSubTab = "defaults" | "visibility" | "editability" | "validity";

const SUB_TABS: { key: ControlSubTab; label: string; icon: React.ElementType; desc: string }[] = [
  {
    key: "defaults",
    label: "Default Values",
    icon: Sparkles,
    desc: "Static default values assigned to fields on create.",
  },
  {
    key: "visibility",
    label: "Visibility",
    icon: Eye,
    desc: "Control which fields are visible in create, view, and edit modes.",
  },
  {
    key: "editability",
    label: "Editability",
    icon: Lock,
    desc: "Control which fields are editable vs read-only in each mode.",
  },
  {
    key: "validity",
    label: "Validity",
    icon: ShieldCheck,
    desc: "Field-level constraints and validation rules.",
  },
];

const VIS_LABELS: Record<string, string> = {
  visible: "Visible",
  hidden: "Hidden",
  internal: "Internal",
};

const EDIT_LABELS: Record<string, string> = {
  editable: "Editable",
  read_only: "Read-only",
  system_managed: "System Managed",
  computed: "Computed",
};

// ─── Props ──────────────────────────────────────────────────

interface EntityControlsEditorProps {
  fields: FieldDefinition[];
  loading: boolean;
  refresh?: () => void;
  onSaveFields?: (fields: FieldDefinition[]) => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────

export function EntityControlsEditor({
  fields,
  loading,
  refresh,
}: EntityControlsEditorProps) {
  const { wb, entity } = useParams<{ wb: string; entity: string }>();
  const fieldsBasePath = `/wb/${wb}/mesh/meta-studio/${entity}/fields`;
  const [activeTab, setActiveTab] = useState<ControlSubTab>("visibility");
  const [searchQuery, setSearchQuery] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "system" | "standard" | "business">("all");

  // Active fields sorted by order
  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => f.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [fields],
  );

  // Origin counts for the filter dropdown
  const originCounts = useMemo(() => {
    const counts = { system: 0, standard: 0, business: 0 };
    for (const f of activeFields) {
      const o = (f.origin ?? "business") as keyof typeof counts;
      if (o in counts) counts[o]++;
    }
    return counts;
  }, [activeFields]);

  // Origin + search filtered fields
  const controlFields = useMemo(() => {
    if (originFilter === "all") return activeFields;
    return activeFields.filter((f) => (f.origin ?? "business") === originFilter);
  }, [activeFields, originFilter]);

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return controlFields;
    const q = searchQuery.toLowerCase().trim();
    return controlFields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.label && f.label.toLowerCase().includes(q)) ||
        f.dataType.toLowerCase().includes(q) ||
        (f.columnName && f.columnName.toLowerCase().includes(q)),
    );
  }, [controlFields, searchQuery]);

  const allFieldNames = useMemo(
    () => controlFields.map((f) => f.name),
    [controlFields],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold shrink-0">Field Controls</h2>
            <Badge variant="secondary" className="text-xs shrink-0">
              {controlFields.length} fields
            </Badge>
            <span className="text-sm text-meta-text-soft truncate">
              Manage defaults, visibility, and editability across all fields in one view.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Search */}
            <div className="relative w-[180px]">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-meta-text-soft pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields..."
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {/* Origin filter */}
            <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as typeof originFilter)}>
              <SelectTrigger size="sm" className="w-[150px] gap-1.5 !text-xs">
                <Filter className="size-3.5 text-meta-text-soft" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-xs" value="all">All fields</SelectItem>
                <SelectItem className="text-xs" value="standard">Standard ({originCounts.standard})</SelectItem>
                <SelectItem className="text-xs" value="business">Custom ({originCounts.business})</SelectItem>
                <SelectItem className="text-xs" value="system">System ({originCounts.system})</SelectItem>
              </SelectContent>
            </Select>
            {refresh && (
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Sub-tab bar */}
        <div className="flex items-center border-b border-meta-border-soft">
          <div className="flex items-center gap-1">
            {SUB_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <Tooltip key={tab.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {tab.label}
                      {isActive && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {tab.desc}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {activeTab === "defaults" && (
          <DefaultsPanel fields={filteredFields} fieldsBasePath={fieldsBasePath} />
        )}
        {activeTab === "visibility" && (
          <VisibilityPanel fields={filteredFields} allFieldNames={allFieldNames} fieldsBasePath={fieldsBasePath} />
        )}
        {activeTab === "editability" && (
          <EditabilityPanel fields={filteredFields} allFieldNames={allFieldNames} fieldsBasePath={fieldsBasePath} />
        )}
        {activeTab === "validity" && (
          <ValidityPanel fields={filteredFields} fieldsBasePath={fieldsBasePath} />
        )}
      </div>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Edit Field Link (pencil icon → deep-link to field dialog)
// ═══════════════════════════════════════════════════════════════

function EditFieldLink({ fieldId, fieldsBasePath }: { fieldId: string; fieldsBasePath: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`${fieldsBasePath}?edit=${fieldId}`}
          className="inline-flex items-center justify-center size-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="size-3" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        Edit in field dialog
      </TooltipContent>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════════════
// Defaults Panel
// ═══════════════════════════════════════════════════════════════

/** Extract a display-friendly static value and conditional count from the raw defaultValue blob */
function parseDefaultValue(raw: unknown): { staticValue: string | null; conditionalCount: number } {
  if (raw == null) return { staticValue: null, conditionalCount: 0 };

  // If it's a structured object with staticValue / conditionals
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const sv = obj.staticValue;
    const conds = Array.isArray(obj.conditionals) ? obj.conditionals : [];
    const staticStr =
      sv != null && sv !== "" ? String(sv) : null;
    return { staticValue: staticStr, conditionalCount: conds.length };
  }

  // Primitive value
  return { staticValue: String(raw), conditionalCount: 0 };
}

function DefaultsPanel({ fields, fieldsBasePath }: { fields: FieldDefinition[]; fieldsBasePath: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-meta-border-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-meta-border-soft bg-meta-surface-subtle">
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Field</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Type</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Static Default</th>
            <th className="px-3 py-2 text-center text-xs font-medium text-meta-text-soft">Conditionals</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => {
            const { staticValue, conditionalCount } = parseDefaultValue(field.defaultValue);
            return (
              <tr key={field.id} className="group hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label ?? field.name}</span>
                    {field.label && (
                      <span className="text-xs text-muted-foreground">{field.name}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {field.dataType}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {staticValue != null ? (
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[200px] truncate inline-block">
                      {staticValue}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">none</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {conditionalCount > 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {conditionalCount} rule{conditionalCount !== 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-1 py-2">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditFieldLink fieldId={field.id} fieldsBasePath={fieldsBasePath} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fields.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No business fields found for this entity.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Visibility Panel
// ═══════════════════════════════════════════════════════════════

function getVisDefault(vis: VisibilityConfig | null, ctx: "create" | "view" | "edit"): VisibilityState {
  return vis?.defaults?.[ctx] ?? "visible";
}

function VisibilityPanel({
  fields,
  allFieldNames,
  fieldsBasePath,
}: {
  fields: FieldDefinition[];
  allFieldNames: string[];
  fieldsBasePath: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-meta-border-soft">
      {/* Column header */}
      <div className="grid grid-cols-[minmax(180px,2fr)_90px_90px_90px_100px_36px] gap-0 px-3 py-2 text-xs font-medium text-meta-text-soft bg-meta-surface-subtle border-b border-meta-border-soft">
        <span>Field</span>
        <span className="text-center">Create</span>
        <span className="text-center">View</span>
        <span className="text-center">Edit</span>
        <span className="text-center">Rules</span>
        <span />
      </div>
      {/* Rows */}
      {fields.map((field) => (
        <VisibilityRow
          key={field.id}
          field={field}
          allFieldNames={allFieldNames}
          fieldsBasePath={fieldsBasePath}
        />
      ))}
      {fields.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No business fields found for this entity.
        </div>
      )}
    </div>
  );
}

function VisibilityRow({
  field,
  allFieldNames,
  fieldsBasePath,
}: {
  field: FieldDefinition;
  allFieldNames: string[];
  fieldsBasePath: string;
}) {
  const ruleCount = field.visibility?.rules?.length ?? 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <div className="group grid grid-cols-[minmax(180px,2fr)_90px_90px_90px_100px_36px] gap-0 items-center px-3 py-2 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{field.label ?? field.name}</span>
          {field.isComputed && (
            <Badge variant="secondary" className="text-[10px] shrink-0">computed</Badge>
          )}
        </div>
        {(["create", "view", "edit"] as const).map((ctx) => {
          const state = getVisDefault(field.visibility, ctx);
          return (
            <div key={ctx} className="flex justify-center">
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 border", VISIBILITY_STATE_BADGE[state])}
              >
                {state === "visible" && <Eye className="size-2.5 mr-0.5" />}
                {state === "hidden" && <EyeOff className="size-2.5 mr-0.5" />}
                {VIS_LABELS[state]}
              </Badge>
            </div>
          );
        })}
        <div className="flex justify-center">
          {ruleCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => setExpanded(!expanded)}
            >
              <ArrowUpDown className="size-3" />
              {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
            </Button>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <EditFieldLink fieldId={field.id} fieldsBasePath={fieldsBasePath} />
          </span>
        </div>
      </div>
      {expanded && ruleCount > 0 && (
        <div className="px-6 pb-3">
          <FieldBehaviorRuleList
            mode="visibility"
            rules={field.visibility?.rules ?? []}
            onChange={() => {}}
            fields={allFieldNames}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Editability Panel
// ═══════════════════════════════════════════════════════════════

function getEditDefault(edit: EditabilityConfig | null, ctx: "create" | "edit"): EditabilityState {
  return edit?.defaults?.[ctx] ?? "editable";
}

function EditabilityPanel({
  fields,
  allFieldNames,
  fieldsBasePath,
}: {
  fields: FieldDefinition[];
  allFieldNames: string[];
  fieldsBasePath: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-meta-border-soft">
      {/* Column header */}
      <div className="grid grid-cols-[minmax(180px,2fr)_110px_110px_100px_36px] gap-0 px-3 py-2 text-xs font-medium text-meta-text-soft bg-meta-surface-subtle border-b border-meta-border-soft">
        <span>Field</span>
        <span className="text-center">Create</span>
        <span className="text-center">Edit</span>
        <span className="text-center">Rules</span>
        <span />
      </div>
      {/* Rows */}
      {fields.map((field) => (
        <EditabilityRow
          key={field.id}
          field={field}
          allFieldNames={allFieldNames}
          fieldsBasePath={fieldsBasePath}
        />
      ))}
      {fields.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No business fields found for this entity.
        </div>
      )}
    </div>
  );
}

function EditabilityRow({
  field,
  allFieldNames,
  fieldsBasePath,
}: {
  field: FieldDefinition;
  allFieldNames: string[];
  fieldsBasePath: string;
}) {
  const ruleCount = field.editability?.rules?.length ?? 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <div className="group grid grid-cols-[minmax(180px,2fr)_110px_110px_100px_36px] gap-0 items-center px-3 py-2 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{field.label ?? field.name}</span>
          {field.isReadOnly && (
            <Badge variant="secondary" className="text-[10px] shrink-0">read-only</Badge>
          )}
          {field.writeOnce && (
            <Badge variant="secondary" className="text-[10px] shrink-0">write-once</Badge>
          )}
        </div>
        {(["create", "edit"] as const).map((ctx) => {
          const state = getEditDefault(field.editability, ctx);
          return (
            <div key={ctx} className="flex justify-center">
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 border", EDITABILITY_STATE_BADGE[state])}
              >
                {state === "editable" && <Pencil className="size-2.5 mr-0.5" />}
                {state === "read_only" && <Lock className="size-2.5 mr-0.5" />}
                {EDIT_LABELS[state]}
              </Badge>
            </div>
          );
        })}
        <div className="flex justify-center">
          {ruleCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => setExpanded(!expanded)}
            >
              <ArrowUpDown className="size-3" />
              {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
            </Button>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <EditFieldLink fieldId={field.id} fieldsBasePath={fieldsBasePath} />
          </span>
        </div>
      </div>
      {expanded && ruleCount > 0 && (
        <div className="px-6 pb-3">
          <FieldBehaviorRuleList
            mode="editability"
            rules={field.editability?.rules ?? []}
            onChange={() => {}}
            fields={allFieldNames}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Validity Panel
// ═══════════════════════════════════════════════════════════════

function ValidityPanel({ fields, fieldsBasePath }: { fields: FieldDefinition[]; fieldsBasePath: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-meta-border-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-meta-border-soft bg-meta-surface-subtle">
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Field</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Type</th>
            <th className="px-3 py-2 text-center text-xs font-medium text-meta-text-soft w-[80px]">Required</th>
            <th className="px-3 py-2 text-center text-xs font-medium text-meta-text-soft w-[80px]">Unique</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Constraints</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-meta-text-soft">Validation</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => {
            const hasConstraints =
              field.constraints &&
              Object.keys(field.constraints).length > 0;
            const hasValidation =
              field.validation &&
              Object.keys(field.validation).length > 0;

            return (
              <tr key={field.id} className="group hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2">
                  <span className="font-medium">{field.label ?? field.name}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {field.dataType}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  {field.isRequired ? (
                    <Badge variant="default" className="text-[10px]">Yes</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {field.isUnique ? (
                    <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasConstraints ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(field.constraints!).map(([key, val]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className={`text-[10px] font-mono ${CONSTRAINT_BADGE}`}
                        >
                          {key}: {JSON.stringify(val)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">none</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasValidation ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(field.validation!).map(([key]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className={`text-[10px] font-mono ${VALIDATION_BADGE}`}
                        >
                          {key}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">none</span>
                  )}
                </td>
                <td className="px-1 py-2">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditFieldLink fieldId={field.id} fieldsBasePath={fieldsBasePath} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fields.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No business fields found for this entity.
        </div>
      )}
    </div>
  );
}
