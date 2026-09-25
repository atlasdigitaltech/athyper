import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import { businessPartnerReadOperationContracts } from "./business-partner-read-runtime.js";

/** Explicit candidate migration, not a runtime fallback. Leaves all non-read
 * operations and downstream provider authorization untouched. */
export function reconcileBusinessPartnerReadContract(
  source: Readonly<Record<string, any>>,
) {
  const descriptor = structuredClone(source);
  const profile = parseEntityAuthorizationProfile(descriptor.authorization);
  const runtime = parseEntityAuthorizationRuntime(
    descriptor.authorizationRuntime,
    profile,
  );
  if (
    profile.entityCode !== "business_partner" ||
    profile.planeKey !== "neon" ||
    runtime.schemaVersion !== 1
  )
    throw Error("BP_READ_RECONCILIATION_COORDINATE_INVALID");
  const changes: {
    operation: string;
    property: string;
    before: string;
    after: string;
  }[] = [];
  for (const expected of businessPartnerReadOperationContracts()) {
    const operation = descriptor.authorization.operations.find(
      (o: any) => o.key === expected.key,
    );
    const binding = descriptor.authorizationRuntime.bindings.find(
      (b: any) => b.operation === expected.key,
    );
    const exposed = descriptor.operations?.[expected.key];
    if (
      !operation ||
      !binding ||
      !exposed ||
      exposed.code !== expected.key ||
      binding.handler !== `business_partner.${expected.key}.v1` ||
      binding.resolver !== operation.scope ||
      exposed.permissionCode !== operation.permissionCode
    )
      throw Error("BP_READ_RECONCILIATION_BINDING_DRIFT");
    // Permission/scope reconciliation cannot silently repair changed parent-read,
    // effect, target, discovery, preflight, handler or other operation semantics.
    for (const key of new Set([
      ...Object.keys(operation),
      ...Object.keys(expected),
    ])) {
      if (
        key !== "permissionCode" &&
        key !== "scope" &&
        operation[key] !== Reflect.get(expected, key)
      )
        throw Error("BP_READ_RECONCILIATION_SEMANTIC_DRIFT");
    }
    for (const property of ["permissionCode", "scope"] as const) {
      if (operation[property] !== expected[property])
        changes.push({
          operation: expected.key,
          property,
          before: operation[property],
          after: expected[property],
        });
      operation[property] = expected[property];
    }
    exposed.permissionCode = expected.permissionCode;
    binding.resolver = expected.scope;
  }
  const updated = parseEntityAuthorizationProfile(descriptor.authorization);
  parseEntityAuthorizationRuntime(descriptor.authorizationRuntime, updated);
  return { descriptor, changes };
}
