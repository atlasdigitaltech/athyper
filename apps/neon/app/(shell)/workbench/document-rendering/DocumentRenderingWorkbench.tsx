"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { PageFrame } from "@athyper/platform-surface-kit";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@athyper/platform-ui/primitives";
import { csrfFetch } from "@/lib/bff-fetch";

type Row = Record<string, unknown> & { id: string; code?: string; name?: string; status?: string };
type FieldKind = "text" | "textarea" | "json" | "checkbox" | "select" | "number";

interface FieldDefinition {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  createOnly?: boolean;
  options?: readonly string[];
  placeholder?: string;
}

interface ResourceDefinition {
  id: string;
  label: string;
  endpoint: string;
  description: string;
  fields: FieldDefinition[];
  canDeactivate?: boolean;
}

const RESOURCES: ResourceDefinition[] = [
  {
    id: "templates",
    label: "Templates",
    endpoint: "templates",
    description: "Template headers and lifecycle. Content is published as immutable versions.",
    canDeactivate: true,
    fields: [
      { key: "code", label: "Code", required: true, createOnly: true, placeholder: "purchase_invoice" },
      { key: "name", label: "Name", required: true },
      { key: "kind", label: "Kind", required: true, createOnly: true, placeholder: "invoice" },
      { key: "engine", label: "Engine", kind: "select", options: ["handlebars"] },
      { key: "is_rtl_supported", label: "RTL supported", kind: "checkbox" },
      { key: "is_letterhead_required", label: "Letterhead required", kind: "checkbox" },
      { key: "status", label: "Status", kind: "select", options: ["draft", "review", "published", "archived"] },
      { key: "metadata", label: "Metadata", kind: "json" },
    ],
  },
  {
    id: "brands",
    label: "Brand profiles",
    endpoint: "brands",
    description: "Tenant design tokens used by rendered documents.",
    fields: [
      { key: "code", label: "Code", required: true, createOnly: true, placeholder: "default" },
      { key: "name", label: "Name", required: true },
      { key: "palette", label: "Palette JSON", kind: "json" },
      { key: "typography", label: "Typography JSON", kind: "json" },
      { key: "is_default", label: "Tenant default", kind: "checkbox" },
      { key: "status", label: "Status", kind: "select", options: ["active", "inactive", "archived"] },
      { key: "metadata", label: "Metadata", kind: "json" },
    ],
  },
  {
    id: "letterheads",
    label: "Letterheads",
    endpoint: "letterheads",
    description: "Reusable header, footer, logo, and watermark definitions.",
    fields: [
      { key: "code", label: "Code", required: true, createOnly: true },
      { key: "name", label: "Name", required: true },
      { key: "logo_asset_ref", label: "Logo asset reference" },
      { key: "header_html", label: "Header HTML", kind: "textarea" },
      { key: "footer_html", label: "Footer HTML", kind: "textarea" },
      { key: "watermark_text", label: "Watermark text" },
      { key: "watermark_opacity", label: "Watermark opacity", kind: "number" },
      { key: "is_default", label: "Tenant default", kind: "checkbox" },
      { key: "status", label: "Status", kind: "select", options: ["active", "inactive", "archived"] },
      { key: "metadata", label: "Metadata", kind: "json" },
    ],
  },
  {
    id: "bindings",
    label: "Bindings",
    endpoint: "bindings",
    description: "Select the render configuration for an entity operation, variant, and locale.",
    canDeactivate: true,
    fields: [
      { key: "template_id", label: "Template ID", required: true, createOnly: true },
      { key: "entity_code", label: "Entity code", required: true, createOnly: true },
      { key: "operation_code", label: "Operation code", required: true, createOnly: true, placeholder: "print" },
      { key: "variant_code", label: "Variant", createOnly: true, placeholder: "default" },
      { key: "locale_code", label: "Locale", createOnly: true, placeholder: "en" },
      { key: "brand_profile_id", label: "Brand profile ID" },
      { key: "letterhead_id", label: "Letterhead ID" },
      { key: "print_profile_id", label: "Print profile ID" },
      { key: "status", label: "Status", kind: "select", options: ["active", "inactive", "archived"] },
      { key: "metadata", label: "Metadata", kind: "json" },
    ],
  },
  {
    id: "profiles",
    label: "Print profiles",
    endpoint: "profiles",
    description: "Operational PDF paper, orientation, margin, and background settings.",
    fields: [
      { key: "code", label: "Code", required: true, createOnly: true },
      { key: "name", label: "Name", required: true },
      { key: "paper_size", label: "Paper size", kind: "select", options: ["A3", "A4", "A5", "B4", "Letter", "Legal"] },
      { key: "orientation", label: "Orientation", kind: "select", options: ["portrait", "landscape"] },
      { key: "margins", label: "Margins", kind: "select", options: ["none", "narrow", "normal", "wide"] },
      { key: "header_footer", label: "Header and footer", kind: "checkbox" },
      { key: "background_graphics", label: "Background graphics", kind: "checkbox" },
      { key: "is_default", label: "Tenant default", kind: "checkbox" },
      { key: "status", label: "Status", kind: "select", options: ["active", "inactive", "archived"] },
      { key: "metadata", label: "Metadata", kind: "json" },
    ],
  },
];

const JSON_FIELDS = new Set(["metadata", "palette", "typography"]);

function initialForm(definition: ResourceDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (field.kind === "checkbox") result[field.key] = false;
    else if (field.kind === "json") result[field.key] = "{}";
    else if (field.options?.[0]) result[field.key] = field.options[0];
    else result[field.key] = "";
  }
  if (definition.id === "letterheads") result["watermark_opacity"] = "0.15";
  if (definition.id === "bindings") {
    result["variant_code"] = "default";
    result["locale_code"] = "en";
  }
  if (definition.id === "profiles") {
    result["header_footer"] = true;
    result["background_graphics"] = true;
  }
  return result;
}

function formFromRow(definition: ResourceDefinition, row: Row): Record<string, unknown> {
  const result = initialForm(definition);
  for (const field of definition.fields) {
    const value = row[field.key];
    result[field.key] = JSON_FIELDS.has(field.key)
      ? JSON.stringify(value ?? {}, null, 2)
      : value ?? (field.kind === "checkbox" ? false : "");
  }
  return result;
}

function requestPayload(definition: ResourceDefinition, form: Record<string, unknown>, editing: boolean) {
  const payload: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (editing && field.createOnly) continue;
    const value = form[field.key];
    if (field.kind === "json") {
      payload[field.key] = JSON.parse(String(value || "{}"));
    } else if (field.kind === "number") {
      payload[field.key] = value === "" ? null : Number(value);
    } else if (value === "") {
      payload[field.key] = null;
    } else {
      payload[field.key] = value;
    }
  }
  return payload;
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body["message"] ?? body["error"] ?? `Request failed (${response.status})`));
  }
  return body;
}

function rowTitle(row: Row): string {
  return String(row.name ?? row.code ?? row["entity_code"] ?? row.id);
}

function ResourcePanel({ definition }: { definition: ResourceDefinition }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(() => initialForm(definition));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await parseResponse(await fetch(`/api/docservices/${definition.endpoint}`, { cache: "no-store" }));
      setRows((body["data"] as Row[] | undefined) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load resource");
    } finally {
      setLoading(false);
    }
  }, [definition.endpoint]);

  useEffect(() => { void load(); }, [load]);

  const beginCreate = () => {
    setSelected(null);
    setForm(initialForm(definition));
    setError(null);
  };

  const beginEdit = (row: Row) => {
    setSelected(row);
    setForm(formFromRow(definition, row));
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const editing = Boolean(selected);
      const response = await csrfFetch(
        `/api/docservices/${definition.endpoint}${editing ? `/${selected!.id}` : ""}`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload(definition, form, editing)),
        },
      );
      await parseResponse(response);
      await load();
      beginCreate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!selected || !definition.canDeactivate) return;
    setSaving(true);
    setError(null);
    try {
      await parseResponse(await csrfFetch(
        `/api/docservices/${definition.endpoint}/${selected.id}`,
        { method: "DELETE" },
      ));
      await load();
      beginCreate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{definition.label}</CardTitle>
            <CardDescription>{definition.description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="size-4" />
            </Button>
            <Button size="sm" onClick={beginCreate}><Plus className="mr-1 size-4" />New</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No rows configured.</p>}
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => beginEdit(row)}
              className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${selected?.id === row.id ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{rowTitle(row)}</span>
                {row.status && <Badge variant="outline">{row.status}</Badge>}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {String(row.code ?? row["entity_code"] ?? row.id)}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selected ? `Edit ${rowTitle(selected)}` : `Create ${definition.label.toLowerCase()}`}</CardTitle>
          <CardDescription>Changes are tenant-scoped and checked against exact catalog permissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {definition.fields.map((field) => {
              const disabled = Boolean(selected && field.createOnly);
              const value = form[field.key];
              if (field.kind === "checkbox") {
                return (
                  <label key={field.key} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={Boolean(value)}
                      disabled={disabled}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, [field.key]: checked === true }))}
                    />
                    {field.label}
                  </label>
                );
              }
              if (field.kind === "select") {
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <Select
                      value={String(value ?? "")}
                      disabled={disabled}
                      onValueChange={(next) => setForm((current) => ({ ...current, [field.key]: next }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              const TextControl = field.kind === "textarea" || field.kind === "json" ? Textarea : Input;
              return (
                <div key={field.key} className={`space-y-1.5 ${field.kind === "textarea" || field.kind === "json" ? "md:col-span-2" : ""}`}>
                  <Label>{field.label}</Label>
                  <TextControl
                    value={String(value ?? "")}
                    disabled={disabled}
                    required={field.required}
                    placeholder={field.placeholder}
                    className={field.kind === "json" ? "min-h-28 font-mono text-xs" : undefined}
                    type={field.kind === "number" ? "number" : undefined}
                    step={field.kind === "number" ? "0.01" : undefined}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            {selected && definition.canDeactivate && (
              <Button variant="outline" onClick={() => void deactivate()} disabled={saving}>
                <Trash2 className="mr-1 size-4" />Archive
              </Button>
            )}
            <Button onClick={() => void save()} disabled={saving}>
              <Save className="mr-1 size-4" />{saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {definition.id === "templates" && selected && (
            <TemplateVersionPublisher template={selected} onPublished={load} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateVersionPublisher({ template, onPublished }: { template: Row; onPublished(): Promise<void> }) {
  const [locale, setLocale] = useState("en");
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const bytes = new TextEncoder().encode(html);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const checksum = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      await parseResponse(await csrfFetch("/api/docservices/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          locale_code: locale,
          content_html: html,
          checksum,
        }),
      }));
      setHtml("");
      await onPublished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mt-6 space-y-3 border-t pt-5">
      <div>
        <h3 className="font-medium">Publish immutable version</h3>
        <p className="text-sm text-muted-foreground">Publishing creates a new snapshot and promotes it as the current version.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[8rem_1fr]">
        <Input value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="en" />
        <Textarea value={html} onChange={(event) => setHtml(event.target.value)} className="min-h-40 font-mono text-xs" placeholder="<!doctype html>…" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={() => void publish()} disabled={publishing || !html.trim()}>
          <FileText className="mr-1 size-4" />{publishing ? "Publishing…" : "Publish version"}
        </Button>
      </div>
    </div>
  );
}

export function DocumentRenderingWorkbench() {
  const [active, setActive] = useState(RESOURCES[0]!.id);
  const activeDefinition = useMemo(
    () => RESOURCES.find((resource) => resource.id === active) ?? RESOURCES[0]!,
    [active],
  );

  return (
    <PageFrame
      eyebrow="Neon"
      title="Document rendering"
      description="Templates, branding, letterheads, bindings, and operational print profiles."
    >
      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          {RESOURCES.map((resource) => (
            <TabsTrigger key={resource.id} value={resource.id}>{resource.label}</TabsTrigger>
          ))}
        </TabsList>
        {RESOURCES.map((resource) => (
          <TabsContent key={resource.id} value={resource.id}>
            {resource.id === activeDefinition.id && <ResourcePanel definition={activeDefinition} />}
          </TabsContent>
        ))}
      </Tabs>
    </PageFrame>
  );
}
