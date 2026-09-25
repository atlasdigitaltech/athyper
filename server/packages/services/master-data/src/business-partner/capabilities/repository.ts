import { sql, type Transaction } from "kysely";
import type { PartnerCapabilityCommand, PartnerCapabilityContext, PartnerCapabilityRepository, PartnerCapabilityResult } from "./service.js";

type Tx = Transaction<Record<string, never>>;

/** The caller supplies a transaction with verified tenant/principal session context.
 * No session impersonation, generic UPDATE, or fallback to the retiring role tables.
 */
export class KyselyPartnerCapabilityRepository implements PartnerCapabilityRepository<Tx> {
  async change(command: PartnerCapabilityCommand, context: PartnerCapabilityContext, tx: Tx): Promise<PartnerCapabilityResult> {
    const result = await sql<PartnerCapabilityResult>`
      SELECT business_partner_id::text AS "businessPartnerId", capability, enabled,
        record_version::text AS "recordVersion", evidence_id::text AS "evidenceId", replayed
      FROM control.command_business_partner_capability(
        ${context.tenantId}::uuid, ${command.businessPartnerId}::uuid, ${command.capability}::text,
        ${command.enabled}::boolean, ${command.expectedVersion}::bigint, ${command.reason}::text,
        ${command.idempotencyKey}::text, ${context.principalId}::uuid)
    `.execute(tx);
    if (result.rows.length !== 1) throw new Error("Capability command did not acknowledge exactly one result");
    return result.rows[0]!;
  }
}
