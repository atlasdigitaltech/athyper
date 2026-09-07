import type { Transaction } from "kysely";
import { createHash, randomUUID } from "node:crypto";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  controlAdminSchemas,
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

import {
  HttpError,
  validateRuntimeSchema,
  type RuntimeSchema,
} from "@athyper/server-runtime-http";

export type RuntimeCommandTransaction =
  | {
      readonly kind: "postgres";
      readonly database: Transaction<Record<string, never>>;
    }
  | { readonly kind: "memory" };
export interface RuntimeCommandExecutor {
  /** Effects must use the supplied transaction; remote work must be outboxed. */
  readonly effects: "transactional";
  preview(input: {
    readonly context: VerifiedRequestContext;
    readonly command: RuntimeControlCommand;
    readonly transaction?: RuntimeCommandTransaction;
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
    readonly transaction: RuntimeCommandTransaction;
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
  atomic<T>(
    context: VerifiedRequestContext,
    key: string,
    work: (
      store: RuntimeCommandStore,
      transaction: RuntimeCommandTransaction,
    ) => Promise<T>,
  ): Promise<T>;
  findSubmission(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<StoredRuntimeCommandSubmission | undefined>;
  appendSubmission(record: StoredRuntimeCommandSubmission): Promise<boolean>;
  appendApprovalRequest(approval: StoredRuntimeCommandApproval): Promise<void>;
  appendApprovalDecision(input: {
    readonly approvalId: string;
    readonly decision: RuntimeApprovalDecision;
    readonly decidedBy: string;
    readonly decidedAt: string;
    readonly reason: string;
  }): Promise<StoredRuntimeCommandApproval>;
  getApproval(
    approvalId: string,
  ): Promise<StoredRuntimeCommandApproval | undefined>;
  appendHistory(
    entry: Omit<
      RuntimeCommandHistoryEntry,
      "historyId" | "entryHash" | "previousHash"
    >,
  ): Promise<RuntimeCommandHistoryEntry>;
  listHistory(input: {
    readonly tenantId: string;
    readonly limit: number;
  }): Promise<readonly RuntimeCommandHistoryEntry[]>;
}

export function createRuntimeCommandService(options: {
  readonly authorizer: Authorizer;
  readonly executor: RuntimeCommandExecutor;
  readonly store?: RuntimeCommandStore;
  readonly storeFor?: (context: VerifiedRequestContext) => RuntimeCommandStore;
  readonly now?: () => Date;
  readonly riskForKind?: (kind: string) => RuntimeCommandRisk;
}) {
  if (!options.store && !options.storeFor)
    throw new Error("Runtime command persistence is required");
  if (options.executor.effects !== "transactional")
    throw coded("CONTROL_ADMIN_TRANSACTIONAL_EXECUTOR_REQUIRED", 503);
  const now = options.now ?? (() => new Date());
  const riskForKind = options.riskForKind ?? defaultRiskForKind;
  function storeFor(context: VerifiedRequestContext): RuntimeCommandStore {
    try {
      const store = options.storeFor
        ? options.storeFor(context)
        : options.store;
      if (!store || typeof store.atomic !== "function")
        throw Error("transactional store required");
      return store;
    } catch {
      throw coded("CONTROL_ADMIN_RUNTIME_STORE_UNAVAILABLE", 503);
    }
  }
  function matchSubmission(
    existing: StoredRuntimeCommandSubmission | undefined,
    context: VerifiedRequestContext,
    fingerprint: string,
  ) {
    if (
      existing &&
      (existing.tenantId !== context.tenantId ||
        existing.planeKey !== context.planeKey ||
        existing.actorId !== context.principalId ||
        existing.fingerprint !== fingerprint)
    )
      throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
  }

  const preview = async (
    context: VerifiedRequestContext,
    command: RuntimeControlCommand,
    transaction?: RuntimeCommandTransaction,
  ): Promise<RuntimeCommandPreview> => {
    await permit(
      options.authorizer,
      context,
      controlAdminPermissions.runtimeCommandManage,
    );
    validateCommand(command);
    command = immutable(command);
    const result = await options.executor.preview({
      context,
      command,
      ...(transaction ? { transaction } : {}),
    });
    try {
      validJson(result.current);
      validJson(result.proposed);
      check(
        {
          type: "array",
          maxItems: 100,
          items: { type: "string", maxLength: 2000 },
        },
        result.warnings ?? [],
      );
    } catch {
      throw coded("CONTROL_ADMIN_RUNTIME_PREVIEW_INVALID", 503);
    }
    const risk = result.risk ?? riskForKind(command.kind);
    if (!["low", "medium", "high", "critical"].includes(risk))
      throw coded("CONTROL_ADMIN_RUNTIME_RISK_INVALID", 503);
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
    async submit(
      context: VerifiedRequestContext,
      command: RuntimeControlCommand,
    ): Promise<RuntimeCommandSubmission> {
      await permit(
        options.authorizer,
        context,
        controlAdminPermissions.runtimeCommandManage,
      );
      validateCommand(command);
      command = immutable(command);
      const store = storeFor(context);
      return store.atomic(
        context,
        `command:${command.idempotencyKey}`,
        async (store, transaction): Promise<RuntimeCommandSubmission> => {
          const fingerprint = commandFingerprint(context, command);
          const existing = await store.findSubmission(
            context.tenantId,
            command.idempotencyKey,
          );
          matchSubmission(existing, context, fingerprint);
          if (
            existing?.submission.outcome === "applied" ||
            existing?.submission.outcome === "replayed"
          ) {
            return { ...existing.submission, outcome: "replayed" };
          }
          if (
            existing?.submission.outcome === "pending" ||
            existing?.submission.outcome === "failed"
          )
            return existing.submission;

          const planned = await preview(context, command, transaction);
          if (
            planned.approvalRequired ||
            existing?.submission.approval ||
            command.approvalId
          ) {
            if (!command.approvalId) {
              if (existing?.submission.approval) {
                const currentApproval = await store.getApproval(
                  existing.submission.approval.approvalId,
                );
                if (
                  !currentApproval ||
                  currentApproval.tenantId !== context.tenantId ||
                  currentApproval.planeKey !== context.planeKey ||
                  currentApproval.requestedBy !== context.principalId
                )
                  throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
                return {
                  ...existing.submission,
                  approval: publicApproval(currentApproval),
                };
              }
              const requestedAt = now().toISOString();
              const approval: StoredRuntimeCommandApproval = {
                approvalId: deterministicApprovalId(planned.fingerprint),
                commandId: command.commandId,
                commandFingerprint: planned.fingerprint,
                previewFingerprint: previewFingerprint(planned),
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
                approval: publicApproval(approval),
              };
              await store.appendApprovalRequest(approval);
              const inserted = await store.appendSubmission({
                tenantId: context.tenantId,
                planeKey: context.planeKey,
                actorId: context.principalId,
                idempotencyKey: command.idempotencyKey,
                fingerprint: planned.fingerprint,
                submission,
              });
              if (!inserted) {
                const current = await store.findSubmission(
                  context.tenantId,
                  command.idempotencyKey,
                );
                matchSubmission(current, context, planned.fingerprint);
                if (!current)
                  throw coded("CONTROL_ADMIN_COMMAND_CLAIM_LOST", 503);
                return current.submission;
              }
              await history(
                store,
                context,
                command,
                planned.fingerprint,
                "submitted",
                now(),
                { risk: planned.risk },
              );
              await history(
                store,
                context,
                command,
                planned.fingerprint,
                "approval_requested",
                now(),
                { approvalId: approval.approvalId },
              );
              return submission;
            }
            const approval = await store.getApproval(command.approvalId);
            if (
              !approval ||
              approval.tenantId !== context.tenantId ||
              approval.planeKey !== context.planeKey
            )
              throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
            if (
              !approval.previewFingerprint ||
              approval.previewFingerprint !== previewFingerprint(planned)
            )
              throw coded("CONTROL_ADMIN_APPROVAL_PREVIEW_CHANGED", 409);
            if (
              approval.commandFingerprint !== planned.fingerprint ||
              approval.status !== "approved"
            ) {
              throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
            }
            if (approval.requestedBy !== context.principalId)
              throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 403);
          }

          const pending: RuntimeCommandSubmission = {
            outcome: "pending",
            commandId: command.commandId,
            fingerprint: planned.fingerprint,
          };
          const claimed = await store.appendSubmission({
            tenantId: context.tenantId,
            planeKey: context.planeKey,
            actorId: context.principalId,
            idempotencyKey: command.idempotencyKey,
            fingerprint: planned.fingerprint,
            submission: pending,
          });
          if (!claimed) {
            const current = await store.findSubmission(
              context.tenantId,
              command.idempotencyKey,
            );
            if (!current) throw coded("CONTROL_ADMIN_COMMAND_CLAIM_LOST", 503);
            matchSubmission(current, context, planned.fingerprint);
            return current.submission.outcome === "applied"
              ? { ...current.submission, outcome: "replayed" }
              : current.submission;
          }
          if (!existing)
            await history(
              store,
              context,
              command,
              planned.fingerprint,
              "submitted",
              now(),
              { risk: planned.risk },
            );
          const value = await options.executor.apply({
            context,
            command,
            preview: immutable(planned),
            transaction,
          });
          validJson(value);
          const submission: RuntimeCommandSubmission = {
            outcome: "applied",
            commandId: command.commandId,
            fingerprint: planned.fingerprint,
            value,
          };
          const inserted = await store.appendSubmission({
            tenantId: context.tenantId,
            planeKey: context.planeKey,
            actorId: context.principalId,
            idempotencyKey: command.idempotencyKey,
            fingerprint: planned.fingerprint,
            submission,
          });
          if (!inserted) {
            const current = await store.findSubmission(
              context.tenantId,
              command.idempotencyKey,
            );
            matchSubmission(current, context, planned.fingerprint);
            if (current?.submission.outcome !== "applied")
              throw coded("CONTROL_ADMIN_COMMAND_CLAIM_LOST", 503);
            return { ...current.submission, outcome: "replayed" };
          }
          await history(
            store,
            context,
            command,
            planned.fingerprint,
            "applied",
            now(),
            { approvalId: command.approvalId ?? null },
          );
          return submission;
        },
      );
    },
    async decideApproval(
      context: VerifiedRequestContext,
      approvalId: string,
      decision: RuntimeApprovalDecision,
      reason: string,
    ): Promise<RuntimeCommandApproval> {
      await permit(
        options.authorizer,
        context,
        controlAdminPermissions.runtimeCommandApprove,
      );
      const store = storeFor(context);
      check(controlAdminSchemas.runtimeApprovalParams, { id: approvalId });
      check(controlAdminSchemas.runtimeApprovalDecision, { decision, reason });
      return store.atomic(context, `approval:${approvalId}`, async (store) => {
        const approval = await store.getApproval(approvalId);
        if (
          !approval ||
          approval.tenantId !== context.tenantId ||
          approval.planeKey !== context.planeKey
        )
          throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
        if (approval.status !== "pending")
          throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
        if (approval.requestedBy === context.principalId)
          throw coded("CONTROL_ADMIN_SELF_APPROVAL_FORBIDDEN", 403);
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
        return publicApproval(decided);
      });
    },
    async history(context: VerifiedRequestContext, limit = 50) {
      await permit(
        options.authorizer,
        context,
        controlAdminPermissions.runtimeHistoryRead,
      );
      const store = storeFor(context);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
      const entries = await store.listHistory({
        tenantId: context.tenantId,
        limit,
      });
      if (
        entries.some(
          (e) =>
            e.tenantId !== context.tenantId || e.planeKey !== context.planeKey,
        )
      )
        throw coded("CONTROL_ADMIN_RUNTIME_HISTORY_SCOPE_INVALID", 503);
      return entries;
    },
  };
}

export type RuntimeCommandService = ReturnType<
  typeof createRuntimeCommandService
>;

export class InMemoryRuntimeCommandStore implements RuntimeCommandStore {
  readonly #submissions = new Map<string, StoredRuntimeCommandSubmission>();
  readonly #submissionOutcomes = new Set<string>();
  readonly #approvals = new Map<string, StoredRuntimeCommandApproval>();
  readonly #history: RuntimeCommandHistoryEntry[] = [];

  #tail: Promise<void> = Promise.resolve();
  async atomic<T>(
    _context: VerifiedRequestContext,
    _key: string,
    work: (
      store: RuntimeCommandStore,
      transaction: RuntimeCommandTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const submissions = new Map(this.#submissions),
      outcomes = new Set(this.#submissionOutcomes),
      approvals = new Map(this.#approvals),
      history = [...this.#history];
    try {
      return await work(this, { kind: "memory" });
    } catch (error) {
      this.#submissions.clear();
      for (const [k, v] of submissions) this.#submissions.set(k, v);
      this.#submissionOutcomes.clear();
      for (const v of outcomes) this.#submissionOutcomes.add(v);
      this.#approvals.clear();
      for (const [k, v] of approvals) this.#approvals.set(k, v);
      this.#history.splice(0, this.#history.length, ...history);
      throw error;
    } finally {
      release();
    }
  }
  async findSubmission(tenantId: string, key: string) {
    return this.#submissions.get(`${tenantId}\0${key}`);
  }
  async appendSubmission(record: StoredRuntimeCommandSubmission) {
    const key = `${record.tenantId}\0${record.idempotencyKey}`;
    const current = this.#submissions.get(key);
    if (
      current &&
      (current.fingerprint !== record.fingerprint ||
        current.actorId !== record.actorId ||
        current.planeKey !== record.planeKey)
    )
      throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
    const normalizedOutcome =
      record.submission.outcome === "replayed"
        ? "applied"
        : record.submission.outcome;
    const allowed = current
      ? current.submission.outcome === "approval_required"
        ? normalizedOutcome === "pending"
        : current.submission.outcome === "pending"
          ? normalizedOutcome === "applied" || normalizedOutcome === "failed"
          : false
      : normalizedOutcome === "approval_required" ||
        normalizedOutcome === "pending";
    if (!allowed) return false;
    const outcomeKey = `${key}\0${normalizedOutcome}`;
    if (this.#submissionOutcomes.has(outcomeKey)) return false;
    this.#submissionOutcomes.add(outcomeKey);
    const priority = {
      approval_required: 0,
      pending: 1,
      failed: 2,
      applied: 3,
      replayed: 3,
    } as const;
    if (
      !current ||
      priority[normalizedOutcome] >= priority[current.submission.outcome]
    )
      this.#submissions.set(key, immutable(record));
    return true;
  }
  async appendApprovalRequest(approval: StoredRuntimeCommandApproval) {
    const current = this.#approvals.get(approval.approvalId);
    if (current) {
      if (
        current.commandFingerprint !== approval.commandFingerprint ||
        current.requestedBy !== approval.requestedBy ||
        current.previewFingerprint !== approval.previewFingerprint
      )
        throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    this.#approvals.set(approval.approvalId, immutable(approval));
  }
  async appendApprovalDecision(input: {
    readonly approvalId: string;
    readonly decision: RuntimeApprovalDecision;
    readonly decidedBy: string;
    readonly decidedAt: string;
    readonly reason: string;
  }) {
    const current = this.#approvals.get(input.approvalId);
    if (!current || current.status !== "pending")
      throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
    const decided: StoredRuntimeCommandApproval = immutable({
      ...current,
      status: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      decisionReason: input.reason,
    });
    this.#approvals.set(input.approvalId, decided);
    return decided;
  }
  async getApproval(id: string) {
    return this.#approvals.get(id);
  }
  async appendHistory(
    input: Omit<
      RuntimeCommandHistoryEntry,
      "historyId" | "entryHash" | "previousHash"
    >,
  ) {
    let previousHash: string | undefined;
    for (let index = this.#history.length - 1; index >= 0; index -= 1) {
      const entry = this.#history[index]!;
      if (
        entry.tenantId === input.tenantId &&
        entry.planeKey === input.planeKey
      ) {
        previousHash = entry.entryHash;
        break;
      }
    }
    const historyId = randomUUID();
    const entryHash = sha256(
      canonical({ ...input, historyId, previousHash: previousHash ?? null }),
    );
    const entry: RuntimeCommandHistoryEntry = immutable({
      ...input,
      historyId,
      ...(previousHash ? { previousHash } : {}),
      entryHash,
    });
    this.#history.push(entry);
    return entry;
  }
  async listHistory(input: {
    readonly tenantId: string;
    readonly limit: number;
  }) {
    return this.#history
      .filter((entry) => entry.tenantId === input.tenantId)
      .slice(-input.limit)
      .reverse();
  }
}

export function createRuntimeCommandDiff(
  current: JsonValue,
  proposed: JsonValue,
): readonly RuntimeCommandDiffEntry[] {
  const entries: RuntimeCommandDiffEntry[] = [];
  diffValue(current, proposed, "", entries);
  return entries;
}

function diffValue(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  path: string,
  entries: RuntimeCommandDiffEntry[],
): void {
  if (canonical(before) === canonical(after)) return;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort())
      diffValue(
        Object.hasOwn(before, key) ? before[key] : undefined,
        Object.hasOwn(after, key) ? after[key] : undefined,
        `${path}/${escapePointer(key)}`,
        entries,
      );
    return;
  }
  entries.push({
    operation:
      before === undefined ? "add" : after === undefined ? "remove" : "replace",
    path,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  });
}

function defaultRiskForKind(kind: string): RuntimeCommandRisk {
  if (
    /\.(delete|retire|deprecate|publish|activate)$/.test(kind) ||
    kind.includes("desired_state")
  )
    return "high";
  if (/\.(expire|suspend|override|save|set)$/.test(kind)) return "medium";
  // Unknown mutation kinds fail toward approval until explicitly classified by their handler.
  return "high";
}

function validateCommand(command: RuntimeControlCommand): void {
  check(controlAdminSchemas.runtimeCommand, command);
  validJson(command.payload);
}
function check(schema: RuntimeSchema, value: unknown) {
  try {
    validateRuntimeSchema(schema, value);
  } catch {
    throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
  }
}
function validJson(value: unknown): void {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(v: unknown, depth: number) {
    if (++nodes > 10000 || depth > 64)
      throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (
      !v ||
      typeof v !== "object" ||
      seen.has(v) ||
      (!Array.isArray(v) &&
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null)
    )
      throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(v, i))
          throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
        visit(v[i], depth + 1);
      }
    } else {
      if (Object.getOwnPropertySymbols(v).length)
        throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(v),
      )) {
        if (!("value" in descriptor))
          throw coded("CONTROL_ADMIN_INVALID_COMMAND", 400);
        visit(descriptor.value, depth + 1);
      }
    }
    seen.delete(v);
  }
  visit(value, 0);
}
function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(v: unknown) {
    if (v && typeof v === "object") {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
  }
  freeze(copy);
  return copy;
}
function publicApproval(
  value: StoredRuntimeCommandApproval,
): RuntimeCommandApproval {
  const { kind, tenantId, planeKey, ...approval } = value;
  return approval;
}
function previewFingerprint(preview: RuntimeCommandPreview) {
  return sha256(
    canonical({
      current: preview.current,
      proposed: preview.proposed,
      risk: preview.risk,
      warnings: preview.warnings,
    }),
  );
}

function commandFingerprint(
  context: VerifiedRequestContext,
  command: RuntimeControlCommand,
): string {
  return sha256(
    canonical({
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      kind: command.kind,
      reason: command.reason.trim(),
      payload: command.payload,
      expectedVersion: command.expectedVersion ?? null,
      planeKey: context.planeKey,
      tenantId: context.tenantId,
    }),
  );
}

function deterministicApprovalId(fingerprint: string): string {
  const hex = sha256(`control-runtime-approval:${fingerprint}`)
    .slice(0, 32)
    .split("");
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
  await store.appendHistory({
    commandId: command.commandId,
    kind: command.kind,
    event,
    planeKey: context.planeKey,
    tenantId: context.tenantId,
    actorId: context.principalId,
    reason: command.reason.trim(),
    fingerprint,
    detail,
    occurredAt: at.toISOString(),
  });
}

async function permit(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  permissionCode: string,
): Promise<void> {
  if (!(await authorizer.authorize({ context, permissionCode })).allowed)
    throw coded("CONTROL_ADMIN_PERMISSION_DENIED", 403);
}
function isObject(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function coded(code: string, status: number): HttpError {
  return new HttpError(status, code, code);
}
