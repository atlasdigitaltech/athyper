import type { ChannelConsentCoordinate, ChannelConsentDecision, ChannelConsentEvent, ChannelConsentRepository, ChannelConsentWrite, CommentModerationReceipt, CommentModerationRecord, CommentModerationRepository, GovernancePage, GovernanceRepository, OpenCommentModeration, TransitionCommentModeration } from "@athyper/server-contract-governance";
import { sql, type Transaction } from "kysely";

type Database = Record<string, never>;
type Executor = Transaction<Database>;
type Row = Record<string, unknown>;

export class KyselyChannelConsentRepository implements ChannelConsentRepository<Executor> {
  async upsert(input: ChannelConsentWrite, transaction: Executor): Promise<ChannelConsentDecision> {
    const result = await sql<Row>`
      INSERT INTO governance.channel_consent(
        tenant_id, subject_type, subject_id, channel_code, destination_hash,
        is_consented, effective_at, expires_at, last_event_id, source_code, evidence
      ) VALUES (
        ${input.tenantId}::uuid, ${input.subjectType}, ${input.subjectId}::uuid, ${input.channel}, ${input.destinationHash ?? null},
        ${input.consented}, ${input.effectiveAt}::timestamptz, ${input.expiresAt ?? null}::timestamptz,
        ${input.eventId}::uuid, ${input.sourceCode}, ${JSON.stringify(input.evidence)}::jsonb
      )
      ON CONFLICT (tenant_id, subject_type, subject_id, channel_code, destination_hash)
      DO UPDATE SET
        is_consented = EXCLUDED.is_consented,
        effective_at = EXCLUDED.effective_at,
        expires_at = EXCLUDED.expires_at,
        last_event_id = EXCLUDED.last_event_id,
        source_code = EXCLUDED.source_code,
        evidence = EXCLUDED.evidence,
        updated_at = now()
      WHERE governance.channel_consent.effective_at < EXCLUDED.effective_at
         OR (governance.channel_consent.effective_at = EXCLUDED.effective_at
             AND governance.channel_consent.last_event_id = EXCLUDED.last_event_id)
      RETURNING *
    `.execute(transaction);
    const row = result.rows[0] ?? (await this.lookup(input, transaction));
    if (!row) throw new Error("GOVERNANCE_CONSENT_WRITE_FAILED");
    return consentRow(row);
  }

  async findAt(input: ChannelConsentCoordinate & { readonly at: string }, transaction: Executor): Promise<ChannelConsentDecision | null> {
    const result = await sql<Row>`
      SELECT id, tenant_id, subject_type, subject_id, channel_code, destination_hash,
             action, source_code, occurred_at, evidence, actor_principal_id
        FROM event.channel_consent_event
       WHERE tenant_id=${input.tenantId}::uuid AND subject_type=${input.subjectType}
         AND subject_id=${input.subjectId}::uuid AND channel_code=${input.channel}
         AND occurred_at<=${input.at}::timestamptz
         AND (${input.destinationHash ?? null}::text IS NULL
              AND destination_hash IS NULL
              OR ${input.destinationHash ?? null}::text IS NOT NULL
              AND (destination_hash IS NULL OR destination_hash=${input.destinationHash ?? null}))
       ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 1
    `.execute(transaction);
    const row=result.rows[0]; if(!row)return null;
    const evidence=record(row["evidence"]),expiresAt=typeof evidence["expiresAt"]==="string"?new Date(evidence["expiresAt"]).toISOString():undefined;
    if(expiresAt&&expiresAt<=input.at)return null;
    return {tenantId:String(row["tenant_id"]),subjectType:String(row["subject_type"]) as ChannelConsentDecision["subjectType"],subjectId:String(row["subject_id"]),channel:String(row["channel_code"]) as ChannelConsentDecision["channel"],...(row["destination_hash"]?{destinationHash:String(row["destination_hash"])}:{}),consented:row["action"]==="granted",effectiveAt:new Date(String(row["occurred_at"])).toISOString(),...(expiresAt?{expiresAt}:{})};
  }

  async history(input: ChannelConsentCoordinate & { readonly limit?: number; readonly cursor?: string;readonly at?:string }, transaction: Executor): Promise<GovernancePage<ChannelConsentEvent>> {
    const limit=Math.min(Math.max(input.limit??50,1),100);
    const result=await sql<Row>`SELECT id,tenant_id,subject_type,subject_id,channel_code,destination_hash,action,source_code,occurred_at,evidence,actor_principal_id
      FROM event.channel_consent_event
      WHERE tenant_id=${input.tenantId}::uuid AND subject_type=${input.subjectType} AND subject_id=${input.subjectId}::uuid AND channel_code=${input.channel}
        AND (${input.at??null}::timestamptz IS NULL OR occurred_at<=${input.at??null}::timestamptz)
        AND (${input.destinationHash??null}::text IS NULL AND destination_hash IS NULL OR ${input.destinationHash??null}::text IS NOT NULL AND (destination_hash IS NULL OR destination_hash=${input.destinationHash??null}))
        AND (${input.cursor??null}::uuid IS NULL OR (occurred_at,id)<(SELECT occurred_at,id FROM event.channel_consent_event WHERE tenant_id=${input.tenantId}::uuid AND id=${input.cursor??null}::uuid))
      ORDER BY occurred_at DESC,id DESC LIMIT ${limit+1}`.execute(transaction);
    const hasMore=result.rows.length>limit,rows=result.rows.slice(0,limit);
    return {items:rows.map(consentEventRow),...(hasMore&&rows.length?{nextCursor:String(rows.at(-1)!["id"])}:{}),hasMore};
  }

  private async lookup(input: ChannelConsentCoordinate, executor: Executor): Promise<Row | undefined> {
    const result = await sql<Row>`
      SELECT * FROM governance.channel_consent
       WHERE tenant_id = ${input.tenantId}::uuid
         AND subject_type = ${input.subjectType}
         AND subject_id = ${input.subjectId}::uuid
         AND channel_code = ${input.channel}
         AND destination_hash IS NOT DISTINCT FROM ${input.destinationHash ?? null}
    `.execute(executor);
    return result.rows[0];
  }
}

export class KyselyCommentModerationRepository implements CommentModerationRepository<Executor> {
  async createOrReplayOpen(input: OpenCommentModeration, transaction: Executor): Promise<CommentModerationReceipt> {
    const inserted = await sql<Row>`
      INSERT INTO governance.comment_moderation(tenant_id, comment_flag_id, created_by, reviewer_evidence)
      VALUES (${input.tenantId}::uuid, ${input.commentFlagId}::uuid, ${input.createdBy}::uuid, ${JSON.stringify(input.reviewerEvidence)}::jsonb)
      ON CONFLICT (tenant_id, comment_flag_id) DO NOTHING
      RETURNING *
    `.execute(transaction);
    const row = inserted.rows[0] ?? (await sql<Row>`
      SELECT * FROM governance.comment_moderation
       WHERE tenant_id = ${input.tenantId}::uuid AND comment_flag_id = ${input.commentFlagId}::uuid
    `.execute(transaction)).rows[0];
    if (!row || row["status"] !== "open") throw new Error("GOVERNANCE_MODERATION_NOT_OPEN");
    return { ...moderationRow(row), replayed: inserted.rows.length === 0 };
  }

  async transition(input:TransitionCommentModeration,transaction:Executor):Promise<CommentModerationRecord|null>{
    const result=await sql<Row>`WITH changed AS (
      UPDATE governance.comment_moderation SET status=${input.to},moderator_principal_id=${input.reviewerPrincipalId}::uuid,
        decision_code=${input.decisionCode??null},reason_code=${input.reasonCode},decision_note=${input.decisionNote??null},reviewer_evidence=${JSON.stringify(input.reviewerEvidence)}::jsonb,
        updated_by=${input.reviewerPrincipalId}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.moderationId}::uuid AND status=ANY(${input.from}::text[])
        AND EXISTS (SELECT 1 FROM event.comment_flag flag WHERE flag.tenant_id=governance.comment_moderation.tenant_id AND flag.id=governance.comment_moderation.comment_flag_id AND flag.status=ANY(${input.flagFrom}::text[]) FOR UPDATE)
      RETURNING *)
      UPDATE event.comment_flag flag SET status=${input.flagStatus},
        resolved_at=CASE WHEN ${input.flagStatus} IN ('resolved','dismissed') THEN ${input.changedAt}::timestamptz ELSE NULL END,
        resolved_by=CASE WHEN ${input.flagStatus} IN ('resolved','dismissed') THEN ${input.reviewerPrincipalId}::uuid ELSE NULL END
      FROM changed WHERE flag.tenant_id=changed.tenant_id AND flag.id=changed.comment_flag_id
      RETURNING changed.*`.execute(transaction);
    return result.rows[0]?moderationRow(result.rows[0]):null;
  }

  async findById(tenantId:string,moderationId:string,transaction:Executor):Promise<CommentModerationRecord|null>{const row=(await sql<Row>`SELECT * FROM governance.comment_moderation WHERE tenant_id=${tenantId}::uuid AND id=${moderationId}::uuid`.execute(transaction)).rows[0];return row?moderationRow(row):null;}
}

export function createKyselyGovernanceRepository(): GovernanceRepository<Executor> {
  return { consent: new KyselyChannelConsentRepository(), moderation: new KyselyCommentModerationRepository() };
}

function consentRow(row: Row): ChannelConsentDecision {
  return {
    tenantId: String(row["tenant_id"]), subjectType: String(row["subject_type"]) as ChannelConsentDecision["subjectType"],
    subjectId: String(row["subject_id"]), channel: String(row["channel_code"]) as ChannelConsentDecision["channel"],
    ...(row["destination_hash"] ? { destinationHash: String(row["destination_hash"]) } : {}),
    consented: Boolean(row["is_consented"]), effectiveAt: new Date(String(row["effective_at"])).toISOString(),
    ...(row["expires_at"] ? { expiresAt: new Date(String(row["expires_at"])).toISOString() } : {}),
  };
}
function consentEventRow(row:Row):ChannelConsentEvent{return{id:String(row["id"]),tenantId:String(row["tenant_id"]),subjectType:String(row["subject_type"]) as ChannelConsentEvent["subjectType"],subjectId:String(row["subject_id"]),channel:String(row["channel_code"]) as ChannelConsentEvent["channel"],...(row["destination_hash"]?{destinationHash:String(row["destination_hash"])}:{}),action:String(row["action"]) as ChannelConsentEvent["action"],sourceCode:String(row["source_code"]),occurredAt:new Date(String(row["occurred_at"])).toISOString(),evidence:record(row["evidence"]),...(row["actor_principal_id"]?{actorPrincipalId:String(row["actor_principal_id"])}:{})};}
function moderationRow(row:Row):CommentModerationRecord{return{id:String(row["id"]),tenantId:String(row["tenant_id"]),commentFlagId:String(row["comment_flag_id"]),status:String(row["status"]) as CommentModerationRecord["status"],...(row["moderator_principal_id"]?{moderatorPrincipalId:String(row["moderator_principal_id"])}:{}),...(row["decision_code"]?{decisionCode:String(row["decision_code"])}:{}),...(row["reason_code"]?{reasonCode:String(row["reason_code"])}:{}),...(row["decision_note"]?{decisionNote:String(row["decision_note"])}:{}),reviewerEvidence:record(row["reviewer_evidence"])};}
function record(value:unknown):Readonly<Record<string,unknown>>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:{ };}
