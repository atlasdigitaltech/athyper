/** Adapt only already-authorized DTO fields. Never query storage to fill a redacted field. */
export function certificateCollection(value: unknown) {
  return rows(value).map((row) => ({
    id: row.id,
    display_name: row.name,
    custom_name: row.customName,
    certification_type_id: row.certificationTypeId,
    issuing_body: row.issuingBody,
    certificate_number: row.certificateNumber,
    certified_by: row.certifiedBy,
    company_code_id: row.companyCodeId,
    effective_from: row.effectiveFrom,
    effective_until: row.effectiveUntil,
    status: row.status,
    ...(record(row.attachment) &&
    typeof row.attachment.attachmentId === "string"
      ? { document_attachment_id: row.attachment.attachmentId }
      : {}),
  }));
}
export function qualificationCollection(value: unknown) {
  return rows(value).map((row) => ({
    id: row.id,
    context_kind: row.contextKind,
    partner_role: row.partnerRole,
    qualification_type_code: row.typeCode,
    decision: row.decision,
    effective_from: row.effectiveFrom,
    effective_until: row.effectiveUntil,
    next_review_at: row.nextReviewAt,
  }));
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function rows(value: unknown) {
  return Array.isArray(value) ? value.filter(record) : [];
}
