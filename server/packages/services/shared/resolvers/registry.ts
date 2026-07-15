/**
 * Server-side resolver registry.
 *
 * A resolver is a named function that produces a value from a set of form
 * inputs. Used by `on_source_change.action="rederive"` rules to fill a
 * dependent field after a source field changes.
 *
 * Server impls receive a tenant-scoped Kysely connection. They MUST NOT
 * trust `inputs.tenant_id` — always use `ctx.tenantId`. Return null when
 * the input set is insufficient; never throw.
 *
 * Spec: docs/specs/source-change-resolver-registry.md
 */

import type { Kysely } from "kysely";
import type { ResolverContract } from "@athyper/cascade";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface ResolverContext {
  tenantId: string;
  userId:   string;
  db:       AnyDb;
}

export type ServerResolver<T = unknown> = (
  inputs: Record<string, unknown>,
  ctx:    ResolverContext,
) => Promise<T | null>;

interface RegisteredResolver<T = unknown> {
  contract: ResolverContract;
  impl:     ServerResolver<T>;
}

const REGISTRY = new Map<string, RegisteredResolver>();

export function registerResolver<T>(contract: ResolverContract, impl: ServerResolver<T>): void {
  if (REGISTRY.has(contract.code)) {
    throw new Error(`Resolver already registered: ${contract.code}`);
  }
  REGISTRY.set(contract.code, { contract: contract, impl: impl as ServerResolver });
}

export function lookupResolver(code: string): ServerResolver | null {
  return REGISTRY.get(code)?.impl ?? null;
}

export function lookupResolverContract(code: string): ResolverContract | null {
  return REGISTRY.get(code)?.contract ?? null;
}

export function listResolverContracts(): ResolverContract[] {
  return Array.from(REGISTRY.values())
    .map((r) => r.contract)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function resetRegistryForTests(): void {
  REGISTRY.clear();
}
