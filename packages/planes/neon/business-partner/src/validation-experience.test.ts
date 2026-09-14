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
      case: { id: "11111111-1111-4111-8111-111111111111", allowedActions:[{id:"edit"}] },
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
    expect(validation).toContain('/edit">Edit request');
    expect(validation.match(/Edit request/g)).toHaveLength(2);
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

describe("friendly validation results", () => {
  const finding = (ruleCode: string, outcome = "passed", messageCode = "NAME_REQUIRED", severity = "error") => ({ruleCode,outcome,messageCode,severity,fieldPath:"$.name",evidenceReference:{}});
  const render = (findings: unknown[], extra: Record<string,unknown> = {}) => renderToStaticMarkup(createElement(ValidationEvidence,{view:{
    case:{id:"case",allowedActions:[]},request:{kind:"new_partner",source:{kind:"manual"},validationSummary:{outcome:"passed"}},validationFindings:findings,...extra,
  } as unknown as RequestView}));
  it("collapses passed results and preserves codes only in technical details", () => {
    const html=render([finding("identity.name.required"),finding("role.target.required"),finding("source.mesh.pin.required")]);
    expect(html).toContain("Registered name provided");
    expect(html).toContain("No existing partner selected");
    expect(html).toContain("Mesh source verification is not required for manual entry");
    expect(html).toContain("3 checks passed");
    expect(html).not.toContain("<details open");
    expect(html.indexOf("NAME_REQUIRED")).toBeGreaterThan(html.indexOf("Technical details"));
  });
  it("distinguishes not-applicable checks from checks missing input", () => {
    const html=render([finding("company.code.required","skipped","COMPANY_CODE_NOT_REQUIRED"),finding("identity.registration_country.format","skipped","REGISTRATION_COUNTRY_NOT_PROVIDED")]);
    expect(html).toContain("1 not applicable");expect(html).toContain("1 not checked");
    expect(html).toContain("a-badge--neutral");expect(html).not.toContain("a-badge--success");
    expect(html).toContain("no country was provided");
  });
  it("expands failures and does not offer editing without authority", () => {
    const html=render([finding("identity.name.required","failed")]);
    expect(html).toContain('<details open="">');expect(html).toContain("Enter the registered name.");
    expect(html).not.toContain("Edit request");expect(html).toContain("Validation needs attention");
  });
  it("treats failed warning rules as warnings and passed warning rules as success", () => {
    expect(render([finding("identity.name.duplicate","failed","NAME_DUPLICATE_CANDIDATE","warning")])).toContain("Validation completed with warnings");
    const passed=render([finding("identity.name.duplicate","passed","NAME_DUPLICATE_CANDIDATE","warning")]);
    expect(passed).toContain("No exact-name duplicates found");expect(passed).not.toContain("a-badge--warning");
  });
  it("marks old results as outdated and shows their checked revision", () => {
    const html=render([finding("identity.name.required")],{validationRun:{evaluationId:"evaluation",snapshotId:"snapshot",requestVersion:3,evaluatedAt:"2026-09-14T03:00:00Z",stale:true}});
    expect(html).toContain("Outdated—validate again");expect(html).toContain("Request revision 3");expect(html).toContain("previous results");
  });
});
