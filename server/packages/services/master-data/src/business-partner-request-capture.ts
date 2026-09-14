import { sql, type Transaction } from "kysely";
import type { BusinessPartnerRequestExtensions } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";
const fail = (detail: string): never => {
  throw new MasterDataError(422, "REQUEST_CAPTURE_INVALID", detail);
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sections = [
  "identifiers",
  "taxRegistrations",
  "classifications",
  "governanceRelations",
  "certifications",
  "bankAccounts",
];
/** A fixed writable boundary complements the published form's field requirements. */
export function validateRequestCapture(
  extensions: BusinessPartnerRequestExtensions,
  draft = false,
) {
  for (const row of extensions.bankAccounts ?? []) {
    const allowed = [
      "clientItemKey",
      "definitionFieldCode",
      "accountHolderName",
      "bankCountryCode",
      "bankName",
      "bankSource",
      "bankInstitutionId",
      "bankBranchId",
      "bankDirectoryReleaseId",
      "accountIdType",
      "protectedValueToken",
      "maskedValue",
      "valueHash",
      "bic",
      "clearingCode",
      "branch",
      "currencyCode",
      "intendedUse",
      "notes",
    ];
    for (const [key, value] of Object.entries(row))
      if (
        !allowed.includes(key) ||
        typeof value !== "string" ||
        value.length > (key === "notes" ? 4000 : 320)
      )
        fail(`Bank account: invalid ${key}.`);
    if (
      (!draft || row.protectedValueToken || row.maskedValue || row.valueHash) &&
      (!/^bank:[0-9a-f-]{36}$/.test(String(row.protectedValueToken)) ||
        !/^••••/.test(String(row.maskedValue)) ||
        !/^[a-f0-9]{64}$/.test(String(row.valueHash)))
    )
      fail("Bank account requires protected capture.");
    if (
      ((!draft || row.accountIdType) &&
        !["iban", "local_account"].includes(String(row.accountIdType))) ||
      ((!draft || row.bankCountryCode) &&
        !/^[A-Z]{2}$/.test(String(row.bankCountryCode)))
    )
      fail("Bank account identifier type and country are required.");
    if (
      row.bankSource &&
      !["directory", "unlisted"].includes(String(row.bankSource))
    )
      fail("Bank selection source is invalid.");
    for (const key of [
      "bankInstitutionId",
      "bankBranchId",
      "bankDirectoryReleaseId",
    ])
      if (row[key] && !uuid.test(String(row[key])))
        fail("Bank directory coordinate is invalid.");
    if (
      row.bankSource === "unlisted" &&
      (row.bankInstitutionId || row.bankBranchId || row.bankDirectoryReleaseId)
    )
      fail("Unlisted banks cannot claim a directory match.");
    if (
      !draft &&
      row.bankSource === "directory" &&
      (!row.bankInstitutionId || !row.bankDirectoryReleaseId)
    )
      fail("Select a published bank or enter an unlisted bank for review.");
    if (row.currencyCode && !/^[A-Z]{3}$/.test(String(row.currencyCode)))
      fail("Account currency must be a three-letter code.");
    if (row.bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(row.bic)))
      fail("SWIFT / BIC must contain 8 or 11 valid characters.");
  }
  for (const doc of extensions.supportingDocuments ?? []) {
    const allowed = [
      "clientItemKey",
      "definitionFieldCode",
      "sectionCode",
      "entryKey",
      "attachmentId",
      "documentType",
      "issuedOn",
      "expiresOn",
    ];
    if (
      Object.entries(doc).some(
        ([k, v]) =>
          !allowed.includes(k) || typeof v !== "string" || v.length > 256,
      )
    )
      fail("Invalid supporting document fields.");
    if (
      ((!draft || doc.attachmentId) && !uuid.test(String(doc.attachmentId))) ||
      !sections.includes(String(doc.sectionCode))
    )
      fail("Invalid supporting document target.");
    const rows =
      extensions[doc.sectionCode as keyof BusinessPartnerRequestExtensions] ??
      [];
    if (!rows.some((row) => row.clientItemKey === doc.entryKey))
      fail("Supporting document must belong to an existing request entry.");
    for (const key of ["issuedOn", "expiresOn"]) {
      const value = doc[key];
      if (
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
          !Number.isFinite(Date.parse(String(value))) ||
          new Date(String(value)).toISOString().slice(0, 10) !== value)
      )
        fail(`Document ${key} is invalid.`);
    }
    if (
      doc.issuedOn &&
      doc.expiresOn &&
      String(doc.expiresOn) < String(doc.issuedOn)
    )
      fail("Document expiry precedes its issue date.");
  }
}
/** Pin uploaded versions to the request entry, with no master-data writes or review decisions. */
export async function linkRequestCaptureDocuments(
  input: {
    tenantId: string;
    principalId: string;
    caseId: string;
    extensions: BusinessPartnerRequestExtensions;
  },
  tx: Transaction<Record<string, never>>,
) {
  validateRequestCapture(input.extensions, true);
  for (const address of input.extensions.addresses ?? []) {
    if (address.stateRegionCode) {
      const match = (
        await sql<{
          name: string;
        }>`SELECT name FROM shared.state_region WHERE country_code=${address.countryCode} AND code=${address.stateRegionCode} AND status='active'`.execute(
          tx,
        )
      ).rows[0];
      if (!match || match.name !== address.region)
        fail(
          "State or region does not match the selected country and subdivision.",
        );
    }
    if (address.countryCode && address.postalCode) {
      const result = (
        await sql<{
          valid: boolean;
        }>`SELECT shared.fn_validate_postal_code(${address.countryCode},${address.postalCode}) valid`.execute(
          tx,
        )
      ).rows[0];
      if (!result?.valid)
        fail("Postal code does not match the selected country.");
    }
  }
  for (const bank of input.extensions.bankAccounts ?? []) {
    const capture = (await sql<{capture:Record<string,unknown>}>`SELECT validation_schema->'capture' capture FROM control.bank_account_validation_rule WHERE country_code=${String(bank.bankCountryCode ?? "")} AND status='active' AND validation_schema ? 'capture' ORDER BY priority DESC,code LIMIT 1`.execute(tx)).rows[0]?.capture;
    if (capture) {
      if (bank.accountIdType && bank.accountIdType !== capture.accountType) fail("Account number format does not match the selected country.");
      if (bank.clearingCode && typeof capture.routingPattern === "string" && capture.routingPattern && !new RegExp(capture.routingPattern).test(String(bank.clearingCode))) fail("Routing code does not match the selected country format.");
    }
    if (!bank.bankInstitutionId) continue;
    if (!bank.bankDirectoryReleaseId)
      fail("Bank directory release is required.");
    const match = (
      await sql<{
        name: string;
        country_code: string;
        branch_name: string | null;
      }>`SELECT i.name,i.country_code,b.name branch_name FROM shared.bank_institution_version i LEFT JOIN shared.bank_branch_version b ON b.release_id=i.release_id AND b.institution_id=i.institution_id AND b.branch_id=${String(bank.bankBranchId ?? "") || null}::uuid AND b.status='active' AND b.effective_from<=CURRENT_DATE AND (b.effective_until IS NULL OR b.effective_until>CURRENT_DATE) WHERE i.release_id=${String(bank.bankDirectoryReleaseId)}::uuid AND i.institution_id=${String(bank.bankInstitutionId)}::uuid AND i.status='active' AND i.effective_from<=CURRENT_DATE AND (i.effective_until IS NULL OR i.effective_until>CURRENT_DATE)`.execute(
        tx,
      )
    ).rows[0];
    if (
      !match ||
      match.name !== bank.bankName ||
      match.country_code.trim() !== bank.bankCountryCode ||
      (bank.bankBranchId &&
        (!match.branch_name || match.branch_name !== bank.branch))
    )
      fail("Bank directory details do not match the selected reference.");
  }
  for (const doc of input.extensions.supportingDocuments ?? []) {
    if (!doc.attachmentId) continue;
    const coordinate = `${input.caseId}:${doc.sectionCode}:${doc.entryKey}`;
    const attachment = (
      await sql<{
        id: string;
        series_id: string;
      }>`SELECT a.id,a.series_id FROM document.attachment a
   WHERE a.tenant_id=${input.tenantId}::uuid AND a.id=${String(doc.attachmentId)}::uuid
    AND a.status='active' AND a.is_active AND a.is_virus_scanned
    AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
    AND (a.uploaded_by=${input.principalId}::uuid OR EXISTS(SELECT 1 FROM document.attachment_link l WHERE l.tenant_id=a.tenant_id AND l.entity_type='business_partner_request_entry' AND l.entity_id=${coordinate} AND l.pinned_attachment_id=a.id)) FOR SHARE OF a`.execute(
        tx,
      )
    ).rows[0];
    if (!attachment)
      return fail(
        "Supporting document is unavailable, still processing, or inaccessible.",
      );
    await sql`INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind,created_by)
   VALUES(${input.tenantId}::uuid,'business_partner_request_entry',${coordinate},${attachment.series_id}::uuid,${attachment.id}::uuid,'context',${input.principalId}::uuid)
   ON CONFLICT(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind) DO NOTHING`.execute(
      tx,
    );
  }
}
