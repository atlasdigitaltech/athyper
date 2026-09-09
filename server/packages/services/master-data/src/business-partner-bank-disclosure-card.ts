/** Map recipient-safe facts without inventing owner evidence or effective dates. */
export function receivedBankDisclosureCard(row: Record<string, unknown>, companyCodeId?: string) {
  const payload = row["payload_json"] as Record<string, unknown>;
  const bank = (payload["bankAccount"] ?? {}) as Record<string, unknown>;
  const usages = (row["company_assignments"] ?? []) as Record<string, unknown>[];
  const expired = payload["expiresAt"] != null && Date.parse(String(payload["expiresAt"])) <= Date.now();
  const revoked = row["projection_status"] === "revoked";
  const companyAssignments = usages.map(usage => {
    const version = usage["accepted_disclosure_version"];
    const accepted = usage["accepted_at"] != null;
    const legacyApplied = usage["verification_status"] === "applied" && !accepted;
    const current = accepted && version != null && Number(version) === Number(row["current_disclosure_version"])
      && usage["accepted_disclosure_id"] === row["current_disclosure_id"] && !expired && !revoked;
    const acceptance = current ? `Accepted · disclosure v${version}` : accepted ? "Change pending review"
      : legacyApplied ? "Previously applied · review required" : "Not accepted for use";
    return {
      ...(usage["assignment_id"] ? {assignmentId:String(usage["assignment_id"])} : {}),
      companyCodeId: String(usage["company_code_id"]), companyName: String(usage["company_name"]),
      purpose: String(usage["purpose"]), primary: usage["is_primary"] === true,
      effectiveFrom: String(usage["effective_from"]).slice(0,10),
      ...(usage["effective_until"] ? {effectiveUntil:String(usage["effective_until"]).slice(0,10)} : {}),
      acceptance, acceptanceCurrent:current, ...(version != null ? {acceptedDisclosureVersion:Number(version)} : {}),
      ...(usage["verification_id"] ? {verificationId:String(usage["verification_id"])} : {}),
    };
  });
  return {
    linkId:`mesh:${row["id"]}`, bankProjectionId:String(row["id"]), accountId:String(bank["sourceAccountId"] ?? ""),
    source:"MESH", sourceAccountId:String(bank["sourceAccountId"] ?? ""),
    disclosureVersion:Number(row["current_disclosure_version"]),
    disclosureStatus:revoked ? "Disclosure revoked" : expired ? "Disclosure expired" : "Disclosure current",
    acceptance:companyAssignments.length ? companyAssignments.map(u=>`${u.companyName}: ${u.acceptance}`).join("; ")
      : row["projection_status"] === "change_pending" ? "Change pending review · no company acceptance recorded" : "No company acceptance recorded",
    companyUsage:companyAssignments.length ? [...new Set(companyAssignments.map(u=>u.companyName))].join(", ") : "No companies assigned",
    companyAssignments,
    ...(companyCodeId ? {companyCodeId,companyApplicable:companyAssignments.length>0} : {}),
    maskedAccount:`•••• ${bank["accountLast4"] ?? ""}`, lastFour:String(bank["accountLast4"] ?? ""),
    accountHolderName:String(bank["accountHolderName"] ?? ""), currencyCode:String(bank["currencyCode"] ?? ""),
    bankName:String(bank["bankName"] ?? ""),bic:String(bank["bic"] ?? ""),accountIdType:String(bank["accountIdType"] ?? ""),
    verified:typeof bank["ownerVerified"] === "boolean" ? bank["ownerVerified"] : null,
    primary:companyCodeId ? companyAssignments.some(u=>u.primary) : false,
    accountStatus:String(row["projection_status"]),purpose:String(payload["purpose"] ?? "default"),relationshipRole:"beneficiary",
    ...(row["received_at"] ? {receivedAt:new Date(String(row["received_at"])).toISOString()} : {}),
    ...(payload["expiresAt"] ? {disclosureExpiresAt:String(payload["expiresAt"])} : {}),
    revealable:false,
  };
}
