import { createHash } from "node:crypto";
import type {
  AtlasContentBlock,
  AtlasMessageLineage,
  AtlasReplayInput,
  AtlasReadReplayEvidence,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext, hasPermission } from "./context.js";
import type { AtlasAttachmentContextResolver } from "./attachment-context.js";
import type { AtlasBusinessContextResolver } from "./business-context.js";

/** Canonical digest of authorized content; hashes never substitute for a fresh owner read. */
export function atlasEvidenceHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function createAtlasMessageLineage(
  context: VerifiedRequestContext,
  content: readonly AtlasContentBlock[],
  parentMessageId: string | null,
  input: AtlasReplayInput,
  reads: readonly AtlasReadReplayEvidence[] = [],
  complete = true,
): AtlasMessageLineage {
  assertAtlasContext(context);
  return {
    type: "atlas_message_lineage",
    schemaVersion: 1,
    tenantId: context.tenantId,
    principalId: context.principalId,
    planeKey: context.planeKey,
    profileHash: context.profileHash,
    authEpoch: context.authEpoch,
    contentHash: atlasEvidenceHash(content),
    parentMessageId,
    input,
    reads,
    complete,
  };
}
export interface AtlasLineageMessage {
  readonly messageId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly content: readonly AtlasContentBlock[];
  readonly lineage: AtlasMessageLineage | null;
}
export interface AtlasMessageLineageReader {
  /** Must enforce tenant/plane and current conversation membership in the database. */
  read(
    context: VerifiedRequestContext,
    messageId: string,
  ): Promise<AtlasLineageMessage | null>;
}
export class AtlasDurableMessageAuthorizer {
  constructor(
    private readonly options: {
      readonly reader: AtlasMessageLineageReader;
      readonly reads?: {
        revalidate(
          context: VerifiedRequestContext,
          evidence: AtlasReadReplayEvidence,
        ): Promise<boolean>;
      };
      readonly attachments?: AtlasAttachmentContextResolver;
      readonly businessContexts?: AtlasBusinessContextResolver;
      readonly maxDependencies?: number;
    },
  ) {}
  async authorize({
    context,
    messageId,
  }: {
    readonly context: VerifiedRequestContext;
    readonly messageId: string;
  }): Promise<boolean> {
    try {
      assertAtlasContext(context);
      if (!hasPermission(context, `${context.planeKey}.ai.agent.use`))
        return false;
      let id: string | null = messageId,
        threadId: string | undefined,
        previousSequence = Infinity;
      const seen = new Set<string>();
      // No cross-request authorization cache. A complete ancestor chain covers even
      // user follow-ups quoting old content which was evicted from the model budget.
      while (id !== null) {
        if (seen.has(id) || seen.size >= (this.options.maxDependencies ?? 200))
          return false;
        seen.add(id);
        const message = await this.options.reader.read(context, id);
        const l = message?.lineage;
        if (
          !message ||
          message.messageId !== id ||
          !l ||
          l.type !== "atlas_message_lineage" ||
          l.schemaVersion !== 1 ||
          l.complete !== true ||
          l.input?.schemaVersion !== 1 ||
          !Array.isArray(l.reads)
        )
          return false;
        if (
          l.tenantId !== context.tenantId ||
          l.principalId !== context.principalId ||
          l.planeKey !== context.planeKey ||
          l.profileHash !== context.profileHash ||
          l.authEpoch !== context.authEpoch ||
          l.contentHash !== atlasEvidenceHash(message.content)
        )
          return false;
        if (
          (threadId !== undefined && message.threadId !== threadId) ||
          !Number.isSafeInteger(message.sequence) ||
          message.sequence < 1 ||
          (previousSequence !== Infinity &&
            message.sequence !== previousSequence - 1)
        )
          return false;
        threadId = message.threadId;
        previousSequence = message.sequence;
        if (l.input.businessContext) {
          if (!this.options.businessContexts) return false;
          if (
            atlasEvidenceHash(
              await this.options.businessContexts.resolve(
                context,
                l.input.businessContext,
              ),
            ) !== l.input.businessContextHash
          )
            return false;
        }
        if (l.input.attachments) {
          if (!this.options.attachments) return false;
          const { resultHash, ...request } = l.input.attachments;
          if (
            atlasEvidenceHash(
              await this.options.attachments.resolve({ context, ...request, businessContext:l.input.businessContext }),
            ) !== resultHash
          )
            return false;
        }
        if (l.reads.length > 20) return false;
        for (const read of l.reads)
          if (
            !this.options.reads ||
            !(await this.options.reads.revalidate(context, read))
          )
            return false;
        if (l.parentMessageId !== null && typeof l.parentMessageId !== "string")
          return false;
        // The first message alone may have no predecessor. Missing ancestry denies.
        if (l.parentMessageId === null && message.sequence !== 1) return false;
        id = l.parentMessageId;
      }
      return true;
    } catch {
      return false;
    }
  }
}

/** Only call after whole-message authorization. Historical tool data is context,
 * not a new executable call. Replay only authorized prose; raw tool results
 * must not be serialized into assistant speech. Current facts require read tools. */
export function compactAtlasReplayContent(content: readonly AtlasContentBlock[]): readonly AtlasContentBlock[] {
  const text = content.map(block => block.type === "text" ? block.text : "").join("");
  return text ? [{ type: "text", text }] : [];
}

/** Fresh owner checks may observe identical facts at a later instant. Only these
 * registered insight tools exclude observation timestamps from replay equality;
 * scope, definitions, states, evidence revisions and all disclosed facts remain bound. */
export function atlasReadEvidenceHash(toolCode: string, value: {data?: unknown; sources: unknown}): string {
  if (!["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility", "bp_read_list_insights"].includes(toolCode)) return atlasEvidenceHash(value);
  const copy = structuredClone(value) as {data?: {insight?: {evaluatedAt?: string; evidence?: {observedAt?: string}[]}}; sources: unknown};
  if (copy.data?.insight) {
    delete copy.data.insight.evaluatedAt;
    for (const evidence of copy.data.insight.evidence ?? []) delete evidence.observedAt;
  }
  return atlasEvidenceHash(copy);
}
