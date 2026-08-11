import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasServiceError } from "./errors.js";

export function assertAtlasContext(context: VerifiedRequestContext): void {
  const valid = Boolean(
    context.tenantId.trim()
    && context.principalId.trim()
    && context.realmKey.trim()
    && context.requestId.trim()
    && context.profileHash.trim()
    && Number.isSafeInteger(context.authEpoch)
    && context.authEpoch >= 0
    && context.permissions.tenantId === context.tenantId
    && context.permissions.principalId === context.principalId
    && context.permissions.planeKey === context.planeKey
    && context.permissions.profileHash === context.profileHash,
  );
  if (!valid) throw new AtlasServiceError("INVALID_CONTEXT", "Atlas requires one internally consistent verified request context.");
}

export function hasPermission(context: VerifiedRequestContext, code: string): boolean {
  return context.permissions.allowed.includes(code)
    && !context.permissions.denied.includes(code)
    && !context.permissions.planLocked.includes(code)
    && !context.permissions.planeExcluded.includes(code);
}
