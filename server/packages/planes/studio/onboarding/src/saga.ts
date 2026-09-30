import type {
  OnboardingCase,
  OnboardingCommandIntent,
  OnboardingCommandOperation,
  OnboardingReconciliationResult,
  OnboardingResourceObservation,
} from "@athyper/contract-athyper-onboarding";
import type {
  ProvisioningCommandEnvelope,
  ProvisioningCommandReceipt,
  ProvisioningCommandTransport,
} from "@athyper/server-contract-integration";

export interface OnboardingSagaRepository {
  loadCase(caseId: string): Promise<OnboardingCase | undefined>;
  listObservations(
    caseId: string,
  ): Promise<readonly OnboardingResourceObservation[]>;
  recordReceipt(
    caseId: string,
    targetId: string,
    resourceKey: string,
    operation: OnboardingCommandOperation,
    receipt: ProvisioningCommandReceipt,
  ): Promise<void>;
}

export interface CommandEnvelopeFactory {
  create(
    item: OnboardingCase,
    intent: OnboardingCommandIntent,
  ): ProvisioningCommandEnvelope;
}

export function createCommandEnvelopeFactory(input: {
  serviceId: string;
  audienceFor: (plane: OnboardingCommandIntent["targetPlane"]) => string;
  newCommandId: () => string;
  fingerprint: (value: Readonly<Record<string, unknown>>) => string;
  now: () => string;
}): CommandEnvelopeFactory {
  return {
    create(item, intent) {
      const idempotencyKey = `${item.id}:${intent.targetId}:${intent.resourceKey}:v${intent.desiredVersion}:${intent.operation}`;
      const body = { ...intent.body };
      return {
        schemaVersion: 1,
        commandId: input.newCommandId(),
        commandCode: intent.commandCode,
        idempotencyKey,
        requestFingerprint: input.fingerprint({
          commandCode: intent.commandCode,
          targetTenantId: intent.targetTenantId,
          desiredVersion: intent.desiredVersion,
          desiredHash: intent.desiredHash,
          body,
        }),
        correlationId: item.id,
        caseId: item.id,
        targetPlane: intent.targetPlane,
        targetTenantId: intent.targetTenantId,
        desiredVersion: intent.desiredVersion,
        desiredHash: intent.desiredHash,
        actor: {
          serviceId: input.serviceId,
          audience: input.audienceFor(intent.targetPlane),
          subject: input.serviceId,
          authenticatedAt: input.now(),
        },
        body,
      };
    },
  };
}

const coordinate = (targetId: string, resourceKey: string) =>
  `${targetId}:${resourceKey}`;

function operationFor(
  status: OnboardingCase["status"],
  retention: string,
): OnboardingCommandOperation {
  if (status !== "offboarding") return "apply";
  return retention === "deletable" ? "revoke" : "retain";
}

function converged(
  operation: OnboardingCommandOperation,
  item: OnboardingCase,
  observed?: OnboardingResourceObservation,
): boolean {
  if (!observed) return false;
  if (operation === "revoke") return observed.status === "revoked";
  if (operation === "retain") return observed.status === "retained";
  return (
    observed.status === "applied" &&
    observed.appliedVersion === item.desiredVersion &&
    observed.appliedHash === item.desiredHash
  );
}

export function reconcileOnboardingCase(
  item: OnboardingCase,
  observations: readonly OnboardingResourceObservation[],
): OnboardingReconciliationResult {
  if (
    !["provisioning", "reconciling", "active", "offboarding"].includes(
      item.status,
    )
  ) {
    throw new Error("ONBOARDING_RECONCILIATION_STATUS_CONFLICT");
  }
  const actual = new Map(
    observations.map((value) => [
      coordinate(value.targetId, value.resourceKey),
      value,
    ]),
  );
  const commands: OnboardingCommandIntent[] = [];
  const driftedResourceKeys: string[] = [];

  for (const target of item.targets) {
    for (const resource of target.resources) {
      const key = coordinate(target.targetId, resource.resourceKey);
      const observed = actual.get(key);
      const operation = operationFor(item.status, resource.retention);
      if (converged(operation, item, observed)) continue;
      if (observed) driftedResourceKeys.push(key);
      commands.push({
        commandCode: `${operation === "apply" ? "provisioning" : "offboarding"}.${resource.resourceKind}.${operation}`,
        operation,
        targetId: target.targetId,
        resourceKey: resource.resourceKey,
        targetPlane: target.plane,
        targetTenantId: target.targetTenantId,
        desiredVersion: item.desiredVersion,
        desiredHash: item.desiredHash,
        body: {
          targetId: target.targetId,
          resourceKey: resource.resourceKey,
          desiredState: resource.desiredState,
          accessGates: resource.accessGates ?? {},
          retention: resource.retention,
        },
      });
    }
  }
  return {
    caseId: item.id,
    desiredVersion: item.desiredVersion,
    converged: commands.length === 0,
    commands,
    driftedResourceKeys,
  };
}

export function createOnboardingSaga(options: {
  repository: OnboardingSagaRepository;
  transport: ProvisioningCommandTransport;
  envelopes: CommandEnvelopeFactory;
}) {
  return {
    async reconcile(caseId: string, tenantId?: string) {
      const item = await options.repository.loadCase(caseId);
      if (!item || (tenantId !== undefined && item.tenantId !== tenantId))
        throw new Error(`Onboarding case not found: ${caseId}`);
      const result = reconcileOnboardingCase(
        item,
        await options.repository.listObservations(caseId),
      );
      for (const intent of result.commands) {
        const receipt = await options.transport.execute(
          options.envelopes.create(item, intent),
        );
        await options.repository.recordReceipt(
          caseId,
          intent.targetId,
          intent.resourceKey,
          intent.operation,
          receipt,
        );
        if (receipt.status === "rejected") break;
      }
      return result;
    },
  };
}
