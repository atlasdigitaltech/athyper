import type { ActionBundleGroup } from "@athyper/api-contracts/documents";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";

export interface LifecycleStageConfig {
  key: string;
  label: string;
}

export type ActionGroupsConfig = Record<string, {
  primary?: string[];
  working?: string[];
  output?: string[];
}>;

export interface DocumentActionPresentationConfig {
  destructiveCodes: Set<string>;
  confirmationCodes: Set<string>;
  outputCodes: Set<string>;
  labelOverrides: Record<string, string>;
  aliases: Record<string, string[]>;
  placementToGroup: Record<string, ActionBundleGroup>;
  groupsByStatus?: ActionGroupsConfig;
}

export interface ProcessChainPresentationConfig {
  nodeLabels: Record<string, string>;
  nodeShortLabels: Record<string, string>;
  statusIntents: Record<string, SemanticIntent>;
  routeTemplate?: string;
  routeTemplatesByNode: Record<string, string>;
}

export const DEFAULT_DOCUMENT_LINES_RENDERER = "default";
export const DEFAULT_REGISTERED_LINES_RENDERER = "generic";

export const DEFAULT_LIFECYCLE_STAGES: LifecycleStageConfig[] = [
  { key: "draft",            label: "Draft" },
  { key: "pending_approval", label: "Submitted" },
  { key: "approved",         label: "Approved" },
  { key: "posted",           label: "Posted" },
  { key: "paid",             label: "Paid" },
];

export const DEFAULT_ACTION_GROUPS_BY_STATUS: ActionGroupsConfig = {
  draft:            { primary: ["edit", "submit"],          working: ["cancel_document"] },
  submitted:        { primary: ["approve", "reject"],       working: ["cancel_document"] },
  pending_approval: { primary: ["approve", "reject"],       working: ["cancel_document"] },
  in_review:        { primary: ["approve", "reject"],       working: ["cancel_document"] },
  on_hold:          { primary: ["release_hold"],            working: ["cancel_document"] },
  approved:         { primary: ["post"],                    working: ["propose_payment", "cancel_document"], output: ["view_je"] },
  posted:           { primary: ["propose_payment"],         working: ["allocate_payment"], output: ["view_je"] },
  partially_paid:   { primary: ["propose_payment"],         working: ["allocate_payment"], output: ["view_je"] },
  paid:             { output: ["view_je"] },
  cancelled:        {},
  rejected:         { working: ["copy"] },
  reversed:         { working: ["copy"] },
};

const DEFAULT_DESTRUCTIVE_ACTION_CODES = [
  "cancel", "reverse", "void", "delete", "archive", "remove",
  "reject", "deny", "revoke", "suspend",
  "cancel_document", "reverse_document", "void_document",
];

const DEFAULT_CONFIRMATION_ACTION_CODES = [
  "submit", "approve", "deny", "reject", "post", "reverse",
  "cancel", "void", "delete", "hold", "release_hold",
  "cancel_document", "reverse_document", "void_document",
];

const DEFAULT_OUTPUT_ACTION_CODES = ["export", "print"];

const DEFAULT_ACTION_LABEL_OVERRIDES: Record<string, string> = {
  update:           "Edit",
  cancel_document:  "Cancel",
  reverse_document: "Reverse",
  void_document:    "Void",
};

const DEFAULT_ACTION_CODE_ALIASES: Record<string, string[]> = {
  complete:         ["submit"],
  update:           ["edit"],
  edit:             ["update"],
  cancel:           ["cancel_document"],
  cancel_document:  ["cancel"],
  deny:             ["reject"],
  reject:           ["deny"],
  reverse:          ["reverse_document"],
  reverse_document: ["reverse"],
  void:             ["void_document"],
  void_document:    ["void"],
};

const DEFAULT_PLACEMENT_TO_GROUP: Record<string, ActionBundleGroup> = {
  PRIMARY:  "primary",
  TOOLBAR:  "working",
  OVERFLOW: "overflow",
  CONTEXT:  "overflow",
};

const DEFAULT_CHAIN_NODE_LABELS: Record<string, string> = {
  PR:        "Requisition",
  RFX:       "RFx",
  CONTRACT:  "Contract",
  PO:        "Purchase Order",
  GR:        "Goods Receipt",
  SES:       "Service Entry",
  INV:       "Invoice",
  CN:        "Credit Note",
  DN:        "Debit Note",
  PAY:       "Payment",
  ADVANCE:   "Advance",
  RETENTION: "Retention",
};

const DEFAULT_CHAIN_NODE_SHORT_LABELS: Record<string, string> = {
  PR:        "PR",
  RFX:       "RFx",
  CONTRACT:  "CTR",
  PO:        "PO",
  GR:        "GR",
  SES:       "SES",
  INV:       "INV",
  CN:        "CN",
  DN:        "DN",
  PAY:       "PAY",
  ADVANCE:   "ADV",
  RETENTION: "RET",
};

const DEFAULT_CHAIN_STATUS_INTENTS: Record<string, SemanticIntent> = {
  posted:               "success",
  approved:             "success",
  completed:            "success",
  paid:                 "success",
  fully_received:       "success",
  fully_invoiced:       "success",
  closed:               "success",
  pending:              "warning",
  pending_approval:     "warning",
  in_review:            "warning",
  partially_received:   "warning",
  partially_invoiced:   "warning",
  rejected:             "error",
  cancelled:            "error",
  reversed:             "error",
  on_hold:              "error",
  draft:                "muted",
};

const DEFAULT_CHAIN_NODE_ROUTE_TEMPLATE = "/document/{node_type_lower}/{document_id}";

export function asConfigRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stringArrayConfig(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((item) => textConfig(item))
    .filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

export function stringMapConfig(value: unknown): Record<string, string> | undefined {
  const raw = asConfigRecord(value);
  if (!raw) return undefined;
  const entries = Object.entries(raw).flatMap(([key, val]) => {
    const text = textConfig(val);
    return text ? [[key, text] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function stringArrayMapConfig(value: unknown): Record<string, string[]> | undefined {
  const raw = asConfigRecord(value);
  if (!raw) return undefined;
  const entries = Object.entries(raw).flatMap(([key, val]) => {
    const list = stringArrayConfig(val);
    return list ? [[key, list] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function actionGroupsConfig(value: unknown): ActionGroupsConfig | undefined {
  const raw = asConfigRecord(value);
  if (!raw) return undefined;
  const entries = Object.entries(raw).flatMap(([status, config]) => {
    const group = asConfigRecord(config);
    if (!group) return [];
    const next = {
      primary: stringArrayConfig(group["primary"]),
      working: stringArrayConfig(group["working"]),
      output:  stringArrayConfig(group["output"]),
    };
    return next.primary || next.working || next.output ? [[status, next] as const] : [[status, {}] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function semanticIntentMapConfig(value: unknown): Record<string, SemanticIntent> | undefined {
  const raw = stringMapConfig(value);
  if (!raw) return undefined;
  const allowed = new Set<SemanticIntent>([
    "neutral", "info", "success", "warning", "error", "primary", "accent", "muted",
  ]);
  const entries = Object.entries(raw).flatMap(([key, val]) =>
    allowed.has(val as SemanticIntent) ? [[key, val as SemanticIntent] as const] : [],
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeStatusKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[\s-]/g, "_");
}

export function normalizeDocumentLinesRendererKey(value: string): string {
  return value === DEFAULT_DOCUMENT_LINES_RENDERER ? DEFAULT_REGISTERED_LINES_RENDERER : value;
}

export function resolveDocumentLinesRendererKey(
  displayConfig: Record<string, unknown>,
  hasLinesTab: boolean,
): string | null {
  const configuredRenderer =
    textConfig(displayConfig["document_lines_renderer"])
    ?? textConfig(displayConfig["lines_renderer"]);

  if (configuredRenderer) return normalizeDocumentLinesRendererKey(configuredRenderer);
  return hasLinesTab ? DEFAULT_REGISTERED_LINES_RENDERER : null;
}

export function resolveDocumentActionPresentation(
  displayConfig: Record<string, unknown>,
  isDocumentRenderer: boolean,
): DocumentActionPresentationConfig {
  const configuredGroups =
    actionGroupsConfig(displayConfig["action_groups"])
    ?? actionGroupsConfig(displayConfig["default_action_groups_by_status"]);

  return {
    destructiveCodes: new Set(stringArrayConfig(displayConfig["action_destructive_codes"]) ?? DEFAULT_DESTRUCTIVE_ACTION_CODES),
    confirmationCodes: new Set(stringArrayConfig(displayConfig["action_confirm_codes"]) ?? DEFAULT_CONFIRMATION_ACTION_CODES),
    outputCodes: new Set(stringArrayConfig(displayConfig["output_action_codes"]) ?? DEFAULT_OUTPUT_ACTION_CODES),
    labelOverrides: {
      ...DEFAULT_ACTION_LABEL_OVERRIDES,
      ...(stringMapConfig(displayConfig["action_label_overrides"]) ?? {}),
    },
    aliases: {
      ...DEFAULT_ACTION_CODE_ALIASES,
      ...(stringArrayMapConfig(displayConfig["action_code_aliases"]) ?? {}),
    },
    placementToGroup: {
      ...DEFAULT_PLACEMENT_TO_GROUP,
      ...(stringMapConfig(displayConfig["action_placement_groups"]) as Record<string, ActionBundleGroup> | undefined ?? {}),
    },
    groupsByStatus: configuredGroups ?? (isDocumentRenderer ? DEFAULT_ACTION_GROUPS_BY_STATUS : undefined),
  };
}

export function resolveProcessChainPresentation(
  displayConfig?: Record<string, unknown> | null,
): ProcessChainPresentationConfig {
  const config = displayConfig ?? {};
  return {
    nodeLabels: {
      ...DEFAULT_CHAIN_NODE_LABELS,
      ...(stringMapConfig(config["chain_node_labels"]) ?? {}),
    },
    nodeShortLabels: {
      ...DEFAULT_CHAIN_NODE_SHORT_LABELS,
      ...(stringMapConfig(config["chain_node_short_labels"]) ?? {}),
    },
    statusIntents: {
      ...DEFAULT_CHAIN_STATUS_INTENTS,
      ...(semanticIntentMapConfig(config["chain_status_intents"]) ?? {}),
    },
    routeTemplate: textConfig(config["chain_node_route_template"]) ?? DEFAULT_CHAIN_NODE_ROUTE_TEMPLATE,
    routeTemplatesByNode: stringMapConfig(config["chain_node_route_templates"]) ?? {},
  };
}

export function renderTemplate(
  template: string,
  values: Record<string, string | undefined>,
): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (_match, key: string) => values[key] ?? "");
}
