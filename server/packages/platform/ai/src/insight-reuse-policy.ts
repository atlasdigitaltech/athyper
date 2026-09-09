import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext } from "./context.js";

/** Server-produced canonical scope includes filters, selections, transaction scope and as-of. */
export interface AtlasInsightReuseBinding {
  readonly canonicalScope: string;
  readonly descriptorVersions: readonly string[];
  readonly ruleVersions: readonly string[];
  readonly dataRevisions: readonly string[];
  readonly intent: string;
  readonly locale: string;
}
export interface AtlasInsightLineage {
  readonly schemaVersion: 1;
  readonly bindingKey: string;
  readonly claims: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
}
export function atlasInsightReuseKey(
  context: VerifiedRequestContext,
  binding: AtlasInsightReuseBinding,
): string {
  assertAtlasContext(context);
  const versions = (items: readonly string[]) => {
    if (!items.length || items.some((v) => !v.trim()))
      throw new TypeError(
        "Insight reuse requires complete version coordinates.",
      );
    return [...new Set(items)].sort();
  };
  if (
    ![binding.canonicalScope, binding.intent, binding.locale].every((v) =>
      v.trim(),
    )
  )
    throw new TypeError("Insight reuse requires a complete scope.");
  return `atlas:insight:v1:${createHash("sha256")
    .update(
      JSON.stringify([
        context.tenantId,
        context.principalId,
        context.planeKey,
        context.profileHash,
        context.authEpoch,
        binding.canonicalScope,
        versions(binding.descriptorVersions),
        versions(binding.ruleVersions),
        versions(binding.dataRevisions),
        binding.intent,
        binding.locale,
      ]),
    )
    .digest("hex")}`;
}

/** Shared gate for exact-context cache and durable evidence lineage. No cache is enabled here.
 * Call immediately before each disclosure; hashes/epochs never replace live authorization.
 * Whole prose is withheld on failure. The caller must include all inherited evidence claims.
 */
export async function mayReuseAtlasInsight(input: {
  readonly context: VerifiedRequestContext;
  readonly binding: AtlasInsightReuseBinding;
  readonly lineage: AtlasInsightLineage | null;
  readonly now: Date;
  readonly maxAgeMs: number;
  readonly authorize: (
    context: VerifiedRequestContext,
    claim: string,
  ) => Promise<boolean>;
}): Promise<boolean> {
  try {
    const { lineage, now, maxAgeMs } = input;
    if (
      !lineage ||
      lineage.schemaVersion !== 1 ||
      !lineage.claims.length ||
      lineage.claims.some((c) => !c.trim()) ||
      !Number.isFinite(maxAgeMs) ||
      maxAgeMs <= 0
    )
      return false;
    const start = Date.parse(lineage.createdAt),
      end = Date.parse(lineage.expiresAt),
      time = now.getTime();
    if (
      ![start, end, time].every(Number.isFinite) ||
      start > time ||
      end <= time ||
      end <= start ||
      time - start >= maxAgeMs
    )
      return false;
    if (
      lineage.bindingKey !== atlasInsightReuseKey(input.context, input.binding)
    )
      return false;
    for (const claim of lineage.claims)
      if (!(await input.authorize(input.context, claim))) return false;
    return true;
  } catch {
    return false;
  }
}
