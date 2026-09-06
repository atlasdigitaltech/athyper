import { parseInstant } from "@athyper/platform-temporal";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { PolicyService } from "@athyper/server-contract-policy";
import type { CreateWorkItemCommand, WorkflowRepository, WorkflowService, WorkItem, WorkItemActionCommand, WorkItemActionResult } from "@athyper/server-contract-workflow";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { WorkflowError } from "./errors.js";

const PERMISSIONS = {
  create: "workflow.work_item.create", read: "workflow.work_item.read", claim: "workflow.work_item.claim",
  complete: "workflow.work_item.complete", cancel: "workflow.work_item.cancel",
} as const;

export interface WorkflowServiceOptions<Transaction> {
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly repository: WorkflowRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly policy?: PolicyService<Transaction>;
}

export function createWorkflowService<Transaction>(options: WorkflowServiceOptions<Transaction>): WorkflowService {
  return {
    async create(command) {
      if (!await allowed(options.authorizer, command.context, PERMISSIONS.create)) return forbidden(PERMISSIONS.create);
      validateCreate(command);
      const descriptor = await options.metadata.getEntityDescriptor(command.context, command.sourceEntityCode);
      if (!descriptor) throw new WorkflowError(404, "ENTITY_DESCRIPTOR_NOT_FOUND", `No active descriptor for ${command.sourceEntityCode}`);
      if (command.sourceActionCode && !descriptor.operations[command.sourceActionCode]
        && !descriptor.lifecycle?.transitions.some((transition) => transition.code === command.sourceActionCode)) {
        throw new WorkflowError(422, "SOURCE_ACTION_NOT_PUBLISHED", `Action is not published: ${command.sourceActionCode}`);
      }
      return inTransaction(options, command.context, async (transaction) => {
        const policyBindings = (descriptor.policyBindings ?? []).filter((binding) =>
          (!binding.operationCode || binding.operationCode === command.sourceActionCode)
          && ["authorization", "precondition", "validation"].includes(binding.stage));
        let evaluatedCommand = command;
        if (policyBindings.length) {
          if (!options.policy) throw new WorkflowError(503, "POLICY_SERVICE_UNAVAILABLE", "Published workflow policy bindings require the Policy service");
          const decision = await options.policy.evaluate({ context: command.context, entityType: command.sourceEntityCode, entityId: command.sourceEntityId, facts: { ...(command.payload ?? {}), work_type_code: command.workTypeCode, source_action_code: command.sourceActionCode ?? null }, policyDefinitionIds: policyBindings.map((binding) => binding.policyDefinitionId), pipelineId: "workflow.work_item.create" }, transaction);
          for (const binding of policyBindings) {
            const evaluated = decision.evaluatedPolicies.find((policy) => policy.id === binding.policyDefinitionId);
            if (!evaluated || evaluated.versionNo !== binding.policyVersionNo) throw new WorkflowError(503, "POLICY_VERSION_UNAVAILABLE", `Required policy revision is unavailable: ${binding.key}`);
          }
          const enforcedIds = new Set(policyBindings.filter((binding) => binding.enforcement === "enforce").map((binding) => binding.policyDefinitionId));
          const denials = decision.outcomes.filter((outcome) => outcome.action === "deny" && enforcedIds.has(outcome.policyId));
          if (denials.length) return { kind: "PolicyDenied", policyIds: [...new Set(denials.map((outcome) => outcome.policyId))], ...(denials[0]?.explanation ? { reason: denials[0].explanation } : {}) };
          evaluatedCommand = { ...command, payload: { ...(command.payload ?? {}), policy_evaluation: { action: decision.action, evaluated: decision.evaluatedPolicies, matched_rule_ids: decision.outcomes.map((outcome) => outcome.ruleId) } } };
        }
        const item = await options.repository.create({ command: evaluatedCommand, descriptor }, transaction);
        await sideEffects(options, command.context, item, "created", transaction, command.idempotencyKey);
        return { kind: "Committed", workItem: item };
      });
    },
    async listInbox(query) {
      if (!await allowed(options.authorizer, query.context, PERMISSIONS.read)) throw new WorkflowError(403, "FORBIDDEN", "Workflow inbox is not permitted");
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkflowError(400, "INVALID_LIMIT", "Inbox limit must be between 1 and 100");
      return inTransaction(options, query.context, (transaction) => options.repository.listInbox({ ...query, limit }, transaction));
    },
    claim: (command) => action(options, command, "claim", PERMISSIONS.claim, false),
    complete: (command) => action(options, command, "complete", PERMISSIONS.complete, false),
    cancel: (command) => action(options, command, "cancel", PERMISSIONS.cancel, false),
    act: (command) => action(options, command, command.action, permissionFor(command.action), true),
    async getRequestContext(context, requestId) {
      if (!await allowed(options.authorizer, context, PERMISSIONS.read)) throw new WorkflowError(403, "FORBIDDEN", "Workflow request context is not permitted");
      return inTransaction(options, context, (transaction) => options.repository.getRequestContext?.(context.tenantId, requestId, transaction) ?? Promise.resolve(null));
    },
  };
}

async function action<Transaction>(options: WorkflowServiceOptions<Transaction>, command: WorkItemActionCommand, actionName: string, permission: string, strict: boolean): Promise<WorkItemActionResult> {
  if (!await allowed(options.authorizer, command.context, permission)) return forbidden(permission);
  if (strict && !command.idempotencyKey) throw new WorkflowError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required for workflow actions");
  return inTransaction(options, command.context, async (transaction) => {
    const current = await options.repository.get(command.context.tenantId, command.workItemId, transaction);
    if (!current) return { kind: "NotFound", workItemId: command.workItemId };
    const expected = command.expectedRowVersion ?? current.rowVersion;
    const descriptor = await options.metadata.getEntityDescriptor(command.context, current.sourceEntityCode);
    if (!descriptor) return { kind: "Conflict", reason: "The active workflow revision is unavailable" };
    const revision = current.workflowRevision ?? revisionFromPayload(current.payload);
    if (revision && descriptor.compiledHash !== revision.artifactHash) return { kind: "Conflict", reason: "The work item workflow revision is no longer active" };
    const policyBindings = (descriptor.policyBindings ?? []).filter((binding) => !binding.operationCode || binding.operationCode === actionName);
    if (policyBindings.length) {
      if (!options.policy) throw new WorkflowError(503, "POLICY_SERVICE_UNAVAILABLE", "Workflow action policy re-evaluation is unavailable");
      const decision = await options.policy.evaluate({ context: command.context, entityType: current.sourceEntityCode, entityId: current.sourceEntityId, facts: { ...current.payload, ...(command.outcome ?? {}), workflow_action: actionName }, policyDefinitionIds: policyBindings.map((binding) => binding.policyDefinitionId), pipelineId: `workflow.work_item.${actionName}` }, transaction);
      const denials = decision.outcomes.filter((outcome) => outcome.action === "deny");
      if (denials.length) return { kind: "PolicyDenied", policyIds: [...new Set(denials.map((denial) => denial.policyId))], ...(denials[0]?.explanation ? { reason: denials[0].explanation } : {}) };
    }
    const item = await options.repository.action(command.context.tenantId, command.workItemId, command.context.principalId, actionName, expected, command.outcome ?? {}, transaction);
    if (!item) return { kind: "Conflict", reason: `Work item cannot be ${actionName}ed from its current state or assignment` };
    const eventAction = actionName === "complete" || actionName === "approve" || actionName === "reject" ? "completed" : actionName === "claim" ? "claimed" : "cancelled";
    await sideEffects(options, command.context, item, eventAction, transaction, command.idempotencyKey);
    return { kind: "Committed", workItem: item };
  });
}

function permissionFor(action: string): string { return `workflow.work_item.${action}`; }
function revisionFromPayload(payload: Readonly<Record<string, unknown>>) { const value = payload["workflow_revision"]; if (!value || typeof value !== "object" || Array.isArray(value)) return undefined; const row = value as Record<string, unknown>; return typeof row["definitionCode"] === "string" && typeof row["version"] === "number" && typeof row["artifactHash"] === "string" ? { definitionCode: row["definitionCode"], version: row["version"], artifactHash: row["artifactHash"] } : undefined; }

async function sideEffects<Transaction>(options: WorkflowServiceOptions<Transaction>, context: VerifiedRequestContext, item: WorkItem, eventAction: "created" | "claimed" | "completed" | "cancelled", transaction: Transaction, idempotencyKey?: string): Promise<void> {
  const eventType = `workflow.work_item.${eventAction}`;
  await options.outbox.append({ tenantId: context.tenantId, topic: "workflow", eventType, ...(idempotencyKey ? { eventKey: idempotencyKey } : {}), entityType: item.sourceEntityCode, entityId: item.sourceEntityId, aggregateType: "workflow.work_item", aggregateId: item.id, actorId: context.principalId, payload: { work_item_id: item.id, title: item.title, status: item.status, priority: item.priority, due_at: item.dueAt ?? null, source_action_code: item.sourceActionCode ?? null, entity_type: item.sourceEntityCode, entity_id: item.sourceEntityId, recipient_principal_ids: item.assigneePrincipalId ? [item.assigneePrincipalId] : [] } }, transaction);
  const actionName = eventAction === "created" ? "create" : eventAction === "claimed" ? "claim" : eventAction === "completed" ? "complete" : "cancel";
  await options.audit.record({ eventCode: eventType, action: actionName, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: "workflow.work_item", entityId: item.id, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}) }, transaction);
}

function validateCreate(command: CreateWorkItemCommand): void {
  if (!/^[a-z][a-z0-9_.:-]{1,126}$/.test(command.workTypeCode)) throw new WorkflowError(400, "INVALID_WORK_TYPE", "Invalid workflow work type code");
  if (!command.title.trim()) throw new WorkflowError(400, "INVALID_TITLE", "Work item title is required");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.sourceEntityId)) throw new WorkflowError(400, "INVALID_SOURCE_ID", "Source entity id must be a UUID");
  if (command.assigneePrincipalId && command.assigneeTeamId) throw new WorkflowError(400, "AMBIGUOUS_ASSIGNMENT", "Assign a principal or a team, not both");
  for (const [name, value] of [["assigneePrincipalId", command.assigneePrincipalId], ["assigneeTeamId", command.assigneeTeamId]] as const) {
    if (value && !isUuid(value)) throw new WorkflowError(400, "INVALID_ASSIGNMENT", `${name} must be a UUID`);
  }
  const available = command.availableAt ? parseInstant(command.availableAt) : Date.now();
  const due = command.dueAt ? parseInstant(command.dueAt) : undefined;
  if (!Number.isFinite(available) || (due !== undefined && (!Number.isFinite(due) || due < available))) throw new WorkflowError(400, "INVALID_SCHEDULE", "Due time must be valid and not precede availability");
}

function inTransaction<Transaction, Result>(options: WorkflowServiceOptions<Transaction>, context: VerifiedRequestContext, work: (transaction: Transaction) => Promise<Result>): Promise<Result> {
  return options.transactions.run(context.planeKey, { tenantId: context.tenantId, principalId: context.principalId }, work);
}
async function allowed(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<boolean> { return (await authorizer.authorize({ context, permissionCode })).allowed; }
function forbidden(permissionCode: string): WorkItemActionResult { return { kind: "Forbidden", permissionCode }; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
