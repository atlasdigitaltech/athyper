import { createHash } from "node:crypto";
import type {
  AtlasRunRepository,
  AtlasRun,
  AtlasBeginRunInput,
  AtlasUsageLedger,
  AtlasUsageLedgerEntry,
  AtlasContentBlock,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";
type Tx = Transaction<Record<string, never>>;
type Row = Record<string, any>;
export class KyselyAtlasRunRepository
  implements AtlasRunRepository, AtlasUsageLedger
{
  constructor(private readonly transactions: PlaneTransactionCoordinator<Tx>) {}
  private tx<T>(
    context: VerifiedRequestContext,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    assertAtlasContext(context);
    return this.transactions.run(context.planeKey, context, async (tx) => {
      await sql`SELECT set_config('app.current_atlas_plane',${context.planeKey},true)`.execute(
        tx,
      );
      return work(tx);
    });
  }
  async begin(input: AtlasBeginRunInput) {
    return this.tx(input.context, async (tx) => {
      const c = input.context;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            input.threadId,
            c.planeKey,
            c.principalId,
            input.userContent,
            input.publicModelId,
            input.bindingId,
            input.bindingRevision,
            input.policyRevision,
            input.promptRevision,
            input.requestFingerprint ?? null,
          ]),
        )
        .digest("hex");
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${c.tenantId + ":atlas:" + input.clientRequestId},0))`.execute(
        tx,
      );
      const thread = (
        await sql<Row>`SELECT t.*,v.status FROM ai.atlas_thread t JOIN document.conversation v ON v.tenant_id=t.tenant_id AND v.id=t.conversation_id WHERE t.tenant_id=${c.tenantId}::uuid AND t.conversation_id=${input.threadId}::uuid AND t.plane=${c.planeKey} AND t.owner_principal_id=${c.principalId}::uuid AND ai.fn_atlas_conversation_access(t.tenant_id,t.conversation_id,true) FOR UPDATE OF t`.execute(
          tx,
        )
      ).rows[0];
      if (!thread)
        throw new AtlasServiceError(
          "PERMISSION_DENIED",
          "Only an authorized thread owner can start generation.",
        );
      let existing = (
        await sql<Row>`SELECT * FROM ai.atlas_run WHERE tenant_id=${c.tenantId}::uuid AND client_request_id=${input.clientRequestId}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (existing) {
        if (
          existing.request_digest !== fingerprint ||
          existing.principal_id !== c.principalId ||
          existing.conversation_id !== input.threadId ||
          existing.plane !== c.planeKey
        )
          throw new AtlasServiceError(
            "IDEMPOTENCY_CONFLICT",
            "The request key belongs to a different request.",
          );
        if (
          existing.status === "started" &&
          new Date(existing.lease_expires_at).getTime() <= Date.now()
        )
          existing = await this.finish(
            tx,
            c,
            existing,
            "failed",
            [],
            "stream_incomplete",
          );
        if (existing.status === "started")
          throw new AtlasServiceError(
            "IDEMPOTENCY_CONFLICT",
            "This request is already running. Retry the same key after it terminates.",
          );
        const output = (
          await sql<Row>`SELECT content_blocks FROM ai.atlas_message WHERE tenant_id=${c.tenantId}::uuid AND id=${existing.output_message_id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        return {
          replayed: true,
          run: map(existing),
          replayedOutput: output?.content_blocks ?? [],
        };
      }
      if (thread.status !== "active")
        throw new AtlasServiceError(
          "THREAD_NOT_ACTIVE",
          "Thread is not active.",
        );
      const active = (
        await sql<Row>`SELECT * FROM ai.atlas_run WHERE tenant_id=${c.tenantId}::uuid AND conversation_id=${input.threadId}::uuid AND status='started' FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (active) {
        if (new Date(active.lease_expires_at).getTime() > Date.now())
          throw new AtlasServiceError(
            "IDEMPOTENCY_CONFLICT",
            "Another generation is active in this thread.",
          );
        await this.finish(tx, c, active, "failed", [], "stream_incomplete");
      }
      if (
        input.expectedLastMessageSequence !== undefined &&
        Number(thread.last_message_sequence) !==
          input.expectedLastMessageSequence
      )
        throw new AtlasServiceError(
          "VERSION_CONFLICT",
          "Thread history changed; retry before generation.",
        );
      const configuration = {
        publicModelId: input.publicModelId,
        bindingId: input.bindingId,
        bindingRevision: input.bindingRevision,
        policyRevision: input.policyRevision,
        promptRevision: input.promptRevision,
      };
      const row = (
        await sql<Row>`INSERT INTO ai.atlas_run(id,tenant_id,conversation_id,plane,principal_id,client_request_id,input_message_id,output_message_id,generation_config,request_digest,created_by)
      VALUES(${input.runId}::uuid,${c.tenantId}::uuid,${input.threadId}::uuid,${c.planeKey},${c.principalId}::uuid,${input.clientRequestId}::uuid,${input.inputMessageId}::uuid,${input.outputMessageId}::uuid,${JSON.stringify(configuration)}::jsonb,${fingerprint},${c.principalId}::uuid) RETURNING *`.execute(
          tx,
        )
      ).rows[0]!;
      await sql`INSERT INTO ai.atlas_message(id,tenant_id,conversation_id,plane,role,status,content_blocks,run_id,terminal_at,created_by) VALUES(${input.inputMessageId}::uuid,${c.tenantId}::uuid,${input.threadId}::uuid,${c.planeKey},'user','completed',${JSON.stringify(input.userContent)}::jsonb,${input.runId}::uuid,clock_timestamp(),${c.principalId}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO ai.atlas_message(id,tenant_id,conversation_id,plane,role,status,run_id,parent_message_id,created_by) VALUES(${input.outputMessageId}::uuid,${c.tenantId}::uuid,${input.threadId}::uuid,${c.planeKey},'assistant','pending',${input.runId}::uuid,${input.inputMessageId}::uuid,${c.principalId}::uuid)`.execute(
        tx,
      );
      return { replayed: false, run: map(row) };
    });
  }
  get(input: Parameters<AtlasRunRepository["get"]>[0]) {
    return this.tx(input.context, async (tx) => {
      const r = await this.read(tx, input.context, input.runId);
      return r ? map(r) : null;
    });
  }
  complete(input: Parameters<AtlasRunRepository["complete"]>[0]) {
    return this.terminal(
      input.context,
      input.runId,
      "completed",
      input.assistantContent,
      null,
    );
  }
  cancel(input: Parameters<AtlasRunRepository["cancel"]>[0]) {
    return this.terminal(
      input.context,
      input.runId,
      "cancelled",
      [],
      "cancelled",
    );
  }
  fail(input: Parameters<AtlasRunRepository["fail"]>[0]) {
    return this.terminal(
      input.context,
      input.runId,
      "failed",
      [],
      input.errorClass,
    );
  }
  private terminal(
    c: VerifiedRequestContext,
    id: string,
    status: string,
    content: readonly AtlasContentBlock[],
    error: string | null,
  ) {
    return this.tx(c, async (tx) => {
      const r = await this.read(tx, c, id, true);
      if (!r) return null;
      if (r.status !== "started") return map(r);
      return map(await this.finish(tx, c, r, status, content, error));
    });
  }
  private async read(
    tx: Tx,
    c: VerifiedRequestContext,
    id: string,
    lock = false,
  ) {
    return (
      await sql<Row>`SELECT * FROM ai.atlas_run WHERE id=${id}::uuid AND tenant_id=${c.tenantId}::uuid AND plane=${c.planeKey} AND principal_id=${c.principalId}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(
        tx,
      )
    ).rows[0];
  }
  async append(entry: AtlasUsageLedgerEntry, context?: VerifiedRequestContext) {
    if (
      !context ||
      entry.tenantId !== context.tenantId ||
      entry.planeKey !== context.planeKey
    )
      throw new AtlasServiceError("INVALID_CONTEXT", "Usage actor required.");
    await this.tx(context, async (tx) => {
      const run = await this.read(tx, context, entry.runId, true);
      if (!run || run.status !== "started")
        throw new AtlasServiceError(
          "VERSION_CONFLICT",
          "Usage requires an active owned run.",
        );
      await sql`INSERT INTO ai.atlas_provider_usage(provider_call_id,tenant_id,run_id,provider_id,entry) VALUES(${entry.providerCallId}::uuid,${context.tenantId}::uuid,${entry.runId}::uuid,${entry.providerId},${JSON.stringify(entry)}::jsonb) ON CONFLICT(provider_call_id) DO NOTHING`.execute(
        tx,
      );
      const matches=(await sql<{matches:boolean}>`SELECT entry=${JSON.stringify(entry)}::jsonb AS matches FROM ai.atlas_provider_usage WHERE provider_call_id=${entry.providerCallId}::uuid AND tenant_id=${context.tenantId}::uuid AND run_id=${entry.runId}::uuid`.execute(tx)).rows[0];
      if(!matches?.matches)throw new AtlasServiceError('IDEMPOTENCY_CONFLICT','Provider call receipt differs from the recorded attempt.');
    });
  }
  private async finish(
    tx: Tx,
    c: VerifiedRequestContext,
    r: Row,
    status: string,
    content: readonly AtlasContentBlock[],
    error: string | null,
  ): Promise<Row> {
    const calls = (
      await sql<{
        entry: AtlasUsageLedgerEntry;
      }>`SELECT entry FROM ai.atlas_provider_usage WHERE tenant_id=${c.tenantId}::uuid AND run_id=${r.id}::uuid ORDER BY created_at,provider_call_id`.execute(
        tx,
      )
    ).rows.map((v) => v.entry);
    const last = calls.at(-1);
    const tokens = (key: keyof AtlasUsageLedgerEntry["usage"]) =>
      calls.reduce((n, v) => n + (v.usage[key] ?? 0), 0);
    const available = calls.some(
      (v) =>
        v.usage.inputTokens !== undefined || v.usage.outputTokens !== undefined,
    );
    if (status === "completed" && !available)
      throw new AtlasServiceError(
        "PROVIDER_PROTOCOL_ERROR",
        "Completion requires recorded provider usage.",
      );
    const cost =
      calls.length && calls.every((v) => v.totalCostUsd !== null)
        ? calls.reduce((n, v) => n + v.totalCostUsd!, 0)
        : null;
    const at = (
      await sql<{ at: Date }>`SELECT clock_timestamp() AS at`.execute(tx)
    ).rows[0]!.at;
    const cfg = r.generation_config;
    await sql`INSERT INTO ai.ai_agent_run(id,tenant_id,principal_id,thread_id,client_request_id,response_message_id,plane,policy_revision,requested_model_id,resolved_binding_id,resolved_provider_id,actual_model_id,adapter_version,provider_region,provider_account_class,prompt_version,outcome,finish_reason,error_category,usage_source,input_tokens,cache_read_tokens,output_tokens,model_call_count,cost_amount,cost_basis,price_version,duration_ms,started_at,completed_at,created_by)
      VALUES(${r.id}::uuid,${c.tenantId}::uuid,${c.principalId}::uuid,${r.conversation_id}::uuid,${r.client_request_id}::uuid,${r.output_message_id}::uuid,${c.planeKey},${cfg.policyRevision ?? null},${cfg.publicModelId ?? "unknown"},${cfg.bindingId ?? null},${last?.providerId ?? null},${last?.actualModelId ?? null},${last?.adapterVersion ?? null},${last?.providerRegion ?? null},${last?.providerId === "ollama" ? "local" : null},${cfg.promptRevision ?? null},${status},${status === "completed" ? (last?.finishReason ?? "stop") : status === "cancelled" ? "cancelled" : "error"},${error},${available ? (status === "completed" ? "provider_final" : "provider_stream") : "unavailable"},${available ? tokens("inputTokens") : null},${available ? tokens("cacheReadTokens") : null},${available ? tokens("outputTokens") : null},${calls.length},${cost},${cost === null ? null : "catalog_estimate"},${cost === null ? null : (last?.priceVersion ?? null)},${Math.max(0, at.getTime() - new Date(r.started_at).getTime())},${r.started_at}::timestamptz,${at}::timestamptz,${c.principalId}::uuid)`.execute(
      tx,
    );
    for (const [i, call] of calls.entries()) {
      const u = call.usage;
      const known = u.inputTokens !== undefined || u.outputTokens !== undefined;
      const outcome = call.errorClass
        ? "failed"
        : call.finishReason === "cancelled"
          ? "cancelled"
          : call.finishReason === "incomplete" || call.finishReason === "error"
            ? "incomplete"
            : "completed";
      await sql`INSERT INTO ai.ai_agent_call(id,tenant_id,run_id,sequence_no,call_kind,binding_id,provider_id,requested_model_id,actual_model_id,adapter_version,prompt_version,provider_region,provider_account_class,outcome,finish_reason,error_category,usage_source,input_tokens,cache_read_tokens,output_tokens,cost_amount,cost_basis,price_version,duration_ms,started_at,completed_at,created_by)
      VALUES(${call.providerCallId}::uuid,${c.tenantId}::uuid,${r.id}::uuid,${i},'model',${call.bindingId},${call.providerId},${call.publicModelId},${call.actualModelId},${call.adapterVersion},${call.promptRevision},${call.providerRegion},${call.providerId === "ollama" ? "local" : null},${outcome},${call.finishReason},${call.errorClass},${known ? (outcome === "completed" ? "provider_final" : "provider_stream") : "unavailable"},${u.inputTokens ?? null},${u.cacheReadTokens ?? null},${u.outputTokens ?? null},${call.totalCostUsd},${call.totalCostUsd === null ? null : "catalog_estimate"},${call.totalCostUsd === null ? null : call.priceVersion},${Math.round(call.durationMs)},${new Date(at.getTime() - call.durationMs)}::timestamptz,${at}::timestamptz,${c.principalId}::uuid)`.execute(
        tx,
      );
    }
    await sql`UPDATE ai.atlas_message SET status=${status},content_blocks=${JSON.stringify(content)}::jsonb,terminal_error_class=${error},terminal_at=${at}::timestamptz,updated_by=${c.principalId}::uuid WHERE tenant_id=${c.tenantId}::uuid AND id=${r.output_message_id}::uuid AND status='pending'`.execute(
      tx,
    );
    return (
      await sql<Row>`UPDATE ai.atlas_run SET status=${status},finish_reason=${status==='completed'?last?.finishReason??'stop':status==='cancelled'?'cancelled':'error'},terminal_error_class=${error},terminal_at=${at}::timestamptz,metering_run_id=${r.id}::uuid,updated_by=${c.principalId}::uuid WHERE tenant_id=${c.tenantId}::uuid AND id=${r.id}::uuid AND status='started' RETURNING *`.execute(
        tx,
      )
    ).rows[0]!;
  }
}
function map(r: Row): AtlasRun {
  return {
    runId: r.id,
    threadId: r.conversation_id,
    tenantId: r.tenant_id,
    planeKey: r.plane,
    principalId: r.principal_id,
    clientRequestId: r.client_request_id,
    inputMessageId: r.input_message_id,
    outputMessageId: r.output_message_id,
    status: r.status,
    ...r.generation_config,
    startedAt: new Date(r.started_at).toISOString(),
    terminalAt: r.terminal_at ? new Date(r.terminal_at).toISOString() : null,
    finishReason: r.finish_reason ?? undefined,
    terminalErrorClass: r.terminal_error_class,
  };
}
