import { timingSafeEqual } from "node:crypto";
import type { ApiProblem } from "@athyper/contract-platform-api";

export type RelayMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RelayRequestClass = "json" | "upload" | "download" | "stream";
export interface RelayOperation {
  readonly id: string;
  readonly method: RelayMethod;
  readonly path: `/api/${string}`;
  readonly requestClass?: RelayRequestClass;
  /** Trusted operation-specific preflight budget; never supplied by the browser. */
  readonly responseHeaderTimeoutMs?: number;
  readonly requiresTenant?: boolean;
  readonly tenantParam?: string;
  readonly idempotency?: "none" | "optional" | "required";
  readonly maxBodyBytes?: number;
}
export interface RelaySessionContext {
  readonly accessToken: string;
  readonly plane: string;
  readonly realmKey: string;
  readonly tenantId?: string;
  readonly principalId: string;
  readonly authEpoch: number;
  readonly assurance?: "baseline" | "elevated";
  readonly csrfToken: string;
  readonly acceptedCsrfTokens?: readonly string[];
}
export interface RelaySessionAuthority {
  resolve(request: Request): Promise<RelaySessionContext | undefined>;
  refresh(request: Request): Promise<RelaySessionContext | undefined>;
  invalidate(
    request: Request,
    reason: "context_mismatch",
  ): Promise<readonly string[] | void>;
}
/** Session methods an app's auth runtime exposes to the relay. */
export interface RelayAuthRuntime {
  resolveRelaySession(
    request: Request,
  ): Promise<RelaySessionContext | undefined>;
  refreshRelaySession(
    request: Request,
  ): Promise<RelaySessionContext | undefined>;
  invalidateRelaySession(
    request: Request,
    reason: "context_mismatch",
  ): Promise<readonly string[] | void>;
}
/** Adapts an app auth runtime to the relay's session authority. */
export function relaySessionFromAuth(
  auth: RelayAuthRuntime,
): RelaySessionAuthority {
  return {
    resolve: (request) => auth.resolveRelaySession(request),
    refresh: (request) => auth.refreshRelaySession(request),
    invalidate: (request, reason) =>
      auth.invalidateRelaySession(request, reason),
  };
}
/** Builds an app's relay on first request, so importing the route module reads
 * no environment. Every plane app shares this bootstrap. */
export function createLazyRelay(create: () => RelayHandler): RelayHandler {
  let relay: RelayHandler | undefined;
  return (request, context) => (relay ??= create())(request, context);
}
export interface RelayDiagnostic {
  readonly event: "request" | "failure" | "refresh" | "context_mismatch";
  readonly operationId?: string;
  readonly method: string;
  readonly status?: number;
  readonly requestId?: string;
}
export interface RelayOptions {
  readonly plane: string;
  readonly runtimeApiUrl: string;
  readonly appOrigin: string;
  readonly operations: readonly RelayOperation[];
  readonly session: RelaySessionAuthority;
  readonly fetch?: typeof fetch;
  readonly maxHeaderBytes?: number;
  readonly defaultBodyBytes?: number;
  readonly timeouts?: Partial<Record<RelayRequestClass, number>>;
  readonly onDiagnostic?: (diagnostic: RelayDiagnostic) => void;
}
export interface RelayRouteContext {
  readonly params: Promise<{ readonly path: readonly string[] }>;
}
export type RelayHandler = (
  request: Request,
  context: RelayRouteContext,
) => Promise<Response>;

const UNSAFE = new Set<RelayMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const IDEMPOTENT = new Set<RelayMethod>(["GET", "HEAD", "PUT", "DELETE"]);
const BLOCKED_REQUEST_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-plane",
  "x-tenant-id",
  "x-principal-id",
  "x-realm",
  "x-org",
  "x-organization-id",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "x-client-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "via",
  "host",
  "connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "keep-alive",
]);
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "idempotency-key",
  "range",
  "traceparent",
  "tracestate",
  "x-request-id",
  "x-correlation-id",
]);
// Fetch decodes compressed bodies but retains their original length header.
// Let the application server frame the returned body instead of copying it.
const SAFE_RESPONSE_HEADERS = new Set([
  "server-timing",
  "content-type",
  "content-disposition",
  "etag",
  "last-modified",
  "retry-after",
  "accept-ranges",
  "content-range",
  "x-request-id",
  "x-correlation-id",
  "traceparent",
]);
const RAW_PATH_ATTACK = /%(?:2f|5c|2e|252f|255c|252e)/i;
const DEFAULT_TIMEOUTS: Readonly<Record<RelayRequestClass, number>> = {
  json: 15_000,
  upload: 120_000,
  download: 120_000,
  stream: 15_000,
};

/** Explicit Studio authoring surfaces; upstream owns tenant scope, permissions and independent review. */
export const STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "studio.collections.providers",
      method: "GET",
      path: "/api/meta-entity-authoring/collection-providers",
      requiresTenant: true,
      maxBodyBytes: 0,
    },
    ...(
      [
        ["GET", ""],
        ["PUT", ""],
        ["POST", "/validate"],
        ["POST", "/preview"],
      ] as const
    ).map(([method, suffix]) => ({
      id: `studio.collections.${method}${suffix}`,
      method,
      path: `/api/meta-entity-authoring/change-sets/:id/collection${suffix}` as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: method === "GET" ? 0 : 128 * 1024,
    })),

    {
      id: "studio.metaEntity.notifications.inspect",
      method: "GET",
      path: "/api/meta-entity-authoring/inspection/notifications/:entityCode",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 0,
    },
    {
      id: "studio.metaEntity.notifications.list",
      method: "GET",
      path: "/api/meta-entity-authoring/change-sets/:id/notifications",
      requiresTenant: true,
      maxBodyBytes: 0,
    },
    ...(
      [
        ["GET", "", "configuration"],
        ["GET", "/templates", "templates"],
        ["GET", "/templates/:key", "template"],
        ["PUT", "/templates/:key", "saveTemplate"],
        ["PUT", "/policy", "savePolicy"],
        ["POST", "/validate", "validateNotifications"],
        ["POST", "/preview", "previewNotifications"],
      ] as const
    ).map(([method, suffix, name]) => ({
      id: `studio.metaEntity.notifications.${name}`,
      method,
      path: `/api/meta-entity-authoring/change-sets/:id/notifications/:capability${suffix}` as const,
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      allowedQuery: ["channel", "locale", "version"],
      maxBodyBytes: method === "GET" ? 0 : 128 * 1024,
    })),
    ...(
      [
        "/api/meta-entity-authoring/inspection/releases",
        "/api/meta-entity-authoring/inspection/releases/:id",
        "/api/meta-entity-authoring/inspection/releases/:id/activation",
      ] as const
    ).map((path, index) => ({
      id: `studio.metaEntity.inspection.${index}`,
      method: "GET" as const,
      path,
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: 0,
    })),
    ...(
      [
        ["draftHistory", "/api/meta-entity-authoring/change-sets/:id/history"],
        [
          "draftHistoryRevision",
          "/api/meta-entity-authoring/change-sets/:id/history/:revision",
        ],
      ] as const
    ).map(([name, path]) => ({
      id: `studio.metaEntity.${name}`,
      method: "GET" as const,
      path,
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: 0,
    })),
    {
      id: "studio.metaEntity.list",
      method: "GET",
      path: "/api/meta-entity-authoring/change-sets",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 0,
    },
    {
      id: "studio.metaEntity.readGraph",
      method: "GET",
      path: "/api/meta-entity-authoring/change-sets/:id/graph",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 0,
    },
    {
      id: "studio.metaEntity.createDraft",
      method: "POST",
      path: "/api/meta-entity-authoring/change-sets",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 4096,
    },
    {
      id: "studio.metaEntity.replaceGraph",
      method: "PUT",
      path: "/api/meta-entity-authoring/change-sets/:id/graph",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 512 * 1024,
    },
    ...["fork", "validate", "test", "submit", "approve", "publish"].map(
      (action) => ({
        id: `studio.metaEntity.${action}`,
        method: "POST" as const,
        path: `/api/meta-entity-authoring/change-sets/:id/${action}` as const,
        requestClass: "json" as const,
        requiresTenant: true,
        idempotency: "none" as const,
        maxBodyBytes: 4096,
      }),
    ),
    ...["activate", "rollback"].map((action) => ({
      id: `studio.metaEntity.${action}`,
      method: "POST" as const,
      path: `/api/meta-entity-authoring/releases/:id/${action}` as const,
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: 4096,
    })),
  ]);

export const STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "studio.authorization.read",
      method: "GET",
      path: "/api/control-admin/authorization",
      requestClass: "json",
      requiresTenant: true,
    },
    ...["manage", "approve", "revoke"].map((action) => ({
      id: `studio.authorization.${action}`,
      method: "POST" as const,
      path: `/api/control-admin/authorization/${action}` as const,
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: 64 * 1024,
    })),
  ]);
export const IAM_ME_OPERATION: RelayOperation = Object.freeze({
  id: "iam.me",
  method: "GET",
  path: "/api/iam/me",
  requestClass: "json",
  requiresTenant: false,
});
export const EXPERIENCE_BOOTSTRAP_OPERATION: RelayOperation = Object.freeze({
  id: "platform.experience.bootstrap",
  method: "GET",
  path: "/api/platform/experience/bootstrap",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_ADMISSION_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.admission.read",
  method: "GET",
  path: "/api/atlas/admission",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_EXPERIENCE_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.experience.read",
  method: "GET",
  path: "/api/atlas/experience",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_THREAD_CREATE_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.create",
  method: "POST",
  path: "/api/atlas/threads",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATLAS_THREAD_LIST_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.list",
  method: "GET",
  path: "/api/atlas/threads",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_THREAD_MESSAGE_LIST_OPERATION: RelayOperation =
  Object.freeze({
    id: "atlas.threads.messages.list",
    method: "GET",
    path: "/api/atlas/threads/:threadId/messages",
    requestClass: "json",
    requiresTenant: true,
  });
export const ATLAS_THREAD_EXPORT_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.export",
  method: "GET",
  path: "/api/atlas/threads/:threadId/export",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_THREAD_RENAME_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.rename",
  method: "PATCH",
  path: "/api/atlas/threads/:threadId",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATLAS_THREAD_ARCHIVE_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.archive",
  method: "POST",
  path: "/api/atlas/threads/:threadId/archive",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATLAS_THREAD_RUN_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.threads.run",
  // Authorized document grounding can require a cold embedding before SSE starts.
  responseHeaderTimeoutMs: 75_000,
  method: "POST",
  path: "/api/atlas/threads/:threadId/runs",
  requestClass: "stream",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 64 * 1024,
});
export const ATLAS_TOOL_HISTORY_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.tools.history",
  method: "GET",
  path: "/api/atlas/tools/history",
  requestClass: "json",
  requiresTenant: true,
});
export const ATLAS_TOOL_RUN_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.tools.run",
  method: "POST",
  path: "/api/atlas/tools/:proposalId/run",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 64 * 1024,
});
export const ATLAS_TOOL_CANCEL_OPERATION: RelayOperation = Object.freeze({
  id: "atlas.tools.cancel",
  method: "POST",
  path: "/api/atlas/tools/:proposalId/cancel",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATTACHMENT_STAGE_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.stage",
  method: "POST",
  path: "/api/attachments/stage",
  requestClass: "json",
  requiresTenant: true,
  // Staging is a retried command: the client supplies the stable attachment ID
  // as its idempotency key, and the lifecycle reloads that reservation on retry.
  idempotency: "required",
  maxBodyBytes: 16 * 1024,
});
export const ATTACHMENT_FINALIZE_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.finalize",
  method: "POST",
  path: "/api/attachments/:attachmentId/finalize",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATTACHMENT_STATUS_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.status",
  method: "GET",
  path: "/api/attachments/:attachmentId/status",
  requestClass: "json",
  requiresTenant: true,
});
export const ATTACHMENT_BROWSE_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.browse",
  method: "POST",
  path: "/api/attachments/browse",
  requestClass: "json",
  requiresTenant: true,
  maxBodyBytes: 4096,
});
export const ATTACHMENT_REMOVE_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.remove",
  method: "DELETE",
  path: "/api/attachments/:attachmentId",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
});
export const ATTACHMENT_RENAME_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.rename",
  method: "PATCH",
  path: "/api/attachments/:attachmentId",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATTACHMENT_FOLDER_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.folder",
  method: "POST",
  path: "/api/attachments/folders",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const ATTACHMENT_DOWNLOAD_OPERATION: RelayOperation = Object.freeze({
  id: "attachments.download",
  method: "POST",
  path: "/api/attachments/:attachmentId/download",
  requestClass: "json",
  requiresTenant: true,
  maxBodyBytes: 4096,
});
export const ATTACHMENT_READ_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ATTACHMENT_DOWNLOAD_OPERATION,
    {
      id: "attachments.preview",
      method: "POST",
      path: "/api/attachments/:attachmentId/preview",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
    {
      id: "attachments.extract",
      method: "POST",
      path: "/api/attachments/:attachmentId/extract",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
    {
      id: "attachments.search",
      method: "POST",
      path: "/api/attachments/search",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
  ]);
export const ATLAS_KNOWLEDGE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "atlas.reindexAttachment",
      method: "POST",
      path: "/api/atlas/knowledge/attachments/reindex",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 8192,
    },
    {
      id: "atlas.searchAttachmentKnowledge",
      method: "POST",
      path: "/api/atlas/knowledge/search",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 8192,
    },
  ]);
export const ATLAS_ANSWER_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ...ATLAS_KNOWLEDGE_RELAY_OPERATIONS,
    ATLAS_ADMISSION_OPERATION,
    ATLAS_EXPERIENCE_OPERATION,
    ATLAS_THREAD_CREATE_OPERATION,
    ATLAS_THREAD_LIST_OPERATION,
    ATLAS_THREAD_MESSAGE_LIST_OPERATION,
    ATLAS_THREAD_EXPORT_OPERATION,
    ATLAS_THREAD_RENAME_OPERATION,
    ATLAS_THREAD_ARCHIVE_OPERATION,
    ATLAS_THREAD_RUN_OPERATION,
    ATLAS_TOOL_HISTORY_OPERATION,
    ATLAS_TOOL_RUN_OPERATION,
    ATLAS_TOOL_CANCEL_OPERATION,
    ATTACHMENT_STAGE_OPERATION,
    ATTACHMENT_FINALIZE_OPERATION,
    ATTACHMENT_STATUS_OPERATION,
    ATTACHMENT_BROWSE_OPERATION,
    ATTACHMENT_REMOVE_OPERATION,
    ATTACHMENT_RENAME_OPERATION,
    ATTACHMENT_FOLDER_OPERATION,
    {
      id: "attachments.category",
      method: "POST",
      path: "/api/attachments/:attachmentId/category",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 4096,
    },
    {
      id: "attachments.archive-outcome",
      method: "GET",
      path: "/api/attachments/:attachmentId/archive",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "attachments.archive",
      method: "POST",
      path: "/api/attachments/:attachmentId/archive",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 4096,
    },
  ]);
export const ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "atlas.admin.experience.draft.read",
      method: "GET",
      path: "/api/admin/atlas/experience/draft",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "atlas.admin.experience.draft.save",
      method: "PUT",
      path: "/api/admin/atlas/experience/draft",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 128 * 1024,
    },
    {
      id: "atlas.admin.experience.publish",
      method: "POST",
      path: "/api/admin/atlas/experience/publish",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 4096,
    },
  ]);
export const PRINCIPAL_LOCALE_UPDATE_OPERATION: RelayOperation = Object.freeze({
  id: "platform.profile.locale.update",
  method: "PATCH",
  path: "/api/platform/profile/locale",
  requestClass: "json",
  requiresTenant: true,
  maxBodyBytes: 1024,
});
export const PRINCIPAL_APPEARANCE_UPDATE_OPERATION: RelayOperation = Object.freeze({
  id: "platform.profile.appearance.update",
  method: "PATCH",
  path: "/api/platform/profile/appearance",
  requestClass: "json",
  requiresTenant: true,
  maxBodyBytes: 1024,
});
export const LOCALE_POLICY_READ_OPERATION: RelayOperation = Object.freeze({
  id: "platform.localization.policy.read",
  method: "GET",
  path: "/api/platform/localization/policies/:planeKey",
  requestClass: "json",
  requiresTenant: true,
});
export const LOCALE_POLICY_UPDATE_OPERATION: RelayOperation = Object.freeze({
  id: "platform.localization.policy.update",
  method: "PUT",
  path: "/api/platform/localization/policies/:planeKey",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 4096,
});
export const NEON_WORK_CONTEXTS_OPERATION: RelayOperation = Object.freeze({
  id: "neon.work-contexts",
  method: "GET",
  path: "/api/neon/work-contexts",
  requestClass: "json",
  requiresTenant: true,
});
export const NEON_BUSINESS_CONTEXT_OPTIONS_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-context-options",
    method: "GET",
    path: "/api/neon/business-context-options",
    requestClass: "json",
    requiresTenant: true,
  });
export const NEON_OPERATING_ORGANIZATIONS_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.operating-organizations",
    method: "GET",
    path: "/api/neon/operating-organizations",
    requestClass: "json",
    requiresTenant: true,
  });
export const MESH_NETWORK_ACCOUNTS_OPERATION: RelayOperation = Object.freeze({
  id: "mesh.network-accounts",
  method: "GET",
  path: "/api/mesh/network-accounts",
  requestClass: "json",
  requiresTenant: true,
});
export const MESH_BP_NETWORK_EXCHANGE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "mesh.business-partner-network-workspace.read",
      method: "GET",
      path: "/api/mesh/business-partner-network-workspace",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "mesh.business-partner-network-relationships.request",
      method: "POST",
      path: "/api/mesh/business-partner-network-relationships",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "mesh.business-partner-network-relationships.decide",
      method: "POST",
      path: "/api/mesh/business-partner-network-relationships/:relationshipId/decisions",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 8 * 1024,
    },
    {
      id: "mesh.business-partner-network-capabilities.request",
      method: "POST",
      path: "/api/mesh/business-partner-network-relationships/:relationshipId/capabilities",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "mesh.business-partner-network-capabilities.decide",
      method: "POST",
      path: "/api/mesh/business-partner-network-capabilities/:capabilityId/decisions",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 8 * 1024,
    },
    {
      id: "mesh.business-partner-registration-exchanges.issue",
      method: "POST",
      path: "/api/mesh/business-partner-registration-exchanges",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 32 * 1024,
    },
    {
      id: "mesh.business-partner-registration-exchanges.decide",
      method: "POST",
      path: "/api/mesh/business-partner-registration-exchanges/:exchangeId/decisions",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 8 * 1024,
    },
  ]);
export const MESH_BP_BANK_DISCLOSURE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "mesh.business-partner-bank-disclosures.request",
      method: "POST",
      path: "/api/mesh/business-partner-bank-disclosures",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "mesh.business-partner-bank-disclosures.read",
      method: "GET",
      path: "/api/mesh/business-partner-bank-disclosures/:disclosureId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "mesh.business-partner-bank-disclosures.decide",
      method: "POST",
      path: "/api/mesh/business-partner-bank-disclosures/:disclosureId/decisions",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "mesh.business-partner-bank-disclosures.revoke",
      method: "POST",
      path: "/api/mesh/business-partner-bank-disclosures/:disclosureId/revocations",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 8 * 1024,
    },
  ]);
export const NEON_BP_INVITATION_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-invitations.create",
    method: "POST",
    path: "/api/neon/business-partner-invitations",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const NEON_BP_APPLICANT_ACCEPT_OPERATION: RelayOperation = Object.freeze(
  {
    id: "neon.business-partner-applicant.accept",
    method: "POST",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/accept",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 1024 * 1024 + 4096,
  },
);
export const NEON_BP_APPLICANT_STATUS_OPERATION: RelayOperation = Object.freeze(
  {
    id: "neon.business-partner-applicant.status",
    method: "GET",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/status",
    requestClass: "json",
    requiresTenant: true,
  },
);
export const NEON_BP_APPLICANT_CORRECTION_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-applicant.correction",
    method: "PATCH",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/correction",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 1024 * 1024 + 4096,
  });
export const NEON_BP_APPLICANT_EVIDENCE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-applicant.evidence",
    method: "POST",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/evidence",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 8192,
  });
export const NEON_BP_APPLICANT_EVIDENCE_STAGE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-applicant.evidence-stage",
    method: "POST",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/evidence/stage",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 8192,
  });
export const NEON_BP_APPLICANT_EVIDENCE_COMPLETE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-applicant.evidence-complete",
    method: "POST",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/evidence/complete",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 8192,
  });
export const NEON_BP_APPLICANT_SUBMIT_OPERATION: RelayOperation = Object.freeze(
  {
    id: "neon.business-partner-applicant.submit",
    method: "POST",
    path: "/api/neon/external/business-partner-invitations/:journeyKind/requests/:requestId/submit",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 4096,
  },
);
export const NEON_BP_APPLICANT_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    NEON_BP_APPLICANT_ACCEPT_OPERATION,
    NEON_BP_APPLICANT_STATUS_OPERATION,
    NEON_BP_APPLICANT_CORRECTION_OPERATION,
    NEON_BP_APPLICANT_EVIDENCE_OPERATION,
    NEON_BP_APPLICANT_EVIDENCE_STAGE_OPERATION,
    NEON_BP_APPLICANT_EVIDENCE_COMPLETE_OPERATION,
    NEON_BP_APPLICANT_SUBMIT_OPERATION,
  ]);
export const STUDIO_BP_DEFINITION_AUTHOR_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.business-partner-definitions.author",
    method: "POST",
    path: "/api/studio/business-partner-definitions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 512 * 1024,
  });
export const STUDIO_BP_DEFINITION_SIMULATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.business-partner-definitions.simulate",
    method: "POST",
    path: "/api/studio/business-partner-definitions/simulations",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "none",
    maxBodyBytes: 512 * 1024,
  });
export const STUDIO_BP_DEFINITION_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.business-partner-definitions.read",
    method: "GET",
    path: "/api/studio/business-partner-definitions/:revisionId",
    requestClass: "json",
    requiresTenant: true,
  });
export const STUDIO_BP_DEFINITION_PUBLISH_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.business-partner-definitions.publish",
    method: "POST",
    path: "/api/studio/business-partner-definitions/:revisionId/publish",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 4096,
  });
export const STUDIO_BP_LOCAL_PREVIEW_OPERATION: RelayOperation = Object.freeze({
  id: "studio.local-business-partner-preview.read",
  method: "GET",
  path: "/api/studio/local-business-partner-preview",
  requestClass: "json",
  requiresTenant: true,
});
export const STUDIO_BP_DEFINITION_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    Object.freeze({
      id: "studio.task-rules.baselines",
      method: "GET" as const,
      path: "/api/studio/supplier-task-rule-baselines",
      requestClass: "json" as const,
      requiresTenant: true,
    }),
    ...(["author", "read", "publish"] as const).map((action) =>
      Object.freeze({
        id: `studio.task-edit-policy.${action}`,
        method: action === "read" ? ("GET" as const) : ("POST" as const),
        path: `/api/studio/task-edit-policies${action === "author" ? "" : "/:id"}${action === "publish" ? "/publish" : ""}`,
        requestClass: "json" as const,
        requiresTenant: true,
        idempotency:
          action === "read" ? ("none" as const) : ("required" as const),
        maxBodyBytes: 256 * 1024,
      }),
    ),
    STUDIO_BP_DEFINITION_AUTHOR_OPERATION,
    STUDIO_BP_DEFINITION_SIMULATE_OPERATION,
    STUDIO_BP_DEFINITION_READ_OPERATION,
    STUDIO_BP_DEFINITION_PUBLISH_OPERATION,
  ]);
export const ENTITY_APPLICATION_DESCRIPTOR_OPERATION: RelayOperation =
  Object.freeze({
    id: "entity-application.descriptor",
    method: "GET",
    path: "/api/entity-runtime/:entityCode/application-descriptor",
    requestClass: "json",
    requiresTenant: true,
  });
export const REFERENCE_HISTORY_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "reference-history.read",
      method: "GET",
      path: "/api/entity-runtime/:entityCode/reference-history",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "reference-history.update",
      method: "POST",
      path: "/api/entity-runtime/:entityCode/reference-history",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
  ]);
/** The requested entities the caller may open (workspace and module pages). */
export const ENTITY_DIRECTORY_OPERATION: RelayOperation = Object.freeze({
  id: "entity-runtime.directory",
  method: "GET",
  path: "/api/entity-runtime/directory",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_LIST_DESCRIPTOR_OPERATION: RelayOperation = Object.freeze({
  id: "entity-list.descriptor",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/list-descriptor",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_REFERENCE_CHOICES_OPERATION: RelayOperation = Object.freeze({
  id: "entity-reference.choices",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/references/:fieldKey",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_LIST_QUERY_OPERATION: RelayOperation = Object.freeze({
  id: "entity-list.query",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/list",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_FORM_DESCRIPTOR_OPERATION: RelayOperation = Object.freeze({
  id: "entity-form.descriptor",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/form-descriptor",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_DETAIL_DESCRIPTOR_OPERATION: RelayOperation = Object.freeze(
  {
    id: "entity-detail.descriptor",
    method: "GET",
    path: "/api/entity-runtime/:entityCode/detail-descriptor",
    requestClass: "json",
    requiresTenant: true,
  },
);
export const ENTITY_OWN_RECORD_OPERATION: RelayOperation = Object.freeze({
  id: "entity-record.own",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/own-record",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_DETAIL_READ_OPERATION: RelayOperation = Object.freeze({
  id: "entity-detail.read",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/records/:recordId/detail",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_RECORD_CREATE_OPERATION: RelayOperation = Object.freeze({
  id: "entity-record.create",
  method: "POST",
  path: "/api/records/:entityCode",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 256 * 1024,
});
export const ENTITY_RECORD_READ_OPERATION: RelayOperation = Object.freeze({
  id: "entity-record.read",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/records/:recordId",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_RECORD_PATCH_OPERATION: RelayOperation = Object.freeze({
  id: "entity-record.patch",
  method: "PATCH",
  path: "/api/records/:entityCode/:recordId",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 256 * 1024,
});
export const ENTITY_RECORD_TRANSITION_OPERATION: RelayOperation = Object.freeze(
  {
    id: "entity-record.transition",
    method: "POST",
    path: "/api/records/:entityCode/:recordId/transitions/:transitionCode",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 64 * 1024,
  },
);
export const ENTITY_RUNTIME_BOOTSTRAP_OPERATION: RelayOperation = Object.freeze(
  {
    id: "entity-runtime.bootstrap",
    method: "GET",
    path: "/api/entity-runtime/:entityCode/records/:recordId/bootstrap",
    requestClass: "json",
    requiresTenant: true,
  },
);
export const ENTITY_RUNTIME_SUMMARY_OPERATION: RelayOperation = Object.freeze({
  id: "entity-runtime.summary",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/records/:recordId/summary",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_RUNTIME_SECTION_OPERATION: RelayOperation = Object.freeze({
  id: "entity-runtime.section",
  method: "GET",
  path: "/api/entity-runtime/:entityCode/records/:recordId/sections/:sectionKey",
  requestClass: "json",
  requiresTenant: true,
});
export const ENTITY_RUNTIME_COMMENTS_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "entity-runtime.collaboration.comments.read",
    method: "GET",
    path: "/api/entity-runtime/:entityCode/records/:recordId/collaboration/comments",
    requestClass: "json",
    requiresTenant: true,
  });
export const ENTITY_RUNTIME_ATTACHMENTS_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "entity-runtime.collaboration.attachments.read",
    method: "GET",
    path: "/api/entity-runtime/:entityCode/records/:recordId/collaboration/attachments",
    requestClass: "json",
    requiresTenant: true,
  });
export const ENTITY_RUNTIME_OPERATION: RelayOperation = Object.freeze({
  id: "entity-runtime.operation",
  method: "POST",
  path: "/api/entity-runtime/:entityCode/records/:recordId/operations/:operationKey",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 256 * 1024,
});
/** Closed Activity endpoints shared by Studio, Neon and Mesh. */
export const ENTITY_ACTIVITY_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ...[
      "",
      "/timeline",
      "/audit",
      "/versions",
      "/snapshots",
      "/snapshots/:snapshotId",
      "/snapshots/:snapshotId/collections/:collectionKey",
    ].map((suffix) => ({
      id: `entity-runtime.activity.read${suffix.replaceAll("/", ".")}`,
      method: "GET" as const,
      path: `/api/entity-runtime/:entityCode/records/:recordId/activity${suffix}` as const,
      requestClass: "json" as const,
      requiresTenant: true,
    })),
    {
      id: "entity-runtime.activity.capture",
      method: "POST",
      path: "/api/entity-runtime/:entityCode/records/:recordId/activity/snapshots",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 1024,
    },
    {
      id: "entity-runtime.activity.collection-compare",
      method: "POST",
      path: "/api/entity-runtime/:entityCode/records/:recordId/activity/compare/collections/:collectionKey",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 8192,
    },
    {
      id: "entity-runtime.activity.compare",
      method: "POST",
      path: "/api/entity-runtime/:entityCode/records/:recordId/activity/compare",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 4096,
    },
  ]);
export const ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ENTITY_FORM_DESCRIPTOR_OPERATION,
    ENTITY_DETAIL_DESCRIPTOR_OPERATION,
    ENTITY_OWN_RECORD_OPERATION,
    ENTITY_RECORD_CREATE_OPERATION,
    ENTITY_RECORD_READ_OPERATION,
    ENTITY_DETAIL_READ_OPERATION,
    ENTITY_RECORD_PATCH_OPERATION,
    ENTITY_RECORD_TRANSITION_OPERATION,
    ENTITY_RUNTIME_BOOTSTRAP_OPERATION,
    ENTITY_RUNTIME_SUMMARY_OPERATION,
    ENTITY_RUNTIME_SECTION_OPERATION,
    ENTITY_RUNTIME_COMMENTS_READ_OPERATION,
    ENTITY_RUNTIME_ATTACHMENTS_READ_OPERATION,
    ...ENTITY_ACTIVITY_RELAY_OPERATIONS,
    ENTITY_RUNTIME_OPERATION,
  ]);
export const EXPERIENCE_SURFACE_READ_OPERATION: RelayOperation = Object.freeze({
  id: "experience-surfaces.read",
  method: "GET",
  path: "/api/platform/experience/surfaces/:surfaceKey",
  requestClass: "json",
  requiresTenant: true,
});
export const EXPERIENCE_SURFACE_ARRANGEMENT_SAVE_OPERATION: RelayOperation =
  Object.freeze({
    id: "experience-surfaces.arrangement.save",
    method: "PUT",
    path: "/api/platform/experience/surfaces/:surfaceKey/arrangement",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const EXPERIENCE_SURFACE_ARRANGEMENT_DELETE_OPERATION: RelayOperation =
  Object.freeze({
    id: "experience-surfaces.arrangement.delete",
    method: "DELETE",
    path: "/api/platform/experience/surfaces/:surfaceKey/arrangement",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024,
  });
export const ROUTE_SLUG_REDIRECT_READ_OPERATION: RelayOperation = Object.freeze(
  {
    id: "navigation.slug-redirect.read",
    method: "GET",
    path: "/api/platform/navigation/slug-redirect",
    requestClass: "json",
    requiresTenant: true,
  },
);
export const EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    EXPERIENCE_SURFACE_READ_OPERATION,
    EXPERIENCE_SURFACE_ARRANGEMENT_SAVE_OPERATION,
    EXPERIENCE_SURFACE_ARRANGEMENT_DELETE_OPERATION,
    ROUTE_SLUG_REDIRECT_READ_OPERATION,
  ]);
/** Existing Studio Entity learning review; mutations retain the shared CSRF/idempotency boundary. */
export const STUDIO_ATLAS_LEARNING_RELAY_OPERATIONS: readonly RelayOperation[] = Object.freeze([
  { id: "studio.atlas-learning.list", method: "GET", path: "/api/studio/atlas-learning", requestClass: "json", requiresTenant: true },
  ...(["stage", "reject", "submit", "approve", "publish", "resume"] as const).map(action => ({
    id: `studio.atlas-learning.${action}`,
    method: "POST" as const,
    path: `/api/studio/atlas-learning/:id/${action}` as const,
    requestClass: "json" as const,
    requiresTenant: true,
    idempotency: "required" as const,
    maxBodyBytes: action === "stage" ? 16 * 1024 : 1024,
  })),
]);
export const EXPERIENCE_SURFACE_DRAFT_SAVE_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.experience-surfaces.drafts.save",
    method: "POST",
    path: "/api/studio/experience-surfaces/drafts",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 256 * 1024,
  });
export const EXPERIENCE_SURFACE_ATLAS_DRAFT_GENERATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.experience-surfaces.atlas-drafts.generate",
    method: "POST",
    path: "/api/studio/experience-surfaces/atlas-drafts",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 256 * 1024,
  });
export const EXPERIENCE_SURFACE_PUBLISH_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.experience-surfaces.publish",
    method: "POST",
    path: "/api/studio/experience-surfaces/:releaseId/publish",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024,
  });
export const EXPERIENCE_SURFACE_HISTORY_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.experience-surfaces.history",
    method: "GET",
    path: "/api/studio/experience-surfaces",
    requestClass: "json",
    requiresTenant: true,
  });
export const EXPERIENCE_SURFACE_ROLLBACK_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.experience-surfaces.rollback",
    method: "POST",
    path: "/api/studio/experience-surfaces/:releaseId/rollback",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024,
  });
export const STUDIO_EXPERIENCE_SURFACE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    EXPERIENCE_SURFACE_DRAFT_SAVE_OPERATION,
    EXPERIENCE_SURFACE_ATLAS_DRAFT_GENERATE_OPERATION,
    EXPERIENCE_SURFACE_PUBLISH_OPERATION,
    EXPERIENCE_SURFACE_HISTORY_OPERATION,
    EXPERIENCE_SURFACE_ROLLBACK_OPERATION,
  ]);
export const ROUTE_SLUG_REDIRECT_REGISTER_OPERATION: RelayOperation =
  Object.freeze({
    id: "studio.navigation.slug-redirects.register",
    method: "POST",
    path: "/api/studio/navigation/slug-redirects",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 8 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.create",
    method: "POST",
    path: "/api/neon/business-partner-requests",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_LIST_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.list",
    method: "GET",
    path: "/api/neon/business-partner-requests",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_REQUEST_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.read",
    method: "GET",
    path: "/api/neon/business-partner-requests/:requestId",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_REQUEST_VIEW_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.view",
    method: "GET",
    path: "/api/neon/business-partner-requests/:requestId/view",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_REQUEST_PATCH_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.patch",
    method: "PATCH",
    path: "/api/neon/business-partner-requests/:requestId",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_VALIDATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.validate",
    method: "POST",
    path: "/api/neon/business-partner-requests/:requestId/validate",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_SUBMIT_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.submit",
    method: "POST",
    path: "/api/neon/business-partner-requests/:requestId/submit",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_DECIDE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.decide",
    method: "POST",
    path: "/api/neon/business-partner-requests/:requestId/decisions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_REQUEST_APPLY_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-requests.apply",
    method: "POST",
    path: "/api/neon/business-partner-requests/:requestId/apply",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_CASE_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.create",
    method: "POST",
    path: "/api/neon/business-partner-cases",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024 * 1024,
  });
export const BUSINESS_PARTNER_GOVERNED_IMPORT_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-imports.create",
    method: "POST",
    path: "/api/neon/business-partner-imports",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 4 * 1024 * 1024 + 4096,
  });
export const BUSINESS_PARTNER_CASE_LIST_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.list",
    method: "GET",
    path: "/api/neon/business-partner-cases",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_CASE_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.read",
    method: "GET",
    path: "/api/neon/business-partner-cases/:caseId",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_CASE_VIEW_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.view",
    method: "GET",
    path: "/api/neon/business-partner-cases/:caseId/view",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_CASE_PATCH_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.patch",
    method: "PATCH",
    path: "/api/neon/business-partner-cases/:caseId",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 1024 * 1024,
  });
export const BUSINESS_PARTNER_CASE_VALIDATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.validate",
    method: "POST",
    path: "/api/neon/business-partner-cases/:caseId/validate",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_CASE_SUBMIT_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.submit",
    method: "POST",
    path: "/api/neon/business-partner-cases/:caseId/submit",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_CASE_DECIDE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.decide",
    method: "POST",
    path: "/api/neon/business-partner-cases/:caseId/decisions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_CASE_MATERIALIZE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-cases.materialize",
    method: "POST",
    path: "/api/neon/business-partner-cases/:caseId/materialize",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const BUSINESS_PARTNER_CASE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze(
    [
      BUSINESS_PARTNER_CASE_CREATE_OPERATION,
      BUSINESS_PARTNER_CASE_LIST_OPERATION,
      BUSINESS_PARTNER_CASE_READ_OPERATION,
      BUSINESS_PARTNER_CASE_VIEW_OPERATION,
      BUSINESS_PARTNER_CASE_PATCH_OPERATION,
      BUSINESS_PARTNER_CASE_VALIDATE_OPERATION,
      BUSINESS_PARTNER_CASE_SUBMIT_OPERATION,
      BUSINESS_PARTNER_CASE_DECIDE_OPERATION,
      BUSINESS_PARTNER_CASE_MATERIALIZE_OPERATION,
    ].flatMap((operation) => [
      operation,
      Object.freeze({
        ...operation,
        id: operation.id.replace(
          "business-partner-cases",
          "business-partner-company-setup-cases",
        ),
        path: operation.path.replace(
          "business-partner-cases",
          "business-partner-company-setup-cases",
        ) as RelayOperation["path"],
      }),
    ]),
  );
export const BUSINESS_PARTNER_AGGREGATE_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.aggregate.read",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_360_COMMENT_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.comments.create",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/360/comments",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 48 * 1024,
  });
export const BUSINESS_PARTNER_360_SUMMARY_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.summary",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId/360/summary",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_360_TAX_REVEAL_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.tax-reveal",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/360/identifiers-tax/reveal",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_360_IDENTIFIER_REVEAL_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.identifier-reveal",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/360/identifiers/reveal",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 4096,
  });
export const BUSINESS_PARTNER_360_BANK_REVEAL_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.bank-reveal",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/360/banking/reveal",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 4096,
  });
export const PERSON_RESTRICTED_EVIDENCE_REVEAL_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.people.restricted-evidence.reveal",
    method: "POST",
    path: "/api/neon/people/:personId/restricted-evidence/read",
    requestClass: "json",
    requiresTenant: true,
    maxBodyBytes: 4096,
  });
export const BUSINESS_PARTNER_360_GOVERNANCE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.360.governance",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId/360/governance",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_360_SECTION_OPERATIONS: readonly RelayOperation[] =
  Object.freeze(
    [
      "identity",
      "contacts",
      "addresses",
      "identifiers",
      "roles",
      "company-configuration",
      "banking",
      "qualifications",
      "certificates",
      "credit",
      "workforce",
      "requests",
      "activity",
      "business-activity",
      "network",
      "comments",
      "attachments",
    ].map((section) =>
      Object.freeze({
        id: `neon.business-partners.360.${section}`,
        method: "GET" as const,
        path: `/api/neon/business-partners/:businessPartnerId/360/${section}`,
        requestClass: "json" as const,
        requiresTenant: true,
      }),
    ),
  );
export const BUSINESS_PARTNER_ELIGIBILITY_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.eligibility.read",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId/eligibility",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_SUPPLIER_ACTIVATION_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.supplier-activation",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/supplier-activation",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_QUALIFICATION_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.qualifications.create",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/qualifications",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_QUALIFICATION_DECIDE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-qualifications.decide",
    method: "POST",
    path: "/api/neon/business-partner-qualifications/:qualificationId/decisions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_PREFERENCE_LIST_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.preferences.list",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId/preferences",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_PREFERENCE_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.preferences.create",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/preferences",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_PREFERENCE_DECIDE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-preferences.decide",
    method: "POST",
    path: "/api/neon/business-partner-preferences/:preferenceId/decisions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_PREFERENCE_REVOKE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partner-preferences.revoke",
    method: "POST",
    path: "/api/neon/business-partner-preferences/:preferenceId/revocations",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_CUSTOMER_CREDIT_LIST_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.customer-credit-reviews.list",
    method: "GET",
    path: "/api/neon/business-partners/:businessPartnerId/customer-credit-reviews",
    requestClass: "json",
    requiresTenant: true,
  });
export const BUSINESS_PARTNER_CUSTOMER_DESIGNATION_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.business-partners.customer-designations.list",
      method: "GET",
      path: "/api/neon/business-partners/:businessPartnerId/customer-designations",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.business-partners.customer-designations.create",
      method: "POST",
      path: "/api/neon/business-partners/:businessPartnerId/customer-designations",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 32 * 1024,
    },
    {
      id: "neon.customer-designations.decide",
      method: "POST",
      path: "/api/neon/customer-designations/:designationId/decisions",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 32 * 1024,
    },
  ]);
export const BUSINESS_PARTNER_CUSTOMER_CREDIT_CREATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.customer-credit-reviews.create",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/customer-credit-reviews",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_CUSTOMER_CREDIT_DECIDE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.customer-credit-reviews.decide",
    method: "POST",
    path: "/api/neon/customer-credit-reviews/:reviewId/decisions",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const BUSINESS_PARTNER_CUSTOMER_LIFECYCLE_OPERATION: RelayOperation =
  Object.freeze({
    id: "neon.business-partners.customer-lifecycle",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/customer-lifecycle",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
export const NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.workforce-requests.list",
      method: "GET",
      path: "/api/neon/workforce-requests",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce-requests.read",
      method: "GET",
      path: "/api/neon/workforce-requests/:requestId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce-requests.create",
      method: "POST",
      path: "/api/neon/workforce-requests",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 64 * 1024,
    },
    {
      id: "neon.workforce-requests.validate",
      method: "POST",
      path: "/api/neon/workforce-requests/:requestId/validate",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 8 * 1024,
    },
    ...(["submit", "decision", "apply"] as const).map((action) =>
      Object.freeze({
        id: `neon.workforce-requests.${action}`,
        method: "POST" as const,
        path: `/api/neon/workforce-requests/:requestId/${action}` as const,
        requestClass: "json" as const,
        requiresTenant: true,
        idempotency: "required" as const,
        maxBodyBytes: 8 * 1024,
      }),
    ),
  ]);
/** Current effective employee directory and record reads. Workforce writes remain request-governed. */
export const NEON_WORKFORCE_READ_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.workforce.list",
      method: "GET",
      path: "/api/neon/workforce",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce.read",
      method: "GET",
      path: "/api/neon/workforce/:employeeId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce.section.read",
      method: "GET",
      path: "/api/neon/workforce/:employeeId/sections/:section",
      requestClass: "json",
      requiresTenant: true,
    },
  ]);
export const NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.workforce.saved-views.list",
      method: "GET",
      path: "/api/platform/saved-views/:entity",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce.saved-views.create",
      method: "POST",
      path: "/api/platform/saved-views/:entity",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
  ]);
export const NEON_WORKFORCE_PROFILE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.workforce.profile.mutate",
      method: "POST",
      path: "/api/neon/workforce/:employeeId/profile-records",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
  ]);
export const NEON_HR_STAGE2_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.hr-setup.policy.simulate",
      method: "POST",
      path: "/api/policy/simulate",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.catalog",
      method: "GET",
      path: "/api/neon/hr-setup/catalog",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.position.create",
      method: "POST",
      path: "/api/neon/hr-setup/positions",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.drafts.list",
      method: "GET",
      path: "/api/neon/hr-setup/drafts",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.drafts.create",
      method: "POST",
      path: "/api/neon/hr-setup/drafts",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.drafts.publish",
      method: "POST",
      path: "/api/neon/hr-setup/drafts/:approvalId/publish",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.org-company.list",
      method: "GET",
      path: "/api/neon/hr-setup/org-company-assignments",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.org-candidates",
      method: "GET",
      path: "/api/neon/hr-setup/org-candidates",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.org-company.create",
      method: "POST",
      path: "/api/neon/hr-setup/org-company-assignments",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.org-company.publish",
      method: "POST",
      path: "/api/neon/hr-setup/org-company-assignments/:assignmentId/publish",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.calendar-day.list",
      method: "GET",
      path: "/api/neon/hr-setup/calendar-day-changes",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.calendar-day.create",
      method: "POST",
      path: "/api/neon/hr-setup/calendar-day-changes",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.calendar-day.publish",
      method: "POST",
      path: "/api/neon/hr-setup/calendar-day-changes/:changeId/publish",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.policy-assignments.list",
      method: "GET",
      path: "/api/neon/hr-setup/policy-assignments",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.policy-effective",
      method: "GET",
      path: "/api/neon/hr-setup/policy-effective",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.hr-setup.policy-assignments.create",
      method: "POST",
      path: "/api/neon/hr-setup/policy-assignments",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.hr-setup.policy-assignments.publish",
      method: "POST",
      path: "/api/neon/hr-setup/policy-assignments/:assignmentId/publish",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.users.list",
      method: "GET",
      path: "/api/neon/users",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.users.read",
      method: "GET",
      path: "/api/neon/users/:principalId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.users.profile-change.list",
      method: "GET",
      path: "/api/neon/users/me/profile-change",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.users.profile-change.create",
      method: "POST",
      path: "/api/neon/users/me/profile-change",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.users.profile-change.submit",
      method: "POST",
      path: "/api/neon/users/me/profile-change/:requestId/submit",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.users.profile-change.review",
      method: "GET",
      path: "/api/neon/users/profile-changes/review",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.users.profile-change.decide",
      method: "POST",
      path: "/api/neon/users/profile-changes/:requestId/decision",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.users.profile.admin",
      method: "PATCH",
      path: "/api/neon/users/:principalId/profile",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.workforce.authority",
      method: "GET",
      path: "/api/neon/workforce/:employeeId/authority",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.workforce.iam-projection.retry",
      method: "POST",
      path: "/api/neon/workforce/:employeeId/iam-projection/retry",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 16 * 1024,
    },
  ]);
export const SUPPLIER_WORKFORCE_REQUISITION_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.supplier-workforce.policy-readiness",
      method: "GET",
      path: "/api/neon/supplier-workforce/policy-readiness",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.supplier-workforce.requisitions.list",
      method: "GET",
      path: "/api/neon/supplier-workforce/requisitions",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.supplier-workforce.requisitions.publish",
      method: "POST",
      path: "/api/neon/supplier-workforce/requisitions/:requisitionId/publications",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 64 * 1024,
    },
    {
      id: "neon.supplier-workforce.engagement-iam.project",
      method: "POST",
      path: "/api/neon/supplier-workforce/engagements/:workerEngagementId/iam-projections",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
    {
      id: "neon.supplier-workforce.placements.activate",
      method: "POST",
      path: "/api/neon/supplier-workforce/engagements/:workerEngagementId/placements",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 32 * 1024,
    },
    {
      id: "neon.supplier-workforce.engagements.terminate",
      method: "POST",
      path: "/api/neon/supplier-workforce/engagements/:workerEngagementId/termination",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16 * 1024,
    },
  ]);
export const SUPPLIER_PROCESS_SELECTION_PREVIEW_OPERATION: RelayOperation =
  Object.freeze({
    id: "supplier.process-selection.preview",
    method: "GET",
    path: "/api/governance/process-selection/cases/:caseId/preview",
    requestClass: "json",
    requiresTenant: true,
    allowedQuery: [],
  });
export const BUSINESS_PARTNER_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    SUPPLIER_PROCESS_SELECTION_PREVIEW_OPERATION,
    {
      id: "notifications.email-consent.record",
      method: "POST",
      path: "/api/notifications/preferences/email-consent",
      requestClass: "json",
      requiresTenant: true,
      allowedQuery: [],
      idempotency: "required",
      maxBodyBytes: 16384,
    },
    ...(["view", "request", "process", "retry", "download"] as const).map(
      (action) => ({
        id: `supplier.process-documents.${action}`,
        method: action === "view" ? ("GET" as const) : ("POST" as const),
        path: `/api/governance/process-documents/${action === "view" || action === "request" ? "cases" : "jobs"}/:id/${action}` as const,
        requestClass: "json" as const,
        requiresTenant: true,
        allowedQuery: [],
        ...(action !== "view"
          ? { idempotency: "required" as const, maxBodyBytes: 16384 }
          : {}),
      }),
    ),
    {
      id: "supplier.cycle.readiness",
      method: "GET",
      path: "/api/governance/supplier-onboarding/runs/:runId/readiness",
      requestClass: "json",
      requiresTenant: true,
      allowedQuery: [],
    },
    {
      id: "supplier.cycle.complete",
      method: "POST",
      path: "/api/governance/supplier-onboarding/runs/:runId/completion",
      requestClass: "json",
      requiresTenant: true,
      allowedQuery: [],
      idempotency: "required",
      maxBodyBytes: 16384,
    },
    ...(
      [
        "view",
        "start",
        "decide",
        "cancel",
        "information",
        "escalate",
        "edit-preview",
      ] as const
    ).map((action) => ({
      id: `supplier.process-tasks.${action}`,
      method: action === "view" ? ("GET" as const) : ("POST" as const),
      path: `/api/governance/process-tasks/cases/:caseId/${action}` as const,
      requestClass: "json" as const,
      requiresTenant: true,
      allowedQuery: [],
      ...(action !== "view"
        ? {
            idempotency: "required" as const,
            maxBodyBytes: action === "edit-preview" ? 65536 : 16384,
          }
        : {}),
    })),
    BUSINESS_PARTNER_GOVERNED_IMPORT_OPERATION,
    {
      id: "neon.business-partner-intake.protect",
      method: "POST",
      path: "/api/neon/business-partner-intake/protected-values",
      requestClass: "json",
      requiresTenant: true,
      allowedQuery: [],
      maxBodyBytes: 4096,
    },
    BUSINESS_PARTNER_360_COMMENT_CREATE_OPERATION,
    ...BUSINESS_PARTNER_CASE_RELAY_OPERATIONS,
    BUSINESS_PARTNER_AGGREGATE_READ_OPERATION,
    BUSINESS_PARTNER_360_SUMMARY_OPERATION,
    BUSINESS_PARTNER_360_TAX_REVEAL_OPERATION,
    BUSINESS_PARTNER_360_IDENTIFIER_REVEAL_OPERATION,
    BUSINESS_PARTNER_360_BANK_REVEAL_OPERATION,
    BUSINESS_PARTNER_360_GOVERNANCE_OPERATION,
    PERSON_RESTRICTED_EVIDENCE_REVEAL_OPERATION,
    ...BUSINESS_PARTNER_360_SECTION_OPERATIONS,
    BUSINESS_PARTNER_ELIGIBILITY_READ_OPERATION,
    BUSINESS_PARTNER_SUPPLIER_ACTIVATION_OPERATION,
    BUSINESS_PARTNER_QUALIFICATION_CREATE_OPERATION,
    BUSINESS_PARTNER_QUALIFICATION_DECIDE_OPERATION,
    BUSINESS_PARTNER_PREFERENCE_LIST_OPERATION,
    BUSINESS_PARTNER_PREFERENCE_CREATE_OPERATION,
    BUSINESS_PARTNER_PREFERENCE_DECIDE_OPERATION,
    BUSINESS_PARTNER_PREFERENCE_REVOKE_OPERATION,
    ...BUSINESS_PARTNER_CUSTOMER_DESIGNATION_OPERATIONS,
    BUSINESS_PARTNER_CUSTOMER_CREDIT_LIST_OPERATION,
    BUSINESS_PARTNER_CUSTOMER_CREDIT_CREATE_OPERATION,
    BUSINESS_PARTNER_CUSTOMER_CREDIT_DECIDE_OPERATION,
    BUSINESS_PARTNER_CUSTOMER_LIFECYCLE_OPERATION,
    ...SUPPLIER_WORKFORCE_REQUISITION_OPERATIONS,
  ]);
/** @deprecated Use BUSINESS_PARTNER_RELAY_OPERATIONS. */
export const BUSINESS_PARTNER_REQUEST_RELAY_OPERATIONS =
  BUSINESS_PARTNER_RELAY_OPERATIONS;
export const RECORD_BOOKMARK_LIST_OPERATION: RelayOperation = Object.freeze({
  id: "record-bookmarks.list",
  method: "GET",
  path: "/api/record-bookmarks",
  requestClass: "json",
  requiresTenant: true,
});
export const RECORD_BOOKMARK_MEMBERSHIP_OPERATION: RelayOperation =
  Object.freeze({
    id: "record-bookmarks.membership",
    method: "GET",
    path: "/api/record-bookmarks/:entityCode/membership",
    requestClass: "json",
    requiresTenant: true,
  });
export const RECORD_BOOKMARK_ADD_OPERATION: RelayOperation = Object.freeze({
  id: "record-bookmarks.add",
  method: "PUT",
  path: "/api/record-bookmarks/:entityCode",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 64 * 1024,
});
export const RECORD_BOOKMARK_REMOVE_OPERATION: RelayOperation = Object.freeze({
  id: "record-bookmarks.remove",
  method: "DELETE",
  path: "/api/record-bookmarks/:entityCode",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 64 * 1024,
});
export const RECORD_BOOKMARK_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    RECORD_BOOKMARK_LIST_OPERATION,
    RECORD_BOOKMARK_MEMBERSHIP_OPERATION,
    RECORD_BOOKMARK_ADD_OPERATION,
    RECORD_BOOKMARK_REMOVE_OPERATION,
  ]);
export const RECORD_TRANSFERS_LIST_OPERATION: RelayOperation = Object.freeze({
  id: "records.transfers.list",
  method: "GET",
  path: "/api/records/transfers",
  requestClass: "json",
  requiresTenant: true,
});
export const RECORD_EXPORT_REQUEST_OPERATION: RelayOperation = Object.freeze({
  id: "records.exports.request",
  method: "POST",
  path: "/api/records/:entityCode/exports",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 256 * 1024,
});
export const RECORD_IMPORT_BEGIN_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.begin",
  method: "POST",
  path: "/api/records/:entityCode/imports",
  requestClass: "upload",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 256 * 1024,
});
export const RECORD_IMPORT_CHUNK_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.chunk",
  method: "PUT",
  path: "/api/records/imports/:sessionId/chunks/:chunkIndex",
  requestClass: "upload",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 8 * 1024 * 1024,
});
export const RECORD_IMPORT_COMPLETE_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.complete",
  method: "POST",
  path: "/api/records/imports/:sessionId/complete",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 16 * 1024,
});
export const RECORD_IMPORT_WORKBOOK_UPLOAD_OPERATION: RelayOperation =
  Object.freeze({
    id: "records.imports.workbook-upload",
    method: "POST",
    path: "/api/records/imports/:sessionId/workbook-upload",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "none",
    maxBodyBytes: 16 * 1024,
  });
export const RECORD_IMPORT_WORKBOOK_COMPLETE_OPERATION: RelayOperation =
  Object.freeze({
    id: "records.imports.workbook-complete",
    method: "POST",
    path: "/api/records/imports/:sessionId/workbook-complete",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const RECORD_IMPORT_FILE_UPLOAD_OPERATION: RelayOperation =
  Object.freeze({
    id: "records.imports.file-upload",
    method: "POST",
    path: "/api/records/imports/:sessionId/file-upload",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "none",
    maxBodyBytes: 16 * 1024,
  });
export const RECORD_IMPORT_FILE_COMPLETE_OPERATION: RelayOperation =
  Object.freeze({
    id: "records.imports.file-complete",
    method: "POST",
    path: "/api/records/imports/:sessionId/file-complete",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 16 * 1024,
  });
export const RECORD_IMPORT_VALIDATE_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.validate",
  method: "POST",
  path: "/api/records/imports/:sessionId/validate",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 16 * 1024,
});
export const RECORD_IMPORT_PREVIEW_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.preview",
  method: "POST",
  path: "/api/records/imports/:sessionId/preview",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 16 * 1024,
});
export const RECORD_IMPORT_COMMIT_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.commit",
  method: "POST",
  path: "/api/records/imports/:sessionId/commit",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 16 * 1024,
});
export const RECORD_IMPORT_ERROR_REPORT_OPERATION: RelayOperation =
  Object.freeze({
    id: "records.imports.error-report",
    method: "GET",
    path: "/api/records/imports/:sessionId/error-report",
    requestClass: "download",
    requiresTenant: true,
  });
export const RECORD_IMPORT_CANCEL_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.cancel",
  method: "POST",
  path: "/api/records/imports/:sessionId/cancel",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "none",
  maxBodyBytes: 1024,
});
export const RECORD_IMPORT_TEMPLATE_OPERATION: RelayOperation = Object.freeze({
  id: "records.imports.template",
  method: "GET",
  path: "/api/records/:entityCode/import-template.xlsx",
  requestClass: "download",
  requiresTenant: true,
});
export const RECORD_EXPORT_DOWNLOAD_OPERATION: RelayOperation = Object.freeze({
  id: "records.exports.download",
  method: "GET",
  path: "/api/records/exports/:exportRequestId/download",
  requestClass: "download",
  requiresTenant: true,
});
export const RECORD_EXPORT_CANCEL_OPERATION: RelayOperation = Object.freeze({
  id: "records.exports.cancel",
  method: "POST",
  path: "/api/records/exports/:exportRequestId/cancel",
  requestClass: "json",
  requiresTenant: true,
  idempotency: "none",
  maxBodyBytes: 1024,
});
export const RECORD_TRANSFER_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    RECORD_TRANSFERS_LIST_OPERATION,
    RECORD_EXPORT_REQUEST_OPERATION,
    RECORD_IMPORT_BEGIN_OPERATION,
    RECORD_IMPORT_CHUNK_OPERATION,
    RECORD_IMPORT_COMPLETE_OPERATION,
    RECORD_IMPORT_WORKBOOK_UPLOAD_OPERATION,
    RECORD_IMPORT_WORKBOOK_COMPLETE_OPERATION,
    RECORD_IMPORT_FILE_UPLOAD_OPERATION,
    RECORD_IMPORT_FILE_COMPLETE_OPERATION,
    RECORD_IMPORT_VALIDATE_OPERATION,
    RECORD_IMPORT_PREVIEW_OPERATION,
    RECORD_IMPORT_COMMIT_OPERATION,
    RECORD_IMPORT_ERROR_REPORT_OPERATION,
    RECORD_IMPORT_CANCEL_OPERATION,
    RECORD_IMPORT_TEMPLATE_OPERATION,
    RECORD_EXPORT_DOWNLOAD_OPERATION,
    RECORD_EXPORT_CANCEL_OPERATION,
  ]);
export const NOTIFICATION_INBOX_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.inbox",
  method: "GET",
  path: "/api/notifications/inbox",
  requiresTenant: true,
});
export const NOTIFICATION_COUNTS_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.counts",
  method: "GET",
  path: "/api/notifications/counts",
  requiresTenant: true,
});
export const NOTIFICATION_STREAM_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.stream",
  method: "GET",
  path: "/api/notifications/stream",
  requestClass: "stream",
  requiresTenant: true,
});
export const NOTIFICATION_READ_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.read",
  method: "POST",
  path: "/api/notifications/:id/read",
  requiresTenant: true,
  idempotency: "required",
});
export const NOTIFICATION_READ_ALL_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.read-all",
  method: "POST",
  path: "/api/notifications/read-all",
  requiresTenant: true,
  idempotency: "required",
});
export const NOTIFICATION_DISMISS_OPERATION: RelayOperation = Object.freeze({
  id: "notifications.dismiss",
  method: "POST",
  path: "/api/notifications/:id/dismiss",
  requiresTenant: true,
  idempotency: "required",
});
export const NOTIFICATION_PREFERENCES_READ_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.preferences.read",
    method: "GET",
    path: "/api/notifications/preferences",
    requiresTenant: true,
  });
export const NOTIFICATION_PREFERENCES_UPDATE_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.preferences.update",
    method: "PATCH",
    path: "/api/notifications/preferences",
    requiresTenant: true,
    maxBodyBytes: 64 * 1024,
  });
export const NOTIFICATION_PREFERENCES_PREVIEW_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.preferences.preview",
    method: "POST",
    path: "/api/notifications/preferences/preview",
    requiresTenant: true,
    maxBodyBytes: 64 * 1024,
  });
export const NOTIFICATION_PUSH_CONFIGURATION_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.push.configuration",
    method: "GET",
    path: "/api/notifications/push-configuration",
    requiresTenant: true,
  });
export const NOTIFICATION_PUSH_SUBSCRIBE_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.push.subscribe",
    method: "POST",
    path: "/api/notifications/push-subscriptions",
    requiresTenant: true,
    maxBodyBytes: 16 * 1024,
  });
export const NOTIFICATION_PUSH_UNSUBSCRIBE_OPERATION: RelayOperation =
  Object.freeze({
    id: "notifications.push.unsubscribe",
    method: "DELETE",
    path: "/api/notifications/push-subscriptions/:id",
    requiresTenant: true,
  });
export const WORKFLOW_INBOX_OPERATION: RelayOperation = Object.freeze({
  id: "workflow.inbox",
  method: "GET",
  path: "/api/workflow/inbox",
  requiresTenant: true,
});
export const WORKFLOW_ITEM_ACTION_OPERATION: RelayOperation = Object.freeze({
  id: "workflow.item.action",
  method: "POST",
  path: "/api/workflow/items/:id/actions/:action",
  requiresTenant: true,
  idempotency: "required",
  maxBodyBytes: 64 * 1024,
});
export const ACTIVITY_CENTER_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ...(["GET", "POST"] as const).map((method) => ({
      id: `activity.collection.views.${method}`,
      method,
      path: "/api/collections/:entityCode/views" as const,
      requiresTenant: true,
      idempotency: "none" as const,
      maxBodyBytes: method === "GET" ? 0 : 65536,
    })),
    {
      id: "activity.collection.descriptor",
      method: "GET",
      path: "/api/collections/:collectionKey/descriptor",
      requiresTenant: true,
      maxBodyBytes: 0,
    },
    {
      id: "activity.collection.configuration",
      method: "GET",
      path: "/api/collections/:collectionKey/configuration",
      requiresTenant: true,
      maxBodyBytes: 0,
    },
    {
      id: "notifications.deliveries.list",
      method: "GET",
      path: "/api/operations/notifications/deliveries",
      requiresTenant: true,
      allowedQuery: ["before"],
    },
    {
      id: "notifications.deliveries.timeline",
      method: "GET",
      path: "/api/operations/notifications/deliveries/:id/timeline",
      requiresTenant: true,
    },
    {
      id: "notifications.deliveries.replay",
      method: "POST",
      path: "/api/operations/notifications/deliveries/:id/replay",
      requiresTenant: true,
      idempotency: "required",
    },
    NOTIFICATION_INBOX_OPERATION,
    NOTIFICATION_COUNTS_OPERATION,
    NOTIFICATION_STREAM_OPERATION,
    NOTIFICATION_READ_OPERATION,
    NOTIFICATION_READ_ALL_OPERATION,
    NOTIFICATION_DISMISS_OPERATION,
    NOTIFICATION_PREFERENCES_READ_OPERATION,
    NOTIFICATION_PREFERENCES_UPDATE_OPERATION,
    NOTIFICATION_PREFERENCES_PREVIEW_OPERATION,
    NOTIFICATION_PUSH_CONFIGURATION_OPERATION,
    NOTIFICATION_PUSH_SUBSCRIBE_OPERATION,
    NOTIFICATION_PUSH_UNSUBSCRIBE_OPERATION,
    WORKFLOW_INBOX_OPERATION,
    WORKFLOW_ITEM_ACTION_OPERATION,
  ]);

export function createRelayHandler(options: RelayOptions): RelayHandler {
  const runtime = runtimeOrigin(options.runtimeApiUrl);
  const expectedOrigin = new URL(options.appOrigin).origin;
  const fetcher = options.fetch ?? globalThis.fetch;
  const operations = options.operations.map(compileOperation);
  if (!operations.length)
    throw new TypeError("Relay requires at least one allowlisted operation");
  const maxHeaderBytes = options.maxHeaderBytes ?? 32 * 1024;
  const defaultBodyBytes = options.defaultBodyBytes ?? 1024 * 1024;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  return async (request, context) => {
    try {
      enforceHeaderLimit(request.headers, maxHeaderBytes);
      const { path } = await context.params;
      const requestPath = new URL(request.url).pathname;
      // Path encodings are a routing concern; encoded query values are data
      // validated by the selected Runtime operation.
      if (
        !requestPath.startsWith("/api/relay/") ||
        RAW_PATH_ATTACK.test(requestPath)
      )
        return problem(400, "RELAY_INVALID_PATH", "Relay path is invalid");
      const normalizedPath = normalizePath(path);
      const method = request.method.toUpperCase() as RelayMethod;
      const match = findOperation(operations, method, normalizedPath);
      if (!match)
        return problem(
          404,
          "RELAY_OPERATION_NOT_ALLOWED",
          "The requested platform operation is not allowlisted",
        );
      const { operation, params } = match;
      const session = await options.session.resolve(request);
      if (!session)
        return problem(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication is required",
        );
      if (session.plane !== options.plane)
        return problem(
          403,
          "AUTH_CONTEXT_MISMATCH",
          "The verified session belongs to another plane",
        );
      if (operation.requiresTenant !== false && !session.tenantId)
        return problem(
          409,
          "AUTH_CONTEXT_MISMATCH",
          "Select a tenant context before continuing",
        );
      if (
        operation.tenantParam &&
        params[operation.tenantParam] !== session.tenantId
      )
        return problem(
          403,
          "AUTH_CONTEXT_MISMATCH",
          "The requested tenant does not match the verified session",
        );
      if (UNSAFE.has(method)) {
        const originFailure = verifyUnsafeRequest(
          request,
          expectedOrigin,
          session.acceptedCsrfTokens ?? [session.csrfToken],
        );
        if (originFailure) return originFailure;
      }
      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey && !validIdempotencyKey(idempotencyKey))
        return problem(
          400,
          "RELAY_INVALID_IDEMPOTENCY_KEY",
          "Idempotency-Key is invalid",
        );
      if (operation.idempotency === "required" && !idempotencyKey)
        return problem(
          428,
          "RELAY_IDEMPOTENCY_REQUIRED",
          "This operation requires an Idempotency-Key",
        );
      if (operation.idempotency === "none" && idempotencyKey)
        return problem(
          400,
          "RELAY_IDEMPOTENCY_NOT_ALLOWED",
          "This operation does not accept an Idempotency-Key",
        );
      // Refresh needs authentication metadata only. The business body will be
      // consumed below and cannot subsequently be cloned by the auth adapter.
      const refreshHeaders = new Headers();
      for (const name of [
        "cookie",
        "origin",
        "sec-fetch-site",
        "x-csrf-token",
      ]) {
        const value = request.headers.get(name);
        if (value !== null) refreshHeaders.set(name, value);
      }
      const refreshRequest = new Request(request.url, {
        method: UNSAFE.has(method) ? "POST" : method,
        headers: refreshHeaders,
        signal: request.signal,
      });
      const body = await prepareBody(request, operation, defaultBodyBytes);
      const canRetry =
        body.replayable && (IDEMPOTENT.has(method) || !!idempotencyKey);
      options.onDiagnostic?.({
        event: "request",
        operationId: operation.id,
        method,
      });
      let activeSession = session;
      let response = await forward(activeSession, 0);
      if (response.status === 401 && canRetry) {
        options.onDiagnostic?.({
          event: "refresh",
          operationId: operation.id,
          method,
          status: 401,
        });
        const refreshResult = await options.session.refresh(refreshRequest);
        const refreshed = refreshResult
          ? await options.session.resolve(request)
          : undefined;
        if (sameAuthority(session, refreshed, options.plane)) {
          activeSession = refreshed;
          response = await forward(activeSession, 1);
        }
      }
      if (await isContextMismatch(response)) {
        const clearedCookies = await options.session.invalidate(
          request,
          "context_mismatch",
        );
        options.onDiagnostic?.({
          event: "context_mismatch",
          operationId: operation.id,
          method,
          status: response.status,
          requestId: response.headers.get("x-request-id") ?? undefined,
        });
        const recovery = problem(
          401,
          "AUTH_CONTEXT_MISMATCH",
          "Session context changed; sign in again",
          response.headers.get("x-request-id") ?? undefined,
          { "x-athyper-session-action": "login" },
        );
        // Only the local session authority can issue cookies; upstream
        // Set-Cookie headers remain excluded from relay responses.
        for (const value of clearedCookies ?? [])
          recovery.headers.append("set-cookie", value);
        return recovery;
      }
      return relayResponse(
        response,
        request.signal,
        operation.requestClass ?? "json",
      );

      async function forward(
        authority: RelaySessionContext,
        attempt: number,
      ): Promise<Response> {
        const headers = requestHeaders(request.headers);
        headers.set("authorization", `Bearer ${authority.accessToken}`);
        headers.set("x-plane", authority.plane);
        headers.set("x-realm", authority.realmKey);
        headers.set("x-principal-id", authority.principalId);
        headers.set("x-auth-epoch", String(authority.authEpoch));
        if (authority.tenantId) headers.set("x-tenant-id", authority.tenantId);
        const controller = new AbortController();
        const requestClass = operation.requestClass ?? "json";
        const timeoutMs =
          options.timeouts?.[requestClass] ??
          operation.responseHeaderTimeoutMs ??
          timeouts[requestClass];
        const timer = setTimeout(
          () =>
            controller.abort(
              new DOMException("Upstream timeout", "TimeoutError"),
            ),
          timeoutMs,
        );
        const disconnect = () => controller.abort(request.signal.reason);
        if (request.signal.aborted) disconnect();
        else
          request.signal.addEventListener("abort", disconnect, { once: true });
        try {
          const init: RequestInit & { duplex?: "half" } = {
            method,
            headers,
            body: body.forAttempt(attempt),
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
          };
          if (init.body instanceof ReadableStream) init.duplex = "half";
          const upstream = await fetcher(
            new URL(
              `${normalizedPath}${new URL(request.url).search}`,
              runtime,
            ).toString(),
            init,
          );
          clearTimeout(timer);
          return upstream;
        } catch {
          clearTimeout(timer);
          if (body.exceeded())
            return problem(
              413,
              "RELAY_BODY_TOO_LARGE",
              "Request body exceeds the operation limit",
            );
          if (request.signal.aborted)
            return new Response(null, { status: 499 });
          if (controller.signal.aborted)
            return problem(
              504,
              "RELAY_UPSTREAM_TIMEOUT",
              "Platform request timed out",
            );
          options.onDiagnostic?.({
            event: "failure",
            operationId: operation.id,
            method,
            status: 502,
          });
          return problem(
            502,
            "RELAY_UPSTREAM_UNAVAILABLE",
            "Platform service is unavailable",
          );
        } finally {
          request.signal.removeEventListener("abort", disconnect);
        }
      }
    } catch (cause) {
      if (cause instanceof RelayInputError)
        return problem(cause.status, cause.code, cause.message);
      options.onDiagnostic?.({
        event: "failure",
        method: request.method,
        status: 500,
      });
      return problem(500, "RELAY_INTERNAL_ERROR", "Relay request failed");
    }
  };
}

interface CompiledOperation {
  readonly operation: RelayOperation;
  readonly segments: readonly string[];
}
function compileOperation(operation: RelayOperation): CompiledOperation {
  if (
    operation.responseHeaderTimeoutMs !== undefined &&
    (!Number.isInteger(operation.responseHeaderTimeoutMs) ||
      operation.responseHeaderTimeoutMs < 1 ||
      operation.responseHeaderTimeoutMs > 120_000)
  )
    throw new TypeError("Invalid relay response header timeout");
  if (
    !operation.path.startsWith("/api/") ||
    operation.path.includes("?") ||
    operation.path.includes("#") ||
    operation.path.includes("\\") ||
    operation.path.split("/").includes("..")
  )
    throw new TypeError(`Invalid relay operation path: ${operation.path}`);
  return {
    operation: Object.freeze({
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      ...operation,
    }),
    segments: operation.path.slice(1).split("/"),
  };
}
function findOperation(
  operations: readonly CompiledOperation[],
  method: RelayMethod,
  path: string,
) {
  const actual = path.slice(1).split("/");
  for (const candidate of operations) {
    if (
      candidate.operation.method !== method ||
      candidate.segments.length !== actual.length
    )
      continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < actual.length; index++) {
      const expected = candidate.segments[index]!;
      const value = actual[index]!;
      if (expected.startsWith(":")) params[expected.slice(1)] = value;
      else if (expected !== value) {
        matches = false;
        break;
      }
    }
    if (matches) return { operation: candidate.operation, params };
  }
  return undefined;
}
function normalizePath(segments: readonly string[]): `/api/${string}` {
  if (!segments.length)
    throw new RelayInputError(400, "RELAY_INVALID_PATH", "Relay path is empty");
  const normalized = segments.map((segment) => {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      segment.includes("?") ||
      segment.includes("#")
    )
      throw new RelayInputError(
        400,
        "RELAY_INVALID_PATH",
        "Relay path contains an unsafe segment",
      );
    return encodeURIComponent(segment);
  });
  return `/api/${normalized.join("/")}`;
}
function runtimeOrigin(value: string): URL {
  const url = new URL(value);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      "RUNTIME_API_URL must be a server-side HTTP(S) base URL without credentials, query, or fragment",
    );
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "") + "/";
  return url;
}
function requestHeaders(input: Headers): Headers {
  const output = new Headers();
  for (const [name, value] of input) {
    const lower = name.toLowerCase();
    if (
      BLOCKED_REQUEST_HEADERS.has(lower) ||
      !SAFE_REQUEST_HEADERS.has(lower) ||
      lower === "content-length" ||
      lower === "content-encoding"
    )
      continue;
    output.set(lower, value);
  }
  return output;
}
function enforceHeaderLimit(headers: Headers, limit: number): void {
  let bytes = 0;
  for (const [name, value] of headers)
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
  if (bytes > limit)
    throw new RelayInputError(
      431,
      "RELAY_HEADERS_TOO_LARGE",
      "Request headers exceed the relay limit",
    );
}
function verifyUnsafeRequest(
  request: Request,
  expectedOrigin: string,
  expectedCsrf: readonly string[],
): Response | undefined {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expectedOrigin || (fetchSite && fetchSite !== "same-origin"))
    return problem(
      403,
      "RELAY_CROSS_ORIGIN",
      "Unsafe relay requests must be same-origin",
    );
  const supplied = request.headers.get("x-csrf-token");
  if (
    !supplied ||
    !expectedCsrf.some((candidate) => safeEqual(supplied, candidate))
  )
    return problem(403, "RELAY_CSRF_INVALID", "CSRF validation failed");
  return undefined;
}
function sameAuthority(
  previous: RelaySessionContext,
  refreshed: RelaySessionContext | undefined,
  plane: string,
): refreshed is RelaySessionContext {
  return (
    !!refreshed &&
    refreshed.plane === plane &&
    refreshed.realmKey === previous.realmKey &&
    refreshed.tenantId === previous.tenantId &&
    refreshed.principalId === previous.principalId &&
    refreshed.authEpoch === previous.authEpoch
  );
}
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function validIdempotencyKey(value: string): boolean {
  return value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value);
}

interface PreparedBody {
  readonly replayable: boolean;
  forAttempt(attempt: number): BodyInit | undefined;
  exceeded(): boolean;
}
async function prepareBody(
  request: Request,
  operation: RelayOperation,
  fallbackLimit: number,
): Promise<PreparedBody> {
  if (["GET", "HEAD"].includes(request.method))
    return {
      replayable: true,
      forAttempt: () => undefined,
      exceeded: () => false,
    };
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity")
    throw new RelayInputError(
      415,
      "RELAY_CONTENT_ENCODING_UNSUPPORTED",
      "Compressed request bodies are not accepted by the relay",
    );
  const limit = operation.maxBodyBytes ?? fallbackLimit;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit)
    throw new RelayInputError(
      413,
      "RELAY_BODY_TOO_LARGE",
      "Request body exceeds the operation limit",
    );
  if (!request.body)
    return {
      replayable: true,
      forAttempt: () => undefined,
      exceeded: () => false,
    };
  if ((operation.requestClass ?? "json") !== "upload") {
    const bytes = await readLimited(request.body, limit);
    return {
      replayable: true,
      forAttempt: () => bytes.slice(),
      exceeded: () => false,
    };
  }
  let size = 0;
  let tooLarge = false;
  const stream = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > limit) {
          tooLarge = true;
          controller.error(new RangeError("body limit"));
        } else controller.enqueue(chunk);
      },
    }),
  );
  return {
    replayable: false,
    forAttempt: (attempt) => (attempt === 0 ? stream : undefined),
    exceeded: () => tooLarge,
  };
}
async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit)
        throw new RelayInputError(
          413,
          "RELAY_BODY_TOO_LARGE",
          "Request body exceeds the operation limit",
        );
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function isContextMismatch(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const type = response.headers.get("content-type") ?? "";
  if (!/json/i.test(type) || !response.body) return false;
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > 64 * 1024) return false;
  try {
    const bytes = await readLimited(response.clone().body!, 64 * 1024);
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    return (
      value.code === "AUTH_CONTEXT_MISMATCH" ||
      value.error === "AUTH_CONTEXT_MISMATCH"
    );
  } catch {
    return false;
  }
}
function relayResponse(
  upstream: Response,
  clientSignal: AbortSignal,
  requestClass: RelayRequestClass,
): Response {
  const headers = new Headers({
    "cache-control":
      requestClass === "stream"
        ? "no-cache, no-transform"
        : "private, no-store",
  });
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (!SAFE_RESPONSE_HEADERS.has(lower)) continue;
    if (
      (lower === "x-request-id" || lower === "x-correlation-id") &&
      !safeIdentifier(value)
    )
      continue;
    headers.set(
      name,
      lower === "content-disposition" ? value.replace(/[\r\n\0]/g, "") : value,
    );
  }
  const body = upstream.body
    ? cancelOnDisconnect(upstream.body, clientSignal)
    : null;
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
function cancelOnDisconnect(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const cancel = () => void reader.cancel(signal.reason).catch(() => undefined);
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          signal.removeEventListener("abort", cancel);
          controller.close();
        } else controller.enqueue(result.value);
      } catch (cause) {
        controller.error(cause);
      }
    },
    async cancel(reason) {
      signal.removeEventListener("abort", cancel);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
function problem(
  status: number,
  code: string,
  title: string,
  requestId?: string,
  extraHeaders?: HeadersInit,
): Response {
  const value = {
    type: `https://athyper.dev/problems/${code}`,
    title,
    status,
    code,
    ...(requestId && safeIdentifier(requestId) ? { requestId } : {}),
  } satisfies ApiProblem;
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/problem+json",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}
function safeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}
class RelayInputError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze(
    STUDIO_BP_DEFINITION_RELAY_OPERATIONS.flatMap((operation) =>
      [
        "business-partner-case-contracts",
        "business-partner-company-case-contracts",
      ].map((resource) =>
        Object.freeze({
          ...operation,
          id: operation.id.replace("business-partner-definitions", resource),
          path: operation.path.replace(
            "business-partner-definitions",
            resource,
          ) as RelayOperation["path"],
        }),
      ),
    ),
  );

export const NEON_BP_CLASSIFICATION_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.partner-classification.read",
      method: "GET",
      path: "/api/neon/business-partners/:businessPartnerId/commodity-classifications",
      requestClass: "json",
      requiresTenant: true,
    },
    ...(["declare", "verify", "archive"] as const).map((action) => ({
      id: `neon.partner-classification.${action}`,
      method: "POST" as const,
      path: `/api/neon/business-partners/:businessPartnerId/commodity-classifications/${action}` as RelayOperation["path"],
      requestClass: "json" as const,
      requiresTenant: true,
      idempotency: "required" as const,
      maxBodyBytes: 8192,
    })),
  ]);

export const NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "neon.bank-registration.create",
      method: "POST",
      path: "/api/neon/business-partners/:businessPartnerId/protected-bank-registrations",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "required",
      maxBodyBytes: 16384,
    },
    {
      id: "neon.bank-registration.read",
      method: "GET",
      path: "/api/neon/protected-bank-registrations/:bankAccountLinkId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.bank-provisional.resolve",
      method: "POST",
      path: "/api/neon/protected-bank-registrations/:bankAccountLinkId/provisional-resolution",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
    {
      id: "neon.bank-registration.decide",
      method: "POST",
      path: "/api/neon/protected-bank-registrations/:bankAccountLinkId/decisions",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 32768,
    },
    {
      id: "neon.bank-verification.read",
      method: "GET",
      path: "/api/neon/business-partner-bank-verifications/:verificationId",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "neon.bank-verification.decide",
      method: "POST",
      path: "/api/neon/business-partner-bank-verifications/:verificationId/decisions",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 32768,
    },
    {
      id: "neon.bank-verification.apply",
      method: "POST",
      path: "/api/neon/business-partner-bank-verifications/:verificationId/applications",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
  ]);

export const ENTITY_VIEWS_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "entity-views.list",
      method: "GET",
      path: "/api/entity-runtime/:entityCode/views",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "entity-views.command",
      method: "POST",
      path: "/api/entity-runtime/:entityCode/views",
      requestClass: "json",
      requiresTenant: true,
      idempotency: "none",
      maxBodyBytes: 64 * 1024,
    },
  ]);

export const COLLABORATION_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    {
      id: "collaboration.participants",
      method: "GET",
      path: "/api/collab/participants",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "collaboration.history",
      method: "GET",
      path: "/api/collab/comments/:id/history",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "collaboration.create",
      method: "POST",
      path: "/api/collab/comments",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 262144,
      idempotency: "required",
    },
    {
      id: "collaboration.reply",
      method: "POST",
      path: "/api/collab/comments/:id/replies",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 262144,
      idempotency: "required",
    },
    {
      id: "collaboration.edit",
      method: "PATCH",
      path: "/api/collab/comments/:id",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 262144,
    },
    {
      id: "collaboration.remove",
      method: "DELETE",
      path: "/api/collab/comments/:id",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "collaboration.react",
      method: "POST",
      path: "/api/collab/comments/:id/reactions",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 4096,
    },
    {
      id: "collaboration.unreact",
      method: "DELETE",
      path: "/api/collab/comments/:id/reactions/:code",
      requestClass: "json",
      requiresTenant: true,
    },
    {
      id: "collaboration.flag",
      method: "POST",
      path: "/api/collab/comments/:id/flag",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 8192,
    },
    {
      id: "collaboration.draft.save",
      method: "POST",
      path: "/api/collab/drafts",
      requestClass: "json",
      requiresTenant: true,
      maxBodyBytes: 262144,
    },
    {
      id: "collaboration.draft.cancel",
      method: "DELETE",
      path: "/api/collab/drafts",
      requestClass: "json",
      requiresTenant: true,
    },
  ]);

/** Operations every plane exposes for the shared shell and Entity Framework:
 * identity, experience runtime, entity views/list/detail/record runtime,
 * bookmarks, transfers, activity and collaboration. Plane apps spread this and
 * add only what is plane-specific, so a new shared entity capability is
 * registered once. Keep it last in this module: it composes the groups above. */
export const COMMON_PLANE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ...COLLABORATION_RELAY_OPERATIONS,
    ...ATTACHMENT_READ_RELAY_OPERATIONS,
    IAM_ME_OPERATION,
    EXPERIENCE_BOOTSTRAP_OPERATION,
    PRINCIPAL_LOCALE_UPDATE_OPERATION,
    PRINCIPAL_APPEARANCE_UPDATE_OPERATION,
    ...EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS,
    ...ATLAS_ANSWER_RELAY_OPERATIONS,
    ...ENTITY_VIEWS_RELAY_OPERATIONS,
    ENTITY_APPLICATION_DESCRIPTOR_OPERATION,
    ...REFERENCE_HISTORY_RELAY_OPERATIONS,
    ENTITY_DIRECTORY_OPERATION,
    ENTITY_LIST_DESCRIPTOR_OPERATION,
    ENTITY_LIST_QUERY_OPERATION,
    ENTITY_REFERENCE_CHOICES_OPERATION,
    ...ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
    ...RECORD_BOOKMARK_RELAY_OPERATIONS,
    ...RECORD_TRANSFER_RELAY_OPERATIONS,
    ...ACTIVITY_CENTER_RELAY_OPERATIONS,
  ]);
