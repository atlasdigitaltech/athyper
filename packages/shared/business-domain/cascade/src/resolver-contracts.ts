/**
 * Resolver contract types â€” shared between server registry and client adapter.
 *
 * A resolver is a named function that produces a value from a set of form
 * inputs. Used by `on_source_change.action="rederive"` rules.
 *
 * Server impl lives in `server/packages/services/shared/resolvers/`.
 * Client adapter lives in `packages/shared/runtime-domain/runtime-shared/src/resolvers/client.ts`.
 *
 * Spec: docs/specs/source-change-resolver-registry.md
 */

export type ResolverCode = string & { readonly __brand: "ResolverCode" };

export type ResolverOutputType = "uuid" | "string" | "number" | "enum" | "object";

export interface ResolverContract {
  /** Canonical code, e.g. "supplier.default_payment_term". */
  code:            ResolverCode;
  /** Human-readable description for docs/admin UI. */
  description:     string;
  /** Form fields the resolver needs as inputs. */
  requiredSources: string[];
  outputType:      ResolverOutputType;
  /** When outputType="uuid", the FK target entity_code for CI cross-check. */
  targetEntity?:   string;
}

export function isResolverCode(value: string): value is ResolverCode {
  // <domain>.<intent> shape, both segments lowercase snake_case.
  return /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(value);
}

export function asResolverCode(value: string): ResolverCode {
  if (!isResolverCode(value)) {
    throw new Error(`Invalid resolver code: ${value}. Expected '<domain>.<intent>' (lowercase snake_case).`);
  }
  return value as ResolverCode;
}
