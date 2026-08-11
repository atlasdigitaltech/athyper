import type {
  ProvisioningCommandAuthenticator,
  ProvisioningCommandEnvelope,
  ProvisioningCommandExecutionStore,
  ProvisioningCommandReceipt,
  ProvisioningMutationResult,
} from "@athyper/server-contract-integration";

export class ProvisioningCommandError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super(code);
  }
}

export interface PlaneProvisioner<Transaction> {
  apply(command: ProvisioningCommandEnvelope, transaction: Transaction): Promise<ProvisioningMutationResult>;
}

export function createProvisioningCommandExecutor<Transaction>(options: {
  plane: ProvisioningCommandEnvelope["targetPlane"];
  audience: string;
  authenticator: ProvisioningCommandAuthenticator;
  executions: ProvisioningCommandExecutionStore<Transaction>;
  provisioner: PlaneProvisioner<Transaction>;
}) {
  return {
    async execute(command: ProvisioningCommandEnvelope): Promise<ProvisioningCommandReceipt> {
      validateEnvelope(command, options.plane, options.audience);
      const authentication = await options.authenticator.authenticate(command);
      if (!authentication.allowed) throw new ProvisioningCommandError(authentication.errorCode, 401);

      const result = await options.executions.executeAtomically(
        command,
        (transaction) => options.provisioner.apply(command, transaction),
      );
      if (result.kind === "conflict") {
        throw new ProvisioningCommandError("PROVISIONING_IDEMPOTENCY_CONFLICT", 409);
      }
      return result.receipt;
    },
  };
}

function validateEnvelope(
  command: ProvisioningCommandEnvelope,
  plane: ProvisioningCommandEnvelope["targetPlane"],
  audience: string,
): void {
  if (command.schemaVersion !== 1) throw new ProvisioningCommandError("PROVISIONING_SCHEMA_UNSUPPORTED", 400);
  if (command.targetPlane !== plane) throw new ProvisioningCommandError("PROVISIONING_PLANE_MISMATCH", 403);
  if (command.actor.audience !== audience) throw new ProvisioningCommandError("PROVISIONING_AUDIENCE_MISMATCH", 403);
  if (!command.idempotencyKey.trim() || !command.requestFingerprint.trim()) {
    throw new ProvisioningCommandError("PROVISIONING_IDEMPOTENCY_REQUIRED", 428);
  }
  if (!Number.isSafeInteger(command.desiredVersion) || command.desiredVersion < 1 || !command.desiredHash.trim()) {
    throw new ProvisioningCommandError("PROVISIONING_DESIRED_STATE_INVALID", 400);
  }
}
