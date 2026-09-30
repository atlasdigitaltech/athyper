import type {
  AtlasContentBlock,
  AtlasMessageLineage,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { assertAtlasContext } from "./context.js";
import type { AtlasMessageLineageReader } from "./message-lineage.js";

export class KyselyAtlasMessageLineageReader implements AtlasMessageLineageReader {
  constructor(
    private readonly transactions: PlaneTransactionCoordinator<
      Transaction<Record<string, never>>
    >,
  ) {}
  async read(context: VerifiedRequestContext, messageId: string) {
    assertAtlasContext(context);
    return this.transactions.run(context.planeKey, context, async (tx) => {
      await sql`SELECT set_config('app.current_atlas_plane',${context.planeKey},true)`.execute(
        tx,
      );
      const row = (
        await sql<{
          id: string;
          conversation_id: string;
          sequence: string;
          content_blocks: readonly AtlasContentBlock[];
          citation_refs: readonly AtlasMessageLineage[];
        }>`
        SELECT id,conversation_id,sequence,content_blocks,citation_refs FROM ai.atlas_message
        WHERE tenant_id=${context.tenantId}::uuid AND plane=${context.planeKey} AND id=${messageId}::uuid
          AND status='completed' AND protected_content_ref IS NULL
          AND ai.fn_atlas_conversation_access(tenant_id,conversation_id,false)
      `.execute(tx)
      ).rows[0];
      if (!row) return null;
      const candidates = row.citation_refs.filter(
        (value) => value?.type === "atlas_message_lineage",
      );
      return {
        messageId: row.id,
        threadId: row.conversation_id,
        sequence: Number(row.sequence),
        content: row.content_blocks,
        lineage: candidates.length === 1 ? candidates[0]! : null,
      };
    });
  }
}
