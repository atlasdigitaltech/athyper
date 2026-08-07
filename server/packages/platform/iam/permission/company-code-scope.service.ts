import type { EffectivePermissionContext } from "../permission-context/types.js";

export interface ScopeResolutionResult {
  readonly principalId: string;
  readonly tenantId: string;
  readonly permissionCode: string;
  readonly companyCodeIds: readonly string[];
  readonly isUnrestricted: boolean;
}

/**
 * Reads the permission-specific scope already materialized by the canonical
 * evaluator. It performs no database lookup and cannot fall back to a
 * principal-wide or tenant-wide grant.
 */
export function resolveCompanyCodeScope(
  context: EffectivePermissionContext,
  permissionCode: string,
): ScopeResolutionResult {
  const exactCode = permissionCode.trim();
  const scope = context.authorizationScopes.get(exactCode);
  const authorized = context.allowed.has(exactCode);
  if (!exactCode || !authorized || !scope) {
    return {
      principalId: context.principalId,
      tenantId: context.tenantId,
      permissionCode: exactCode,
      companyCodeIds: [],
      isUnrestricted: false,
    };
  }
  return {
    principalId: context.principalId,
    tenantId: context.tenantId,
    permissionCode: exactCode,
    companyCodeIds: [...scope.companyCodeIds].sort(),
    isUnrestricted: scope.tenantWide,
  };
}

export function hasCompanyCodeAccess(
  context: EffectivePermissionContext,
  permissionCode: string,
  companyCodeId: string,
): boolean {
  const scope = resolveCompanyCodeScope(context, permissionCode);
  return scope.isUnrestricted || scope.companyCodeIds.includes(companyCodeId);
}
