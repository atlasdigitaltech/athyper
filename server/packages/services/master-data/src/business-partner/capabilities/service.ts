import { MasterDataError } from "../../errors.js";

export type PartnerCapability = "supplier" | "customer";
export interface PartnerCapabilityCommand {
  businessPartnerId: string;
  capability: PartnerCapability;
  enabled: boolean;
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}
export interface PartnerCapabilityContext {
  tenantId: string;
  principalId: string;
}
export interface PartnerCapabilityResult {
  businessPartnerId: string;
  capability: PartnerCapability;
  enabled: boolean;
  recordVersion: string;
  evidenceId: string;
  replayed: boolean;
}
export interface PartnerCapabilityRepository<Tx> {
  change(command: PartnerCapabilityCommand, context: PartnerCapabilityContext, tx: Tx): Promise<PartnerCapabilityResult>;
}
export interface PartnerCapabilityAuthorization {
  tenantId: string;
  principalId: string;
  entityCode: "business_partner";
  recordId: string;
  operation: "business_partner.capability.supplier.manage" | "business_partner.capability.customer.manage";
}

/** Staged domain operation, not a generic entity write. The host must bind its
 * authorizer to tenant-scoped IAM before publishing either operation key.
 * Registration and qualification commands must never call this implicitly.
 */
export class PartnerCapabilityService<Tx> {
  constructor(
    private readonly repository: PartnerCapabilityRepository<Tx>,
    private readonly authorize: (request: PartnerCapabilityAuthorization, tx: Tx) => Promise<boolean>,
  ) {}

  async change(command: PartnerCapabilityCommand, context: PartnerCapabilityContext, tx: Tx): Promise<PartnerCapabilityResult> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!command || !context || !uuid.test(context.tenantId) || !uuid.test(context.principalId)
      || !uuid.test(command.businessPartnerId) || !["supplier", "customer"].includes(command.capability)
      || typeof command.enabled !== "boolean" || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1
      || typeof command.reason !== "string" || command.reason.trim().length === 0 || command.reason.length > 4000
      || typeof command.idempotencyKey !== "string" || command.idempotencyKey.trim() !== command.idempotencyKey
      || command.idempotencyKey.length < 8 || command.idempotencyKey.length > 200
      || Object.keys(command).some(key => !["businessPartnerId", "capability", "enabled", "expectedVersion", "reason", "idempotencyKey"].includes(key))) {
      throw new MasterDataError(400, "PARTNER_CAPABILITY_COMMAND_INVALID", "Invalid partner capability command");
    }
    const allowed = await this.authorize({
      ...context,
      entityCode: "business_partner",
      recordId: command.businessPartnerId,
      operation: command.capability === "supplier" ? "business_partner.capability.supplier.manage" : "business_partner.capability.customer.manage",
    }, tx);
    if (allowed !== true) {
      throw new MasterDataError(403, "PARTNER_CAPABILITY_FORBIDDEN", "Capability management is not authorized");
    }
    // Authorize even idempotent retries. Revoked access must not be bypassed by replay.
    return this.repository.change(command, context, tx);
  }
}
