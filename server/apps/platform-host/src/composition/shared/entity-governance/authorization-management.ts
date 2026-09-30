import type {
  Authorizer,
  AuthorizationManagementUnitOfWork,
  AuthorizationManagementRolloutPolicySource,
  AuthorizationWriterSwitchGate,
} from "@athyper/server-contract-auth";
import type { Kysely } from "kysely";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  createAuthorizationManagementService,
  createKyselyAuthorizationManagementUnitOfWork,
  createSafeAuthorizationManagementRolloutSelector,
  type LegacyAuthorizationTransactionBinder,
} from "@athyper/server-platform-control-admin";
import { createConfiguredAuthorizationManagement } from "./authorization-management-config.js";

export interface AuthorizationManagementDependencies {
  readonly unitOfWork?: AuthorizationManagementUnitOfWork;
  readonly legacyTransactionBinder?: LegacyAuthorizationTransactionBinder;
  readonly writerDatabases?: Readonly<
    Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
  >;
  readonly rolloutPolicies: AuthorizationManagementRolloutPolicySource;
  readonly writerGate: AuthorizationWriterSwitchGate;
}
export interface AuthorizationManagementPolicy {
  readonly authorizationManagementRoutesEnabled?: boolean;
  readonly authorizationManagementMutationsEnabled?: boolean;
  readonly authorizationManagementPolicyPath?: string;
  readonly authorizationManagementMode?: "legacy" | "shadow" | "enforce";
  readonly authorizationGoldenEvaluatorCorpusQualified?: boolean;
  readonly authorizationDdlEpochIntegrationQualified?: boolean;
  readonly authorizationWriterSwitchQualified?: boolean;
}
export interface AuthorizationManagementCompositionOptions {
  readonly policy: AuthorizationManagementPolicy;
  readonly supplied?: AuthorizationManagementDependencies;
  readonly writerDatabases?: Readonly<
    Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
  >;
  readonly metadataDatabases: Readonly<
    Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
  >;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder;
}

/** Preserve writer qualification, rollout ceilings and audit independently of host wiring. */
export function createHostAuthorizationManagement(
  options: AuthorizationManagementCompositionOptions,
) {
  const {
    policy,
    supplied,
    writerDatabases,
    metadataDatabases,
    authorizer,
    audit,
  } = options;
  if (
    policy.authorizationManagementRoutesEnabled &&
    policy.authorizationManagementMutationsEnabled &&
    !supplied &&
    !policy.authorizationManagementPolicyPath
  )
    throw new Error(
      "Authorization mutations require configured writer-switch evidence",
    );
  if (
    policy.authorizationManagementMutationsEnabled &&
    !supplied &&
    !writerDatabases
  )
    throw new Error(
      "Authorization mutations require dedicated writer connections",
    );
  const authorizationOptions: AuthorizationManagementDependencies | undefined =
    supplied ??
    (policy.authorizationManagementRoutesEnabled
      ? createConfiguredAuthorizationManagement(
          policy.authorizationManagementPolicyPath,
        )
      : undefined);
  const authorizationMode = policy.authorizationManagementMode ?? "legacy";
  return authorizationOptions
    ? createAuthorizationManagementService({
        unitOfWork:
          authorizationOptions.unitOfWork ??
          createKyselyAuthorizationManagementUnitOfWork(
            authorizationOptions.writerDatabases ??
              writerDatabases ??
              metadataDatabases,
            authorizationOptions.legacyTransactionBinder,
          ),
        authorizer,
        rollout: {
          async select(input) {
            const selected =
              await createSafeAuthorizationManagementRolloutSelector(
                authorizationOptions.rolloutPolicies,
              ).select(input);
            if (authorizationMode === "legacy")
              return {
                mode: "legacy",
                revision: `host-legacy:${selected.revision}`,
              };
            if (authorizationMode === "shadow" && selected.mode === "enforce")
              return {
                mode: "shadow",
                revision: `host-shadow:${selected.revision}`,
              };
            if (
              selected.mode === "enforce" &&
              (!policy.authorizationGoldenEvaluatorCorpusQualified ||
                !policy.authorizationDdlEpochIntegrationQualified ||
                !policy.authorizationWriterSwitchQualified)
            )
              throw Object.assign(
                new Error("AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED"),
                { code: "AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED" },
              );
            return selected;
          },
        },
        writerGate: authorizationOptions.writerGate,
        mutationsEnabled:
          policy.authorizationManagementMutationsEnabled ?? false,
        audit: {
          async record(input) {
            await audit.record({
              eventCode: `authorization.management.${input.outcome}`,
              action: "manage_authorization",
              outcome: input.outcome === "success" ? "success" : "denied",
              actor: { kind: "user", principalId: input.principalId },
              tenantId: input.tenantId,
              entityType: "authorization.management_command",
              entityId: input.commandId,
              requestId: input.requestId,
              ...(input.correlationId
                ? { correlationId: input.correlationId }
                : {}),
              metadata: {
                mutationKind: input.mutationKind,
                planeKey: input.planeKey,
                mode: input.mode,
                writer: input.writer,
                ...(input.reason ? { reason: input.reason } : {}),
                ...(input.writerSwitchEvidence
                  ? { writerSwitchEvidence: input.writerSwitchEvidence }
                  : {}),
              },
            });
          },
        },
      })
    : undefined;
}
