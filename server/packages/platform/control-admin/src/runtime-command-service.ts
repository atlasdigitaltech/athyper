import { createHash, randomUUID } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  type JsonValue,
  type RuntimeApprovalDecision,
  type RuntimeCommandApproval,
  type RuntimeCommandDiffEntry,
  type RuntimeCommandHistoryEntry,
  type RuntimeCommandPreview,
  type RuntimeCommandRisk,
  type RuntimeCommandSubmission,
  type RuntimeControlCommand,
} from "@athyper/server-contract-control-admin";

export interface RuntimeCommandExecutor {
  preview(input: {
    readonly context: VerifiedRequestContext;
    readonly command: RuntimeControlCommand;
  }): Promise<{
    readonly current: JsonValue;
    readonly proposed: JsonValue;
    readonly risk?: RuntimeCommandRisk;
    readonly warnings?: readonly string[];
  }>;
  apply(input: {
    readonly context: VerifiedRequestContext;
    readonly command: RuntimeControlCommand;
    readonly preview: RuntimeCommandPreview;
  }): Promise<JsonValue>;
}

export interface StoredRuntimeCommandSubmission {
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly submission: RuntimeCommandSubmission;
}

export interface StoredRuntimeCommandApproval extends RuntimeCommandApproval {
  readonly kind: string;
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
}

export interface RuntimeCommandStore {
  findSubmission(tenantId: string, idempotencyKey: string): Promise<StoredRuntimeCommandSubmission | undefined>;
  appendSubmission(record: StoredRuntimeCommandSubmission): Promise<boolean>;
  appendApprovalRequest(approval: StoredRuntimeCommandApproval): Promise<void>;
  appendApprovalDecision(input: {
    readonly approvalId: string;
    readonly decision: RuntimeApprovalDecision;
    readonly decidedBy: string;
    readonly decidedAt: string;
    readonly reason: string;
  }): Promise<StoredRuntimeCommandApproval>;
  getApproval(approvalId: string): Promise<StoredRuntimeCommandApproval | undefined>;
  appendHistory(entry: Omit<RuntimeCommandHistoryEntry, "historyId" | "entryHash" | "previousHash">): Promise<RuntimeCommandHistoryEntry>;
  listHistory(input: { readonly tenantId: string; readonly limit: number }): Promise<readonly RuntimeCommandHistoryEntry[]>;
}

export function createRuntimeCommandService(options: {
  readonly authorizer: Authorizer;
  readonly executor: RuntimeCommandExecutor;
  readonly store?: RuntimeCommandStore;
  readonly storeFor?: (context: VerifiedRequestContext) => RuntimeCommandStore;
  readonly now?: () => Date;
  readonly riskForKind?: (kind: string) => RuntimeCommandRisk;
}) {
  if (!options.store && !options.storeFor) throw new Error("Runtime command persistence is required");
  const now = options.now ?? (() => new Date());
  const riskForKind = options.riskForKind ?? defaultRiskForKind;

  const preview = async (
    context: VerifiedRequestContext,
    command: RuntimeControlCommand,
  ): Promise<RuntimeCommandPreview> => {
    await permit(options.authorizer, context, controlAdminPermissions.runtimeCommandManage);
    validateCommand(command);
    const result = await options.executor.preview({ context, command });
    const risk = result.risk ?? riskForKind(command.kind);
    return {
      commandId: command.commandId,
      fingerprint: commandFingerprint(context, command),
      risk,
      approvalRequired: risk === "high" || risk === "critical",
      current: result.current,
      proposed: result.proposed,
      diff: createRuntimeCommandDiff(result.current, result.proposed),
      warnings: result.warnings ?? [],
    };
  };

  return {
    preview,
    async submit(context: VerifiedRequestContext, command: RuntimeControlCommand): Promise<RuntimeCommandSubmission> {
      const store = options.storeFor?.(context) ?? options.store!;
      const planned = await preview(context, command);
      const existing = await store.findSubmission(context.tenantId, command.idempotencyKey);
      if (existing && existing.fingerprint !== planned.fingerprint) throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
      if (existing?.submission.outcome === "applied" || existing?.submission.outcome === "replayed") {
        return { ...existing.submission, outcome: "replayed" };
      }
      if (existing?.submission.outcome === "pending" || existing?.submission.outcome === "failed") return existing.submission;

      if (planned.approvalRequired) {
        if (!command.approvalId) {
          if (existing?.submission.approval) {
            const currentApproval = await store.getApproval(existing.submission.approval.approvalId);
            return currentApproval ? { ...existing.submission, approval: currentApproval } : existing.submission;
          }
          const requestedAt = now().toISOString();
          const approval: StoredRuntimeCommandApproval = {
            approvalId: deterministicApprovalId(planned.fingerprint),
            commandId: command.commandId,
            commandFingerprint: planned.fingerprint,
            requestedBy: context.principalId,
            requestedAt,
            status: "pending",
            kind: command.kind,
            tenantId: context.tenantId,
            planeKey: context.planeKey,
          };
          const submission: RuntimeCommandSubmission = {
            outcome: "approval_required",
            commandId: command.commandId,
            fingerprint: planned.fingerprint,
            approval,
          };
          await store.appendApprovalRequest(approval);
          const inserted = await store.appendSubmission({ tenantId: context.tenantId, planeKey: context.planeKey, actorId: context.principalId, idempotencyKey: command.idempotencyKey, fingerprint: planned.fingerprint, submission });
          if (!inserted) return (await store.findSubmission(context.tenantId, command.idempotencyKey))?.submission ?? submission;
          await history(store, context, command, planned.fingerprint, "submitted", now(), { risk: planned.risk });
          await history(store, context, command, planned.fingerprint, "approval_requested", now(), { approvalId: approval.approvalId });
          return submission;
        }
        const approval = await store.getApproval(command.approvalId);
        if (!approval) throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
        if (approval.commandFingerprint !== planned.fingerprint || approval.status !== "approved") {
          throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
        }
        if (approval.requestedBy !== context.principalId) throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 403);
      }

      const pending: RuntimeCommandSubmission = { outcome: "pending", commandId: command.commandId, fingerprint: planned.fingerprint };
      const claimed = await store.appendSubmission({ tenantId: context.tenantId, planeKey: context.planeKey, actorId: context.principalId, idempotencyKey: command.idempotencyKey, fingerprint: planned.fingerprint, submission: pending });
      if (!claimed) {
        const current = await store.findSubmission(context.tenantId, command.idempotencyKey);
        if (!current) throw coded("CONTROL_ADMIN_COMMAND_CLAIM_LOST", 503);
        return current.submission.outcome === "applied" ? { ...current.submission, outcome: "replayed" } : current.submission;
      }
      if (!existing) await history(store, context, command, planned.fingerprint, "submitted", now(), { risk: planned.risk });
      let value: JsonValue;
      try {
        value = await options.executor.apply({ context, command, preview: planned });
      } catch (error) {
        const failed: RuntimeCommandSubmission = { outcome: "failed", commandId: command.commandId, fingerprint: planned.fingerprint };
        await store.appendSubmission({ tenantId: context.tenantId, planeKey: context.planeKey, actorId: context.principalId, idempotencyKey: command.idempotencyKey, fingerprint: planned.fingerprint, submission: failed }).catch(() => false);
        throw error;
      }
      const submission: RuntimeCommandSubmission = {
        outcome: "applied",
        commandId: command.commandId,
        fingerprint: planned.fingerprint,
        value,
      };
      const inserted = await store.appendSubmission({ tenantId: context.tenantId, planeKey: context.planeKey, actorId: context.principalId, idempotencyKey: command.idempotencyKey, fingerprint: planned.fingerprint, submission });
      if (!inserted) return { ...(await store.findSubmission(context.tenantId, command.idempotencyKey))!.submission, outcome: "replayed" };
      await history(store, context, command, planned.fingerprint, "applied", now(), { approvalId: command.approvalId ?? null });
      return submission;
    },
    async decideApproval(
      context: VerifiedRequestContext,
      approvalId: string,
      decision: RuntimeApprovalDecision,
      reason: string,
    ): Promise<RuntimeCommandApproval> {
      await permit(options.authorizer, context, controlAdminPermissions.runtimeCommandApprove);
      const store = options.storeFor?.(context) ?? options.store!;
      if (!approvalId.trim() || !reason.trim()) throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
      const approval = await store.getApproval(approvalId);
      if (!approval) throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
      if (approval.status !== "pending") throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
      if (approval.requestedBy === context.principalId) throw coded("CONTROL_ADMIN_SELF_APPROVAL_FORBIDDEN", 403);
      if (approval.tenantId !== context.tenantId || approval.planeKey !== context.planeKey) {
        throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
      }
      const decidedAt = now().toISOString();
      const decided = await store.appendApprovalDecision({
        approvalId,
        decision,
        decidedBy: context.principalId,
        decidedAt,
        reason: reason.trim(),
      });
      await store.appendHistory({
        commandId: approval.commandId,
        kind: approval.kind,
        event: decision,
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        actorId: context.principalId,
        reason: reason.trim(),
        fingerprint: approval.commandFingerprint,
        detail: { approvalId },
        occurredAt: decidedAt,
      });
      return decided;
    },
    async history(context: VerifiedRequestContext, limit = 50) {
      await permit(options.authorizer, context, controlAdminPermissions.runtimeHistoryRead);
      const store = options.storeFor?.(context) ?? options.store!;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
      return store.listHistory({ tenantId: context.tenantId, limit });
    },
  };
}

export type RuntimeCommandService = ReturnType<typeof createRuntimeCommandService>;

export class InMemoryRuntimeCommandStore implements RuntimeCommandStore {
  readonly #submissions = new Map<string, StoredRuntimeCommandSubmission>();
  readonly #submissionOutcomes = new Set<string>();
  readonly #approvals = new Map<string, StoredRuntimeCommandApproval>();
  readonly #history: RuntimeCommandHistoryEntry[] = [];

  async findSubmission(tenantId: string, key: string) { return this.#submissions.get(`${tenantId}\0${key}`); }
  async appendSubmission(record: StoredRuntimeCommandSubmission) {
    const key = `${record.tenantId}\0${record.idempotencyKey}`;
    const current = this.#submissions.get(key);
    if (current && current.fingerprint !== record.fingerprint) throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
    const normalizedOutcome = record.submission.outcome === "replayed" ? "applied" : record.submission.outcome;
    const outcomeKey = `${key}\0${normalizedOutcome}`;
    if (this.#submissionOutcomes.has(outcomeKey)) return false;
    this.#submissionOutcomes.add(outcomeKey);
    const priority = { approval_required: 0, pending: 1, failed: 2, applied: 3, replayed: 3 } as const;
    if (!current || priority[normalizedOutcome] >= priority[current.submission.outcome]) this.#submissions.set(key, Object.freeze(record));
    return true;
  }
  async appendApprovalRequest(approval: StoredRuntimeCommandApproval) {
    if (this.#approvals.has(approval.approvalId)) throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
    this.#approvals.set(approval.approvalId, Object.freeze(approval));
  }
  async appendApprovalDecision(input: { readonly approvalId: string; readonly decision: RuntimeApprovalDecision; readonly decidedBy: string; readonly decidedAt: string; readonly reason: string }) {
    const current = this.#approvals.get(input.approvalId);
    if (!current || current.status !== "pending") throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
    const decided: StoredRuntimeCommandApproval = Object.freeze({ ...current, status: input.decision, decidedBy: input.decidedBy, decidedAt: input.decidedAt, decisionReason: input.reason });
    this.#approvals.set(input.approvalId, decided);
    return decided;
  }
  async getApproval(id: string) { return this.#approvals.get(id); }
  async appendHistory(input: Omit<RuntimeCommandHistoryEntry, "historyId" | "entryHash" | "previousHash">) {
    let previousHash: string | undefined;
    for (let index = this.#history.length - 1; index >= 0; index -= 1) {
      const entry = this.#history[index]!;
      if (entry.tenantId === input.tenantId && entry.planeKey === input.planeKey) {
        previousHash = entry.entryHash;
        break;
      }
    }
    const historyId = randomUUID();
    const entryHash = sha256(canonical({ ...input, historyId, previousHash: previousHash ?? null }));
    const entry: RuntimeCommandHistoryEntry = Object.freeze({ ...input, historyId, ...(previousHash ? { previousHash } : {}), entryHash });
    this.#history.push(entry);
    return entry;
  }
  async listHistory(input: { readonly tenantId: string; readonly limit: number }) {
    return this.#history.filter((entry) => entry.tenantId === input.tenantId).slice(-input.limit).reverse();
  }
}

export function createRuntimeCommandDiff(current: JsonValue, proposed: JsonValue): readonly RuntimeCommandDiffEntry[] {
  const entries: RuntimeCommandDiffEntry[] = [];
  diffValue(current, proposed, "", entries);
  return entries;
}

function diffValue(before: JsonValue | undefined, after: JsonValue | undefined, path: string, entries: RuntimeCommandDiffEntry[]): void {
  if (canonical(before) === canonical(after)) return;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) diffValue(before[key], after[key], `${path}/${escapePointer(key)}`, entries);
    return;
  }
  entries.push({
    operation: before === undefined ? "add" : after === undefined ? "remove" : "replace",
    path: path || "/",
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  });
}

function defaultRiskForKind(kind: string): RuntimeCommandRisk {
  if (/\.(delete|retire|deprecate|publish|activate)$/.test(kind) || kind.includes("desired_state")) return "high";
  if (/\.(expire|suspend|override|save|set)$/.test(kind)) return "medium";
  // Unknown mutation kinds fail toward approval until explicitly classified by their handler.
  return "high";
}

function validateCommand(command: RuntimeControlCommand): void {
  if (!command.commandId.trim() || !command.idempotencyKey.trim() || !command.reason.trim()
    || !/^[a-z][a-z0-9_.-]{2,127}$/.test(command.kind)
    || command.expectedVersion !== undefined && (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0)) {
    throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
  }
}

function commandFingerprint(context: VerifiedRequestContext, command: RuntimeControlCommand): string {
  return sha256(canonical({
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    kind: command.kind,
    reason: command.reason.trim(),
    payload: command.payload,
    expectedVersion: command.expectedVersion ?? null,
    planeKey: context.planeKey,
    tenantId: context.tenantId,
  }));
}

function deterministicApprovalId(fingerprint: string): string {
  const hex = sha256(`control-runtime-approval:${fingerprint}`).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function history(
  store: RuntimeCommandStore,
  context: VerifiedRequestContext,
  command: RuntimeControlCommand,
  fingerprint: string,
  event: RuntimeCommandHistoryEntry["event"],
  at: Date,
  detail: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  await store.appendHistory({ commandId: command.commandId, kind: command.kind, event, planeKey: context.planeKey, tenantId: context.tenantId, actorId: context.principalId, reason: command.reason.trim(), fingerprint, detail, occurredAt: at.toISOString() });
}

async function permit(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> {
  if (!(await authorizer.authorize({ context, permissionCode })).allowed) throw coded("CONTROL_ADMIN_PERMISSION_DENIED", 403);
}
function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function escapePointer(value: string): string { return value.replace(/~/g, "~0").replace(/\//g, "~1"); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
function coded(code: string, status: number): Error { return Object.assign(new Error(code), { code, status }); }
