import type {
  EntityAuthoringResourceSource,
  PublicationCanonicalizer,
  PublicationAuthorityRepository,
  PublicationRelease,
} from "@athyper/server-contract-publication";
import { parseEntityAuthoringResource } from "@athyper/server-contract-publication";
/** Runs inside the authenticated host's canonical transaction. Exact generated
 * sources are producer-owned; neither the HTTP body nor a reviewer can edit them. */
export function createAuthoringResourceReview<Context>(options: {
  canonical: PublicationCanonicalizer;
  run<T>(
    context: Context,
    work: (ports: {
      repository: PublicationAuthorityRepository;
      source(releaseId: string): Promise<EntityAuthoringResourceSource>;
      inspect(releaseId: string): Promise<{
        authorId: string;
        reviewerId: string | null;
        sourceHash: string;
        status: string;
      } | null>;
      authorize(
        action: "propose" | "approve",
        releaseId: string,
        authorId: string,
      ): Promise<{ actorId: string; tenantId: string }>;
      qualify(source: EntityAuthoringResourceSource): Promise<void>;
      audit(
        action: "propose" | "approve",
        releaseId: string,
        sourceHash: string,
      ): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
}) {
  return {
    async execute(
      context: Context,
      command: {
        action: "propose" | "approve";
        releaseId: string;
        expectedSourceHash: string;
      },
    ): Promise<PublicationRelease> {
      if (
        !command ||
        Object.keys(command).sort().join() !==
          "action,expectedSourceHash,releaseId" ||
        !["propose", "approve"].includes(command.action) ||
        !/^[a-f0-9-]{36}$/.test(command.releaseId) ||
        !/^[a-f0-9]{64}$/.test(command.expectedSourceHash)
      )
        throw Error("RESOURCE_REVIEW_COMMAND_INVALID");
      const captured = structuredClone(command);
      return options.run(context, async (ports) => {
        const source = structuredClone(await ports.source(captured.releaseId));
        parseEntityAuthoringResource(source.kind, source.payload);
        const hash = options.canonical.sha256(
          options.canonical.canonicalBytes(source),
        );
        if (
          source.releaseId !== captured.releaseId ||
          hash !== captured.expectedSourceHash
        )
          throw Error("RESOURCE_REVIEW_SOURCE_CHANGED");
        const existing = await ports.inspect(captured.releaseId);
        const actor = await ports.authorize(
          captured.action,
          captured.releaseId,
          existing?.authorId ?? "",
        );
        await ports.qualify(source);
        if (captured.action === "approve") {
          if (
            !existing ||
            existing.authorId === actor.actorId ||
            existing.sourceHash !== hash ||
            !["preparing", "approved"].includes(existing.status) ||
            (existing.reviewerId !== null &&
              existing.reviewerId !== actor.actorId)
          )
            throw Error("RESOURCE_INDEPENDENT_REVIEW_REQUIRED");
          const payload = parseEntityAuthoringResource(
            source.kind,
            source.payload,
          );
          if (
            payload.schema === "entity.historical-identity-review/1" &&
            (payload.proposerId !== existing.authorId ||
              payload.reviewerId !== actor.actorId)
          )
            throw Error("RESOURCE_NAMED_REVIEW_REQUIRED");
          const result = await ports.repository.transitionRelease({
            releaseId: source.releaseId,
            status: "approved",
            actorId: actor.actorId,
            evidence: { sourceHash: hash },
          });
          await ports.audit("approve", source.releaseId, hash);
          return result;
        }
        const result = await ports.repository.createRelease({
          id: source.releaseId,
          tenantId: actor.tenantId,
          actorId: actor.actorId,
          publicationKey: source.publicationKey,
          releaseNo: source.releaseNo,
          releaseKind: "publish",
          compatibilityLevel: "breaking",
          releaseHash: hash,
          manifestHash: hash,
          authoringResourceSource: source,
        });
        await ports.audit("propose", source.releaseId, hash);
        return result;
      });
    },
  };
}
