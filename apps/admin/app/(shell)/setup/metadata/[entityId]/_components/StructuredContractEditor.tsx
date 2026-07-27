"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Label, Switch, Textarea } from "@athyper/ui";
import type { ContractIssue, JsonRecord } from "./contract-state";
import { jsonPointer } from "./contract-state";

function title(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function regenerateIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(regenerateIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, child]) => [
      key,
      key === "id" && typeof child === "string" ? crypto.randomUUID() : regenerateIds(child),
    ]));
  }
  return value;
}

function starterFor(pointer: string): unknown {
  const id = () => crypto.randomUUID();
  if (/\/(semantic_roles|plane_eligibility|plane_filter|required_permissions|group_codes|transition_to|read_permissions|write_permissions|merge_order|planes)$/.test(pointer)) return "";
  if (pointer === "/fields") return {
    id: id(), name: "new_field", column_name: "new_field", projection_alias_of: null,
    label: "New field", description: null, data_type: "text", cardinality: "one",
    origin: "business", required: false, unique: false, unique_scope: null,
    read_only: false, deprecated: false, computed: false, write_once: false,
    runtime_enabled: true, compute: null, default_value: null, defaults: null,
    capabilities: { filterable: false, sortable: false, groupable: false, aggregatable: false },
    semantic_roles: [], type_config: { kind: "scalar", format: null, unit: null },
  };
  if (pointer === "/relations") return {
    id: id(), code: "new_relation", kind: "belongs_to", target_entity_code: "target_entity",
    resolution: "fk", source_field: null, target_field: "id", polymorphic: null,
    source_line_field: null, runtime_role: null, on_delete: "restrict", record_filter: {},
    mutation: { owner: "read_only", permissions: [] },
  };
  if (pointer === "/surfaces") return {
    id: id(), surface_key: "default", mode: "detail", kind: "DETAIL", placement: "main",
    parent_surface_id: null, slot_key: null,
    renderer: { key: "default", composer_key: null, strategy_key: null, config: {} },
    layout: { column_count: 2, print_span: null, density: "comfortable" },
    security: { required_permissions: [], visibility_condition: null },
    grouping: { group_codes: [], relation_code: null }, label: "Default", order: 100,
    enabled: true, bindings: [],
  };
  if (/\/surfaces\/\d+\/bindings$/.test(pointer)) return {
    id: id(), field_id: id(), visible: true, required: null, read_only: null, order: 100,
    column_span: null, density: null, group_code: null, renderer_key: null, editor_key: null,
    visibility_condition: null, editability_condition: null, renderer_config: {},
  };
  if (pointer === "/operations") return {
    id: id(), operation_code: "new.operation", permission_code: "new.operation",
    surface: "DETAIL", placement: "OVERFLOW", plane_filter: null,
    handler: { kind: "api", target: "/api/new-operation" }, execution: null,
    record_required: true, label: "New operation", icon: null, intent: "neutral",
    confirmation: { required: false, code: null, message: null }, reason_required: false,
    selection: null, order: 100, enabled: true, action_rules: [],
  };
  if (/\/operations\/\d+\/action_rules$/.test(pointer)) return {
    id: id(), status: "draft", action_code: "new.operation", capability: "allowed",
    required_permission: null, reason: null, condition: null, metadata: {},
  };
  if (pointer === "/numbering/configurations") return {
    id: id(), code: "default", company_scope: { mode: "all", company_code: null },
    field_scope: { field_name: "code", uniqueness: "tenant" }, reset_policy: "never",
    segments: [{ kind: "sequence", value: null, width: 6 }],
    confirmation: { required: false, message: null },
    format: { prefix: "", prefix_configurable: false, separator: "-", max_length: null, allowed_chars: "A-Z0-9-" },
    enabled: true, metadata: {},
  };
  if (/\/numbering\/configurations\/\d+\/segments$/.test(pointer)) return { kind: "literal", value: "X", width: null };
  if (pointer === "/lifecycle/states") return {
    id: id(), code: "new_state", label: "New state", initial: false, terminal: false,
    presentation: { badge: null, icon: null, color: null },
    capabilities: { edit: true, delete: false, reversible: false, transition_to: [] },
    masks: [],
  };
  if (/\/lifecycle\/states\/\d+\/masks$/.test(pointer)) return {
    id: id(), planes: ["admin"], edit: false, delete: false, transition_to: [], disabled_reason: null,
  };
  if (pointer === "/lifecycle/transitions") return {
    id: id(), from: "draft", to: "active", operation_code: "entity.activate",
    conditions: [], gates: [], hooks: [], timers: [],
  };
  if (/\/lifecycle\/transitions\/\d+\/conditions$/.test(pointer)) return { expression: {}, failure_code: null };
  if (/\/lifecycle\/transitions\/\d+\/gates$/.test(pointer)) return { id: id(), gate_code: "new.gate", order: 100, config: {} };
  if (/\/lifecycle\/transitions\/\d+\/hooks$/.test(pointer)) return { id: id(), phase: "before", hook_code: "new.hook", order: 100, config: {} };
  if (/\/lifecycle\/transitions\/\d+\/timers$/.test(pointer)) return { id: id(), timer_code: "new.timer", duration_iso: "P1D", operation_code: "entity.remind", config: {} };
  if (pointer === "/flows") return {
    id: id(), flow_code: "new_flow", label: "New flow", description: null, icon_key: null,
    trigger_context: "new", default: false, version: 1, condition: null, required_permissions: [],
    writer_operation: "entity.save", submit_operation: null, config: {},
    steps: [{
      id: id(), step_key: "details", label: "Details", description: null, icon_key: null,
      order: 100, skip_when: null, advance_rule: {}, layout_hint: "two_column",
      required_permissions: [], sections: [], fields: [],
    }],
  };
  if (/\/flows\/\d+\/steps$/.test(pointer)) return {
    id: id(), step_key: "new_step", label: "New step", description: null, icon_key: null,
    order: 100, skip_when: null, advance_rule: {}, layout_hint: "two_column",
    required_permissions: [], sections: [], fields: [],
  };
  if (/\/flows\/\d+\/steps\/\d+\/sections$/.test(pointer)) return {
    id: id(), section_key: "new_section", label: "New section", description: null, order: 100,
    collapsed: false, visible_when: null, reveal_behavior: "auto_expand", icon_key: null, help_text: null,
  };
  if (/\/flows\/\d+\/steps\/\d+\/fields$/.test(pointer)) return {
    id: id(), field_id: id(), section_id: null, mode: "editable", derivation: null,
    visible_when: null, required_when: null, summary_role: null, ui_variant: null,
    format: null, span: 1, help_text: null, placeholder: null, order: 100, metadata: {},
  };
  if (pointer === "/policy/field_security") return {
    id: id(), field_name: "new_field", classification: "internal",
    read_permissions: [], write_permissions: [], mask: "none", condition: null,
  };
  return {};
}

function issueList(
  pointer: string,
  issues: Readonly<Record<string, ContractIssue[]>>,
): ContractIssue[] {
  return Object.entries(issues)
    .filter(([path]) => path === pointer || path.startsWith(`${pointer}/`))
    .flatMap(([, value]) => value);
}

function PrimitiveEditor({
  name,
  value,
  pointer,
  disabled,
  issues,
  onChange,
}: {
  name: string;
  value: string | number | boolean | null;
  pointer: string;
  disabled: boolean;
  issues: Readonly<Record<string, ContractIssue[]>>;
  onChange: (value: unknown) => void;
}) {
  const directIssues = issues[pointer] ?? [];
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <Label>{title(name)}</Label>
          <p className="font-mono text-[10px] text-muted-foreground">{pointer}</p>
        </div>
        <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />
        {directIssues.map((issue, index) => <p key={index} className="text-xs text-destructive">{issue.message}</p>)}
      </div>
    );
  }
  if (value === null) {
    return (
      <div className="grid gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>{title(name)}</Label>
            <p className="font-mono text-[10px] text-muted-foreground">{pointer}</p>
          </div>
          <Badge variant="outline">null</Badge>
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onChange("")}>Set text</Button>
            <Button size="sm" variant="outline" onClick={() => onChange({})}>Set object</Button>
            <Button size="sm" variant="outline" onClick={() => onChange([])}>Set list</Button>
          </div>
        )}
        {directIssues.map((issue, index) => <p key={index} className="text-xs text-destructive">{issue.message}</p>)}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`contract${pointer}`}>{title(name)}</Label>
      <Input
        id={`contract${pointer}`}
        type={typeof value === "number" ? "number" : "text"}
        value={value}
        disabled={disabled}
        aria-invalid={directIssues.length > 0}
        onChange={(event) => onChange(typeof value === "number"
          ? Number(event.target.value)
          : event.target.value)}
      />
      <p className="font-mono text-[10px] text-muted-foreground">{pointer}</p>
      {directIssues.map((issue, index) => <p key={index} className="text-xs text-destructive">{issue.message}</p>)}
    </div>
  );
}

export function StructuredContractEditor({
  name,
  value,
  path = [],
  disabled,
  issues,
  onChange,
  depth = 0,
}: {
  name: string;
  value: unknown;
  path?: readonly (string | number)[];
  disabled: boolean;
  issues: Readonly<Record<string, ContractIssue[]>>;
  onChange: (value: unknown) => void;
  depth?: number;
}) {
  const pointer = jsonPointer(path);
  const nestedIssues = useMemo(() => issueList(pointer, issues), [issues, pointer]);
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return (
      <PrimitiveEditor
        name={name}
        value={value as string | number | boolean | null}
        pointer={pointer}
        disabled={disabled}
        issues={issues}
        onChange={onChange}
      />
    );
  }

  if (Array.isArray(value)) {
    const add = () => {
      const seed = value.length ? regenerateIds(clone(value.at(-1))) : starterFor(pointer);
      onChange([...value, seed]);
    };
    return (
      <section className="rounded-lg border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="font-medium">{title(name)} <Badge variant="outline">{value.length}</Badge></span>
          <span className="text-xs text-muted-foreground">{nestedIssues.length ? `${nestedIssues.length} issues` : expanded ? "Collapse" : "Expand"}</span>
        </button>
        {expanded && (
          <div className="space-y-3 border-t p-3">
            {value.map((item, index) => (
              <div key={`${pointer}-${index}`} className="rounded-md bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium">{title(name)} {index + 1}</span>
                  {!disabled && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => {
                        const next = [...value];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        onChange(next);
                      }}>Up</Button>
                      <Button size="sm" variant="ghost" disabled={index === value.length - 1} onClick={() => {
                        const next = [...value];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        onChange(next);
                      }}>Down</Button>
                      <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                    </div>
                  )}
                </div>
                <StructuredContractEditor
                  name={`${name} ${index + 1}`}
                  value={item}
                  path={[...path, index]}
                  disabled={disabled}
                  issues={issues}
                  onChange={(nextItem) => onChange(value.map((current, itemIndex) => itemIndex === index ? nextItem : current))}
                  depth={depth + 1}
                />
              </div>
            ))}
            {!value.length && <p className="text-sm text-muted-foreground">No items configured.</p>}
            {!disabled && <Button size="sm" variant="outline" onClick={add}>Add {title(name).replace(/s$/, "")}</Button>}
          </div>
        )}
      </section>
    );
  }

  const record = value && typeof value === "object" ? value as JsonRecord : {};
  return (
    <section className={depth === 0 ? "space-y-4" : "rounded-lg border"}>
      {depth > 0 && (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="font-medium">{title(name)}</span>
          <span className="text-xs text-muted-foreground">{nestedIssues.length ? `${nestedIssues.length} issues` : expanded ? "Collapse" : "Expand"}</span>
        </button>
      )}
      {(depth === 0 || expanded) && (
        <div className={depth === 0 ? "grid gap-4 md:grid-cols-2" : "grid gap-4 border-t p-4 md:grid-cols-2"}>
          {Object.entries(record).map(([key, child]) => (
            <div
              key={key}
              className={child && typeof child === "object" ? "md:col-span-2" : ""}
            >
              <StructuredContractEditor
                name={key}
                value={child}
                path={[...path, key]}
                disabled={disabled}
                issues={issues}
                onChange={(nextChild) => onChange({ ...record, [key]: nextChild })}
                depth={depth + 1}
              />
            </div>
          ))}
          {!Object.keys(record).length && <p className="text-sm text-muted-foreground md:col-span-2">Empty configuration object.</p>}
          {depth > 0 && !disabled && (
            <Button className="md:col-span-2" size="sm" variant="ghost" onClick={() => onChange(null)}>
              Clear optional configuration
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function AdvancedJsonEditor({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Textarea
        className="min-h-96 font-mono text-xs"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!disabled && <Button size="sm" variant="outline" onClick={() => {
        try {
          onChange(JSON.parse(text) as unknown);
          setError(null);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Invalid JSON.");
        }
      }}>Apply JSON through workspace</Button>}
    </div>
  );
}
