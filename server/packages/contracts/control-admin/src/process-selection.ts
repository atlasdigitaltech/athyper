import type {
  PolicyDefinition,
  JsonRuleEvaluator,
} from "@athyper/server-contract-policy";

export type ProcessRequirement = "basic" | "standard" | "enhanced";
export type OnboardingProfileCode = "simple" | "standard" | "enhanced";

/** Never resolve "latest" after acceptance. IDs are immutable revision identities. */
export interface ProcessRevision {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
}
export interface ProcessScope {
  readonly tenantId: string;
  readonly planeKey: "neon" | "studio" | "mesh";
  readonly processFamily: string;
  readonly operatingOrganizationId: string;
  readonly companyCodeId: string | null;
}
export interface ProcessPolicyRevision extends ProcessRevision {
  readonly definitionId: string;
}
export interface ProcessProfileRevision extends ProcessRevision {
  readonly code: OnboardingProfileCode;
}
export interface ProcessSelectionAction {
  readonly schema: "athyper.process-selection-result/1";
  readonly profile: ProcessProfileRevision;
}
export type ProcessDocumentPurpose =
  "submitted_review_pack" | "decision_document" | "activation_confirmation";
export interface ProcessDocumentBinding {
  readonly purpose: ProcessDocumentPurpose;
  readonly template: ProcessRevision & {
    readonly templateId: string;
    readonly bindingId: string;
    readonly locale: string;
    readonly variant: string;
  };
  readonly projection: ProcessRevision & { readonly code: string };
  readonly source:
    "submitted_snapshot" | "decision_snapshot" | "result_snapshot";
  readonly requiredBefore:
    "review_execution" | "materialization" | "cycle_completion";
  readonly recipientPolicy: ProcessRevision;
}
export type ProcessTaskBinding = {
  readonly taskTemplateId: string;
  readonly code: string;
  /** Sequential in A; the preceding task must be the sole predecessor. */
  readonly predecessorTaskTemplateId: string | null;
  readonly requiredDocumentPurposes: readonly ProcessDocumentPurpose[];
} & (
  | {
      readonly executionKind: "preparation";
      readonly commandCode: string;
      readonly outcomeScope: "task";
    }
  | {
      readonly executionKind: "document";
      readonly documentPurpose: "submitted_review_pack";
      readonly outcomeScope: "task";
    }
  | {
      readonly executionKind: "review" | "approval";
      readonly workflow: ProcessRevision & {
        readonly definitionId: string;
        readonly code: string;
      };
      readonly reviewerPolicy: ProcessRevision;
      readonly outcomeScope: "task" | "case_final_decision";
      readonly makerChecker: true;
      readonly informationPolicy?: {
        readonly schema: "athyper.task-information-policy/1";
        /** Response deadline bounds an optional item-only decision-clock pause. */
        readonly clockMode: "elapsed" | "bounded_pause";
        readonly responseHours: number;
        /** Notify the eligible supervisor when the requester leaves clarification unanswered. */
        readonly overdueSupervisorRole?: string;
      };
      readonly escalationPolicy?: {
        readonly schema: "athyper.task-escalation-policy/1";
        readonly mode: "notify" | "consult" | "reassign";
        readonly responseHours?: number;
        /** Explicit governed pilot supervisor selector; never inferred from a job title. */
        readonly supervisorRole: string;
      };
      /** Absent only for legacy manifests, which retain return/reject authority. */
      readonly caseAuthority?: {
        readonly schema: "athyper.task-case-authority/1";
        readonly returnForChanges: boolean;
        readonly rejectProposal: boolean;
      };
    }
);
export interface ProcessExecutionManifest {
  readonly schema: "athyper.process-execution-manifest/1";
  readonly scope: ProcessScope;
  readonly revision: ProcessRevision;
  readonly profile: ProcessProfileRevision;
  readonly cycle: ProcessRevision & { readonly cycleTypeId: string };
  readonly tasks: readonly ProcessTaskBinding[];
  readonly documents: readonly ProcessDocumentBinding[];
  readonly mandatoryGateCodes: readonly string[];
  readonly editPolicy?: ProcessPolicyRevision & { readonly effectiveOn: string };
}
export interface ProcessMinimumControl {
  readonly scope: ProcessScope;
  readonly authority: ProcessRevision & { readonly owner: string };
  readonly minimumProfile: OnboardingProfileCode;
  readonly mandatoryGateCodes: readonly string[];
}
export interface ProcessSelectionPublication {
  readonly schema: "athyper.process-selection-publication/1";
  readonly scope: ProcessScope;
  readonly factSchema: ProcessRevision & {
    readonly code: "supplier_onboarding_requirement";
  };
  readonly policy: ProcessPolicyRevision;
  readonly definition: PolicyDefinition;
  readonly manifests: readonly ProcessExecutionManifest[];
  readonly minimumControls: readonly ProcessMinimumControl[];
}
export interface ProcessSelectionIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}
export type CompiledProcessSelection =
  | { readonly valid: false; readonly issues: readonly ProcessSelectionIssue[] }
  | {
      readonly valid: true;
      readonly issues: readonly [];
      readonly publication: ProcessSelectionPublication;
      readonly mappings: Readonly<
        Record<ProcessRequirement, ProcessProfileRevision>
      >;
    };

/** P1 compiler consumes the existing evaluator; runtime revision evaluation is P1a. */
export interface ProcessSelectionCompilerPorts {
  readonly evaluator: JsonRuleEvaluator;
  /** Publication owner must resolve exact, published, scope-authorized revisions. */
  readonly isPublished: (
    kind:
      | "policy"
      | "edit_policy"
      | "profile"
      | "manifest"
      | "cycle"
      | "workflow"
      | "template"
      | "projection"
      | "recipient_policy"
      | "reviewer_policy"
      | "fact_schema"
      | "minimum_control",
    revision: ProcessRevision,
    scope: ProcessScope,
  ) => Promise<boolean>;
}
