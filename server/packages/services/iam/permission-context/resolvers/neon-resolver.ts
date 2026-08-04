import type { PermissionResolver } from "../types.js";
import type { EffectivePermissionEntry } from "../types.js";
import type { PermissionBatchResult } from "../../permission/permission.types.js";
import {
  createCanonicalResolver,
  type CanonicalResolverDeps,
} from "./base.js";

export type NeonResolverDeps = CanonicalResolverDeps;

export function createNeonResolver(
  deps: NeonResolverDeps,
): PermissionResolver {
  return createCanonicalResolver("neon", deps);
}

/**
 * Pure legacy-decision partition retained for rollout comparison tests. Runtime
 * resolution uses createCanonicalResolver and never reads the retired schema.
 */
export function partitionDecisions(
  decisions: PermissionBatchResult,
  planeEligible: ReadonlyMap<string, { readonly code: string }>,
): {
  allowed: ReadonlySet<string>;
  denied: ReadonlySet<string>;
  planLocked: ReadonlySet<string>;
  planeExcluded: ReadonlySet<string>;
  entries: ReadonlyMap<string, EffectivePermissionEntry>;
} {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  const planLocked = new Set<string>();
  const planeExcluded = new Set<string>();
  const entries = new Map<string, EffectivePermissionEntry>();

  for (const [code, raw] of Object.entries(decisions)) {
    if (!planeEligible.has(code)) {
      planeExcluded.add(code);
      entries.set(code, { code, status: "missing", reason: "plane_excluded" });
      continue;
    }
    switch (raw.decision) {
      case "allow":
        allowed.add(code);
        entries.set(code, { code, status: "allow", reason: "allowed" });
        break;
      case "deny":
        denied.add(code);
        entries.set(code, { code, status: "deny", reason: "denied_by_grant" });
        break;
      case "not_in_plan":
      case "addon_required":
        planLocked.add(code);
        entries.set(code, { code, status: "not_in_plan", reason: "plan_locked" });
        break;
      default:
        entries.set(code, { code, status: "missing", reason: "missing_permission" });
    }
  }
  return { allowed, denied, planLocked, planeExcluded, entries };
}
