import { describe, it, expect } from "vitest";
import {
  certificateCollection,
  qualificationCollection,
} from "../business-partner/classification/projection";
describe("independent compiled classification surfaces", () => {
  it("maps authorized certificate fields without returning protected or unrelated DTO fields", () => {
    expect(
      certificateCollection([
        {
          id: "cert",
          name: "Demo",
          customName: "Custom certificate",
          issuingBody: "Catalog issuer",
          certificateNumber: "DEMO-1",
          status: "active",
          effectiveFrom: "2025-01-01",
          rawValue: "hidden",
          attachment: { attachmentId: "authorized", downloadHref: "/unsafe" },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        display_name: "Demo",
        custom_name: "Custom certificate",
        issuing_body: "Catalog issuer",
        certificate_number: "DEMO-1",
        document_attachment_id: "authorized",
      }),
    ]);
    const text = JSON.stringify(
      certificateCollection([
        {
          name: "Demo",
          rawValue: "hidden",
          document_attachment_id: "not-authorized",
        },
      ]),
    );
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("not-authorized");
  });
  it("does not manufacture certificate attachment access or qualification decisions", () => {
    expect(
      certificateCollection([{ id: "cert", name: "Demo" }])[0],
    ).not.toHaveProperty("document_attachment_id");
    expect(qualificationCollection(undefined)).toEqual([]);
    expect(
      qualificationCollection([
        {
          id: "q",
          contextKind: "supplier",
          typeCode: "initial",
          decision: "rejected",
          commodityCapabilities: [{ id: "fact" }],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        context_kind: "supplier",
        qualification_type_code: "initial",
        decision: "rejected",
      }),
    ]);
  });
});
