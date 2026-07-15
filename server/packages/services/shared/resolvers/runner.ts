/**
 * Resolver runner — validates inputs against the contract and invokes impl.
 *
 * Wraps lookupResolver/lookupResolverContract with consistent error semantics.
 * Used by:
 *   • BFF route (apps/neon/app/api/runtime/v1/resolvers/[code]/route.ts)
 *   • Server-side source-change validator (records/source-change-validation)
 */

import type { ResolverContext, ServerResolver } from "./registry.js";
import { lookupResolver, lookupResolverContract } from "./registry.js";

export type ResolverFailureCode =
  | "RESOLVER_NOT_FOUND"
  | "RESOLVER_MISSING_INPUTS"
  | "RESOLVER_INPUT_INVALID"
  | "RESOLVER_FAILED";

export interface ResolverSuccess {
  ok:    true;
  value: unknown | null;
}

export interface ResolverFailure {
  ok:           false;
  code:         ResolverFailureCode;
  message:      string;
  missingKeys?: string[];
}

export type ResolverResult = ResolverSuccess | ResolverFailure;

export async function runResolver(
  code:   string,
  inputs: Record<string, unknown>,
  ctx:    ResolverContext,
): Promise<ResolverResult> {
  const contract = lookupResolverContract(code);
  if (!contract) {
    return { ok: false, code: "RESOLVER_NOT_FOUND", message: `Unknown resolver code: ${code}` };
  }

  const missing = contract.requiredSources.filter((k) => {
    const v = inputs[k];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  if (missing.length > 0) {
    return {
      ok: false,
      code: "RESOLVER_MISSING_INPUTS",
      message: `Resolver ${code} requires inputs: ${missing.join(", ")}`,
      missingKeys: missing,
    };
  }

  const impl: ServerResolver | null = lookupResolver(code);
  if (!impl) {
    // contract exists but no impl — registry inconsistency, surface as not found
    return { ok: false, code: "RESOLVER_NOT_FOUND", message: `Resolver ${code} has no impl bound` };
  }

  try {
    const value = await impl(inputs, ctx);
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "RESOLVER_FAILED", message };
  }
}
