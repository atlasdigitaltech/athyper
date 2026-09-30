/** Published authority is separate from assignment and current authorization. */
export type GovernedTaskKind = "todo" | "review" | "approval";
export type GovernedTaskAction =
  | "complete_task" | "accept_review" | "approve"
  | "return" | "reject" | "record_finding" | "report_blocker"
  | "request_information" | "escalate";

export interface TaskCaseAuthority {
  readonly schema: "athyper.task-case-authority/1";
  readonly returnForChanges: boolean;
  readonly rejectProposal: boolean;
}

export interface GovernedTaskDefinition {
  readonly code: string;
  readonly kind: GovernedTaskKind;
  readonly responsibility: string;
  readonly mandatory: boolean;
  readonly outcomeScope: "task" | "case_final_decision";
  readonly caseAuthority: TaskCaseAuthority;
  readonly inputPaths: readonly string[];
  readonly predecessors: readonly string[];
  readonly completionOwner: string;
}

export interface TaskGovernanceContract {
  readonly schema: "athyper.task-governance/1";
  readonly tasks: readonly GovernedTaskDefinition[];
}

export interface TaskRuleRevision {
  readonly definitionId: string;
  readonly version: number;
  readonly hash: string;
}

/** Paths are exact JSON pointers; arrays are treated as whole changed fields. */
export interface TaskEditOutcome {
  readonly schema: "athyper.task-edit-result/1";
  readonly paths: readonly string[];
  readonly effect: "deny" | "metadata_only" | "full_reapproval";
}

export interface TaskFieldChange {
  readonly path: string;
  readonly beforePresent: boolean;
  readonly afterPresent: boolean;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface TaskEditDecision {
  readonly permitted: boolean;
  readonly effect: "denied" | "unchanged" | "metadata_only" | "full_reapproval";
  readonly requiresResubmission: boolean;
  readonly uncoveredPaths: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly revision: TaskRuleRevision;
}

export interface TaskCandidateFilterEvidence {
  readonly responsibility: string;
  readonly excluded: readonly {
    readonly principalId: string;
    readonly reason: "maker" | "ineligible" | "duplicate" | "independence_conflict";
  }[];
  readonly eligiblePrincipalIds: readonly string[];
  readonly requiredVotes: number;
}
