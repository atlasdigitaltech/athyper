import { createHash, randomUUID } from "node:crypto";
import type { AtlasContentBlock, AtlasDataClass, AtlasFinishReason, AtlasModelPolicyResolver, AtlasPlaneAdmissionResolver, AtlasProviderCredentialResolver, AtlasProviderError, AtlasProviderUsage, AtlasPublicModelId, AtlasRunRepository, AtlasSseEnvelope, AtlasUsageLedger } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasBindingRegistry, AtlasProviderRegistry } from "./bindings.js";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";
import type { AtlasRuntimeToolCoordinator } from "./runtime-tool-coordinator.js";
import { AtlasThreadService } from "./thread-service.js";

export interface AtlasPromptResolver { resolve(input: { readonly context: VerifiedRequestContext; readonly promptRevision: string }): Promise<{ readonly revision: string; readonly systemText: string }> }
export interface AtlasAgentRuntimeOptions {
  readonly admission: AtlasPlaneAdmissionResolver;
  readonly modelPolicy: AtlasModelPolicyResolver;
  readonly bindings: AtlasBindingRegistry;
  readonly providers: AtlasProviderRegistry;
  readonly credentials: AtlasProviderCredentialResolver;
  readonly threads: AtlasThreadService;
  readonly runs: AtlasRunRepository;
  readonly ledger: AtlasUsageLedger;
  readonly prompts: AtlasPromptResolver;
  readonly tools?: AtlasRuntimeToolCoordinator;
  readonly maxInputCharacters: number;
  readonly maxToolRounds: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
}
export interface AtlasRunCommand { readonly context: VerifiedRequestContext; readonly threadId: string; readonly clientRequestId: string; readonly publicModelId: AtlasPublicModelId; readonly dataClass: AtlasDataClass; readonly userText: string; readonly catalogPolicyRevision: string; readonly signal?: AbortSignal }

export class AtlasAgentRuntime {
  private readonly now: () => Date; private readonly createId: () => string;
  constructor(private readonly options: AtlasAgentRuntimeOptions) { this.now = options.now ?? (() => new Date()); this.createId = options.createId ?? randomUUID; if (options.maxInputCharacters < 1 || options.maxToolRounds < 0) throw new TypeError("Atlas runtime limits are invalid."); }
  async *run(command: AtlasRunCommand): AsyncIterable<AtlasSseEnvelope> {
    assertAtlasContext(command.context); const userText = command.userText.trim(); if (!userText || userText.length > this.options.maxInputCharacters) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas user input is outside the configured bounds.");
    const admission = await this.options.admission.resolve(command.context); if (!admission.chatAllowed || !admission.persistenceAllowed) throw new AtlasServiceError("ADMISSION_DENIED", "Durable Atlas chat is not admitted for this request.");
    if (!admission.allowedPublicModelIds.includes(command.publicModelId) || !admission.allowedDataClasses.includes(command.dataClass)) throw new AtlasServiceError("ADMISSION_DENIED", "The requested Atlas mode or data class is not admitted.");
    if (command.catalogPolicyRevision !== admission.policyRevision) throw new AtlasServiceError("BINDING_POLICY_DENIED", "The Atlas catalog revision is stale.");
    const binding = this.options.bindings.resolve(command.publicModelId); const policy = await this.options.modelPolicy.evaluate({ context: command.context, admission, binding, dataClass: command.dataClass });
    if (!policy.allowed) throw new AtlasServiceError("BINDING_POLICY_DENIED", "The exact Atlas model binding was denied by policy.");
    const prompt = await this.options.prompts.resolve({ context: command.context, promptRevision: policy.promptRevision }); if (prompt.revision !== policy.promptRevision) throw new AtlasServiceError("BINDING_POLICY_DENIED", "The Atlas prompt revision changed before execution.");
    const credential = await this.options.credentials.resolve({ tenantId: command.context.tenantId, binding }); if (!credential || credential.ownerId !== binding.credentialOwnerId) throw new AtlasServiceError("CREDENTIAL_UNAVAILABLE", "The exact Atlas provider credential is unavailable.");
    const thread = await this.options.threads.get(command.context, command.threadId); if (thread.status !== "active") throw new AtlasServiceError("THREAD_NOT_ACTIVE", "Atlas runs require an active thread.");
    const history = await this.options.threads.boundedHistory(command.context, command.threadId); const runId = this.createId(); const outputMessageId = this.createId(); const begin = await this.options.runs.begin({ context: command.context, runId, threadId: thread.threadId, clientRequestId: required(command.clientRequestId), inputMessageId: this.createId(), outputMessageId, userContent: [{ type: "text", text: userText }], publicModelId: binding.publicModelId, bindingId: binding.bindingId, bindingRevision: binding.bindingRevision, policyRevision: policy.policyRevision, promptRevision: policy.promptRevision, startedAt: this.now().toISOString() });
    let sequence = 0; const envelope = (event: AtlasSseEnvelope["event"]): AtlasSseEnvelope => ({ protocol: "atlas.sse/1", sequence: ++sequence, runId: begin.run.runId, threadId: thread.threadId, emittedAt: this.now().toISOString(), event });
    yield envelope({ type: "run.started", publicModelId: binding.publicModelId, bindingRevision: binding.bindingRevision, policyRevision: policy.policyRevision, promptRevision: policy.promptRevision });
    if (begin.replayed) { for (const block of begin.replayedOutput ?? []) if (block.type === "text") yield envelope({ type: "message.delta", messageId: begin.run.outputMessageId, text: block.text }); if (begin.run.status === "completed") yield envelope({ type: "run.completed", messageId: begin.run.outputMessageId, reason: "stop" }); else if (begin.run.status === "cancelled") yield envelope({ type: "run.cancelled" }); else if (begin.run.status === "failed") yield envelope({ type: "run.failed", errorClass: begin.run.terminalErrorClass ?? "upstream_error", code: "replayed_failure", retryable: false }); return; }
    const provider = this.options.providers.resolve(binding); const principalHash = sha(`${command.context.tenantId}\u0000${command.context.principalId}`); const messages = [...history, { role: "user" as const, content: [{ type: "text" as const, text: userText }] }]; const persisted: AtlasContentBlock[] = [];
    const definitions = admission.readToolsAllowed && binding.capabilities.tools && this.options.tools ? await this.options.tools.definitions(command.context) : [];
    for (let round = 0; round <= this.options.maxToolRounds; round += 1) {
      const providerCallId = this.createId(); const callStarted = this.now(); let providerRequestId: string | null = null; let actualModelId = ""; let usage: AtlasProviderUsage = {}; let finish: AtlasFinishReason = "error"; let failure: AtlasProviderError | null = null; let cancelled = false; const roundBlocks: AtlasContentBlock[] = []; const toolCalls: { callId: string; toolName: string; input: Readonly<Record<string, unknown>> }[] = [];
      try { for await (const event of provider.invoke({ binding, credential, prompt: { messages: [{ role: "system", content: [{ type: "text", text: prompt.systemText }] }, ...messages], maxOutputTokens: binding.capabilities.maxOutputTokens, ...(definitions.length ? { tools: definitions } : {}) }, signal: command.signal, trace: { runId: begin.run.runId, providerCallId, tenantId: command.context.tenantId, principalHash, safetyIdentifier: sha(`${command.context.tenantId}\u0000${command.context.principalId}`), promptRevision: policy.promptRevision, policyRevision: policy.policyRevision } })) {
        if (event.kind === "response_started") { providerRequestId = event.providerRequestId; actualModelId = event.actualModelId; if (actualModelId !== binding.upstreamModelId) { failure = { errorClass: "protocol_error", code: "actual_model_mismatch", safeMessage: "The Atlas provider returned an unexpected model.", retryable: false }; break; } }
        else if (event.kind === "text_delta") { roundBlocks.push({ type: "text", text: event.text }); yield envelope({ type: "message.delta", messageId: begin.run.outputMessageId, text: event.text }); }
        else if (event.kind === "tool_call_complete") { toolCalls.push({ callId: event.callId, toolName: event.toolName, input: event.input }); roundBlocks.push({ type: "tool_use", callId: event.callId, toolName: event.toolName, input: event.input }); }
        else if (event.kind === "usage") { usage = mergeUsage(usage, event.usage, event.mode); yield envelope({ type: "usage.updated", usage }); }
        else if (event.kind === "completed") finish = event.reason;
        else if (event.kind === "failed") { failure = event.error; finish = "error"; }
        else if (event.kind === "cancelled") { cancelled = true; finish = "cancelled"; }
      } } catch { failure = { errorClass: "upstream_error", code: "provider_adapter_failed", safeMessage: "The Atlas provider request could not be completed.", retryable: true }; finish = "error"; }
      await this.options.ledger.append(contentFreeLedger({ ledgerId: this.createId(), runId: begin.run.runId, providerCallId, context: command.context, principalHash, binding, credential, providerRequestId, actualModelId: actualModelId || binding.upstreamModelId, policyRevision: policy.policyRevision, promptRevision: policy.promptRevision, usage, finish, failure, durationMs: Math.max(0, this.now().getTime() - callStarted.getTime()), recordedAt: this.now().toISOString() }));
      persisted.push(...roundBlocks);
      if (cancelled) { await this.options.runs.cancel({ context: command.context, runId: begin.run.runId, cancelledAt: this.now().toISOString() }); yield envelope({ type: "run.cancelled" }); return; }
      if (failure) { await this.options.runs.fail({ context: command.context, runId: begin.run.runId, errorClass: failure.errorClass, failedAt: this.now().toISOString() }); yield envelope({ type: "run.failed", errorClass: failure.errorClass, code: failure.code, retryable: failure.retryable }); return; }
      if (toolCalls.length) {
        if (!this.options.tools || !admission.readToolsAllowed) { const errorClass = "protocol_error" as const; await this.options.runs.fail({ context: command.context, runId: begin.run.runId, errorClass, failedAt: this.now().toISOString() }); yield envelope({ type: "run.failed", errorClass, code: "tool_not_admitted", retryable: false }); return; }
        const results: AtlasContentBlock[] = []; let awaitingConfirmation = false;
        for (const call of toolCalls) { const outcome = await this.options.tools.handle({ context: command.context, runId: begin.run.runId, threadId: thread.threadId, callId: call.callId, toolCode: call.toolName, arguments: call.input, signal: command.signal }); yield envelope({ type: "tool.previewed", callId: call.callId, toolCode: call.toolName, proposalId: outcome.preview.proposalId, confirmationRequired: outcome.preview.confirmationRequired }); if (outcome.result) { yield envelope({ type: "tool.completed", callId: call.callId, toolCode: call.toolName, outcome: outcome.result.outcome }); results.push({ type: "tool_result", callId: call.callId, toolName: call.toolName, result: outcome.result.data ?? { outcome: outcome.result.outcome }, isError: outcome.result.outcome !== "completed" }); } else awaitingConfirmation = true; }
        if (awaitingConfirmation) { await this.options.runs.complete({ context: command.context, runId: begin.run.runId, assistantContent: persisted, completedAt: this.now().toISOString() }); yield envelope({ type: "run.completed", messageId: begin.run.outputMessageId, reason: "tool_call" }); return; }
        messages.push({ role: "assistant", content: roundBlocks }, { role: "tool", content: results }); persisted.push(...results); continue;
      }
      await this.options.runs.complete({ context: command.context, runId: begin.run.runId, assistantContent: persisted, completedAt: this.now().toISOString() }); yield envelope({ type: "run.completed", messageId: begin.run.outputMessageId, reason: finish === "error" ? "stop" : finish }); return;
    }
    await this.options.runs.fail({ context: command.context, runId: begin.run.runId, errorClass: "protocol_error", failedAt: this.now().toISOString() }); yield envelope({ type: "run.failed", errorClass: "protocol_error", code: "tool_round_limit", retryable: false });
  }
}

function contentFreeLedger(input: any) { const b = input.binding; const u = input.usage as AtlasProviderUsage; const inputCost = cost((u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0), b.inputPricePerMtokUsd); const outputCost = cost((u.outputTokens ?? 0) + (u.reasoningTokens ?? 0), b.outputPricePerMtokUsd); return { ledgerId: input.ledgerId, runId: input.runId, providerCallId: input.providerCallId, tenantId: input.context.tenantId, planeKey: input.context.planeKey, principalHash: input.principalHash, providerId: b.providerId, providerRequestId: input.providerRequestId, credentialId: input.credential.credentialId, credentialRevision: input.credential.credentialRevision, credentialOwnerId: input.credential.ownerId, providerRegion: b.providerRegion, publicModelId: b.publicModelId, bindingId: b.bindingId, bindingRevision: b.bindingRevision, actualModelId: input.actualModelId, adapterId: b.adapterId, adapterVersion: b.adapterVersion, policyRevision: input.policyRevision, promptRevision: input.promptRevision, priceVersion: b.priceVersion, usage: u, inputCostUsd: inputCost, outputCostUsd: outputCost, totalCostUsd: inputCost === null || outputCost === null ? null : inputCost + outputCost, finishReason: input.finish, errorClass: input.failure?.errorClass ?? null, durationMs: input.durationMs, recordedAt: input.recordedAt }; }
function mergeUsage(current: AtlasProviderUsage, next: AtlasProviderUsage, mode: "snapshot" | "delta"): AtlasProviderUsage { const merge = (a: number | undefined, b: number | undefined) => mode === "delta" ? (a ?? 0) + (b ?? 0) : b ?? a; return { inputTokens: merge(current.inputTokens, next.inputTokens), outputTokens: merge(current.outputTokens, next.outputTokens), cacheReadTokens: merge(current.cacheReadTokens, next.cacheReadTokens), cacheWriteTokens: merge(current.cacheWriteTokens, next.cacheWriteTokens), reasoningTokens: merge(current.reasoningTokens, next.reasoningTokens) }; }
function cost(tokens: number, price: number | null): number | null { return price === null ? null : tokens * price / 1_000_000; }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function required(value: string): string { const result = value.trim(); if (!result) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas client request id is required."); return result; }
