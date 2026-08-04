import type {
  CollectionDecisionResult,
  ResourceCoordinates,
  ScopeConstraint,
} from "./types.js";

export function isValidScope(scope: ScopeConstraint): boolean {
  if (!scope.scopeId || !scope.tenantOrAccountId) return false;
  if (scope.tenantWide) {
    return Object.values(scope.dimensions).every(
      (values) => values === undefined || values.length === 0,
    );
  }
  return Object.values(scope.dimensions).some(
    (values) => values !== undefined && values.length > 0,
  );
}

export function scopeMatches(
  scope: ScopeConstraint,
  resource: ResourceCoordinates,
): boolean {
  if (!isValidScope(scope)) return false;
  if (scope.tenantOrAccountId !== resource.tenantOrAccountId) return false;
  if (scope.tenantWide) return true;

  for (const [dimension, allowedValues] of Object.entries(scope.dimensions)) {
    if (!allowedValues || allowedValues.length === 0) return false;
    const actual = resource.dimensions[
      dimension as keyof ResourceCoordinates["dimensions"]
    ];
    if (!actual || !allowedValues.includes(actual)) return false;
  }
  return true;
}

export function proofPathMatches(
  constraints: readonly ScopeConstraint[],
  resource: ResourceCoordinates,
): boolean {
  return constraints.length > 0
    && constraints.every((scope) => scopeMatches(scope, resource));
}

/**
 * Proves child is no broader than parent. Extra dimensions on child make it
 * narrower. Every parent dimension must exist on child with a subset of IDs.
 */
export function isScopeSubset(
  child: ScopeConstraint,
  parent: ScopeConstraint,
): boolean {
  if (!isValidScope(child) || !isValidScope(parent)) return false;
  if (child.tenantOrAccountId !== parent.tenantOrAccountId) return false;
  if (parent.tenantWide) return true;
  if (child.tenantWide) return false;

  for (const [dimension, parentValues] of Object.entries(parent.dimensions)) {
    if (!parentValues || parentValues.length === 0) return false;
    const childValues = child.dimensions[
      dimension as keyof ScopeConstraint["dimensions"]
    ];
    if (!childValues || childValues.length === 0) return false;
    if (!childValues.every((value) => parentValues.includes(value))) {
      return false;
    }
  }
  return true;
}

export interface CollectionCandidate extends ResourceCoordinates {
  readonly entityId: string;
  readonly recordId: string;
}

/**
 * Reference materializer used by repository truth tables. Production
 * repositories may compile equivalent SQL predicates, but the algebra stays
 * here: cross-path union, within-path intersection, deny subtraction, and a
 * separate ACL record set.
 */
export function applyCollectionMaterialization(
  result: CollectionDecisionResult,
  candidates: readonly CollectionCandidate[],
): ReadonlySet<string> {
  if (result.decision === "deny") return new Set();
  const allowed = new Set<string>();

  for (const candidate of candidates) {
    const denied = result.materialization.denyScopes.some((scope) =>
      scopeMatches(scope, candidate)
    );
    if (denied) continue;

    const organizational = result.materialization.organizationalAllowClauses
      .some((clause) => proofPathMatches(clause.intersection, candidate));
    const shared = result.materialization.sharedRecords.some((record) =>
      record.entityId === candidate.entityId
      && record.recordId === candidate.recordId
    );
    if (organizational || shared) allowed.add(candidate.recordId);
  }
  return allowed;
}
