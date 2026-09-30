import type {
  EntityChangeCaseCreateCommand,
  EntityChangeCaseDecisionCommand,
  EntityChangeCaseRecord,
  EntityChangeCaseStatus,
  EntityChangeCaseVersionedCommand,
} from "@athyper/server-contract-entity-governance";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface EntityChangeCaseRepository<Transaction = unknown> {
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, transaction: Transaction): Promise<EntityChangeCaseRecord | null>;
  create(input: Omit<EntityChangeCaseRecord, "id" | "rowVersion" | "status"> & { readonly idempotencyKey: string }, transaction: Transaction): Promise<EntityChangeCaseRecord>;
  get(tenantId: string, caseId: string, transaction: Transaction): Promise<EntityChangeCaseRecord | null>;
  transition(input: { readonly tenantId: string; readonly caseId: string; readonly expectedVersion: number; readonly status: EntityChangeCaseStatus; readonly actorId: string; readonly decision?: "approve" | "reject" | "return" }, transaction: Transaction): Promise<EntityChangeCaseRecord | null>;
}

export interface EntityChangeCaseMetadata {
  readonly entityCode: string;
  readonly operationKey: string;
  readonly caseKind: string;
  readonly releaseId: string;
  readonly hash: string;
  readonly workflowKey?: string;
  readonly materializationBindingKey?: string;
}

export interface EntityChangeCasePolicy<Transaction = unknown> {
  admitCreate(input: { readonly command: EntityChangeCaseCreateCommand; readonly metadata: EntityChangeCaseMetadata }, transaction: Transaction): Promise<void>;
  validate(input: { readonly record: EntityChangeCaseRecord; readonly metadata: EntityChangeCaseMetadata }, transaction: Transaction): Promise<void>;
  admitDecision?(input: { readonly command: EntityChangeCaseDecisionCommand; readonly record: EntityChangeCaseRecord; readonly metadata: EntityChangeCaseMetadata }, transaction: Transaction): Promise<void>;
}

export interface EntityChangeCaseMaterializer<Transaction = unknown> {
  materialize(input: { readonly context: VerifiedRequestContext; readonly record: EntityChangeCaseRecord; readonly metadata: EntityChangeCaseMetadata }, transaction: Transaction): Promise<Readonly<Record<string, unknown>>>;
}

export interface EntityChangeCaseEventWriter<Transaction = unknown> {
  append(input: { readonly context: VerifiedRequestContext; readonly event: "created" | "submitted" | "approved" | "rejected" | "returned" | "materialized"; readonly record: EntityChangeCaseRecord; readonly detail?: Readonly<Record<string, unknown>> }, transaction: Transaction): Promise<void>;
}

export function createEntityChangeCaseService<Transaction>(options: {
  readonly repository: EntityChangeCaseRepository<Transaction>;
  readonly metadata: { resolve(command: Pick<EntityChangeCaseCreateCommand, "context" | "entityCode" | "operationKey" | "caseKind">): Promise<EntityChangeCaseMetadata> };
  readonly policy: EntityChangeCasePolicy<Transaction>;
  readonly materializers: { get(key: string): EntityChangeCaseMaterializer<Transaction> | undefined };
  readonly events: EntityChangeCaseEventWriter<Transaction>;
  readonly transactions: { run<T>(planeKey: string, context: VerifiedRequestContext, work: (transaction: Transaction) => Promise<T>): Promise<T> };
}) {
  return Object.freeze({
    async create(command: EntityChangeCaseCreateCommand) {
      return options.transactions.run(command.context.planeKey, command.context, async (transaction) => {
        const metadata = await options.metadata.resolve(command);
        assertMetadata(command, metadata);
        const existing = await options.repository.findByIdempotencyKey(command.context.tenantId, command.idempotencyKey, transaction);
        if (existing) return Object.freeze({ record: existing, replayed: true });
        await options.policy.admitCreate({ command, metadata }, transaction);
        const record = await options.repository.create({ tenantId: command.context.tenantId, entityCode: command.entityCode, operationKey: command.operationKey, caseKind: command.caseKind, ...(command.targetRecordId ? { targetRecordId: command.targetRecordId } : {}), payload: command.payload, metadataReleaseId: metadata.releaseId, metadataHash: metadata.hash, createdBy: command.context.principalId, idempotencyKey: command.idempotencyKey }, transaction);
        await options.events.append({ context: command.context, event: "created", record }, transaction);
        return Object.freeze({ record, replayed: false });
      });
    },
    async submit(command: EntityChangeCaseVersionedCommand) {
      return options.transactions.run(command.context.planeKey, command.context, async (transaction) => {
        const current = await requireCase(options.repository, command.context.tenantId, command.caseId, transaction);
        assertVersion(current, command.expectedVersion);
        if (!["draft", "returned"].includes(current.status)) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_NOT_SUBMITTABLE");
        const record = await options.repository.transition({ tenantId: current.tenantId, caseId: current.id, expectedVersion: current.rowVersion, status: "pending_approval", actorId: command.context.principalId }, transaction);
        if (!record) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_CONFLICT");
        await options.events.append({ context: command.context, event: "submitted", record }, transaction);
        return record;
      });
    },
    async decide(command: EntityChangeCaseDecisionCommand) {
      return options.transactions.run(command.context.planeKey, command.context, async (transaction) => {
        const current = await requireCase(options.repository, command.context.tenantId, command.caseId, transaction);
        assertVersion(current, command.expectedVersion);
        const metadata = await options.metadata.resolve({ context: command.context, entityCode: current.entityCode, operationKey: current.operationKey, caseKind: current.caseKind });
        await options.policy.admitDecision?.({ command, record: current, metadata }, transaction);
        const status = command.decision === "approve" ? "approved" : command.decision === "reject" ? "rejected" : "returned";
        const record = await options.repository.transition({ tenantId: current.tenantId, caseId: current.id, expectedVersion: current.rowVersion, status, actorId: command.context.principalId, decision: command.decision }, transaction);
        if (!record) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_CONFLICT");
        await options.events.append({ context: command.context, event: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "returned", record }, transaction);
        return record;
      });
    },
    async materialize(command: EntityChangeCaseVersionedCommand) {
      return options.transactions.run(command.context.planeKey, command.context, async (transaction) => {
        const current = await requireCase(options.repository, command.context.tenantId, command.caseId, transaction);
        assertVersion(current, command.expectedVersion);
        if (current.status !== "approved") throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_NOT_APPROVED");
        const metadata = await options.metadata.resolve({ context: command.context, entityCode: current.entityCode, operationKey: current.operationKey, caseKind: current.caseKind });
        await options.policy.validate({ record: current, metadata }, transaction);
        const key = metadata.materializationBindingKey;
        const materializer = key ? options.materializers.get(key) : undefined;
        if (!materializer) throw new EntityChangeCaseError(503, "ENTITY_CHANGE_CASE_MATERIALIZER_UNAVAILABLE");
        const result = await materializer.materialize({ context: command.context, record: current, metadata }, transaction);
        const record = await options.repository.transition({ tenantId: current.tenantId, caseId: current.id, expectedVersion: current.rowVersion, status: "applied", actorId: command.context.principalId }, transaction);
        if (!record) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_CONFLICT");
        await options.events.append({ context: command.context, event: "materialized", record, detail: result }, transaction);
        return Object.freeze({ record, result });
      });
    },
  });
}

export class EntityChangeCaseError extends Error { constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string) { super(code); } }
async function requireCase<T>(repository: EntityChangeCaseRepository<T>, tenantId: string, caseId: string, transaction: T) { const record = await repository.get(tenantId, caseId, transaction); if (!record) throw new EntityChangeCaseError(404, "ENTITY_CHANGE_CASE_NOT_FOUND"); return record; }
function assertVersion(record: EntityChangeCaseRecord, expectedVersion: number) { if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || record.rowVersion !== expectedVersion) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_CONFLICT"); }
function assertMetadata(command: EntityChangeCaseCreateCommand, metadata: EntityChangeCaseMetadata) { if (metadata.entityCode !== command.entityCode || metadata.operationKey !== command.operationKey || metadata.caseKind !== command.caseKind || metadata.releaseId !== command.metadataReleaseId || metadata.hash !== command.metadataHash) throw new EntityChangeCaseError(409, "ENTITY_CHANGE_CASE_METADATA_CHANGED"); }
