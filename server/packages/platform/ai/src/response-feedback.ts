import { parseAtlasResponseFeedback, parseAtlasIntent, type AtlasResponseFeedbackV1 } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { assertAtlasContext, hasPermission } from "./context.js";
import { AtlasServiceError } from "./errors.js";
export interface AtlasResponseFeedbackStore {
  append(context: VerifiedRequestContext, feedback: AtlasResponseFeedbackV1): Promise<void>;
}
export class AtlasResponseFeedbackService {
  constructor(private readonly store: AtlasResponseFeedbackStore, private readonly disclosure: {canDiscloseMessage(context: VerifiedRequestContext, messageId: string): Promise<boolean>}) {}
  async submit(context: VerifiedRequestContext, value: unknown): Promise<{feedbackId: string; accepted: true}> {
    assertAtlasContext(context);
    let feedback: AtlasResponseFeedbackV1;
    try { feedback = parseAtlasResponseFeedback(value); } catch { throw new AtlasServiceError("INVALID_ARGUMENT", "Invalid response feedback."); }
    if (!hasPermission(context, `${context.planeKey}.ai.agent.use`) || !await this.disclosure.canDiscloseMessage(context, feedback.messageId)) throw new AtlasServiceError("PERMISSION_DENIED", "Response feedback is unavailable.");
    await this.store.append(context, feedback);
    return {feedbackId: feedback.feedbackId, accepted: true};
  }
}

/** Same-plane, exact response coordinates; no transcript or proposed wording is copied. */
export class KyselyAtlasResponseFeedbackStore implements AtlasResponseFeedbackStore {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>) {}
  async append(context: VerifiedRequestContext, feedback: AtlasResponseFeedbackV1): Promise<void> {
    assertAtlasContext(context);
    await this.transactions.run(context.planeKey, {tenantId: context.tenantId, principalId: context.principalId}, async tx => {
      await sql`SELECT set_config('app.current_atlas_plane',${context.planeKey},true)`.execute(tx);
      const source = (await sql<{intent: unknown; policy_revision: string | null; binding_revision: string | null}>`SELECT m.citation_refs->0->'input'->'intent' AS intent, r.generation_config->>'policyRevision' AS policy_revision, r.generation_config->>'bindingRevision' AS binding_revision FROM ai.atlas_run r
        JOIN ai.atlas_message m ON m.tenant_id=r.tenant_id AND m.id=r.output_message_id AND m.run_id=r.id AND m.plane=r.plane
        JOIN ai.atlas_thread t ON t.tenant_id=r.tenant_id AND t.conversation_id=r.conversation_id AND t.plane=r.plane
        JOIN document.conversation c ON c.tenant_id=t.tenant_id AND c.id=t.conversation_id
        WHERE r.tenant_id=${context.tenantId}::uuid AND r.plane=${context.planeKey} AND r.principal_id=${context.principalId}::uuid
          AND r.id=${feedback.runId}::uuid AND m.id=${feedback.messageId}::uuid AND r.status='completed' AND m.status='completed'
          AND c.deleted_at IS NULL AND c.status <> 'deleted' AND (t.expires_at IS NULL OR t.expires_at>now() OR t.legal_hold)
        FOR KEY SHARE OF r,m,t,c`.execute(tx)).rows[0];
      if (!source) throw new AtlasServiceError("PERMISSION_DENIED", "Response feedback is unavailable.");
      // This is user-reported evidence only. It never changes active vocabulary or verifies an outcome.
      const evidence = {schema: "atlas-feedback-evidence/1", ...(source.intent ? {intent: parseAtlasIntent(source.intent)} : {}), policyRevision: source.policy_revision, bindingRevision: source.binding_revision};
      const detail = {schema: "atlas-response-feedback/1", runId: feedback.runId, messageId: feedback.messageId, plane: context.planeKey, category: feedback.category};
      await sql`INSERT INTO ai.ai_feedback_log (id,tenant_id,feedback_type,target_id,atlas_response_message_id,atlas_response_plane,verdict,reason_code,detail,evidence_snapshot,submitted_by,created_by)
        VALUES (${feedback.feedbackId}::uuid,${context.tenantId}::uuid,'atlas_agent',${feedback.runId}::uuid,${feedback.messageId}::uuid,${context.planeKey},${feedback.verdict},${feedback.category},${JSON.stringify(detail)}::jsonb,${JSON.stringify(evidence)}::jsonb,${context.principalId}::uuid,${context.principalId}::uuid)
        ON CONFLICT (id) DO NOTHING`.execute(tx);
      const receipt = (await sql<{matches: boolean}>`SELECT (target_id=${feedback.runId}::uuid AND atlas_response_message_id=${feedback.messageId}::uuid AND atlas_response_plane=${context.planeKey} AND feedback_type='atlas_agent' AND verdict=${feedback.verdict} AND reason_code=${feedback.category} AND detail=${JSON.stringify(detail)}::jsonb) AS matches
        FROM ai.ai_feedback_log WHERE id=${feedback.feedbackId}::uuid AND tenant_id=${context.tenantId}::uuid AND submitted_by=${context.principalId}::uuid`.execute(tx)).rows[0];
      if (!receipt?.matches) throw new AtlasServiceError("IDEMPOTENCY_CONFLICT", "Feedback receipt conflicts with an earlier submission.");
    });
  }
}
