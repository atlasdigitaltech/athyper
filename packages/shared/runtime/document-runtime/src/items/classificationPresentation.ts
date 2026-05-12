import {
  asConfigRecord,
  stringMapConfig,
  textConfig,
} from "../documentRuntimeDefaults";

export type ClassificationStatusIconKey = "alert" | "check" | "x";
export type ClassificationPolicyBadgeVariant = "muted" | "warn" | "alert";

export interface ClassificationStatusPresentation {
  icon?: ClassificationStatusIconKey;
  label?: string;
  pill?: string;
  compactPill?: string;
}

export interface ClassificationMethodPresentation {
  label?: string;
  className?: string;
}

export interface ClassificationPolicyBadgeConfig {
  key: string;
  label: string;
  variant?: ClassificationPolicyBadgeVariant;
  value?: unknown;
}

export interface ClassificationConfig {
  decisionField?: string;
  lineIdField?: string;
  requiredInputField?: string;
  classifyEndpointTemplate?: string;
  saveMode?: string;
  previewMode?: string;
  statuses: Record<string, ClassificationStatusPresentation>;
  domainClasses: Record<string, string>;
  fallbackDomainClass?: string;
  methods: Record<string, ClassificationMethodPresentation>;
  fallbackMethod?: ClassificationMethodPresentation;
  policyBadges: ClassificationPolicyBadgeConfig[];
  denyMappingBadge?: ClassificationPolicyBadgeConfig;
  thresholdField?: string;
  thresholdLabel?: string;
}

export const CLASSIFICATION_FALLBACK_STATUS_CONFIG: Required<ClassificationStatusPresentation> = {
  icon:        "alert",
  label:       "Classification",
  pill:        "bg-muted text-muted-foreground border-border/50",
  compactPill: "bg-muted text-muted-foreground border-border/50",
};

export const CLASSIFICATION_FALLBACK_DOMAIN_CLASS =
  "bg-muted text-foreground border-border/50";

export const CLASSIFICATION_FALLBACK_METHOD_CONFIG: Required<ClassificationMethodPresentation> = {
  label:     "Method",
  className: "text-muted-foreground",
};

function statusPresentationMapConfig(value: unknown): Record<string, ClassificationStatusPresentation> {
  const raw = asConfigRecord(value);
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, val]) => {
      const record = asConfigRecord(val);
      if (!record) return [];
      const next: ClassificationStatusPresentation = {
        icon:        iconKeyConfig(record["icon"]),
        label:       textConfig(record["label"]),
        pill:        textConfig(record["pill"]) ?? textConfig(record["className"]),
        compactPill: textConfig(record["compactPill"]) ?? textConfig(record["compact_pill"]),
      };
      return Object.values(next).some(Boolean) ? [[key, next] as const] : [];
    }),
  );
}

function methodPresentationMapConfig(value: unknown): Record<string, ClassificationMethodPresentation> {
  const raw = asConfigRecord(value);
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, val]) => {
      const record = asConfigRecord(val);
      if (!record) return [];
      const next: ClassificationMethodPresentation = {
        label:     textConfig(record["label"]),
        className: textConfig(record["className"]) ?? textConfig(record["class_name"]),
      };
      return Object.values(next).some(Boolean) ? [[key.toLowerCase(), next] as const] : [];
    }),
  );
}

function policyBadgeConfig(value: unknown): ClassificationPolicyBadgeConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asConfigRecord(entry);
    if (!row) return [];
    const key = textConfig(row["key"]);
    const label = textConfig(row["label"]);
    if (!key || !label) return [];
    return [{
      key,
      label,
      variant: policyBadgeVariantConfig(row["variant"]),
      value:   row["value"],
    }];
  });
}

function singlePolicyBadgeConfig(value: unknown): ClassificationPolicyBadgeConfig | undefined {
  return policyBadgeConfig([value])[0];
}

function iconKeyConfig(value: unknown): ClassificationStatusIconKey | undefined {
  const text = textConfig(value)?.toLowerCase();
  return text === "check" || text === "x" || text === "alert" ? text : undefined;
}

function policyBadgeVariantConfig(value: unknown): ClassificationPolicyBadgeVariant | undefined {
  const text = textConfig(value)?.toLowerCase();
  return text === "muted" || text === "warn" || text === "alert" ? text : undefined;
}

export function resolveClassificationConfig(value: unknown): ClassificationConfig {
  const raw = asConfigRecord(value) ?? {};
  const methods =
    methodPresentationMapConfig(raw["methods"] ?? raw["method"])
    ?? {};

  return {
    decisionField:             textConfig(raw["decision_field"]),
    lineIdField:               textConfig(raw["line_id_field"]),
    requiredInputField:        textConfig(raw["required_input_field"]),
    classifyEndpointTemplate:  textConfig(raw["classify_endpoint_template"]) ?? textConfig(raw["endpoint_template"]),
    saveMode:                  textConfig(raw["save_mode"]),
    previewMode:               textConfig(raw["preview_mode"]),
    statuses:                  statusPresentationMapConfig(raw["statuses"] ?? raw["status"]),
    domainClasses:             stringMapConfig(raw["domain_classes"] ?? raw["domainClasses"]) ?? {},
    fallbackDomainClass:       textConfig(raw["fallback_domain_class"]),
    methods,
    fallbackMethod:            methodPresentation(asConfigRecord(raw["fallback_method"])),
    policyBadges:              policyBadgeConfig(raw["policy_badges"]),
    denyMappingBadge:          singlePolicyBadgeConfig(raw["deny_mapping_badge"]),
    thresholdField:            textConfig(raw["threshold_field"]),
    thresholdLabel:            textConfig(raw["threshold_label"]),
  };
}

export function classificationStatusPresentation(
  config: ClassificationConfig,
  status: string,
): Required<ClassificationStatusPresentation> {
  const configured = config.statuses[status] ?? config.statuses[status.toLowerCase()];
  const label = configured?.label ?? titleizeToken(status);
  return {
    icon:        configured?.icon ?? CLASSIFICATION_FALLBACK_STATUS_CONFIG.icon,
    label:       label || CLASSIFICATION_FALLBACK_STATUS_CONFIG.label,
    pill:        configured?.pill ?? CLASSIFICATION_FALLBACK_STATUS_CONFIG.pill,
    compactPill: configured?.compactPill ?? configured?.pill ?? CLASSIFICATION_FALLBACK_STATUS_CONFIG.compactPill,
  };
}

export function classificationMethodPresentation(
  config: ClassificationConfig,
  method: string,
): Required<ClassificationMethodPresentation> {
  const key = method.toLowerCase();
  const configured = config.methods[key];
  const fallback = config.fallbackMethod;
  return {
    label:     configured?.label ?? fallback?.label ?? titleizeToken(method) ?? CLASSIFICATION_FALLBACK_METHOD_CONFIG.label,
    className: configured?.className ?? fallback?.className ?? CLASSIFICATION_FALLBACK_METHOD_CONFIG.className,
  };
}

function methodPresentation(record: Record<string, unknown> | null): ClassificationMethodPresentation | undefined {
  if (!record) return undefined;
  const next = {
    label:     textConfig(record["label"]),
    className: textConfig(record["className"]) ?? textConfig(record["class_name"]),
  };
  return next.label || next.className ? next : undefined;
}

function titleizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
