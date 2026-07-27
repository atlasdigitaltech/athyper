export type MutationKernelOperation = "create" | "patch" | "delete" | "aggregate" | "transition";

export type MutationKernelRolloutStage =
  | "shadow_validation"
  | "dual_read_comparison"
  | "internal_tenants"
  | "small_external_cohort"
  | "full_rollout";

export interface MutationKernelFlagNames {
  mutationKernel: string;
  strictWriteValidation: string;
}

export interface MutationKernelRolloutDecision {
  stage: MutationKernelRolloutStage;
  tenantKey: string;
  entityCode: string;
  operation: MutationKernelOperation;
  flags: MutationKernelFlagNames;
  oldPathWritesBusinessData: boolean;
  newKernelEvaluates: boolean;
  recordDifferences: boolean;
  comparePostMutationReads: boolean;
  executeNewMutation: boolean;
  allowDualWriteBusinessData: false;
  routeTrafficMetric: string;
}

export interface MutationKernelRolloutInput {
  tenantKey: string;
  entityCode: string;
  operation: MutationKernelOperation;
  stage: MutationKernelRolloutStage;
  isInternalTenant?: boolean;
  isExternalCohort?: boolean;
}

export function mutationKernelFlagName(entityCode: string, operation: MutationKernelOperation): string {
  return `mutation_kernel.${operation}.${entityCode}`;
}

export function strictWriteValidationFlagName(entityCode: string): string {
  return `strict_write_validation.${entityCode}`;
}

export function resolveMutationKernelRollout(input: MutationKernelRolloutInput): MutationKernelRolloutDecision {
  const flags = {
    mutationKernel: mutationKernelFlagName(input.entityCode, input.operation),
    strictWriteValidation: strictWriteValidationFlagName(input.entityCode),
  };

  const shadow = input.stage === "shadow_validation";
  const dualRead = input.stage === "dual_read_comparison";
  const internal = input.stage === "internal_tenants";
  const smallCohort = input.stage === "small_external_cohort";
  const full = input.stage === "full_rollout";
  const executeNewMutation = full
    || (internal && (input.isInternalTenant ?? true))
    || (smallCohort && ((input.isInternalTenant ?? false) || (input.isExternalCohort ?? true)));

  return {
    stage: input.stage,
    tenantKey: input.tenantKey,
    entityCode: input.entityCode,
    operation: input.operation,
    flags,
    oldPathWritesBusinessData: !executeNewMutation,
    newKernelEvaluates: true,
    recordDifferences: shadow || dualRead,
    comparePostMutationReads: shadow || dualRead,
    executeNewMutation,
    allowDualWriteBusinessData: false,
    routeTrafficMetric: `mutation_traffic.${input.operation}.${input.entityCode}`,
  };
}
