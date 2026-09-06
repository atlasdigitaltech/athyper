import { parseInstant } from "@athyper/platform-temporal";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AtlasConfirmationVerifier,
  AtlasDomainCommandBus,
  AtlasRecordDataGateway,
  AtlasRegisteredTool,
  AtlasToolAuthority,
  AtlasToolAuditEntry,
  AtlasToolPolicyDecision,
  AtlasToolPreview,
  AtlasToolProposal,
  AtlasToolProposalStore,
  AtlasToolRunResult,
  AtlasToolStoreResult,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext, hasPermission } from "./context.js";
import { AtlasServiceError } from "./errors.js";

export class AtlasToolRegistry {
  private readonly tools = new Map<string, AtlasRegisteredTool>();
  constructor(tools: readonly AtlasRegisteredTool[]) { for (const tool of tools) { validateRegistration(tool); const key = `${tool.manifest.toolCode}@${tool.manifest.version}`; if (this.tools.has(key)) throw new TypeError(`Duplicate registered Atlas tool: ${key}`); this.tools.set(key, tool); } }
  resolve(toolCode: string, version: string): AtlasRegisteredTool { const tool = this.tools.get(`${toolCode}@${version}`); if (!tool) throw new AtlasServiceError("TOOL_DENIED", "The requested Atlas tool is not registered."); return tool; }
  list(): readonly AtlasRegisteredTool[] { return Object.freeze([...this.tools.values()]); }
}

export interface AtlasToolServiceOptions {
  readonly registry: AtlasToolRegistry;
  readonly authority: AtlasToolAuthority;
  readonly proposals: AtlasToolProposalStore;
  readonly records: AtlasRecordDataGateway;
  readonly confirmations: AtlasConfirmationVerifier;
  readonly commands: AtlasDomainCommandBus;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly createConfirmationToken?: () => string;
  readonly proposalTtlMs?: number;
}

export class AtlasToolService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createConfirmationToken: () => string;
  private readonly ttl: number;
  constructor(private readonly options: AtlasToolServiceOptions) {
    this.now = options.now ?? (() => new Date()); this.createId = options.createId ?? randomUUID;
    this.createConfirmationToken = options.createConfirmationToken ?? (() => randomBytes(32).toString("base64url"));
    this.ttl = options.proposalTtlMs ?? 5 * 60_000;
  }

  async preview(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly runId: string; readonly callId: string; readonly toolCode: string; readonly toolVersion: string; readonly arguments: Readonly<Record<string, unknown>>; readonly summary: string; readonly affectedEntityType?: string; readonly affectedEntityId?: string; readonly expectedRowVersion?: number }): Promise<AtlasToolPreview> {
    assertAtlasContext(input.context);
    const tool = this.options.registry.resolve(input.toolCode, input.toolVersion); const manifest = tool.manifest;
    tool.validateArguments?.(input.arguments, input);
    if (manifest.access === "mutation" && (input.expectedRowVersion === undefined || !input.affectedEntityType || !uuid(input.affectedEntityId ?? ""))) throw new AtlasServiceError("TOOL_INVALID", "Mutation previews require an affected entity type, entity UUID, and expected record row version.");
    const decision = await this.options.authority.authorize({ context: input.context, manifest, phase: "preview" });
    const permissionsAllowed = manifest.requiredPermissions.every((code) => hasPermission(input.context, code));
    const allowed = manifest.allowedPlanes.includes(input.context.planeKey) && permissionsAllowed && decision.allowed;
    const now = this.now(); const proposalId = this.createId();
    const confirmationRequired = allowed && (manifest.access === "mutation" || manifest.confirmation === "explicit_user");
    const expiresAt = confirmationRequired ? new Date(now.getTime() + this.ttl).toISOString() : undefined;
    const confirmationToken = confirmationRequired
      ? await (this.options.confirmations.issue?.({ context: input.context, proposalId, expiresAt: expiresAt! }) ?? Promise.resolve(this.createConfirmationToken()))
      : undefined;
    const autonomyDecision = allowed
      ? manifest.access === "mutation" ? "assist" : (decision.autonomyDecision === "denied" ? "suggest" : decision.autonomyDecision ?? "auto")
      : "denied";
    const proposal: AtlasToolProposal = Object.freeze({
      proposalId, tenantId: input.context.tenantId, planeKey: input.context.planeKey, principalId: input.context.principalId,
      threadId: required(input.threadId), runId: required(input.runId), callId: required(input.callId), toolCode: manifest.toolCode,
      toolVersion: manifest.version, actionCode: manifest.commandBinding ?? manifest.toolCode, argumentHash: hashCanonical(input.arguments),
      summary: boundedSummary(manifest.displayName), access: manifest.access, operationClass: manifest.access === "mutation" ? "mutate" : "read",
      risk: manifest.risk, autonomyDecision,
      ...(input.affectedEntityType ? { affectedEntityType: boundedIdentifier(input.affectedEntityType, 128) } : {}),
      ...(input.affectedEntityId ? { affectedEntityId: input.affectedEntityId } : {}),
      ...(input.expectedRowVersion === undefined ? {} : { expectedRowVersion: input.expectedRowVersion }),
      policyRevision: required(decision.policyRevision), profileRevision: decision.profileRevision?.trim() || input.context.profileHash,
      authorizationProfileHash: input.context.profileHash, authorizationEpoch: input.context.authEpoch,
      permissionSnapshot: boundedObject(decision.permissionSnapshot ?? permissionSnapshot(input.context, manifest.requiredPermissions)),
      policySnapshot: boundedObject(decision.policySnapshot ?? { allowed: decision.allowed, reasonCode: decision.reasonCode ?? null, revision: decision.policyRevision }),
      profileSnapshot: boundedObject({ ...(decision.profileSnapshot ?? {}), profileHash: input.context.profileHash, schemaHash: input.context.permissions.schemaHash }),
      ...(expiresAt ? { expiresAt } : {}), confirmationRequired,
      ...(confirmationToken ? { confirmationTokenHash: sha256(confirmationToken) } : {}), status: "proposed", createdAt: now.toISOString(), evidenceRefs: [],
    });
    const stored = await this.options.proposals.propose({ context: input.context, proposal });
    if (stored.kind === "conflict") throw new AtlasServiceError("IDEMPOTENCY_CONFLICT", "The provider tool call identifier was reused with different arguments or registration metadata.");
    if (!allowed) {
      await this.options.proposals.deny({ context: input.context, proposalId: stored.proposal.proposalId, expectedStatuses: ["proposed"], errorClass: denialClass(manifest, permissionsAllowed, decision), terminalAt: now.toISOString(), durationMs: elapsed(stored.proposal.createdAt, now) });
      throw new AtlasServiceError("TOOL_DENIED", "Atlas tool preview was denied by plane, permission, or server policy.");
    }
    return publicPreview(stored.proposal, stored.kind === "replayed", stored.kind === "created" ? confirmationToken : undefined);
  }

  async run(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly arguments: Readonly<Record<string, unknown>>; readonly confirmationToken?: string; readonly signal?: AbortSignal }): Promise<AtlasToolRunResult> {
    assertAtlasContext(input.context);
    let proposal = await this.options.proposals.get({ context: input.context, proposalId: input.proposalId });
    if (!proposal || proposal.principalId !== input.context.principalId) throw new AtlasServiceError("TOOL_DENIED", "Atlas tool proposal not found.");
    if (hashCanonical(input.arguments) !== proposal.argumentHash) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool arguments do not match the preview.");
    if (proposal.status === "completed") return replayResult(proposal);
    if (["denied", "failed", "expired", "cancelled"].includes(proposal.status)) throw terminalError(proposal);
    const now = this.now();
    if (proposal.expiresAt && parseInstant(proposal.expiresAt) <= now.getTime()) {
      await this.options.proposals.expire({ context: input.context, proposalId: proposal.proposalId, expectedStatuses: ["proposed", "confirmed"], errorClass: "confirmation_expired", terminalAt: now.toISOString(), durationMs: elapsed(proposal.createdAt, now) });
      throw new AtlasServiceError("STALE_PROPOSAL", "Atlas tool proposal has expired.");
    }
    const tool = this.options.registry.resolve(proposal.toolCode, proposal.toolVersion); const manifest = tool.manifest;
    tool.validateArguments?.(input.arguments, proposal);

    if (proposal.confirmationRequired && proposal.status === "proposed") {
      if (!input.confirmationToken) throw new AtlasServiceError("CONFIRMATION_REQUIRED", "Explicit user confirmation is required for this Atlas tool.");
      const tokenHash = sha256(input.confirmationToken);
      if (!proposal.confirmationTokenHash || !sameHash(tokenHash, proposal.confirmationTokenHash)
        || !await this.options.confirmations.verify({ context: input.context, proposal, confirmationToken: input.confirmationToken })) {
        throw new AtlasServiceError("CONFIRMATION_INVALID", "Atlas tool confirmation is invalid.");
      }
      const confirmed = await this.options.proposals.confirm({ context: input.context, proposalId: proposal.proposalId, tokenHash, confirmedAt: now.toISOString() });
      proposal = requireTransition(confirmed, "Atlas tool confirmation raced with another transition.");
    }

    const permissionsAllowed = manifest.requiredPermissions.every((code) => hasPermission(input.context, code));
    const decision = await this.options.authority.authorize({ context: input.context, manifest, phase: "execute" });
    const authorizationChanged = input.context.authEpoch !== proposal.authorizationEpoch || input.context.profileHash !== proposal.authorizationProfileHash;
    const policyChanged = decision.policyRevision !== proposal.policyRevision;
    if (!manifest.allowedPlanes.includes(input.context.planeKey) || !permissionsAllowed || !decision.allowed || authorizationChanged || policyChanged) {
      await this.options.proposals.deny({ context: input.context, proposalId: proposal.proposalId, expectedStatuses: ["proposed", "confirmed"], errorClass: authorizationChanged ? "authorization_epoch_changed" : policyChanged ? "policy_revision_changed" : "permission_revoked", terminalAt: now.toISOString(), durationMs: elapsed(proposal.createdAt, now) });
      throw new AtlasServiceError("TOOL_DENIED", "Atlas tool execution was denied during re-authorization.");
    }
    const downstreamIdempotencyKey = manifest.access === "mutation" ? `atlas:${proposal.proposalId}` : undefined;
    const begun = await this.options.proposals.beginExecution({
      context: input.context, proposalId: proposal.proposalId, expectedStatus: proposal.confirmationRequired ? "confirmed" : "proposed",
      executionGuard: boundedObject({ permissionsAllowed, authorizationEpoch: input.context.authEpoch, profileHash: input.context.profileHash, policyRevision: decision.policyRevision, affectedEntityType: proposal.affectedEntityType ?? null, affectedEntityId: proposal.affectedEntityId ?? null, expectedRowVersion: proposal.expectedRowVersion ?? null }),
      authorizationEpoch: input.context.authEpoch, policyRevision: decision.policyRevision, ...(downstreamIdempotencyKey ? { downstreamIdempotencyKey } : {}), executingAt: now.toISOString(),
    });
    if (begun.kind === "replayed") {
      if (begun.proposal.status === "completed") return replayResult(begun.proposal);
      throw new AtlasServiceError("TOOL_IN_PROGRESS", "Atlas tool execution is already in progress.");
    }
    proposal = requireTransition(begun, "Atlas tool proposal changed before execution began.");
    if (input.signal?.aborted) return this.cancelled(input.context, proposal, "worker_cancelled");

    try {
      let result: AtlasToolRunResult;
      if (manifest.access === "read") {
        if (!tool.readHandler) throw new AtlasServiceError("TOOL_INVALID", "Registered read tool has no handler.");
        const output = await executeRead(tool, input.context, input.arguments, this.options.records, manifest.timeoutMs, input.signal);
        enforceSize(output.data, manifest.maxResultBytes);
        result = { proposalId: proposal.proposalId, outcome: "completed", data: output.data, sources: output.sources };
      } else {
        if (!manifest.commandBinding || proposal.expectedRowVersion === undefined || !downstreamIdempotencyKey) throw new AtlasServiceError("TOOL_INVALID", "Atlas mutation registration is incomplete.");
        const command = await this.options.commands.execute({ context: input.context, commandBinding: manifest.commandBinding, arguments: input.arguments, idempotencyKey: downstreamIdempotencyKey, expectedRowVersion: proposal.expectedRowVersion });
        if (command.data !== undefined) enforceSize(command.data, manifest.maxResultBytes);
        result = { proposalId: proposal.proposalId, outcome: "completed", ...(command.data === undefined ? {} : { data: command.data }), sources: [], commandId: command.commandId, resultRevision: command.revision };
      }
      const terminalAt = this.now();
      const completed = await this.options.proposals.complete({ context: input.context, proposalId: proposal.proposalId, resultHash: hashCanonical({ outcome: result.outcome, data: result.data ?? null, commandId: result.commandId ?? null, revision: result.resultRevision ?? null }), evidenceRefs: [...result.sources.map((source) => ({ type: "record", ...source.coordinate })), ...(result.commandId && result.resultRevision ? [{ type: "command", revision: result.resultRevision }] : [])], ...(result.commandId && uuid(result.commandId) ? { businessTransactionId: result.commandId, businessTransactionType: manifest.commandBinding } : {}), terminalAt: terminalAt.toISOString(), durationMs: elapsed(proposal.createdAt, terminalAt) });
      if (completed.kind === "conflict") throw new AtlasServiceError("VERSION_CONFLICT", "Atlas tool terminal evidence could not be recorded.");
      return result;
    } catch (error) {
      if (isCancellation(error, input.signal)) return this.cancelled(input.context, proposal, "worker_cancelled");
      const terminalAt = this.now();
      await this.options.proposals.fail({ context: input.context, proposalId: proposal.proposalId, expectedStatuses: ["executing"], errorClass: safeErrorClass(error), terminalAt: terminalAt.toISOString(), durationMs: elapsed(proposal.createdAt, terminalAt) });
      throw error;
    }
  }

  async cancel(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly reason?: string }): Promise<AtlasToolRunResult> {
    assertAtlasContext(input.context);
    const proposal = await this.options.proposals.get({ context: input.context, proposalId: input.proposalId });
    if (!proposal || proposal.principalId !== input.context.principalId) throw new AtlasServiceError("TOOL_DENIED", "Atlas tool proposal not found.");
    return this.cancelled(input.context, proposal, input.reason ?? "worker_cancelled");
  }

  async history(input: { readonly context: VerifiedRequestContext; readonly limit?: number }): Promise<{ readonly items: readonly AtlasToolAuditEntry[] }> {
    assertAtlasContext(input.context);
    const proposals = await this.options.proposals.list({ context: input.context, limit: Math.min(Math.max(input.limit ?? 25, 1), 100) });
    return Object.freeze({ items: Object.freeze(proposals.map(publicAuditEntry)) });
  }

  private async cancelled(context: VerifiedRequestContext, proposal: AtlasToolProposal, reason: string): Promise<AtlasToolRunResult> {
    const terminalAt = this.now();
    const result = await this.options.proposals.cancel({ context, proposalId: proposal.proposalId, expectedStatuses: ["proposed", "confirmed", "executing"], errorClass: reason, terminalAt: terminalAt.toISOString(), durationMs: elapsed(proposal.createdAt, terminalAt) });
    if (result.kind === "conflict" && result.proposal?.status === "completed") return replayResult(result.proposal);
    if (result.kind === "conflict") throw new AtlasServiceError("VERSION_CONFLICT", "Atlas tool cancellation raced with a terminal transition.");
    return { proposalId: proposal.proposalId, outcome: "cancelled", replayed: result.kind === "replayed", sources: [] };
  }
}

async function executeRead(tool: AtlasRegisteredTool, context: VerifiedRequestContext, args: Readonly<Record<string, unknown>>, records: AtlasRecordDataGateway, timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
  try { return await tool.readHandler!.execute({ context: { context, records, signal: controller.signal }, arguments: args }); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
function publicPreview(proposal: AtlasToolProposal, replayed: boolean, token?: string): AtlasToolPreview { const { tenantId: _t, planeKey: _p, principalId: _u, actionCode: _a, operationClass: _o, permissionSnapshot: _ps, policySnapshot: _pol, profileSnapshot: _prof, confirmationTokenHash: _h, createdAt: _c, confirmationAt: _ca, executingAt: _xa, terminalAt: _ta, durationMs: _dm, executionAuthEpoch: _ea, executionPolicyRevision: _ep, downstreamIdempotencyKey: _di, terminalErrorClass: _te, resultHash: _rh, businessTransactionId: _bt, businessTransactionType: _btt, evidenceRefs: _er, ...preview } = proposal; return { ...preview, replayed, ...(token ? { confirmationToken: token } : {}) }; }
function publicAuditEntry(proposal: AtlasToolProposal): AtlasToolAuditEntry { return Object.freeze({ proposalId: proposal.proposalId, threadId: proposal.threadId, runId: proposal.runId, toolCode: proposal.toolCode, toolVersion: proposal.toolVersion, summary: proposal.summary, access: proposal.access, risk: proposal.risk, autonomyDecision: proposal.autonomyDecision, ...(proposal.affectedEntityType ? { affectedEntityType: proposal.affectedEntityType } : {}), ...(proposal.affectedEntityId ? { affectedEntityId: proposal.affectedEntityId } : {}), ...(proposal.expectedRowVersion === undefined ? {} : { expectedRowVersion: proposal.expectedRowVersion }), policyRevision: proposal.policyRevision, profileRevision: proposal.profileRevision, authorizationEpoch: proposal.authorizationEpoch, confirmationRequired: proposal.confirmationRequired, status: proposal.status, createdAt: proposal.createdAt, ...(proposal.confirmationAt ? { confirmationAt: proposal.confirmationAt } : {}), ...(proposal.executingAt ? { executingAt: proposal.executingAt } : {}), ...(proposal.terminalAt ? { terminalAt: proposal.terminalAt } : {}), ...(proposal.durationMs === undefined ? {} : { durationMs: proposal.durationMs }), ...(proposal.terminalErrorClass ? { terminalErrorClass: proposal.terminalErrorClass } : {}), ...(proposal.businessTransactionId ? { businessTransactionId: proposal.businessTransactionId } : {}), ...(proposal.businessTransactionType ? { businessTransactionType: proposal.businessTransactionType } : {}), evidenceRefs: proposal.evidenceRefs }); }
function replayResult(proposal: AtlasToolProposal): AtlasToolRunResult { const commandEvidence = proposal.evidenceRefs.find((item) => item["type"] === "command"); return { proposalId: proposal.proposalId, outcome: "completed", replayed: true, sources: [], ...(proposal.businessTransactionId ? { commandId: proposal.businessTransactionId } : {}), ...(typeof commandEvidence?.["revision"] === "string" ? { resultRevision: commandEvidence["revision"] } : {}) }; }
function requireTransition(result: AtlasToolStoreResult, message: string): AtlasToolProposal { if (result.kind === "conflict") throw new AtlasServiceError("VERSION_CONFLICT", message); return result.proposal; }
function terminalError(proposal: AtlasToolProposal): AtlasServiceError { return new AtlasServiceError(proposal.status === "expired" ? "STALE_PROPOSAL" : proposal.status === "cancelled" ? "TOOL_CANCELLED" : "TOOL_DENIED", `Atlas tool invocation is already ${proposal.status}.`); }
function denialClass(manifest: AtlasRegisteredTool["manifest"], permissionsAllowed: boolean, decision: AtlasToolPolicyDecision): string { return !permissionsAllowed ? "permission_denied" : decision.reasonCode?.slice(0, 128) || (manifest.allowedPlanes.length ? "policy_denied" : "plane_denied"); }
function permissionSnapshot(context: VerifiedRequestContext, requiredPermissions: readonly string[]): Readonly<Record<string, unknown>> { return { required: requiredPermissions, allowed: requiredPermissions.filter((code) => hasPermission(context, code)), denied: requiredPermissions.filter((code) => !hasPermission(context, code)), schemaHash: context.permissions.schemaHash, resolvedAt: context.permissions.resolvedAt }; }
function validateRegistration(tool: AtlasRegisteredTool): void { const manifest = tool.manifest; if (manifest.schema !== "atlas-tool-manifest/1" || !/^[a-z][a-z0-9_-]{0,127}$/.test(manifest.toolCode) || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(manifest.version) || manifest.timeoutMs < 1 || manifest.maxResultBytes < 1) throw new TypeError("Invalid Atlas tool manifest."); if (manifest.access === "read" && (!tool.readHandler || manifest.commandBinding)) throw new TypeError("Read tools require a read handler and cannot bind a domain command."); if (manifest.access === "mutation" && (tool.readHandler || !manifest.commandBinding || !/^[a-z][a-z0-9_.:-]{0,127}$/.test(manifest.commandBinding) || manifest.confirmation !== "explicit_user")) throw new TypeError("Mutation tools require an explicitly confirmed registered domain command."); }
function hashCanonical(value: unknown): string { return sha256(canonicalJson(value)); }
function canonicalJson(value: unknown): string { if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value); if (typeof value === "number") { if (!Number.isFinite(value)) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool values must be finite JSON numbers."); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; throw new AtlasServiceError("TOOL_INVALID", "Atlas tool values must be JSON serializable."); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function sameHash(a: string, b: string): boolean { const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex"); return left.length === right.length && timingSafeEqual(left, right); }
function boundedObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { const text = canonicalJson(value); if (value === null || Array.isArray(value) || Object.keys(value).length === 0 || Buffer.byteLength(text, "utf8") > 32_768 || containsSensitiveField(value)) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool decision evidence must be a non-empty bounded, content-free object."); return value; }
function containsSensitiveField(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsSensitiveField); if (!value || typeof value !== "object") return false; return Object.entries(value as Record<string, unknown>).some(([key, child]) => /(^|_)(secret|password|token|api_?key|prompt|result|arguments?|request_?body|response_?body|content|raw)($|_)/i.test(key) || containsSensitiveField(child)); }
function enforceSize(value: unknown, max: number): void { if (Buffer.byteLength(canonicalJson(value), "utf8") > max) throw new AtlasServiceError("RESULT_TOO_LARGE", "Atlas tool result exceeds its registered byte limit."); }
function required(value: string): string { const result = value.trim(); if (!result) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool identifiers are required."); return result; }
function boundedSummary(value: string): string { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > 4096) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool preview summary must be between 1 and 4096 bytes."); return result; }
function boundedIdentifier(value: string, max: number): string { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > max || /[\u0000-\u001f\u007f]/.test(result)) throw new AtlasServiceError("TOOL_INVALID", "Atlas tool affected entity type is invalid."); return result; }
function elapsed(createdAt: string, now: Date): number { return Math.max(0, now.getTime() - parseInstant(createdAt)); }
function safeErrorClass(error: unknown): string { if (error instanceof AtlasServiceError) return error.code.toLowerCase().slice(0, 128); return "tool_execution_failed"; }
function isCancellation(error: unknown, signal?: AbortSignal): boolean { return signal?.aborted === true || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")); }
function uuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
