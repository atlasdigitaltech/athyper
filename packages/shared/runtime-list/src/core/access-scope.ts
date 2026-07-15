import {
  LIST_URL_PARAMS as P,
  type RawSearchParams,
  type RuntimeAccessContext,
  type RuntimeAccessScope,
  type RuntimeAccessScopeConfig,
  type RuntimeAccessScopeLabel,
  type RuntimeDescriptor,
  type RuntimeListState,
  type RuntimeScopeFieldRole,
  type RuntimeScopePlane,
  type RuntimeScopePredicate,
  type RuntimeTenantScopeMode,
} from "./types";

const DEFAULT_SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const ROLE_LABELS: Record<RuntimeScopeFieldRole, string> = {
  tenant:         "Tenant",
  legalEntity:    "Legal entity",
  businessEntity: "Business entity",
  companyCode:    "Company code",
  buyerOrg:       "Buyer account",
  supplierOrg:    "Supplier account",
};

const ROLE_FALLBACK_FIELDS: Record<RuntimeScopeFieldRole, string[]> = {
  tenant:         ["tenant_id"],
  legalEntity:    ["legal_entity_id"],
  businessEntity: ["business_entity_id"],
  companyCode:    ["company_code_id"],
  buyerOrg:       ["buyer_org_id"],
  supplierOrg:    ["supplier_org_id"],
};

const ROLE_SEMANTIC_TOKENS: Record<RuntimeScopeFieldRole, string[]> = {
  tenant:         ["tenant", "tenantscope", "tenantid"],
  legalEntity:    ["legalentity", "legalentityscope", "legalentityid"],
  businessEntity: ["businessentity", "businessentityscope", "businessentityid"],
  companyCode:    ["companycode", "companycodescope", "companycodeid"],
  buyerOrg:       ["buyerorg", "buyeraccount", "buyeraccountscope", "buyerorgid"],
  supplierOrg:    ["supplierorg", "supplieraccount", "supplieraccountscope", "supplierorgid"],
};

const ALL_ROLES: RuntimeScopeFieldRole[] = [
  "tenant",
  "legalEntity",
  "businessEntity",
  "companyCode",
  "buyerOrg",
  "supplierOrg",
];

export function resolveRuntimeAccessScope(
  plane:      RuntimeScopePlane,
  descriptor: RuntimeDescriptor,
  context:    RuntimeAccessContext,
): RuntimeAccessScope {
  const config = resolveAccessScopeConfig(descriptor);
  const mode   = config.mode ?? "tenant";
  const fields = resolveAccessScopeFields(descriptor, config);
  const protectedFields = plane === "admin" ? [] : resolveProtectedScopeFields(descriptor, config, fields);

  for (const role of ALL_ROLES) {
    const explicit = explicitFieldForRole(config, role);
    if (explicit && !fields[role]) {
      return deniedScope(
        plane,
        mode,
        protectedFields,
        `Configured ${ROLE_LABELS[role].toLowerCase()} scope field "${explicit}" is not present on ${descriptor.entityCode}.`,
      );
    }
  }
  for (const role of config.requiredFields ?? []) {
    if (!fields[role]) {
      return deniedScope(
        plane,
        mode,
        protectedFields,
        `Required ${ROLE_LABELS[role].toLowerCase()} scope field is not present on ${descriptor.entityCode}.`,
      );
    }
  }

  const predicates: RuntimeScopePredicate[] = [];
  const labels: RuntimeAccessScopeLabel[] = [];

  const tenant = resolveTenantPredicate(plane, mode, fields.tenant, context, protectedFields);
  if (tenant.status === "denied") return tenant;
  if (tenant.predicate) predicates.push(tenant.predicate);
  labels.push(...tenant.labels);

  const planeScope = resolvePlanePredicate(plane, fields, context, protectedFields, mode);
  if (planeScope.status === "denied") return planeScope;
  if (planeScope.predicate) predicates.push(planeScope.predicate);
  labels.push(...planeScope.labels);

  return {
    plane,
    mode,
    status: "ready",
    source: "resolved",
    predicate: combineAnd(predicates),
    protectedFields,
    labels,
  };
}

export function createDelegatedAccessScope(
  plane:      RuntimeScopePlane,
  descriptor: RuntimeDescriptor,
): RuntimeAccessScope {
  const config = resolveAccessScopeConfig(descriptor);
  const fields = resolveAccessScopeFields(descriptor, config);
  return {
    plane,
    mode: config.mode ?? "tenant",
    status: "ready",
    source: "delegated",
    protectedFields: plane === "admin" ? [] : resolveProtectedScopeFields(descriptor, config, fields),
    labels: [],
  };
}

export function removeProtectedScopeFilters(
  state:           RuntimeListState,
  protectedFields: readonly string[],
): RuntimeListState {
  if (!state.filters || protectedFields.length === 0) return state;

  const protectedSet = new Set(protectedFields);
  const filters = Object.fromEntries(
    Object.entries(state.filters).filter(([field]) => !protectedSet.has(field)),
  );

  return {
    ...state,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}

export function applyAccessScopeToRawParams(
  params: RawSearchParams,
  scope:  RuntimeAccessScope,
): RawSearchParams {
  const filters = scopePredicateToFilterValues(scope.predicate);
  if (!filters) return params;

  const next: RawSearchParams = { ...params };
  for (const [field, values] of Object.entries(filters)) {
    if (values.length > 0) {
      next[`${P.FILTER_PFX}${field}`] = values.join(",");
    }
  }
  return next;
}

export function resolveAccessScopeConfig(descriptor: RuntimeDescriptor): RuntimeAccessScopeConfig {
  const fromExtensions = readConfigRecord(
    descriptor.extensions?.["access-scope"] ??
    descriptor.extensions?.["scope"] ??
    descriptor.extensions?.["runtimeScope"] ??
    descriptor.extensions?.["rbacScope"],
  );

  return mergeScopeConfigs(fromExtensions, descriptor.accessScope);
}

export function resolveAccessScopeFields(
  descriptor: RuntimeDescriptor,
  config:     RuntimeAccessScopeConfig = resolveAccessScopeConfig(descriptor),
): Partial<Record<RuntimeScopeFieldRole, string>> {
  const out: Partial<Record<RuntimeScopeFieldRole, string>> = {};
  for (const role of ALL_ROLES) {
    const field = resolveRoleField(descriptor, config, role);
    if (field) out[role] = field;
  }
  return out;
}

function resolveTenantPredicate(
  plane:           RuntimeScopePlane,
  mode:            RuntimeTenantScopeMode,
  tenantField:     string | undefined,
  context:         RuntimeAccessContext,
  protectedFields: string[],
): RuntimeAccessScope {
  if (mode === "global") {
    return context.allowGlobal
      ? readyPartial(plane, mode, protectedFields)
      : deniedScope(plane, mode, protectedFields, "Global scope requires explicit global access.");
  }

  if (mode === "system") {
    return context.allowSystem
      ? readyPartial(plane, mode, protectedFields)
      : deniedScope(plane, mode, protectedFields, "System scope requires explicit system access.");
  }

  if (!tenantField) {
    return deniedScope(plane, mode, protectedFields, "Tenant-scoped entity is missing tenant_id.");
  }

  const tenantId = firstNonBlank(context.tenantId);
  if (!tenantId) {
    return deniedScope(plane, mode, protectedFields, "Active session is missing tenant scope.");
  }

  if (mode === "tenant_overlay") {
    const items: RuntimeScopePredicate[] = [
      { op: "eq", field: tenantField, value: tenantId },
      { op: "isNull", field: tenantField },
    ];
    // Only include system-tenant clause when the caller explicitly provides an ID.
    // Falling back to DEFAULT_SYSTEM_TENANT_ID when systemTenantId is null would
    // always inject a spurious system-tenant predicate even when no overlay is intended.
    const systemTenantId = firstNonBlank(context.systemTenantId);
    if (systemTenantId) {
      items.push({ op: "eq", field: tenantField, value: systemTenantId });
    }
    return readyPartial(plane, mode, protectedFields, {
      predicate: { op: "or", items },
      labels: [scopeLabel("tenant", context, tenantId, "tenant overlay")],
    });
  }

  return readyPartial(plane, mode, protectedFields, {
    predicate: { op: "eq", field: tenantField, value: tenantId },
    labels: [scopeLabel("tenant", context, tenantId)],
  });
}

function resolvePlanePredicate(
  plane:           RuntimeScopePlane,
  fields:          Partial<Record<RuntimeScopeFieldRole, string>>,
  context:         RuntimeAccessContext,
  protectedFields: string[],
  mode:            RuntimeTenantScopeMode,
): RuntimeAccessScope {
  if (plane === "admin") {
    return readyPartial(plane, mode, protectedFields);
  }

  if (plane === "neon") {
    return resolveNeonPredicate(fields, context, protectedFields, mode);
  }

  return resolveMeshPredicate(fields, context, protectedFields, mode);
}

function resolveNeonPredicate(
  fields:          Partial<Record<RuntimeScopeFieldRole, string>>,
  context:         RuntimeAccessContext,
  protectedFields: string[],
  mode:            RuntimeTenantScopeMode,
): RuntimeAccessScope {
  const predicates: RuntimeScopePredicate[] = [];
  const labels: RuntimeAccessScopeLabel[] = [];

  const legalEntity = optionalEqScope("legalEntity", fields.legalEntity, context.loginLegalEntityId, context);
  if (legalEntity.status === "denied") return deniedScope("neon", mode, protectedFields, legalEntity.deniedReason);
  pushResolved(predicates, labels, legalEntity);

  const businessEntity = optionalInScope("businessEntity", fields.businessEntity, context.loginBusinessEntityIds, context);
  if (businessEntity.status === "denied") return deniedScope("neon", mode, protectedFields, businessEntity.deniedReason);
  pushResolved(predicates, labels, businessEntity);

  const companyCode = optionalInScope("companyCode", fields.companyCode, context.loginCompanyCodeIds, context);
  if (companyCode.status === "denied") return deniedScope("neon", mode, protectedFields, companyCode.deniedReason);
  pushResolved(predicates, labels, companyCode);

  return readyPartial("neon", mode, protectedFields, {
    predicate: combineAnd(predicates),
    labels,
  });
}

function resolveMeshPredicate(
  fields:          Partial<Record<RuntimeScopeFieldRole, string>>,
  context:         RuntimeAccessContext,
  protectedFields: string[],
  mode:            RuntimeTenantScopeMode,
): RuntimeAccessScope {
  const predicates: RuntimeScopePredicate[] = [];
  const labels: RuntimeAccessScopeLabel[] = [];

  const buyerIds = compactValues(context.accessibleBuyerOrgIds);
  if (fields.buyerOrg && buyerIds.length > 0) {
    predicates.push({ op: "in", field: fields.buyerOrg, values: buyerIds });
    labels.push(scopeLabel("buyerOrg", context, labelValues(buyerIds)));
  }

  const supplierIds = compactValues(context.accessibleSupplierOrgIds);
  if (fields.supplierOrg && supplierIds.length > 0) {
    predicates.push({ op: "in", field: fields.supplierOrg, values: supplierIds });
    labels.push(scopeLabel("supplierOrg", context, labelValues(supplierIds)));
  }

  const hasMeshScopeField = Boolean(fields.buyerOrg || fields.supplierOrg);
  if (hasMeshScopeField && predicates.length === 0) {
    return deniedScope("mesh", mode, protectedFields, "Active session is missing buyer or supplier account scope.");
  }

  return readyPartial("mesh", mode, protectedFields, {
    predicate: combineOr(predicates),
    labels,
  });
}

function optionalEqScope(
  role:    RuntimeScopeFieldRole,
  field:   string | undefined,
  value:   string | null | undefined,
  context: RuntimeAccessContext,
): RuntimeAccessScope {
  if (!field) return readyPartial("neon", "tenant", []);
  const id = firstNonBlank(value);
  if (!id) {
    return deniedScope("neon", "tenant", [], `Active session is missing ${ROLE_LABELS[role].toLowerCase()} scope.`);
  }
  return readyPartial("neon", "tenant", [], {
    predicate: { op: "eq", field, value: id },
    labels: [scopeLabel(role, context, id)],
  });
}

function optionalInScope(
  role:    RuntimeScopeFieldRole,
  field:   string | undefined,
  values:  string[] | undefined,
  context: RuntimeAccessContext,
): RuntimeAccessScope {
  if (!field) return readyPartial("neon", "tenant", []);
  if (values === undefined) return readyPartial("neon", "tenant", []);
  const ids = compactValues(values);
  if (ids.length === 0) {
    return deniedScope("neon", "tenant", [], `Active session is missing ${ROLE_LABELS[role].toLowerCase()} scope.`);
  }
  return readyPartial("neon", "tenant", [], {
    predicate: { op: "in", field, values: ids },
    labels: [scopeLabel(role, context, labelValues(ids))],
  });
}

function pushResolved(
  predicates: RuntimeScopePredicate[],
  labels:     RuntimeAccessScopeLabel[],
  scope:      RuntimeAccessScope,
) {
  if (scope.predicate) predicates.push(scope.predicate);
  labels.push(...scope.labels);
}

function readyPartial(
  plane:           RuntimeScopePlane,
  mode:            RuntimeTenantScopeMode,
  protectedFields: string[],
  extra:           Partial<Pick<RuntimeAccessScope, "predicate" | "labels">> = {},
): RuntimeAccessScope {
  return {
    plane,
    mode,
    status: "ready",
    source: "resolved",
    protectedFields,
    labels: extra.labels ?? [],
    predicate: extra.predicate,
  };
}

function deniedScope(
  plane:           RuntimeScopePlane,
  mode:            RuntimeTenantScopeMode,
  protectedFields: string[],
  deniedReason = "Access scope could not be resolved.",
): RuntimeAccessScope {
  return {
    plane,
    mode,
    status: "denied",
    source: "resolved",
    protectedFields,
    labels: [],
    deniedReason,
  };
}

function resolveProtectedScopeFields(
  descriptor: RuntimeDescriptor,
  config:     RuntimeAccessScopeConfig,
  fields:     Partial<Record<RuntimeScopeFieldRole, string>>,
): string[] {
  const protectedFields = [
    ...Object.values(fields),
    ...(config.protectedFields ?? []),
    ...ALL_ROLES.flatMap((role) => ROLE_FALLBACK_FIELDS[role]),
  ];
  const descriptorFields = new Set(descriptor.fields.flatMap((field) => [field.name, field.columnName].filter(Boolean) as string[]));
  return unique(protectedFields.filter((field) => descriptorFields.has(field)));
}

function resolveRoleField(
  descriptor: RuntimeDescriptor,
  config:     RuntimeAccessScopeConfig,
  role:       RuntimeScopeFieldRole,
): string | undefined {
  const explicit = explicitFieldForRole(config, role);
  if (explicit) return normalizeFieldRef(descriptor, explicit);

  const semanticMatch = descriptor.fields.find((field) => {
    if (field.scopeRole === role) return true;
    const semanticRole = normalizeToken(field.semanticRole);
    return semanticRole ? ROLE_SEMANTIC_TOKENS[role].includes(semanticRole) : false;
  });
  if (semanticMatch) return semanticMatch.name;

  for (const fallback of ROLE_FALLBACK_FIELDS[role]) {
    const field = normalizeFieldRef(descriptor, fallback);
    if (field) return field;
  }
  return undefined;
}

function normalizeFieldRef(descriptor: RuntimeDescriptor, ref: string): string | undefined {
  const wanted = ref.trim();
  if (!wanted) return undefined;
  return descriptor.fields.find((field) => field.name === wanted || field.columnName === wanted)?.name;
}

function explicitFieldForRole(
  config: RuntimeAccessScopeConfig,
  role:   RuntimeScopeFieldRole,
): string | undefined {
  return firstNonBlank(config.fields?.[role]);
}

function mergeScopeConfigs(
  base:     RuntimeAccessScopeConfig,
  override: RuntimeAccessScopeConfig | undefined,
): RuntimeAccessScopeConfig {
  if (!override) return base;
  return {
    mode: override.mode ?? base.mode,
    fields: {
      ...(base.fields ?? {}),
      ...(override.fields ?? {}),
    },
    requiredFields: override.requiredFields ?? base.requiredFields,
    protectedFields: unique([...(base.protectedFields ?? []), ...(override.protectedFields ?? [])]),
  };
}

function readConfigRecord(value: unknown): RuntimeAccessScopeConfig {
  const rec = asRecord(value);
  if (!rec) return {};

  const fieldsRecord = asRecord(rec["fields"]);
  const fields: Partial<Record<RuntimeScopeFieldRole, string>> = {};
  for (const role of ALL_ROLES) {
    const explicit =
      readString(fieldsRecord?.[role]) ??
      readString(rec[`${role}Field`]) ??
      readString(rec[`${toSnake(role)}_field`]) ??
      readString(rec[role]);
    if (explicit) fields[role] = explicit;
  }

  return {
    mode: readTenantScopeMode(rec["mode"] ?? rec["tenantMode"] ?? rec["tenant_mode"]),
    fields,
    requiredFields: readRoleList(rec["requiredFields"] ?? rec["required_fields"]),
    protectedFields: readStringList(rec["protectedFields"] ?? rec["protected_fields"]),
  };
}

function readTenantScopeMode(value: unknown): RuntimeTenantScopeMode | undefined {
  if (value !== "tenant" && value !== "tenant_overlay" && value !== "global" && value !== "system") return undefined;
  return value;
}

function readRoleList(value: unknown): RuntimeScopeFieldRole[] | undefined {
  const values = readStringList(value)
    .map((item) => item as RuntimeScopeFieldRole)
    .filter((item): item is RuntimeScopeFieldRole => ALL_ROLES.includes(item));
  return values.length > 0 ? values : undefined;
}

function readStringList(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
}

function scopePredicateToFilterValues(
  predicate: RuntimeScopePredicate | undefined,
): Record<string, string[]> | null {
  if (!predicate) return {};
  if (predicate.op === "eq") return { [predicate.field]: [predicate.value] };
  if (predicate.op === "in") return { [predicate.field]: predicate.values };
  if (predicate.op === "isNull" || predicate.op === "or") return null;

  const merged: Record<string, string[]> = {};
  for (const item of predicate.items) {
    const child = scopePredicateToFilterValues(item);
    if (!child) return null;
    for (const [field, values] of Object.entries(child)) {
      merged[field] = unique([...(merged[field] ?? []), ...values]);
    }
  }
  return merged;
}

function combineAnd(items: RuntimeScopePredicate[]): RuntimeScopePredicate | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  return { op: "and", items };
}

function combineOr(items: RuntimeScopePredicate[]): RuntimeScopePredicate | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  return { op: "or", items };
}

function scopeLabel(
  role:    RuntimeScopeFieldRole,
  context: RuntimeAccessContext,
  value:   string,
  suffix?: string,
): RuntimeAccessScopeLabel {
  const label = context.labels?.[role] ?? ROLE_LABELS[role];
  return {
    key: role,
    label,
    value: suffix ? `${value} (${suffix})` : value,
  };
}

function labelValues(values: string[]): string {
  return values.length <= 3 ? values.join(", ") : `${values.slice(0, 3).join(", ")} +${values.length - 3}`;
}

function compactValues(values: readonly string[] | undefined): string[] {
  return unique((values ?? []).flatMap((item) => {
    const value = firstNonBlank(item);
    return value ? [value] : [];
  }));
}

function firstNonBlank(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized || undefined;
}

function toSnake(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
