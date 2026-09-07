import { parseInstant } from "@athyper/platform-temporal";

export interface PlanRevision {
  readonly planCode: string;
  readonly revision: number;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly modules: readonly string[];
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number | null>>;
}
export interface EntitlementDecision {
  readonly entitled: boolean;
  readonly reason: "included" | "not_in_plan" | "limit_exceeded" | "no_effective_plan";
  readonly revision?: number;
}
export function revisePlan(history: readonly PlanRevision[], input: Omit<PlanRevision, "revision" | "effectiveTo">): readonly PlanRevision[] {
  const from = parseInstant(input.effectiveFrom);
  if (!Number.isFinite(from)) throw new TypeError("effectiveFrom must be a timestamp");
  const latest = history.filter(r => r.planCode === input.planCode).sort((a,b) => b.revision-a.revision)[0];
  if (latest && from <= parseInstant(latest.effectiveFrom)) throw new TypeError("Plan revisions must move effectiveFrom forward");
  for (const limit of Object.values(input.limits)) {
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new TypeError("Plan limits must be nonnegative safe integers or null for unlimited");
  }
  const closed = latest && !latest.effectiveTo ? history.map(r => r === latest ? {...r,effectiveTo:input.effectiveFrom} : r) : history;
  return [...closed,{...input,modules:Object.freeze([...new Set(input.modules)]),features:Object.freeze([...new Set(input.features)]),
    limits:Object.freeze({...input.limits}),revision:(latest?.revision ?? 0)+1}];
}

/** Commercial availability only. Callers must enforce IAM independently. */
export function evaluateEntitlement(history: readonly PlanRevision[], planCode: string, at: string,
  request: { feature?: string; module?: string; limit?: string; usage?: number }): EntitlementDecision {
  const when = parseInstant(at);
  if (!Number.isFinite(when)) throw new TypeError("at must be a timestamp");
  const plan = history.filter(r => r.planCode === planCode && parseInstant(r.effectiveFrom) <= when
    && (!r.effectiveTo || parseInstant(r.effectiveTo) > when)).sort((a,b) => b.revision-a.revision)[0];
  if (!plan) return {entitled:false,reason:"no_effective_plan"};
  if ((request.feature !== undefined && !plan.features.includes(request.feature))
    || (request.module !== undefined && !plan.modules.includes(request.module))) return {entitled:false,reason:"not_in_plan",revision:plan.revision};
  if (request.limit !== undefined) {
    if (!Object.hasOwn(plan.limits,request.limit)) return {entitled:false,reason:"not_in_plan",revision:plan.revision};
    const ceiling = plan.limits[request.limit], usage = request.usage ?? 0;
    if (!Number.isSafeInteger(usage) || usage < 0 || (ceiling !== null &&
      (!Number.isSafeInteger(ceiling) || ceiling! < 0 || usage >= ceiling!))) return {entitled:false,reason:"limit_exceeded",revision:plan.revision};
  }
  return {entitled:true,reason:"included",revision:plan.revision};
}
