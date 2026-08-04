import type { Kysely } from "kysely";
import { checkPermission } from "@athyper/svc-iam";
import type { AttachmentAuthContext } from "@athyper/svc-shared";

// This is deliberately a service boundary, rather than route-local checks:
// attachments are resources of an entity and must use the same permission
// vocabulary as records. Reads use the platform-wide `read` permission; write
// actions additionally require the entity's configured mutation operation.
export type AttachmentAuthorizationAction =
  | "read" | "create_attachment" | "read_attachment"
  | "update_attachment" | "delete_attachment" | "reindex_attachment";

export type AttachmentAuthorizationOutcome =
  | { allowed: true; tenantId: string; realmKey: string; principalId: string }
  | { allowed: false; error: string; message: string };

type AttachmentAuthorizationLogger = {
  info?(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const ATTACHMENT_PERMISSION: Record<AttachmentAuthorizationAction, string> = {
  read: "attachment.read",
  create_attachment: "attachment.create",
  read_attachment: "attachment.read",
  update_attachment: "attachment.update",
  delete_attachment: "attachment.delete",
  reindex_attachment: "attachment.reindex",
};

const PARENT_ACTION: Record<AttachmentAuthorizationAction, "read" | "update"> = {
  read: "read", read_attachment: "read", create_attachment: "update",
  update_attachment: "update", delete_attachment: "update", reindex_attachment: "update",
};

export async function authorizeAttachmentAccess(input: {
  db: AnyDb;
  context: AttachmentAuthContext;
  entityCode: string;
  entityId: string;
  action: AttachmentAuthorizationAction;
  logger?: AttachmentAuthorizationLogger;
}): Promise<AttachmentAuthorizationOutcome> {
  const tenantId = input.context.tenantId;
  const tenantCode = input.context.tenantCode;
  const realmKey = input.context.realmKey;
  input.logger?.info?.("attachment_auth_context_start", {
    action: input.action,
    entityCode: input.entityCode,
    hasSubject: Boolean(input.context.subject),
    hasClaimRealm: Boolean(realmKey),
    tenantCode,
    hasRealmHeader: Boolean(input.context.headerRealm?.trim()),
  });
  const denyWithContext = (error: string, message: string): AttachmentAuthorizationOutcome => {
    input.logger?.warn?.("attachment_auth_context_denied", {
      action: input.action,
      entityCode: input.entityCode,
      entityId: input.entityId,
      tenantCode,
      realmKey,
      realmHeader: input.context.headerRealm,
      reason: error,
    });
    return deny(error, message);
  };

  const parentAction = PARENT_ACTION[input.action];
  // control.entity_operation is an action/mutation registry, not the source of
  // runtime read capability. Readable entities are already resolved through
  // control.entity.read_capability by the route, and every record read uses the
  // canonical `read` permission granted through canonical role/group authority.
  const parentPermission = parentAction === "read"
    ? "read"
    : await resolveEntityOperationPermission(input.db, input.entityCode, tenantId, parentAction);
  if (!parentPermission) return deny("ENTITY_OPERATION_REQUIRED", `Entity '${input.entityCode}' has no active ${PARENT_ACTION[input.action]} operation.`);
  for (const permissionCode of [parentPermission, ATTACHMENT_PERMISSION[input.action]]) {
    const decision = await checkPermission(input.db, tenantId, input.context.principalId, permissionCode, {
      entity_type: input.entityCode, entity_id: input.entityId,
    });
    if (decision.decision !== "allow") {
      return denyWithContext("PERMISSION_DENIED", `Permission '${permissionCode}' is required for this attachment action.`);
    }
  }
  input.logger?.info?.("attachment_auth_context_success", {
    action: input.action,
    tenantId,
    realmKey,
    tenantCode,
    entityCode: input.entityCode,
    entityId: input.entityId,
  });
  return { allowed: true, tenantId, realmKey, principalId: input.context.principalId };
}

async function resolveEntityOperationPermission(db: AnyDb, entityCode: string, tenantId: string, action: "read" | "update"): Promise<string | null> {
  const rows = await db.selectFrom("control.entity_operation as eo")
    .innerJoin("control.auth_permission as p", "p.id" as never, "eo.permission_id_v2" as never)
    .select(["p.canonical_code as permission_code", "eo.is_enabled", "eo.tenant_id"] as never[])
    .where("eo.entity_name" as never, "=", entityCode as never)
    .where("eo.operation_code_v2" as never, "=", action as never)
    .where("eo.v2_publication_status" as never, "=", "published" as never)
    .where("p.status" as never, "=", "published" as never)
    .where((eb: any) => eb.or([eb("eo.tenant_id" as never, "is" as never, null), eb("eo.tenant_id" as never, "=" as never, tenantId as never)]))
    .execute() as Array<{ permission_code: string; is_enabled: boolean; tenant_id: string | null }>;
  const candidates = rows.filter((row) => row.is_enabled);
  candidates.sort((a, b) => Number(b.tenant_id === tenantId) - Number(a.tenant_id === tenantId));
  return candidates[0]?.permission_code ?? null;
}

function deny(error: string, message: string): AttachmentAuthorizationOutcome { return { allowed: false, error, message }; }
