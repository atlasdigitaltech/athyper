import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  CompiledWorkflowDefinition,
  ApproverResolutionEvidence,
  WorkflowStageDraft,
} from "@athyper/server-contract-workflow";
import {
  createNeonApprovalService,
  type ApprovalPersistence,
} from "./approvals.js";
import { WorkflowError } from "./errors.js";
import { filterTaskCandidates } from "./task-governance.js";

/** Domain-free stage runner. The caller owns transaction locking, document gates and task outcomes. */
export function createTaskApprovalRunner<T>(ports: {
  persistence: ApprovalPersistence<T>;
  resolve(
    stage: WorkflowStageDraft,
    transaction: T,
  ): Promise<ApproverResolutionEvidence>;
  now?: () => Date;
}) {
  const approvals = createNeonApprovalService(ports.persistence, ports.now);

  async function resolveLevel(
    stage: WorkflowStageDraft,
    makerIds: readonly string[],
    tx: T,
  ) {
    if (stage.rules?.length)
      throw new WorkflowError(
        409,
        "TASK_RULE_UNSUPPORTED",
        "Conditional levels require a configured workflow rule owner",
      );
    const resolved = await ports.resolve(stage, tx);
    const filterEvidence = filterTaskCandidates({ responsibility: stage.code,
      candidates: resolved.candidates.map(c => ({ ...c, eligible: true })), makerIds, quorum: stage.quorum });
    const candidates = filterEvidence.eligiblePrincipalIds.map(id => resolved.candidates.find(c => c.principalId === id)!);
    return { ...resolved, candidates, filterEvidence };
  }
  return {
    async start(
      input: {
        tenantId: string;
        taskId: string;
        makerIds: readonly string[];
        definition: CompiledWorkflowDefinition;
      },
      tx: T,
    ) {
      if (!input.definition.stages.length)
        throw new WorkflowError(
          409,
          "TASK_WORKFLOW_EMPTY",
          "Task workflow has no levels",
        );
      const stages: ApprovalRequest["stages"][number][] = [];
      for (const stage of input.definition.stages) {
        const eligibilityEvidence = await resolveLevel(
          stage,
          input.makerIds,
          tx,
        );
        stages.push({
          id: randomUUID(),
          code: stage.code,
          status: stages.length ? "pending" : "active",
          quorum: stage.quorum,
          eligibilityEvidence,
          votes: [],
        });
      }
      return approvals.create(
        {
          id: randomUUID(),
          tenantId: input.tenantId,
          entityType: "cycle_task",
          entityId: input.taskId,
          revision: {
            definitionCode: input.definition.code,
            version: input.definition.version,
            artifactHash: input.definition.artifactHash,
          },
          status: "pending",
          stages,
        },
        tx,
      );
    },
    async accept(
      input: {
        tenantId: string;
        definition: CompiledWorkflowDefinition;
        workflowRequestId: string;
        workflowStageId: string;
        principalId: string;
        makerIds: readonly string[];
      },
      tx: T,
    ) {
      if (input.makerIds.includes(input.principalId))
        throw new WorkflowError(
          403,
          "TASK_MAKER_CHECKER",
          "The maker cannot decide this task",
        );
      const levelApprovals = createNeonApprovalService(
        ports.persistence,
        ports.now,
        async (stage, transaction) => {
          const draft = input.definition.stages.find(
            (s) => s.code === stage.code,
          );
          if (!draft)
            throw new WorkflowError(
              409,
              "TASK_LEVEL_NOT_PINNED",
              "Level is not in the pinned definition",
            );
          return {
            ...stage,
            eligibilityEvidence: await resolveLevel(
              draft,
              input.makerIds,
              transaction,
            ),
          };
        },
      );
      const result = await levelApprovals.decide(
        input.tenantId,
        input.workflowRequestId,
        input.workflowStageId,
        input.principalId,
        "approved",
        tx,
      );
      if (!result)
        throw new WorkflowError(
          409,
          "TASK_VOTE_NOT_ACTIONABLE",
          "Level is inactive, reviewer is ineligible, or vote already exists",
        );
      return {
        request: result,
        outcome:
          result.status === "approved"
            ? ("task_accepted" as const)
            : ("pending" as const),
      };
    },
  };
}
