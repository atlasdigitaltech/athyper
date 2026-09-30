/** BP-AI-10 gates are independent: qualifying one capability never enables another. */
export const extendedCapabilities = Object.freeze({
  duplicate_candidates: {
    evidence_quality: [
      "matching-method-versioned",
      "matching-and-conflicting-evidence",
      "bounded-authorized-coverage",
      "candidates-not-confirmed-duplicates",
    ],
    disclosure: [
      "target-and-candidate-reauthorized",
      "comparison-fields-authorized",
      "hidden-existence-and-counts-withheld",
      "revocation-before-replay",
    ],
    workflow: [
      "compare-action-authorized",
      "no-merge-or-write",
      "stale-candidate-rejected",
    ],
  },
  document_expiry: {
    evidence_quality: [
      "owner-expiry-rule-and-business-date",
      "missing-date-not-valid",
      "current-document-revision",
      "bounded-passages-and-accurate-citations",
      "partial-not-all-clear",
    ],
    disclosure: [
      "parent-and-document-reauthorized",
      "stale-deleted-unscanned-excluded",
      "protected-passages-withheld",
      "revocation-before-replay",
      "document-instructions-treated-as-data",
    ],
    workflow: [
      "expiry-not-eligibility",
      "authorized-document-navigation",
      "no-renewal-or-write",
    ],
  },
  draft_preview: {
    evidence_quality: [
      "owner-nonpersistent-evaluation",
      "allowlisted-patch",
      "base-and-definition-version-bound",
      "draft-labelled-not-saved-readiness",
    ],
    disclosure: [
      "field-and-scope-admission",
      "restricted-inputs-withheld",
      "no-protected-values-in-telemetry",
      "revocation-before-replay",
    ],
    workflow: [
      "no-persistence-or-submit",
      "stale-base-rejected",
      "saved-owner-validation-before-confirmed-submit",
    ],
  },
});

export function extendedRequirements(capabilities) {
  return capabilities.flatMap((capability) =>
    ["owner_contract", "evidence_quality", "disclosure", "workflow"].map(
      (dimension) => `extended:${capability}:${dimension}`,
    ),
  );
}

export function verifyExtendedReceipt(id, receipt, contracts) {
  const [, capability, dimension] = id.split(":");
  const contract = contracts?.[capability];
  if (!contract || receipt.ownerContractSha256 !== contract)
    throw new Error("capability owner contract binding mismatch");
  const required =
    dimension === "owner_contract"
      ? [
          "owner-api-versioned",
          "scope-and-disclosure-policy-versioned",
          "unavailable-and-freshness-semantics",
          "owner-reviewed",
        ]
      : extendedCapabilities[capability]?.[dimension];
  if (
    !required ||
    required.some(
      (id) =>
        !receipt.assertions.some(
          (check) => check.id === id && check.passed === true,
        ),
    )
  )
    throw new Error("capability-specific assertions incomplete");
}
