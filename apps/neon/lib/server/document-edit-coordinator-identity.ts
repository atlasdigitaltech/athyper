import "server-only";

import { createHash } from "node:crypto";
import type { V4Session } from "@athyper/auth-bff";
import type { DocumentEditCoordinatorIdentity } from "@athyper/runtime-canvas";
import { PLANE_KEY } from "@/lib/plane";
import { getNeonServerSession } from "@/lib/server/session";

type RuntimeRecordLike = Record<string, unknown>;

export async function getDocumentEditCoordinatorIdentity(
  record?: RuntimeRecordLike | null,
): Promise<DocumentEditCoordinatorIdentity | undefined> {
  const session = await getNeonServerSession();
  if (!session) return undefined;

  return buildDocumentEditCoordinatorIdentity(session, record);
}

export function buildDocumentEditCoordinatorIdentity(
  session: V4Session,
  record?: RuntimeRecordLike | null,
): DocumentEditCoordinatorIdentity | undefined {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const tenantId =
    membership?.tenantId ??
    readString(record, "tenant_id") ??
    readString(record, "tenantId");

  if (!tenantId) return undefined;

  return {
    tenantId,
    planeKey: session.planeKey ?? PLANE_KEY,
    realmKey: session.realmKey,
    effectivePrincipal: session.userId,
    permissionStamp: buildDocumentEditPermissionStamp(session),
  };
}

export function buildDocumentEditPermissionStamp(session: V4Session): string {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const payload = {
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    contextType: membership?.contextType,
    legalEntityId: membership?.legalEntityId,
    organizationId: membership?.organizationId,
    planeKey: session.planeKey,
    realmKey: session.realmKey,
    roles: [...new Set(membership?.roles ?? [])].sort(),
    tenantId: membership?.tenantId,
    userId: session.userId,
    workspaceId: membership?.workspaceId,
  };

  return `neon-permissions-v1:${hashJson(payload)}`;
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function readString(record: RuntimeRecordLike | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
