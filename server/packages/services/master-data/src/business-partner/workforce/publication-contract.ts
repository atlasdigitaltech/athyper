import { sql, type Transaction } from "kysely";
import { MasterDataError } from "../../errors.js";

export const partnerPublicationContract = "business_partner.v1";
export function readPartnerPublicationTargets(
  payload: Record<string, unknown>,
): readonly { businessPartnerId: string; responseDueAt?: string }[] {
  const targets = payload["partnerTargets"];
  if (
    payload["counterpartyContract"] !== partnerPublicationContract ||
    !Array.isArray(targets) ||
    targets.length === 0 ||
    targets.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        typeof row.businessPartnerId !== "string" ||
        "supplierId" in row ||
        (row.responseDueAt !== undefined &&
          typeof row.responseDueAt !== "string"),
    )
  ) {
    throw new MasterDataError(
      409,
      "WORKFORCE_PUBLICATION_RECEIPT_CONTRACT_MISMATCH",
      "Publication receipt uses a different counterparty contract; legacy IDs cannot be reinterpreted",
    );
  }
  return targets.map((row) => ({
    businessPartnerId: row.businessPartnerId,
    ...(row.responseDueAt !== undefined
      ? { responseDueAt: row.responseDueAt }
      : {}),
  }));
}

/** Deliberate fail-closed deployment boundary, not a legacy-ID fallback. */
export async function assertPartnerPublicationSchema(
  tx: Transaction<Record<string, never>>,
): Promise<void> {
  const result = await sql<{ ready: boolean }>`
    SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid=to_regclass('document.workforce_requisition_supplier')
        AND attname='business_partner_id' AND NOT attisdropped)
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='document' AND p.proname='command_publish_workforce_requisition'
        AND position('business_partner.v1' in p.prosrc)>0) AS ready
  `.execute(tx);
  if (result.rows[0]?.ready !== true)
    throw new MasterDataError(
      503,
      "WORKFORCE_PARTNER_SCHEMA_REQUIRED",
      "Partner-owned workforce publication is not activated on this instance",
    );
}
