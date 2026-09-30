import type { AtlasEntityContextReader } from "@athyper/server-platform-ai";
import type {
  createEntityCollaborationService,
  createEntityActivityService,
} from "@athyper/server-platform-experience";

/** Shared Entity owners enforce current capability, parent and audience policy. */
export function createAtlasEntityContextReader(
  entityCollaboration: Pick<
    ReturnType<typeof createEntityCollaborationService>,
    "read"
  >,
  entityActivity: Pick<
    ReturnType<typeof createEntityActivityService>,
    "page" | "compare"
  >,
): AtlasEntityContextReader {
  return {
    async read(input) {
      const subject = {
        context: input.context,
        entityCode: input.entityCode,
        recordId: input.recordId,
      };
      if (input.capability === "entity_read_comments") {
        const result = await entityCollaboration.read({
          ...subject,
          kind: "comments",
          limit: 20,
          ...(typeof input.arguments.cursor === "string"
            ? { cursor: input.arguments.cursor }
            : {}),
          ...(typeof input.arguments.threadRootId === "string"
            ? { threadRootId: input.arguments.threadRootId }
            : {}),
        });
        const data = result.data as {
          items?: readonly Record<string, unknown>[];
          nextCursor?: string;
        };
        // Exclude drafts, moderation reports, attachments and rich JSON. These
        // have independent audiences and are not needed to answer saved comments.
        const keys = [
          "id",
          "text",
          "authorId",
          "authorDisplayName",
          "createdAt",
          "updatedAt",
          "revision",
          "tombstone",
          "parentCommentId",
          "replyCount",
        ];
        const items = (data.items ?? []).map((row) =>
          Object.fromEntries(
            keys.flatMap((key) => {
              const value = row[key];
              return typeof value === "string" ||
                typeof value === "boolean" ||
                typeof value === "number"
                ? [[key, value]]
                : [];
            }),
          ),
        );
        return {
          items,
          hasMore: Boolean(data.nextCursor),
          ...(data.nextCursor ? { nextCursor: data.nextCursor } : {}),
          coverage: input.arguments.threadRootId
            ? "authorized_thread_replies"
            : "authorized_root_comments",
          note: "Only saved comments visible to the current user are included. Read reply threads separately; do not infer absence for an author from a partial page.",
        };
      }
      if (input.capability === "entity_read_snapshots") {
        const page = await entityActivity.page({
          ...subject,
          view: "snapshots",
          ...(typeof input.arguments.cursor === "string"
            ? { cursor: input.arguments.cursor }
            : {}),
        });
        return {
          items: page.items,
          hasMore: Boolean(page.nextCursor),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          coverage: "authorized_snapshots_in_default_date_range",
        };
      }
      if (input.capability !== "entity_compare_snapshots")
        throw new Error("ATLAS_ENTITY_CAPABILITY_UNAVAILABLE");
      const comparison = await entityActivity.compare({
        ...subject,
        from: String(input.arguments.from),
        to: String(input.arguments.to),
      });
      return {
        from: comparison.from,
        to: comparison.to,
        fields: comparison.fields,
        coverage: "currently_authorized_captured_root_fields",
        note: "Uncaptured values are unknown. Omitted fields and related collections are not evidence of no change. This is a snapshot comparison, not a comparison with the live record.",
      };
    },
  };
}
