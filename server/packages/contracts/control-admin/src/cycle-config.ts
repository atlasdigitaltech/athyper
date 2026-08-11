import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type CycleFrequency = "daily" | "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "semiannual" | "annual" | "adhoc";
export type CycleCompletionMode = "manual" | "system" | "hybrid";
export type CycleDependencyType = "finish_to_start" | "finish_to_finish";
export type CycleCarryForwardAction = "force_close" | "auto_carry" | "expire";
export type CycleDeviationType = "exception" | "override" | "waiver";

export interface CycleTypeDraft { readonly id: string; readonly code: string; readonly name: string; readonly domainCode: string; readonly frequency: CycleFrequency; readonly cleanCyclePolicy: Readonly<Record<string, unknown>>; readonly approvalPolicy: Readonly<Record<string, unknown>>; readonly runDataSchema: Readonly<Record<string, unknown>>; readonly taskDataSchema: Readonly<Record<string, unknown>>; }
export interface CyclePhaseDraft { readonly id: string; readonly code: string; readonly name: string; readonly sortOrder: number; readonly isGateEnforced: boolean; readonly minimumReadinessPct?: number; readonly targetHoursFromStart?: number; }
export interface CycleTaskCategoryDraft { readonly id: string; readonly code: string; readonly name: string; readonly sortOrder: number; }
export interface CycleTaskTemplateDraft { readonly id: string; readonly phaseId: string; readonly categoryId: string; readonly entityCode: string; readonly code: string; readonly name: string; readonly completionMode: CycleCompletionMode; readonly systemCheckHandler?: string; readonly isMandatory: boolean; readonly isWaivable: boolean; readonly sortOrder: number; readonly applicability: Readonly<Record<string, unknown>>; }
export interface CycleTaskDependencyDraft { readonly predecessorTemplateId: string; readonly successorTemplateId: string; readonly dependencyType: CycleDependencyType; readonly isHard: boolean; }
export interface CycleCrossDependencyDraft { readonly predecessorTypeId: string; readonly predecessorPhaseId: string; readonly successorTypeId: string; readonly successorPhaseId: string; readonly isHard: boolean; }
export interface CycleCarryForwardRuleDraft { readonly deviationType: CycleDeviationType; readonly action: CycleCarryForwardAction; readonly maximumCarryCount?: number; readonly escalateAfterCarries?: number; readonly targetCycleTypeId?: string; }
export interface CycleTemplateDraft { readonly cycleType: CycleTypeDraft; readonly phases: readonly CyclePhaseDraft[]; readonly categories: readonly CycleTaskCategoryDraft[]; readonly tasks: readonly CycleTaskTemplateDraft[]; readonly dependencies: readonly CycleTaskDependencyDraft[]; readonly crossDependencies: readonly CycleCrossDependencyDraft[]; readonly carryForwardRules: readonly CycleCarryForwardRuleDraft[]; }

export type CycleTemplateIssueCode = "DUPLICATE_CODE" | "DUPLICATE_ORDER" | "MISSING_REFERENCE" | "SELF_DEPENDENCY" | "DUPLICATE_DEPENDENCY" | "CYCLIC_DEPENDENCY" | "INVALID_CROSS_CYCLE_REFERENCE" | "INVALID_CARRY_FORWARD_TARGET" | "INVALID_TASK_HANDLER";
export interface CycleTemplateIssue { readonly code: CycleTemplateIssueCode; readonly path: string; readonly message: string; }
export interface CycleTemplatePreview { readonly schema: "athyper.cycle-template/1.0"; readonly template: CycleTemplateDraft; readonly templateHash: string; readonly valid: boolean; readonly issues: readonly CycleTemplateIssue[]; readonly topologicalTaskIds: readonly string[]; }
export interface PublishedCycleTemplate extends CycleTemplatePreview { readonly id: string; readonly tenantId: string; readonly version: number; readonly publishedAt: string; readonly publishedBy: string; }
export interface PublishCycleTemplateCommand { readonly context: VerifiedRequestContext; readonly template: CycleTemplateDraft; readonly idempotencyKey: string; readonly expectedLatestVersion?: number; }
export type PublishCycleTemplateResult = { readonly kind: "published" | "replayed"; readonly value: PublishedCycleTemplate } | { readonly kind: "version_conflict"; readonly expectedVersion: number; readonly actualVersion: number };

/** The only cycle-template persistence port. Governance consumes CycleConfigReader only. */
export interface CycleTemplateRepository {
  externalPhaseExists(tenantId: string, cycleTypeId: string, phaseId: string): Promise<boolean>;
  cycleTypeExists(tenantId: string, cycleTypeId: string): Promise<boolean>;
  publish(input: { readonly tenantId: string; readonly principalId: string; readonly idempotencyKey: string; readonly expectedLatestVersion?: number; readonly preview: CycleTemplatePreview }): Promise<PublishCycleTemplateResult>;
  getPublished(tenantId: string, cycleTypeId: string, version?: number): Promise<PublishedCycleTemplate | undefined>;
}

export interface CycleDesiredStatePayload {
  readonly schema: "athyper.cycle-template-desired-state/1.0";
  readonly desiredStateId: string;
  readonly sourceBlueprintId: string;
  readonly sourceRevision: number;
  readonly targetPlane: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly template: CycleTemplateDraft;
  readonly templateHash: string;
  readonly issuedAt: string;
}
export interface CycleDesiredStateSignature { readonly algorithm: string; readonly keyId: string; readonly value: string; }
export interface SignedCycleDesiredStateRevision extends CycleDesiredStatePayload { readonly signature: CycleDesiredStateSignature; }
export interface CycleDesiredStateSigner { sign(payload: CycleDesiredStatePayload): Promise<CycleDesiredStateSignature>; }
export interface CycleDesiredStateVerifier { verify(payload: CycleDesiredStatePayload, signature: CycleDesiredStateSignature): Promise<boolean>; }
export interface ApplyCycleDesiredStateCommand { readonly context: VerifiedRequestContext; readonly revision: SignedCycleDesiredStateRevision; readonly expectedLatestVersion?: number; }

export interface CycleConfigReader {
  readPublished(context: VerifiedRequestContext, cycleTypeId: string, version?: number): Promise<PublishedCycleTemplate>;
}
export interface CycleConfigService extends CycleConfigReader {
  preview(context: VerifiedRequestContext, template: CycleTemplateDraft): Promise<CycleTemplatePreview>;
  validate(context: VerifiedRequestContext, template: CycleTemplateDraft): Promise<CycleTemplatePreview>;
  publish(command: PublishCycleTemplateCommand): Promise<PublishCycleTemplateResult>;
  applyDesiredState(command: ApplyCycleDesiredStateCommand): Promise<PublishCycleTemplateResult>;
}
