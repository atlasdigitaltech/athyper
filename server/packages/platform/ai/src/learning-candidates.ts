import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { parseAtlasLearningProposal, type AtlasLearningHandoff, type AtlasLearningInboxPort, type MetadataReader } from "@athyper/server-contract-metadata";
import { assertAtlasContext, hasPermission } from "./context.js";
import { AtlasServiceError } from "./errors.js";

/** Origin-only proposal capture and retryable, idempotent minimized handoff. */
export class AtlasLearningCandidateService {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>, private readonly metadata: MetadataReader,
    private readonly disclosure: {canDiscloseMessage(context: VerifiedRequestContext, id: string): Promise<boolean>}, private readonly inbox: AtlasLearningInboxPort) {}
  async submit(context: VerifiedRequestContext, value: unknown) {
    assertAtlasContext(context);
    let input;
    try { input = parseAtlasLearningProposal(value); } catch { throw new AtlasServiceError("INVALID_ARGUMENT", "Use a short term and a registered capability."); }
    if (input.capabilityId !== "entity_read_record") throw new AtlasServiceError("INVALID_ARGUMENT", "This workflow currently teaches record summary terms.");
    if (!hasPermission(context, `${context.planeKey}.ai.agent.use`)) throw unavailable();
    const proposal = await this.transactions.run(context.planeKey, {tenantId: context.tenantId, principalId: context.principalId}, async tx => {
      await sql`SELECT set_config('app.current_atlas_plane',${context.planeKey},true)`.execute(tx);
      const source = (await sql<{message_id: string; entity_code: string; descriptor_hash: string; contract_hash: string; expires_at: Date | string}>`SELECT m.id AS message_id,
        m.citation_refs->0->'input'->'businessContext'->>'entityCode' AS entity_code,
        m.citation_refs->0->'input'->>'entityDescriptorHash' AS descriptor_hash,
        m.citation_refs->0->'input'->>'entityContractHash' AS contract_hash,
        LEAST(COALESCE(t.expires_at,now()+interval '30 days'),now()+interval '30 days') AS expires_at
        FROM ai.ai_feedback_log f JOIN ai.atlas_run r ON r.id=f.target_id AND r.tenant_id=f.tenant_id
        JOIN ai.atlas_message m ON m.id=r.output_message_id AND m.id=f.atlas_response_message_id AND m.run_id=r.id AND m.tenant_id=r.tenant_id AND m.plane=r.plane
        JOIN ai.atlas_thread t ON t.tenant_id=r.tenant_id AND t.conversation_id=r.conversation_id AND t.plane=r.plane
        JOIN document.conversation c ON c.tenant_id=t.tenant_id AND c.id=t.conversation_id
        WHERE f.id=${input.feedbackId}::uuid AND f.tenant_id=${context.tenantId}::uuid AND f.submitted_by=${context.principalId}::uuid
        AND r.principal_id=f.submitted_by AND r.plane=${context.planeKey} AND f.atlas_response_plane=r.plane
        AND f.feedback_type='atlas_agent' AND f.reason_code IN ('vocabulary','intent') AND f.verdict IN ('wrong','partial','missing')
        AND r.status='completed' AND m.status='completed' AND c.deleted_at IS NULL AND c.status<>'deleted'
        AND (t.expires_at IS NULL OR t.expires_at>now()) FOR KEY SHARE OF r,m,t,c`.execute(tx)).rows[0];
      if (!source || !await this.disclosure.canDiscloseMessage(context, source.message_id)) throw unavailable();
      if (!/^[0-9a-f]{64}$/.test(source.descriptor_hash ?? "") || !/^[0-9a-f]{64}$/.test(source.contract_hash ?? "")) throw new AtlasServiceError("INVALID_ARGUMENT", "Ask again on the current record before proposing a term.");
      const descriptor = await this.metadata.getEntityDescriptor(context, source.entity_code);
      if (!descriptor?.ai?.enabled || descriptor.entityCode !== source.entity_code || descriptor.planeKey !== context.planeKey || descriptor.compiledHash !== source.descriptor_hash || descriptor.contractHash !== source.contract_hash || !descriptor.ai.insightProviders.some(ref => ref.id === input.capabilityId && ref.version === 1)) throw new AtlasServiceError("INVALID_ARGUMENT", "The source definition changed or the capability is unavailable.");
      const payload = {...input, tenantId: context.tenantId, originPlane: context.planeKey, submittedBy: context.principalId, entityCode: source.entity_code, sourceDescriptorHash: source.descriptor_hash, sourceContractHash: source.contract_hash, sourceReleaseId: descriptor.releaseId};
      const proposalHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const expiresAt = new Date(source.expires_at).toISOString();
      await sql`INSERT INTO ai.atlas_learning_candidate(id,tenant_id,feedback_id,origin_plane,submitted_by,proposal,proposal_hash,expires_at)
        VALUES(${input.candidateId}::uuid,${context.tenantId}::uuid,${input.feedbackId}::uuid,${context.planeKey},${context.principalId}::uuid,${JSON.stringify(payload)}::jsonb,${proposalHash},${expiresAt}::timestamptz) ON CONFLICT(id) DO NOTHING`.execute(tx);
      const row = (await sql<{proposal: typeof payload; proposal_hash: string; expires_at: Date | string}>`SELECT proposal,proposal_hash,expires_at FROM ai.atlas_learning_candidate WHERE id=${input.candidateId}::uuid AND tenant_id=${context.tenantId}::uuid AND submitted_by=${context.principalId}::uuid AND expires_at>now()`.execute(tx)).rows[0];
      if (!row || row.proposal_hash !== proposalHash) throw new AtlasServiceError("IDEMPOTENCY_CONFLICT", "The correction already has different content.");
      return {...row.proposal, proposalHash: row.proposal_hash, expiresAt: new Date(row.expires_at).toISOString()} satisfies AtlasLearningHandoff;
    });
    // No distributed transaction: durable source first, idempotent receive second.
    // A failed delivery is retried with the same candidate ID and exact payload.
    await this.inbox.receive(proposal);
    await this.transactions.run(context.planeKey, {tenantId: context.tenantId, principalId: context.principalId}, async tx => {
      await sql`UPDATE ai.atlas_learning_candidate SET handed_off_at=COALESCE(handed_off_at,now()) WHERE tenant_id=${context.tenantId}::uuid AND id=${input.candidateId}::uuid AND proposal_hash=${proposal.proposalHash}`.execute(tx);
    });
    return {candidateId: input.candidateId, accepted: true as const, state: "pending_review" as const};
  }
}
function unavailable() { return new AtlasServiceError("PERMISSION_DENIED", "The source correction is unavailable."); }

/** Registered origin attestation. Studio receives only a boolean, never source content. */
export async function isAtlasLearningSourceCurrent(transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>, proposal: AtlasLearningHandoff): Promise<boolean> {
  return transactions.run(proposal.originPlane, {tenantId: proposal.tenantId, principalId: proposal.submittedBy}, async tx => {
    await sql`SELECT set_config('app.current_atlas_plane',${proposal.originPlane},true)`.execute(tx);
    const row = (await sql`SELECT p.id FROM ai.atlas_learning_candidate p
      JOIN ai.ai_feedback_log f ON f.id=p.feedback_id AND f.tenant_id=p.tenant_id AND f.submitted_by=p.submitted_by
      JOIN ai.atlas_run r ON r.id=f.target_id AND r.tenant_id=f.tenant_id AND r.principal_id=f.submitted_by AND r.plane=p.origin_plane
      JOIN ai.atlas_thread t ON t.tenant_id=r.tenant_id AND t.conversation_id=r.conversation_id AND t.plane=r.plane
      JOIN document.conversation c ON c.tenant_id=t.tenant_id AND c.id=t.conversation_id
      WHERE p.id=${proposal.candidateId}::uuid AND p.tenant_id=${proposal.tenantId}::uuid AND p.proposal_hash=${proposal.proposalHash}
      AND p.origin_plane=${proposal.originPlane} AND p.submitted_by=${proposal.submittedBy}::uuid AND p.expires_at>now()
      AND c.deleted_at IS NULL AND c.status<>'deleted' AND (t.expires_at IS NULL OR t.expires_at>now())`.execute(tx)).rows[0];
    return Boolean(row);
  });
}
