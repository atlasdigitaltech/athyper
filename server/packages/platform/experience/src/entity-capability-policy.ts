import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  parseCapabilityBinding,
  parseCapabilityDeclaration,
  projectEntityCapability,
  type EntityCapabilityKind,
} from "@athyper/server-contract-publication";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";

export class EntityCapabilityPolicyError extends Error {
  readonly statusCode = 403;
  readonly code = "ENTITY_CAPABILITY_DENIED";
  constructor() {
    super("Entity capability is unavailable or not authorized");
  }
}
export interface EntityCapabilityRequest {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly kind: EntityCapabilityKind;
  readonly action: string;
  readonly input?: Readonly<Record<string, unknown>>;
  /** Trusted route preflight: authorization still applies, command tokens do not. */
  readonly preflight?: boolean;
}
/**
 * Server-resolved parent admission. Scope resources are derived from the
 * admitted record, never supplied by the browser. They let a record-bound
 * capability use the same scope proof as the parent record.
 */
export type EntityCapabilityParentAdmission =
  | boolean
  | Readonly<{
      readonly scopeResources?: readonly Readonly<Record<string, unknown>>[];
    }>;
/** Server-loaded state for a comment target. Browser input must never populate it. */
export interface EntityCapabilityCommentSubject {
  readonly commentId: string;
  readonly entityCode: string;
  readonly recordId: string;
  readonly authorId: string;
  readonly visibility: "public" | "internal" | "private";
  readonly parentCommentId?: string;
}

export interface EntityCapabilityAudienceResolver {
  validateMentions?(input: EntityCapabilityRequest, ids: readonly string[]): Promise<boolean>;
  loadComment(
    input: Pick<EntityCapabilityRequest, "context" | "entityCode" | "recordId"> & {
      readonly commentId: string;
      readonly includeDeleted?: boolean;
    },
  ): Promise<EntityCapabilityCommentSubject | null>;
  /**
   * Tests a current record participant under the same verified admission boundary.
   * It is only called for the requester; recipient expansion is deliberately a
   * separate service concern so a caller cannot nominate collaborators.
   */
  isCurrentRecordParticipant(input: EntityCapabilityRequest): Promise<boolean>;
}
/** One admitted-release resolver for direct routes, generic dispatch and layouts. */
export function createEntityCapabilityPolicy(options: {
  readonly reader: PinnedCompiledEntityReader;
  readonly authorizer: Authorizer;
  readonly authorizeParent: (
    input: EntityCapabilityRequest,
  ) => Promise<EntityCapabilityParentAdmission>;
  readonly audience?: EntityCapabilityAudienceResolver;
}) {
  return {
    async resolve(
      input: EntityCapabilityRequest,
      admittedRelease?: NonNullable<
        Awaited<ReturnType<PinnedCompiledEntityReader["resolve"]>>
      >,
    ) {
      const deny = () => {
        throw new EntityCapabilityPolicyError();
      };
      const release =
        admittedRelease ??
        (await options.reader.resolve({
          tenantId: input.context.tenantId,
          principalId: input.context.principalId,
          planeKey: input.context.planeKey,
          entityCode: input.entityCode,
        }));
      if (!release) return deny();
      if (
        admittedRelease &&
        (release.coordinate.tenantId !== input.context.tenantId ||
          release.coordinate.principalId !== input.context.principalId ||
          release.coordinate.planeKey !== input.context.planeKey ||
          release.coordinate.entityCode !== input.entityCode)
      )
        return deny();
      const core = await options.reader.core(release);
      const declaration = parseCapabilityDeclaration(
        (core.content.capabilities as Record<string, unknown> | undefined)?.[
          input.kind
        ],
        input.kind,
        input.entityCode,
      );
      if (!declaration.enabled) return deny();
      const operation = await options.reader.operation(release);
      const binding = parseCapabilityBinding(
        operation.content[
          input.kind === "comments" ? "commentBinding" : "attachmentBinding"
        ],
        input.kind,
        input.entityCode,
      );
      const action = binding.actions.find((a) => a.key === input.action);
      const parent = await options.authorizeParent(input);
      if (!action || !parent) return deny();
      const baseResource = {
        tenantId: input.context.tenantId,
        resourceCode: input.entityCode,
        resourceId:
          input.input?.attachmentId ?? input.input?.commentId ?? input.recordId,
        recordId: input.recordId,
        entityType: input.entityCode,
        entityId: input.recordId,
      };
      const scopeResources = parentScopeResources(parent);
      let resource: Readonly<Record<string, unknown>> | undefined;
      for (const scopeResource of scopeResources) {
        const candidate = { ...baseResource, ...scopeResource };
        if ((await options.authorizer.authorize({
          context: input.context,
          permissionCode: action.permissionCode,
          resource: candidate,
        })).allowed) {
          resource = candidate;
          break;
        }
      }
      if (
        !resource
      )
        return deny();
      const value = input.input ?? {};
      if (input.kind === "comments") {
        const commentBinding = binding as import("@athyper/server-contract-publication").CommentBinding;
        const targetId = string(value.commentId);
        const parentId = string(value.parentCommentId);
        const target = targetId
          ? await loadComment(options.audience, input, targetId)
          : undefined;
        const parent = parentId
          ? await loadComment(options.audience, input, parentId)
          : undefined;
        if (targetId && !target) return deny();
        if (input.action === "history" && (!target || target.authorId !== input.context.principalId)) return deny();
        if (parentId && !parent) return deny();
        if (target && !(await canReadComment(options.audience, input, target)))
          return deny();
        if (parent && !(await canReadComment(options.audience, input, parent)))
          return deny();

        // A reply can only retain or narrow its parent's audience. Private is
        // strictly author-only, Internal is admitted-record-participant-only.
        const requested = audience(value.visibility, commentBinding.defaultAudience);
        if (parent && !canReplyWith(parent.visibility, requested)) return deny();
        if (requested === "internal" && !(await isParticipant(options.audience, input)))
          return deny();
        if (Array.isArray(value.mentionedPrincipalIds)) {
          if (!commentBinding.features.mentions) return deny();
          const ids=value.mentionedPrincipalIds;
          if(ids.length && (ids.some(id=>typeof id!=="string") || !options.audience?.validateMentions || !await options.audience.validateMentions({...input,input:{...value,visibility:target?.visibility ?? requested}},ids))) return deny();
        }
      } else {
        // Attachment bytes that are pinned to a comment inherit that comment's
        // audience. The attachment route supplies this ID from its own
        // tenant-scoped lookup; it never trusts a browser-provided association.
        const commentId = string(value.commentId);
        if (commentId) {
          const subject = await loadComment(options.audience, input, commentId);
          if (!subject || !(await canReadComment(options.audience, input, subject)))
            return deny();
        }
      }
      if (input.action !== "read" && !input.preflight) {
        const revision = input.kind === "attachments" && input.action === "version"
          ? value.expectedSeriesVersion
          : input.kind === "attachments" && input.action === "rename"
            ? (typeof value.expectedSeriesRevision === "string" && /^[1-9][0-9]*$/.test(value.expectedSeriesRevision) ? Number(value.expectedSeriesRevision) : undefined)
            : value.expectedRevision ?? value.expectedVersion;
        if (
          action.concurrency === "revision" &&
          (!Number.isSafeInteger(revision) || Number(revision) < 1)
        )
          return deny();
        if (action.idempotency === "required" && (typeof value.idempotencyKey !== "string" || value.idempotencyKey.length < 8))
          return deny();
      }
      if ("maxFileBytes" in binding) {
        if (
          value.sizeBytes !== undefined &&
          (!Number.isSafeInteger(value.sizeBytes) ||
            typeof value.sizeBytes !== "number" ||
            value.sizeBytes < 1 ||
            value.sizeBytes > binding.maxFileBytes)
        )
          return deny();
        if (
          value.contentType !== undefined &&
          !binding.allowedContentTypes.includes(String(value.contentType))
        )
          return deny();
      } else {
        if (
          typeof value.text === "string" &&
          value.text.length > binding.maxTextLength
        )
          return deny();
        if (
          value.visibility !== undefined &&
          !binding.allowedAudiences.includes(value.visibility as never)
        )
          return deny();
        if (
          Array.isArray(value.attachmentIds) &&
          value.attachmentIds.length > binding.attachments.maxCount
        )
          return deny();
        if (
          Array.isArray(value.mentionedPrincipalIds) &&
          value.mentionedPrincipalIds.length &&
          !binding.features.mentions
        )
          return deny();
        if (value.parentCommentId && !binding.features.replies) return deny();
        if (
          value.code !== undefined &&
          !binding.reactionCodes.includes(String(value.code))
        )
          return deny();
      }
      const allowed = new Set<string>();
      for (const candidate of binding.actions)
        if (
          (
            await options.authorizer.authorize({
              context: input.context,
              permissionCode: candidate.permissionCode,
              resource,
            })
          ).allowed
        )
          allowed.add(candidate.permissionCode);
      return {
        binding,
        action,
        releaseHash: release.release.releaseHash,
        policyHash: operation.artifactHash,
        projection: projectEntityCapability(binding, allowed),
      };
    },
  };
}

function parentScopeResources(
  admission: EntityCapabilityParentAdmission,
): readonly Readonly<Record<string, unknown>>[] {
  if (!admission || typeof admission !== "object") return Object.freeze([{}]);
  const values = admission.scopeResources;
  if (!Array.isArray(values) || values.length === 0) return Object.freeze([{}]);
  const safe = values.filter(
    (value): value is Readonly<Record<string, unknown>> =>
      !!value && typeof value === "object" && !Array.isArray(value),
  );
  return safe.length ? Object.freeze(safe) : Object.freeze([{}]);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}
function audience(
  value: unknown,
  fallback: "public" | "internal" | "private",
): "public" | "internal" | "private" {
  return value === "public" || value === "internal" || value === "private"
    ? value
    : fallback;
}
function canReplyWith(
  parent: EntityCapabilityCommentSubject["visibility"],
  requested: EntityCapabilityCommentSubject["visibility"],
): boolean {
  const width = { private: 0, internal: 1, public: 2 } as const;
  return width[requested] <= width[parent];
}
async function isParticipant(
  resolver: EntityCapabilityAudienceResolver | undefined,
  input: EntityCapabilityRequest,
): Promise<boolean> {
  return resolver ? resolver.isCurrentRecordParticipant(input) : false;
}
async function canReadComment(
  resolver: EntityCapabilityAudienceResolver | undefined,
  input: EntityCapabilityRequest,
  subject: EntityCapabilityCommentSubject,
): Promise<boolean> {
  if (
    subject.entityCode !== input.entityCode ||
    subject.recordId !== input.recordId
  )
    return false;
  if (subject.visibility === "public") return true;
  if (subject.authorId === input.context.principalId) return true;
  return subject.visibility === "internal" && (await isParticipant(resolver, input));
}
async function loadComment(
  resolver: EntityCapabilityAudienceResolver | undefined,
  input: EntityCapabilityRequest,
  commentId: string,
): Promise<EntityCapabilityCommentSubject | null> {
  return resolver?.loadComment({
    context: input.context,
    entityCode: input.entityCode,
    recordId: input.recordId,
    commentId,
    ...(input.action === "history" ? {includeDeleted:true} : {}),
  }) ?? null;
}
