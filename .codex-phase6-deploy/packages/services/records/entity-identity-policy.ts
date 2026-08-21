export type EntityIdentityContext = "initiate" | "copy" | "promote";

export interface EntityIdentityTemplateRule {
  kind?: "template";
  template?: string;
  fallback_template?: string;
  apply_when?: "always" | "blank" | "system_managed";
  normalize_copy_prefix?: boolean;
}

export interface EntityNamingPolicy {
  field?: string;
  initiate?: EntityIdentityTemplateRule;
  copy?: EntityIdentityTemplateRule;
  promote?: EntityIdentityTemplateRule;
  max_length?: number;
}

export interface EntityNumberingPolicy {
  enabled?: boolean;
  field?: string;
  strategy?: string;
  provider?: string;
  company_scope_field?: string;
  effective_date_field?: string;
}

export interface EntityIdentityPolicy {
  numbering?: EntityNumberingPolicy;
  naming?: EntityNamingPolicy;
}

export interface FieldProvenance {
  source: "identity_config.naming" | "user";
  context: EntityIdentityContext | "edit";
  system_managed: boolean;
}

export interface ResolveEntityIdentityInput {
  identityConfig: unknown;
  context: EntityIdentityContext;
  entityLabel: string;
  sourceRecord?: Record<string, unknown> | null;
  targetRecord?: Record<string, unknown> | null;
  generatedCode?: string | null;
}

export interface ResolvedEntityIdentity {
  values: Record<string, string>;
  provenance: Record<string, FieldProvenance>;
}

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;
const ALLOWED_PLACEHOLDERS = new Set(["code", "source.code", "source.name", "entity.label"]);

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readProvenance(record: Record<string, unknown> | null | undefined, field: string): FieldProvenance | null {
  const metadata = asObject(record?.["metadata"]);
  const all = asObject(metadata["_field_provenance"]);
  const current = asObject(all[field]);
  if (typeof current["system_managed"] !== "boolean") return null;
  return {
    source: current["source"] === "user" ? "user" : "identity_config.naming",
    context: text(current["context"]) as FieldProvenance["context"] || "edit",
    system_managed: current["system_managed"],
  };
}

function normalizeCopyName(value: string): string {
  return value.replace(/^(?:copy of\s+)+/i, "").trim();
}

export function validateIdentityTemplate(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const token = match[1]?.trim() ?? "";
    if (!ALLOWED_PLACEHOLDERS.has(token)) unknown.add(token);
  }
  return [...unknown];
}

function renderTemplate(
  template: string,
  input: ResolveEntityIdentityInput,
  normalizeCopyPrefix: boolean,
): string | null {
  const source = input.sourceRecord ?? {};
  const sourceName = normalizeCopyPrefix ? normalizeCopyName(text(source["name"])) : text(source["name"]);
  const values: Record<string, string> = {
    code: text(input.generatedCode ?? input.targetRecord?.["code"]),
    "source.code": text(source["code"]),
    "source.name": sourceName,
    "entity.label": text(input.entityLabel),
  };
  if (validateIdentityTemplate(template).length > 0) return null;
  let missing = false;
  const rendered = template.replace(PLACEHOLDER_RE, (_whole, rawToken: string) => {
    const value = values[rawToken.trim()] ?? "";
    if (!value) missing = true;
    return value;
  }).replace(/\s+/g, " ").trim();
  return missing || !rendered ? null : rendered;
}

export function mergeFieldProvenance(
  metadata: unknown,
  provenance: Record<string, FieldProvenance>,
): Record<string, unknown> {
  const base = { ...asObject(metadata) };
  const existing = { ...asObject(base["_field_provenance"]) };
  base["_field_provenance"] = { ...existing, ...provenance };
  return base;
}

export function resolveEntityIdentity(input: ResolveEntityIdentityInput): ResolvedEntityIdentity {
  const config = asObject(input.identityConfig);
  const naming = asObject(config["naming"]);
  const field = text(naming["field"]) || "name";
  const rule = asObject(naming[input.context]);
  const template = text(rule["template"]);
  if (!template) return { values: {}, provenance: {} };

  const currentValue = text(input.targetRecord?.[field]);
  const currentProvenance = readProvenance(input.targetRecord, field);
  const applyWhen = text(rule["apply_when"]) || (input.context === "promote" ? "system_managed" : "always");
  if (applyWhen === "blank" && currentValue) return { values: {}, provenance: {} };
  if (applyWhen === "system_managed" && currentValue && currentProvenance?.system_managed !== true) {
    return { values: {}, provenance: {} };
  }

  const normalizeCopyPrefix = rule["normalize_copy_prefix"] === true;
  let value = renderTemplate(template, input, normalizeCopyPrefix);
  if (!value) {
    const fallback = text(rule["fallback_template"]);
    value = fallback ? renderTemplate(fallback, input, normalizeCopyPrefix) : null;
  }
  if (!value) return { values: {}, provenance: {} };

  const configuredMax = Number(naming["max_length"]);
  if (Number.isInteger(configuredMax) && configuredMax > 0 && value.length > configuredMax) {
    value = value.slice(0, configuredMax).trimEnd();
  }

  return {
    values: { [field]: value },
    provenance: {
      [field]: {
        source: "identity_config.naming",
        context: input.context,
        system_managed: input.context !== "copy",
      },
    },
  };
}
