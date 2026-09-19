import {
  supplierComplianceLevels,
  supplierRequirementFieldContract,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export function validateSupplierOnboardingRequirement(
  input: {
    readonly kind: string;
    readonly source: { readonly kind: string };
    readonly requestedRole?: string;
    readonly proposedPayload: Readonly<Record<string, unknown>>;
  },
  options: {
    readonly draft?: boolean;
    readonly previous?: Readonly<Record<string, unknown>>;
    readonly changes?: Readonly<Record<string, unknown>>;
  } = {},
): void {
  const payload = input.proposedPayload;
  const level = payload.requestedComplianceLevel;
  const reason = payload.complianceRequirementReason;
  const applicable =
    input.kind === "new_partner" &&
    input.source.kind === "manual" &&
    input.requestedRole === "supplier";
  const fail = (field: string, message: string): never => {
    throw new MasterDataError(
      422,
      "SUPPLIER_COMPLIANCE_REQUIREMENT_INVALID",
      message,
      [{ fieldPath: field, message }],
    );
  };
  if (!applicable) {
    if (level !== undefined || reason !== undefined)
      fail(
        "requestedComplianceLevel",
        "Compliance requirement applies only to internal new-supplier requests.",
      );
    return;
  }
  if (level !== undefined && !supplierComplianceLevels.includes(level as never))
    fail(
      "requestedComplianceLevel",
      "Select Basic, Standard or Enhanced compliance requirement.",
    );
  if (!options.draft && level === undefined)
    fail(
      "requestedComplianceLevel",
      "Select a compliance requirement before submission.",
    );
  if (
    reason !== undefined &&
    (typeof reason !== "string" ||
      reason.length > supplierRequirementFieldContract.reasonMaxLength)
  )
    fail(
      "complianceRequirementReason",
      "Requirement reason must be text of at most 2000 characters.",
    );
  const changed =
    options.previous?.requestedComplianceLevel !== undefined &&
    level !== options.previous.requestedComplianceLevel;
  // A previous explanation cannot silently justify a new assertion. Require it in the edit.
  const suppliedReason = changed
    ? options.changes?.complianceRequirementReason
    : reason;
  if (
    (level === "basic" || changed) &&
    (typeof suppliedReason !== "string" || !suppliedReason.trim())
  )
    fail(
      "complianceRequirementReason",
      "Explain a Basic requirement or a change to the saved requirement.",
    );
}
