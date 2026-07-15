import {
  contractDefinitionsForScope,
  findPropertyContractDefinition,
  type ContractScope,
  type PropertyContractDefinition,
} from "@athyper/api-contracts/field-contract-registry-core";

export interface ContractWriteIssue {
  path: string;
  message: string;
}

export interface ContractWriteValidationResult {
  values: Record<string, unknown>;
  warnings: ContractWriteIssue[];
  errors: ContractWriteIssue[];
}

const FIELD_TOP_LEVEL_ALIASES: Record<string, string> = {
  validation: "validation_rules",
};

const FIELD_DIRECT_COLUMNS = new Set([
  "enum_domain_code",
  "group_key",
]);

const ENTITY_RUNTIME_COLUMNS = new Set([
  "runtime_enabled",
  "primary_key",
  "tenant_column",
  "read_capability",
  "write_capability",
]);


const VALIDATION_REFERENCE_KEYS = new Set([
  "ref_entity",
  "ref_hint",
  "target_field",
  "display_field",
  "picker",
  "label_field",
  "code_field",
  "description_field",
  "navigation_field",
  "record_id_field",
  "show_code",
  "show_description",
  "show_view_action",
]);

const RULE_EXPRESSION_KEYS = new Set([
  "field",
  "operator",
  "value",
  "values",
  "and",
  "or",
  "not",
  "var",
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function isRuleExpression(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(record && Object.keys(record).some((key) => RULE_EXPRESSION_KEYS.has(key)));
}

function mergeRecord(
  target: Record<string, unknown>,
  key: string,
  source: Record<string, unknown> | null,
): void {
  if (!source) return;
  const existing = asRecord(target[key]);
  target[key] = compactRecord({ ...(existing ?? {}), ...source });
}

function normalizeTopLevelFieldKey(key: string): string {
  return FIELD_TOP_LEVEL_ALIASES[key] ?? key;
}

function addWarning(warnings: ContractWriteIssue[], path: string, message: string): void {
  warnings.push({ path, message });
}

function addError(errors: ContractWriteIssue[], path: string, message: string): void {
  errors.push({ path, message });
}

function normalizeReferenceConfig(value: unknown, warnings: ContractWriteIssue[]): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  const targetEntity = out["target_entity"]
    ?? out["ref_entity"]
    ?? out["ref_hint"]
    ?? out["entity"]
    ?? out["entity_code"]
    ?? out["targetEntity"]
    ?? out["refEntity"];

  if (out["target_entity"] === undefined && targetEntity !== undefined) {
    out["target_entity"] = targetEntity;
    addWarning(warnings, "reference_config.target_entity", "Normalized legacy reference target alias to target_entity.");
  }

  for (const alias of ["ref_entity", "ref_hint", "entity", "entity_code", "targetEntity", "refEntity"]) {
    delete out[alias];
  }

  return compactRecord(out);
}

function normalizeMoneyConfig(value: unknown, warnings: ContractWriteIssue[]): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  if (out["currency_code"] === undefined && out["constant_currency"] !== undefined) {
    out["currency_code"] = out["constant_currency"];
    addWarning(warnings, "money_config.currency_code", "Normalized constant_currency to currency_code.");
  }
  if (out["currency_code_position"] === undefined) {
    const position = out["code_position"] ?? out["currency_position"];
    if (position !== undefined) {
      out["currency_code_position"] = position;
      addWarning(warnings, "money_config.currency_code_position", "Normalized legacy currency position alias.");
    }
  }

  delete out["constant_currency"];
  delete out["code_position"];
  delete out["currency_position"];

  return compactRecord(out);
}

function normalizeLookupConfig(value: unknown, warnings: ContractWriteIssue[]): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  if (out["dependent_filter"] === undefined) {
    const dependentFilter = out["depends_on"] ?? out["dependency"];
    if (dependentFilter !== undefined) {
      out["dependent_filter"] = dependentFilter;
      addWarning(warnings, "lookup_config.dependent_filter", "Normalized dependent lookup alias to dependent_filter.");
    }
  }

  delete out["depends_on"];
  delete out["dependency"];

  return compactRecord(out);
}

function normalizeUiHint(
  value: unknown,
  output: Record<string, unknown>,
  warnings: ContractWriteIssue[],
): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };

  const filter = asRecord(out["filter"]);
  if (filter) {
    mergeRecord(output, "filter_config", filter);
    addWarning(warnings, "ui_hint.filter", "Moved legacy filter hint to filter_config.");
  }

  const groupKey = out["group_key"];
  if (typeof groupKey === "string" && groupKey.trim()) {
    output["group_key"] = groupKey.trim();
    addWarning(warnings, "ui_hint.group_key", "Moved legacy group_key hint to the top-level group_key column.");
  }

  const display = { ...(asRecord(out["display"]) ?? {}) };
  const topLevelVisibleWhen = out["visible_when"];
  if (display["visible_when"] === undefined && isRuleExpression(topLevelVisibleWhen)) {
    display["visible_when"] = topLevelVisibleWhen;
    addWarning(warnings, "ui_hint.visible_when", "Moved dynamic visibility to ui_hint.display.visible_when.");
  }
  if (Object.keys(display).length > 0) out["display"] = display;

  const copyBehavior = out["copy_behavior"];
  if (copyBehavior !== undefined) {
    const copy = { ...(asRecord(out["copy"]) ?? {}) };
    if (copy["behavior"] === undefined) copy["behavior"] = copyBehavior;
    out["copy"] = copy;
    addWarning(warnings, "ui_hint.copy_behavior", "Moved copy_behavior to ui_hint.copy.behavior.");
  }

  delete out["filter"];
  delete out["group_key"];
  delete out["visible_when"];
  delete out["copy_behavior"];

  return compactRecord(out);
}

function normalizeValidationRules(
  value: unknown,
  output: Record<string, unknown>,
  warnings: ContractWriteIssue[],
): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  const referencePatch: Record<string, unknown> = {};

  const targetEntity = out["ref_entity"] ?? out["ref_hint"];
  if (typeof targetEntity === "string" && targetEntity.trim()) {
    referencePatch["target_entity"] = targetEntity.trim();
  }
  for (const key of [
    "target_field",
    "display_field",
    "label_field",
    "code_field",
    "description_field",
    "navigation_field",
    "record_id_field",
    "show_code",
    "show_description",
    "show_view_action",
  ]) {
    if (out[key] !== undefined) referencePatch[key] = out[key];
  }
  if (out["picker"] !== undefined) referencePatch["picker"] = out["picker"];

  if (Object.keys(referencePatch).length > 0) {
    mergeRecord(output, "reference_config", referencePatch);
    addWarning(warnings, "validation_rules", "Moved legacy reference validation keys to reference_config.");
  }

  for (const key of VALIDATION_REFERENCE_KEYS) delete out[key];

  return compactRecord(out);
}

function normalizeConstraints(
  value: unknown,
  output: Record<string, unknown>,
  warnings: ContractWriteIssue[],
  errors: ContractWriteIssue[],
): void {
  const raw = asRecord(value);
  if (!raw) return;

  const validationPatch: Record<string, unknown> = {};
  for (const key of ["max_length", "min_length", "min_value", "max_value", "pattern", "allowed_values"]) {
    if (raw[key] !== undefined) validationPatch[key] = raw[key];
  }
  if (Object.keys(validationPatch).length > 0) {
    mergeRecord(output, "validation_rules", validationPatch);
    addWarning(warnings, "constraints", "Moved scalar/runtime constraints to validation_rules.");
  }

  const remaining = Object.keys(raw).filter((key) => validationPatch[key] === undefined);
  if (remaining.length > 0) {
    addError(errors, "constraints", `constraints is server-owned and cannot be authored here: ${remaining.join(", ")}.`);
  }
}

function normalizeLookupProfile(
  value: unknown,
  output: Record<string, unknown>,
  warnings: ContractWriteIssue[],
): void {
  const raw = asRecord(value);
  if (!raw) return;

  const picker: Record<string, unknown> = {};
  if (raw["variant"] !== undefined) picker["variant"] = raw["variant"];
  if (raw["density"] !== undefined) picker["density"] = raw["density"];
  if (raw["max_items"] !== undefined) picker["page_size"] = raw["max_items"];

  if (Object.keys(picker).length === 0) return;

  const existingReference = asRecord(output["reference_config"]) ?? {};
  const existingPicker = asRecord(existingReference["picker"]) ?? {};
  output["reference_config"] = {
    ...existingReference,
    picker: {
      ...existingPicker,
      ...picker,
    },
  };
  addWarning(warnings, "lookup_profile", "Moved legacy lookup_profile picker keys to reference_config.picker.");
}

function normalizeVisibility(
  value: unknown,
  output: Record<string, unknown>,
  warnings: ContractWriteIssue[],
): void {
  const raw = asRecord(value);
  if (!raw) return;

  const uiHint = asRecord(output["ui_hint"]) ?? {};
  const display = { ...(asRecord(uiHint["display"]) ?? {}) };

  if (Array.isArray(raw["hide_in"])) {
    display["hide_in"] = raw["hide_in"];
  } else {
    const hiddenSurfaces = Object.entries(raw)
      .filter(([, surfaceValue]) => surfaceValue === false)
      .map(([surface]) => surface);
    if (hiddenSurfaces.length > 0) display["hide_in"] = hiddenSurfaces;
  }

  if (isRuleExpression(raw["visible_when"])) {
    display["visible_when"] = raw["visible_when"];
  } else if (isRuleExpression(raw)) {
    display["visible_when"] = raw;
  }

  if (Object.keys(display).length > 0) {
    output["ui_hint"] = {
      ...uiHint,
      display,
    };
    addWarning(warnings, "visibility", "Moved legacy visibility into ui_hint.display.");
  }
}

function validatePropertyContractValue(
  entry: PropertyContractDefinition,
  value: unknown,
): { ok: true; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const record = asRecord(value);

  if (record && entry.allowedKeys.length > 0) {
    const allowed = new Set([
      ...entry.allowedKeys,
      ...entry.aliases,
      ...entry.deprecatedKeys.map((deprecated) => deprecated.key),
    ]);
    const unknownKeys = Object.keys(record).filter((key) => !allowed.has(key));
    if (unknownKeys.length > 0) {
      const message = `${entry.property} contains unknown keys: ${unknownKeys.join(", ")}`;
      if (entry.unknownKeyPolicy === "reject") {
        return { ok: false, errors: [message], warnings };
      }
      if (entry.unknownKeyPolicy === "warn") warnings.push(message);
    }
  }

  for (const deprecated of entry.deprecatedKeys) {
    if (record && deprecated.key in record) {
      warnings.push(`${entry.property}.${deprecated.key} is deprecated; migrate to ${deprecated.migratesTo}.`);
    }
  }

  return { ok: true, warnings };
}

function isNormalAuthoredProperty(entry: PropertyContractDefinition): boolean {
  return entry.compileTarget !== "omit" && entry.compileTarget !== "server_only";
}

function validateNormalizedProperties(
  scope: ContractScope,
  values: Record<string, unknown>,
  warnings: ContractWriteIssue[],
  errors: ContractWriteIssue[],
): void {
  for (const [property, value] of Object.entries(values)) {
    if (scope === "entity_field" && FIELD_DIRECT_COLUMNS.has(property)) continue;
    if (value === null) continue;

    const entry = findPropertyContractDefinition(scope, property);
    if (!entry) {
      addError(errors, property, `${property} is not a registered ${scope} contract property.`);
      continue;
    }

    if (!isNormalAuthoredProperty(entry)) {
      addError(errors, property, `${property} is ${entry.phase}/${entry.compileTarget} and cannot be authored through this endpoint.`);
      continue;
    }
    if (entry.phase === "grandfathered") {
      addWarning(warnings, property, `${property} is grandfathered; prefer its canonical replacement for new authoring.`);
    }

    const result = validatePropertyContractValue(entry, value);
    for (const warning of result.warnings) addWarning(warnings, property, warning);
    if (!result.ok) {
      for (const error of result.errors) addError(errors, property, error);
    }
  }
}

export function validateEntityContractWrite(input: unknown): ContractWriteValidationResult {
  const values: Record<string, unknown> = {};
  const warnings: ContractWriteIssue[] = [];
  const errors: ContractWriteIssue[] = [];
  const body = asRecord(input);

  if (!body) {
    return {
      values,
      warnings,
      errors: [{ path: "$", message: "Request body must be an object." }],
    };
  }

  const allowed = new Set([
    ...contractDefinitionsForScope("entity").map((entry) => entry.property),
    ...ENTITY_RUNTIME_COLUMNS,
  ]);
  for (const [property, value] of Object.entries(body)) {
    if (!allowed.has(property)) {
      addError(errors, property, `${property} is not a registered entity contract property.`);
      continue;
    }
    values[property] = value;
  }

  const runtimeEnabled = values["runtime_enabled"];
  if (runtimeEnabled !== undefined && typeof runtimeEnabled !== "boolean") {
    addError(errors, "runtime_enabled", "runtime_enabled must be boolean.");
  }
  for (const property of ["primary_key", "tenant_column"] as const) {
    const value = values[property];
    if (value !== undefined && value !== null && (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/.test(value))) {
      addError(errors, property, `${property} must be a physical snake_case column name or null.`);
    }
  }
  const readCapability = values["read_capability"];
  if (readCapability !== undefined && !["none", "generic", "facade", "projection"].includes(String(readCapability))) {
    addError(errors, "read_capability", "read_capability is invalid.");
  }
  const writeCapability = values["write_capability"];
  if (writeCapability !== undefined && !["none", "generic", "facade", "append_only"].includes(String(writeCapability))) {
    addError(errors, "write_capability", "write_capability is invalid.");
  }

  validateNormalizedProperties("entity", Object.fromEntries(Object.entries(values).filter(([key]) => !ENTITY_RUNTIME_COLUMNS.has(key))), warnings, errors);
  return { values, warnings, errors };
}

export function validateEntityFieldContractWrite(input: unknown): ContractWriteValidationResult {
  const values: Record<string, unknown> = {};
  const warnings: ContractWriteIssue[] = [];
  const errors: ContractWriteIssue[] = [];
  const body = asRecord(input);

  if (!body) {
    return {
      values,
      warnings,
      errors: [{ path: "$", message: "Request body must be an object." }],
    };
  }

  const contractProperties = new Set(contractDefinitionsForScope("entity_field").map((entry) => entry.property));

  for (const [rawProperty, value] of Object.entries(body)) {
    const property = normalizeTopLevelFieldKey(rawProperty);

    if (FIELD_DIRECT_COLUMNS.has(property)) {
      values[property] = value;
      continue;
    }

    if (!contractProperties.has(property)) {
      addError(errors, rawProperty, `${rawProperty} is not a registered entity_field contract property.`);
      continue;
    }

    switch (property) {
      case "reference_config":
        values[property] = normalizeReferenceConfig(value, warnings);
        break;
      case "money_config":
        values[property] = normalizeMoneyConfig(value, warnings);
        break;
      case "lookup_config":
        values[property] = normalizeLookupConfig(value, warnings);
        break;
      case "ui_hint":
        {
          const normalized = normalizeUiHint(value, values, warnings);
          if (normalized !== null || value === null) values[property] = normalized;
        }
        break;
      case "validation_rules":
        {
          const normalized = normalizeValidationRules(value, values, warnings);
          if (normalized !== null || value === null) values[property] = normalized;
        }
        break;
      case "visibility":
        normalizeVisibility(value, values, warnings);
        break;
      case "constraints":
        normalizeConstraints(value, values, warnings, errors);
        break;
      case "lookup_profile":
        normalizeLookupProfile(value, values, warnings);
        break;
      default:
        values[property] = value;
        break;
    }
  }

  for (const [property, value] of Object.entries(values)) {
    if (value === null) continue;
    if (value === undefined) delete values[property];
  }

  validateNormalizedProperties("entity_field", values, warnings, errors);
  return { values, warnings, errors };
}
