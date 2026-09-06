import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RequestView } from "./client";
import {
  DuplicateEvidence,
  ValidationEvidence,
  validationTarget,
} from "./validation-experience";

describe("Business Partner validation experience", () => {
  it("links only blocking findings with permitted editable targets", () => {
    expect(validationTarget("$.legalName")).toBe("bp-edit-legal-name");
    expect(validationTarget("$.registrationCountryCode")).toBe(
      "bp-edit-country",
    );
    expect(validationTarget("$.requestedRole")).toBeUndefined();
    expect(validationTarget("$.proposedPayload.creditLimit")).toBeUndefined();
  });

  it("renders actionable permitted-field links and truthful exact-match provenance", () => {
    const view = {
      case: { id: "11111111-1111-4111-8111-111111111111" },
      request: {
        duplicateSummary: {
          matchMethod: "exact_legal_name_case_insensitive",
          sourceEntity: "master.business_partner",
          scored: false,
          exactLegalNameCandidateCount: 1,
          candidates: [{ id: "bp-1", code: "BP.EXACT", name: "Acme" }],
        },
      },
      validationFindings: [
        {
          ruleCode: "identity.legal_name.required",
          severity: "error",
          fieldPath: "$.legalName",
          outcome: "failed",
          messageCode: "LEGAL_NAME_REQUIRED",
          evidenceReference: {},
        },
        {
          ruleCode: "role.requested.required",
          severity: "error",
          fieldPath: "$.requestedRole",
          outcome: "failed",
          messageCode: "REQUESTED_ROLE_REQUIRED",
          evidenceReference: {},
        },
      ],
    } as unknown as RequestView;
    const validation = renderToStaticMarkup(
      createElement(ValidationEvidence, { view }),
    );
    expect(validation).toContain('/edit#bp-edit-legal-name">Fix this field');
    expect(validation.match(/Fix this field/g)).toHaveLength(1);
    const duplicate = renderToStaticMarkup(
      createElement(DuplicateEvidence, { request: view.request }),
    );
    expect(duplicate).toContain("Exact legal-name match (case-insensitive)");
    expect(duplicate).toContain("NEON Business Partner master");
    expect(duplicate).toContain(
      "does not calculate or imply a similarity score",
    );
  });
});
