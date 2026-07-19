import { z } from "zod";

export const EntityListCacheModeSchema = z.enum([
  "disabled",
  "memory",
  "stale_while_revalidate",
]);
export const EntityListCachePrefetchSchema = z.enum(["none", "intent", "viewport", "eager"]);
export const EntityListCacheStorageSchema = z.enum(["memory", "session", "persistent"]);
export const EntityListCachePolicySourceSchema = z.enum(["platform", "entity_class", "entity", "tenant"]);

const policyFields = {
  mode: EntityListCacheModeSchema,
  fresh_for_seconds: z.number().int().min(0).max(3_600),
  retain_for_seconds: z.number().int().min(0).max(86_400),
  prefetch: EntityListCachePrefetchSchema,
  restore_scroll: z.boolean(),
  invalidate_on_mutation: z.boolean(),
  max_queries_per_entity: z.number().int().min(1).max(20),
  max_rows_per_query: z.number().int().min(1).max(500),
  storage: EntityListCacheStorageSchema,
} as const;

export const EntityListCachePolicyValuesSchema = z.object(policyFields).strict().superRefine(
  (policy, ctx) => {
    if (policy.retain_for_seconds < policy.fresh_for_seconds) {
      ctx.addIssue({
        code: "custom",
        path: ["retain_for_seconds"],
        message: "retain_for_seconds must be greater than or equal to fresh_for_seconds",
      });
    }
  },
);
export type EntityListCachePolicyValues = z.infer<typeof EntityListCachePolicyValuesSchema>;

export const EntityListCachePolicyOverrideSchema = z.object({
  mode: policyFields.mode.optional(),
  fresh_for_seconds: policyFields.fresh_for_seconds.optional(),
  retain_for_seconds: policyFields.retain_for_seconds.optional(),
  prefetch: policyFields.prefetch.optional(),
  restore_scroll: policyFields.restore_scroll.optional(),
  invalidate_on_mutation: policyFields.invalidate_on_mutation.optional(),
  max_queries_per_entity: policyFields.max_queries_per_entity.optional(),
  max_rows_per_query: policyFields.max_rows_per_query.optional(),
  storage: policyFields.storage.optional(),
}).strict().superRefine((policy, ctx) => {
  if (policy.fresh_for_seconds !== undefined
      && policy.retain_for_seconds !== undefined
      && policy.retain_for_seconds < policy.fresh_for_seconds) {
    ctx.addIssue({
      code: "custom",
      path: ["retain_for_seconds"],
      message: "retain_for_seconds must be greater than or equal to fresh_for_seconds",
    });
  }
});
export type EntityListCachePolicyOverride = z.infer<typeof EntityListCachePolicyOverrideSchema>;

export const EntityClassListCachePolicySchema = z.object({
  mode: policyFields.mode.optional(),
  fresh_for_seconds: policyFields.fresh_for_seconds.optional(),
  retain_for_seconds: policyFields.retain_for_seconds.optional(),
  prefetch: policyFields.prefetch.optional(),
  restore_scroll: policyFields.restore_scroll.optional(),
  invalidate_on_mutation: policyFields.invalidate_on_mutation.optional(),
  max_queries_per_entity: policyFields.max_queries_per_entity.optional(),
  max_rows_per_query: policyFields.max_rows_per_query.optional(),
  storage: policyFields.storage.optional(),
  eager_prefetch_allowed: z.boolean().default(false),
}).strict().superRefine((policy, ctx) => {
  if (policy.fresh_for_seconds !== undefined
      && policy.retain_for_seconds !== undefined
      && policy.retain_for_seconds < policy.fresh_for_seconds) {
    ctx.addIssue({
      code: "custom",
      path: ["retain_for_seconds"],
      message: "retain_for_seconds must be greater than or equal to fresh_for_seconds",
    });
  }
});
export type EntityClassListCachePolicy = z.infer<typeof EntityClassListCachePolicySchema>;

export const EntityListCachePolicySchema = EntityListCachePolicyValuesSchema.and(z.object({
  source: EntityListCachePolicySourceSchema,
}).strict());
export type EntityListCachePolicy = z.infer<typeof EntityListCachePolicySchema>;

export const PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY: EntityListCachePolicyValues = Object.freeze({
  mode: "stale_while_revalidate",
  fresh_for_seconds: 20,
  retain_for_seconds: 300,
  prefetch: "intent",
  restore_scroll: true,
  invalidate_on_mutation: true,
  max_queries_per_entity: 5,
  max_rows_per_query: 200,
  storage: "memory",
});

export type EntityListCachePolicyAuditCode =
  | "CACHE_POLICY_SCHEMA_INVALID"
  | "CACHE_POLICY_NEGATIVE_TTL"
  | "CACHE_POLICY_RETENTION_TOO_SHORT"
  | "CACHE_POLICY_RESTRICTED_PERSISTENCE"
  | "CACHE_POLICY_EAGER_PREFETCH_FORBIDDEN"
  | "CACHE_POLICY_MUTATION_INVALIDATION_REQUIRED";

export interface EntityListCachePolicyAuditIssue {
  code: EntityListCachePolicyAuditCode;
  path: string;
  message: string;
  layer: "platform" | "entity_class" | "entity" | "tenant" | "effective";
}

export interface ResolveEntityListCachePolicyInput {
  platformPolicy?: unknown;
  entityClassPolicy?: unknown;
  entityPolicy?: unknown;
  tenantPolicy?: unknown;
  dataClassification?: string | null;
  mutable: boolean;
}

export class EntityListCachePolicyValidationError extends Error {
  constructor(readonly issues: readonly EntityListCachePolicyAuditIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "EntityListCachePolicyValidationError";
  }
}

export function auditEntityListCachePolicy(
  input: ResolveEntityListCachePolicyInput,
): EntityListCachePolicyAuditIssue[] {
  return resolveWithAudit(input).issues;
}

export function resolveEntityListCachePolicy(
  input: ResolveEntityListCachePolicyInput,
): EntityListCachePolicy {
  const result = resolveWithAudit(input);
  if (!result.policy || result.issues.length > 0) {
    throw new EntityListCachePolicyValidationError(result.issues);
  }
  return result.policy;
}

function resolveWithAudit(input: ResolveEntityListCachePolicyInput): {
  policy?: EntityListCachePolicy;
  issues: EntityListCachePolicyAuditIssue[];
} {
  const issues: EntityListCachePolicyAuditIssue[] = [];
  const platformResult = EntityListCachePolicyValuesSchema.safeParse(
    input.platformPolicy ?? PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
  );
  const classResult = EntityClassListCachePolicySchema.safeParse(input.entityClassPolicy ?? {});
  const entityResult = EntityListCachePolicyOverrideSchema.safeParse(input.entityPolicy ?? {});
  const tenantResult = EntityListCachePolicyOverrideSchema.safeParse(input.tenantPolicy ?? {});

  if (!platformResult.success) issues.push(...zodAuditIssues("platform", platformResult.error.issues));
  if (!classResult.success) issues.push(...zodAuditIssues("entity_class", classResult.error.issues));
  if (!entityResult.success) issues.push(...zodAuditIssues("entity", entityResult.error.issues));
  if (!tenantResult.success) issues.push(...zodAuditIssues("tenant", tenantResult.error.issues));
  if (!platformResult.success || !classResult.success || !entityResult.success || !tenantResult.success) return { issues };

  const { eager_prefetch_allowed: eagerPrefetchAllowed, ...classPolicy } = classResult.data;
  const merged = {
    ...platformResult.data,
    ...definedPolicyValues(classPolicy),
    ...definedPolicyValues(entityResult.data),
    ...definedPolicyValues(tenantResult.data),
  };
  const effectiveResult = EntityListCachePolicyValuesSchema.safeParse(merged);
  if (!effectiveResult.success) {
    issues.push(...zodAuditIssues("effective", effectiveResult.error.issues));
    return { issues };
  }

  const effective = effectiveResult.data;
  if (input.dataClassification?.trim().toLowerCase() === "restricted"
      && effective.storage === "persistent") {
    issues.push({
      code: "CACHE_POLICY_RESTRICTED_PERSISTENCE",
      layer: "effective",
      path: "storage",
      message: "restricted entities cannot use persistent browser storage",
    });
  }
  if (effective.prefetch === "eager" && !eagerPrefetchAllowed) {
    issues.push({
      code: "CACHE_POLICY_EAGER_PREFETCH_FORBIDDEN",
      layer: "effective",
      path: "prefetch",
      message: "eager prefetch is not allowed by the entity-class policy",
    });
  }
  if (input.mutable && effective.invalidate_on_mutation !== true) {
    issues.push({
      code: "CACHE_POLICY_MUTATION_INVALIDATION_REQUIRED",
      layer: "effective",
      path: "invalidate_on_mutation",
      message: "mutable entities must invalidate cached lists after mutations",
    });
  }

  const source = hasPolicyValues(tenantResult.data)
    ? "tenant" as const
    : hasPolicyValues(entityResult.data)
      ? "entity" as const
      : hasPolicyValues(classPolicy)
        ? "entity_class" as const
        : "platform" as const;
  return {
    policy: EntityListCachePolicySchema.parse({ ...effective, source }),
    issues,
  };
}

function definedPolicyValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function hasPolicyValues(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

function zodAuditIssues(
  layer: EntityListCachePolicyAuditIssue["layer"],
  zodIssues: readonly z.core.$ZodIssue[],
): EntityListCachePolicyAuditIssue[] {
  return zodIssues.map((issue) => {
    const path = issue.path.map(String).join(".") || "$";
    const field = issue.path.at(-1);
    const code = (field === "fresh_for_seconds" || field === "retain_for_seconds")
      && issue.code === "too_small"
      ? "CACHE_POLICY_NEGATIVE_TTL" as const
      : field === "retain_for_seconds" && issue.code === "custom"
        ? "CACHE_POLICY_RETENTION_TOO_SHORT" as const
        : "CACHE_POLICY_SCHEMA_INVALID" as const;
    return { code, layer, path, message: issue.message };
  });
}
