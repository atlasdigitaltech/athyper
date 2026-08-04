import type {
  MetaEntityCheckpointCommand,
  MetaEntityCheckpointResult,
  MetaEntityClassProfile,
  MetaEntityContractTestResult,
  MetaEntityContractTestRun,
  MetaEntityContractTestRunCommand,
  MetaEntityNumberingPreviewCommand,
  MetaEntityNumberingTestArtifact,
  MetaEntityActivityItem,
  MetaEntityChangeSetSummary,
  MetaEntityCreateChangeSetCommand,
  MetaEntityCreateCommand,
  MetaEntityPhase2Graph,
  MetaEntityModuleCoordinate,
  MetaEntityPolicyDefinitionRef,
  MetaEntityPublishCommand,
  MetaEntityReleaseResult,
  MetaEntityReleaseSummary,
  MetaEntitySaveCommand,
  MetaEntitySaveResult,
  MetaEntitySummary,
  MetaEntityValidationResult,
  MetaEntityWorkflowCommand,
  NumberingPolicyTestCommand,
  NumberingPolicyTestResult,
} from "@athyper/meta-entity-authoring-contracts";
import { canonicalizeMetaEntityGraph, validateMetaEntityGraph } from "./meta-entity-graph.js";
import { runMetaEntityContractTests, type ContractTestExecution } from "./contract-test-runner.js";

export interface MetaEntityActorContext {
  tenantId: string;
  principalId: string;
  correlationId?: string;
  requestId?: string;
  /** Internal build tooling only. Tenant/browser callers must never set this. */
  authority?: "tenant" | "central_package";
}

export type MetaEntityWorkflowAction = "submit" | "return_to_draft" | "approve" | "reject" | "abandon";

export type MetaEntityGuardedAction = "review" | "publish" | "rollback" | "retire";

export interface MetaEntitySeparationOfDutiesFacts {
  entityTenantId: string | null;
  createdBy: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  latestRevisionCapturedBy: string | null;
  latestReleasePublishedBy: string | null;
  rollbackTargetPublishedBy: string | null;
}

export interface MetaEntityNumberingPolicyTester {
  test(command: NumberingPolicyTestCommand): Promise<NumberingPolicyTestResult>;
}

export interface MetaEntityNumberingTestExecution {
  bindingContract: Readonly<Record<string, unknown>>;
  policyTest: NumberingPolicyTestResult | null;
  previewInput: NumberingPreviewCommandInput;
  status: "passed" | "failed";
  diagnosticCodes: readonly string[];
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
}

type NumberingPreviewCommandInput = Pick<MetaEntityNumberingPreviewCommand, "nextValue" | "occurredAt" | "scopeKey" | "fiscalYear">;

export interface MetaEntityAuthoringRepository {
  listModuleCoordinates(context: MetaEntityActorContext): Promise<readonly MetaEntityModuleCoordinate[]>;
  listClassProfiles(context: MetaEntityActorContext): Promise<readonly MetaEntityClassProfile[]>;
  listPolicyDefinitions(context: MetaEntityActorContext): Promise<readonly MetaEntityPolicyDefinitionRef[]>;
  listEntities(context: MetaEntityActorContext): Promise<readonly MetaEntitySummary[]>;
  createEntity(context: MetaEntityActorContext, command: MetaEntityCreateCommand): Promise<MetaEntitySummary>;
  listChangeSets(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityChangeSetSummary[]>;
  createChangeSet(
    context: MetaEntityActorContext,
    command: MetaEntityCreateChangeSetCommand,
  ): Promise<MetaEntityChangeSetSummary>;
  loadGraph(context: MetaEntityActorContext, changeSetId: string): Promise<MetaEntityPhase2Graph | null>;
  saveGraph(
    context: MetaEntityActorContext,
    command: MetaEntitySaveCommand,
  ): Promise<{ lockVersion: number; graph: MetaEntityPhase2Graph }>;
  checkpoint(
    context: MetaEntityActorContext,
    command: MetaEntityCheckpointCommand,
    canonicalContract: unknown,
    diagnostics: MetaEntityValidationResult["diagnostics"],
  ): Promise<MetaEntityCheckpointResult>;
  listRevisions(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityCheckpointResult[]>;
  diffRevisions(context: MetaEntityActorContext, leftRevisionId: string, rightRevisionId: string): Promise<readonly string[]>;
  transition(
    context: MetaEntityActorContext,
    action: MetaEntityWorkflowAction,
    command: MetaEntityWorkflowCommand,
  ): Promise<MetaEntityChangeSetSummary>;
  publish(context: MetaEntityActorContext, command: MetaEntityPublishCommand): Promise<MetaEntityReleaseResult>;
  listReleases(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityReleaseSummary[]>;
  listActivity(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityActivityItem[]>;
  persistContractTestRun(context: MetaEntityActorContext, command: MetaEntityContractTestRunCommand, execution: ContractTestExecution): Promise<MetaEntityContractTestRun>;
  listContractTestRuns(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityContractTestRun[]>;
  listContractTestResults(context: MetaEntityActorContext, testRunId: string): Promise<readonly MetaEntityContractTestResult[]>;
  persistNumberingTestArtifact(context: MetaEntityActorContext, command: MetaEntityNumberingPreviewCommand, execution: MetaEntityNumberingTestExecution): Promise<MetaEntityNumberingTestArtifact>;
  listNumberingTestArtifacts(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityNumberingTestArtifact[]>;
  loadSeparationOfDutiesFacts(
    context: MetaEntityActorContext,
    changeSetId: string,
    rollbackOfReleaseId?: string,
  ): Promise<MetaEntitySeparationOfDutiesFacts>;
}

export class MetaEntityAuthoringError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "MetaEntityAuthoringError";
  }
}

export class MetaEntityAuthoringService {
  constructor(
    private readonly repository: MetaEntityAuthoringRepository,
    private readonly numberingTesters: Partial<Record<"neon" | "mesh", MetaEntityNumberingPolicyTester>> = {},
  ) {}

  listModuleCoordinates(context: MetaEntityActorContext): Promise<readonly MetaEntityModuleCoordinate[]> {
    return this.repository.listModuleCoordinates(context);
  }

  listClassProfiles(context: MetaEntityActorContext): Promise<readonly MetaEntityClassProfile[]> {
    return this.repository.listClassProfiles(context);
  }

  listPolicyDefinitions(context: MetaEntityActorContext): Promise<readonly MetaEntityPolicyDefinitionRef[]> {
    return this.repository.listPolicyDefinitions(context);
  }

  listEntities(context: MetaEntityActorContext): Promise<readonly MetaEntitySummary[]> {
    return this.repository.listEntities(context);
  }

  createEntity(context: MetaEntityActorContext, command: MetaEntityCreateCommand): Promise<MetaEntitySummary> {
    return this.repository.createEntity(context, command);
  }

  listChangeSets(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityChangeSetSummary[]> {
    return this.repository.listChangeSets(context, entityId);
  }

  createChangeSet(
    context: MetaEntityActorContext,
    command: MetaEntityCreateChangeSetCommand,
  ): Promise<MetaEntityChangeSetSummary> {
    return this.repository.createChangeSet(context, command);
  }

  async getGraph(context: MetaEntityActorContext, changeSetId: string): Promise<MetaEntityPhase2Graph> {
    const graph = await this.repository.loadGraph(context, changeSetId);
    if (!graph) throw new MetaEntityAuthoringError("CHANGE_SET_NOT_FOUND", "Entity change set was not found.", 404);
    return graph;
  }

  async saveGraph(context: MetaEntityActorContext, command: MetaEntitySaveCommand): Promise<MetaEntitySaveResult> {
    const diagnostics = validateMetaEntityGraph(command.graph);
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      throw new MetaEntityAuthoringError(
        "GRAPH_INVALID",
        "The Entity graph has validation problems.",
        422,
        diagnostics,
      );
    }
    const result = await this.repository.saveGraph(context, command);
    return { changeSetId: command.changeSetId, ...result, diagnostics };
  }

  async validate(context: MetaEntityActorContext, changeSetId: string): Promise<MetaEntityValidationResult> {
    const graph = await this.getGraph(context, changeSetId);
    const diagnostics = validateMetaEntityGraph(graph);
    return { changeSetId, valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
  }

  async checkpoint(
    context: MetaEntityActorContext,
    command: MetaEntityCheckpointCommand,
  ): Promise<MetaEntityCheckpointResult> {
    const graph = await this.getGraph(context, command.changeSetId);
    const diagnostics = validateMetaEntityGraph(graph);
    if (diagnostics.some((item) => item.severity === "error")) {
      throw new MetaEntityAuthoringError("GRAPH_INVALID", "Only a valid Entity graph can be checkpointed.", 422, diagnostics);
    }
    return this.repository.checkpoint(
      context,
      command,
      canonicalizeMetaEntityGraph(graph),
      diagnostics,
    );
  }

  listRevisions(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityCheckpointResult[]> {
    return this.repository.listRevisions(context, changeSetId);
  }

  diffRevisions(
    context: MetaEntityActorContext,
    leftRevisionId: string,
    rightRevisionId: string,
  ): Promise<readonly string[]> {
    return this.repository.diffRevisions(context, leftRevisionId, rightRevisionId);
  }

  async assertSeparationOfDuties(
    context: MetaEntityActorContext,
    action: MetaEntityGuardedAction,
    changeSetId: string,
    rollbackOfReleaseId?: string,
  ): Promise<void> {
    const facts = await this.repository.loadSeparationOfDutiesFacts(context, changeSetId, rollbackOfReleaseId);
    if (facts.entityTenantId === null) {
      throw new MetaEntityAuthoringError(
        "GLOBAL_PACKAGE_READ_ONLY",
        "Global package Entity contracts require central module authority and cannot be changed through a tenant role.",
        403,
      );
    }

    const conflicts = new Set<string>();
    const compare = (label: string, principalId: string | null): void => {
      if (principalId === context.principalId) conflicts.add(label);
    };

    compare("change_set_author", facts.createdBy);
    compare("submitter", facts.submittedBy);
    compare("latest_revision_author", facts.latestRevisionCapturedBy);

    if (action !== "review") {
      compare("reviewer", facts.reviewedBy);
      compare("approver", facts.approvedBy);
    }
    if (action === "rollback") compare("rollback_target_publisher", facts.rollbackTargetPublishedBy);
    if (action === "retire") compare("active_release_publisher", facts.latestReleasePublishedBy);

    if (conflicts.size > 0) {
      throw new MetaEntityAuthoringError(
        "SEPARATION_OF_DUTIES_FAILED",
        `The ${action} actor must be independent from prior authoring and decision actors.`,
        403,
        { conflictingRoles: [...conflicts].sort() },
      );
    }
  }

  transition(
    context: MetaEntityActorContext,
    action: MetaEntityWorkflowAction,
    command: MetaEntityWorkflowCommand,
  ): Promise<MetaEntityChangeSetSummary> {
    if (action === "reject" && !command.reason?.trim()) {
      throw new MetaEntityAuthoringError("REJECTION_REASON_REQUIRED", "A rejection reason is required.", 422);
    }
    return this.repository.transition(context, action, command);
  }

  publish(context: MetaEntityActorContext, command: MetaEntityPublishCommand): Promise<MetaEntityReleaseResult> {
    if (command.targetPlanes.length === 0) {
      throw new MetaEntityAuthoringError("TARGET_PLANE_REQUIRED", "At least one target plane is required.", 422);
    }
    if (command.releaseKind === "rollback" && !command.rollbackOfReleaseId) {
      throw new MetaEntityAuthoringError("ROLLBACK_TARGET_REQUIRED", "A rollback target release is required.", 422);
    }
    if (command.releaseKind !== "rollback" && command.rollbackOfReleaseId) {
      throw new MetaEntityAuthoringError("ROLLBACK_TARGET_FORBIDDEN", "Only rollback releases may name a rollback target.", 422);
    }
    if ((command.releaseKind === "rollback" || command.releaseKind === "retire")
      && (!command.reason?.trim() || !command.ticketReference?.trim())) {
      throw new MetaEntityAuthoringError(
        "RELEASE_GOVERNANCE_EVIDENCE_REQUIRED",
        "Rollback and retirement require both a reason and a ticket reference.",
        422,
      );
    }
    return this.repository.publish(context, command);
  }

  listReleases(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityReleaseSummary[]> {
    return this.repository.listReleases(context, entityId);
  }

  listActivity(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityActivityItem[]> {
    return this.repository.listActivity(context, entityId);
  }

  async runContractTests(context: MetaEntityActorContext, command: MetaEntityContractTestRunCommand): Promise<MetaEntityContractTestRun> {
    const graph = await this.getGraph(context, command.changeSetId);
    return this.repository.persistContractTestRun(context, command, runMetaEntityContractTests(graph));
  }

  listContractTestRuns(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityContractTestRun[]> {
    return this.repository.listContractTestRuns(context, changeSetId);
  }

  listContractTestResults(context: MetaEntityActorContext, testRunId: string): Promise<readonly MetaEntityContractTestResult[]> {
    return this.repository.listContractTestResults(context, testRunId);
  }

  async previewNumbering(context: MetaEntityActorContext, command: MetaEntityNumberingPreviewCommand): Promise<MetaEntityNumberingTestArtifact> {
    const graph = await this.getGraph(context, command.changeSetId);
    const binding = graph.numberingBindings.find((item) => item.id === command.numberingBindingId);
    if (!binding) throw new MetaEntityAuthoringError("NUMBERING_BINDING_NOT_FOUND", "The numbering binding was not found in this change set.", 404);
    const field = graph.fields.find((item) => item.id === binding.fieldId);
    const operation = binding.operationId ? graph.operations.find((item) => item.id === binding.operationId) : null;
    if (!field) throw new MetaEntityAuthoringError("NUMBERING_FIELD_NOT_FOUND", "The numbering field was not found.", 422);
    const bindingContract = {
      bindingId: binding.id, bindingKey: binding.bindingKey, targetPlane: binding.targetPlane,
      fieldId: field.id, fieldKey: field.fieldKey, operationId: operation?.id ?? null,
      operationKey: operation?.operationKey ?? null, assignmentMode: binding.assignmentMode,
      required: binding.required, status: binding.status, policyCode: binding.policyCode,
      policyRevision: binding.policyRevision,
    };
    const tester = this.numberingTesters[binding.targetPlane];
    let execution: MetaEntityNumberingTestExecution;
    if (!tester) {
      execution = { bindingContract, policyTest: null, previewInput: command, status: "failed",
        diagnosticCodes: ["numbering.tester.unavailable"],
        diagnostics: [{ code: "numbering.tester.unavailable", message: `The ${binding.targetPlane} numbering tester is not configured.` }] };
    } else {
      try {
        const policyTest = await tester.test({
          tenantId: context.tenantId, principalId: context.principalId,
          targetPlane: binding.targetPlane, policyCode: binding.policyCode, policyRevision: binding.policyRevision,
          nextValue: command.nextValue, occurredAt: command.occurredAt,
          scopeKey: command.scopeKey, fiscalYear: command.fiscalYear,
        });
        execution = { bindingContract, policyTest, previewInput: command, status: "passed", diagnosticCodes: [], diagnostics: [] };
      } catch (error) {
        const candidate = error as { code?: string; message?: string };
        const code = candidate.code ?? "NUMBERING_PREVIEW_FAILED";
        execution = { bindingContract, policyTest: null, previewInput: command, status: "failed",
          diagnosticCodes: [code.toLowerCase()], diagnostics: [{ code: code.toLowerCase(), message: candidate.message ?? "Numbering preview failed." }] };
      }
    }
    return this.repository.persistNumberingTestArtifact(context, command, execution);
  }

  listNumberingTestArtifacts(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityNumberingTestArtifact[]> {
    return this.repository.listNumberingTestArtifacts(context, changeSetId);
  }
}
