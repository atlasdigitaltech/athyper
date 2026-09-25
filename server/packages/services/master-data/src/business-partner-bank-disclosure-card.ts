/** Received disclosure facts never establish Neon verification, activation or eligibility. */
export function receivedBankDisclosureCard(row: Record<string, unknown>) {
  const payload = row["payload_json"] as Record<string, unknown>;
  const bank = (payload["bankAccount"] ?? {}) as Record<string, unknown>;
  const expired = payload["expiresAt"] != null && Date.parse(String(payload["expiresAt"])) <= Date.now();
  const revoked = row["projection_status"] === "revoked";
  return {
    linkId:`mesh:${row["id"]}`, bankProjectionId:String(row["id"]), accountId:String(bank["sourceAccountId"] ?? ""),
    source:"MESH", sourceAccountId:String(bank["sourceAccountId"] ?? ""),
    disclosureVersion:Number(row["current_disclosure_version"]),
    disclosureStatus:revoked ? "Disclosure revoked" : expired ? "Disclosure expired" : "Disclosure current",
    maskedAccount:`•••• ${bank["accountLast4"] ?? ""}`, lastFour:String(bank["accountLast4"] ?? ""),
    accountHolderName:String(bank["accountHolderName"] ?? ""), currencyCode:String(bank["currencyCode"] ?? ""),
    bankName:String(bank["bankName"] ?? ""),bic:String(bank["bic"] ?? ""),accountIdType:String(bank["accountIdType"] ?? ""),
    primary:false,
    accountStatus:String(row["projection_status"]),purpose:String(payload["purpose"] ?? "default"),relationshipRole:"beneficiary",
    ...(row["received_at"] ? {receivedAt:new Date(String(row["received_at"])).toISOString()} : {}),
    ...(payload["expiresAt"] ? {disclosureExpiresAt:String(payload["expiresAt"])} : {}),
    revealable:false,
  };
}
