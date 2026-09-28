import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import { EntityCapabilityPolicyError, type createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import { EntityRuntimeResourceError, type EntityRuntimeSectionHandlerRegistry } from "./entity-section-service.js";

type Subject = { context: VerifiedRequestContext; entityCode: string; recordId: string };
type Kind = "comments" | "attachments";

/** Signed capability admission, independent of optional published page sections.
 * Read providers retain tenant SQL/RLS and mutations use existing secured routes. */
export function createEntityCollaborationService(options: {
  reader: PinnedCompiledEntityReader;
  capabilities: ReturnType<typeof createEntityCapabilityPolicy>;
  providers: Pick<EntityRuntimeSectionHandlerRegistry, "getService">;
}) {
  return {
    async describe(input: Subject): Promise<readonly Kind[]> {
      const allowed: Kind[] = [];
      const release = await options.reader.resolve({ tenantId: input.context.tenantId, principalId: input.context.principalId, planeKey: input.context.planeKey, entityCode: input.entityCode });
      if (!release) return allowed;
      const core = await options.reader.core(release);
      const declarations = core.content.capabilities as Record<string, unknown> | undefined;
      for (const kind of ["comments", "attachments"] as const) {
        if (!declarations?.[kind]) continue;
        try {
          const admitted = await options.capabilities.resolve({ ...input, kind, action: "read" }, release);
          if (options.providers.getService?.(admitted.binding.serviceKey)) allowed.push(kind);
        } catch (error) {
          if (!(error instanceof EntityCapabilityPolicyError)) throw error;
        }
      }
      return allowed;
    },
    async read(input: Subject & { kind: Kind; cursor?: string; limit?: number; threadRootId?: string; commentFilter?: "mentions" }) {
      if (!["comments", "attachments"].includes(input.kind) || (input.cursor && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.cursor)) ||
        (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)))
        throw new EntityCapabilityPolicyError();
      const release = await options.reader.resolve({ tenantId: input.context.tenantId, principalId: input.context.principalId, planeKey: input.context.planeKey, entityCode: input.entityCode });
      if (!release) throw new EntityCapabilityPolicyError();
      const capability = await options.capabilities.resolve({ ...input, action: "read" }, release);
      if (input.threadRootId) {
        if (input.kind !== "comments" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.threadRootId)) throw new EntityCapabilityPolicyError();
        await options.capabilities.resolve({ ...input, action: "read", input: { commentId: input.threadRootId } }, release);
      }
      const handler = options.providers.getService?.(capability.binding.serviceKey);
      if (!handler) throw new EntityRuntimeResourceError(503, "ENTITY_RUNTIME_SECTION_HANDLER_UNAVAILABLE");
      const core = await options.reader.core(release);
      const result = await handler.read({ context: input.context, release, core, capability, recordId: input.recordId,
        limit: Math.min(100, Math.max(1, input.limit ?? 25)), ...(input.cursor ? { cursor: input.cursor } : {}),
        resourceContext: { ...(input.threadRootId ? { threadRootId: input.threadRootId } : {}), ...(input.commentFilter ? { commentFilter: input.commentFilter } : {}) } });
      return { releaseId: release.release.releaseId, releaseHash: release.release.releaseHash,
        sectionKey: input.kind, revision: result.revision, capability: capability.projection,
        presentation: { rendererKey: capability.binding.serviceKey, fields: [], childCollections: [] }, data: result.data };
    },
  };
}
