import { describe, expect, it } from "vitest";
import {
  isRequestFieldVisible,
  parsePublishedRequestForm,
  requestFormDefaults,
  serializeRequestForm,
  type RequestFormField,
} from "./request-form-descriptor.js";

const envelope = {
  requestForm: {
    definition: {
      code: "neon.business_partner_request.supplier.new",
      version: 7,
      hash: "a".repeat(64),
      releaseId: "12000000-0000-4000-8000-000000000004",
    },
    descriptor: {
      schema: "athyper.business-partner-request-form/1",
      version: "1.0.0",
      title: "New supplier onboarding request",
      description: "Create a governed supplier request.",
      submitLabel: "Create draft request",
      sections: [
        {
          key: "identity",
          title: "Organization identity",
          fields: [
            { key: "legalName", path: "legalName", target: "canonical", label: "Legal name", widget: "text", required: true },
            {
              key: "ownershipClass",
              path: "ownershipClass",
              target: "canonical",
              label: "Ownership",
              widget: "lookup",
              required: true,
              defaultValue: "external",
              lookup: { code: "master.ownership", options: [{ value: "external", label: "External" }] },
            },
            {
              key: "qualificationTypeCode",
              path: "qualificationTypeCode",
              target: "canonical",
              label: "Qualification type",
              widget: "text",
              required: true,
              visibility: { field: "ownershipClass", operator: "equals", value: "external" },
            },
            {
              key: "expectedAnnualSpend",
              path: "expectedAnnualSpend",
              target: "request_only",
              label: "Expected annual spend",
              widget: "decimal",
              required: false,
            },
          ],
        },
      ],
    },
  },
};

describe("published Business Partner request forms", () => {
  it("parses the release and descriptor and exposes published defaults", () => {
    const form = parsePublishedRequestForm(envelope);
    expect(form.definition).toMatchObject({ version: 7, releaseId: "12000000-0000-4000-8000-000000000004" });
    expect(form.descriptor.sections[0]?.fields).toHaveLength(4);
    expect(requestFormDefaults(form.descriptor)).toEqual({ ownershipClass: "external" });
  });

  it("evaluates conditional visibility from the current answers", () => {
    const field = parsePublishedRequestForm(envelope).descriptor.sections[0]?.fields[2] as RequestFormField;
    expect(isRequestFieldVisible(field, { ownershipClass: "external" })).toBe(true);
    expect(isRequestFieldVisible(field, { ownershipClass: "internal" })).toBe(false);
  });

  it("parses bounded address components and their published lookups",()=>{const value={requestForm:{...envelope.requestForm,descriptor:{...envelope.requestForm.descriptor,sections:[...envelope.requestForm.descriptor.sections,{key:"addresses",title:"Addresses",fields:[],components:[{key:"addresses",kind:"addresses",title:"Supplier addresses",addLabel:"Add address",minItems:1,maxItems:10,requirePrimary:true,lookups:{countries:[{value:"MY",label:"Malaysia"}],purposes:[{value:"registered",label:"Registered"}]}}]}]}}};const form=parsePublishedRequestForm(value);expect(form.descriptor.sections[1]?.components?.[0]).toMatchObject({kind:"addresses",maxItems:10,requirePrimary:true,lookups:{countries:[{value:"MY",label:"Malaysia"}]}});});

  it("keeps tenant request-only answers out of canonical fields", () => {
    const descriptor = parsePublishedRequestForm(envelope).descriptor;
    const data = new FormData();
    data.set("legalName", "Acme Ltd");
    data.set("ownershipClass", "external");
    data.set("qualificationTypeCode", "compliance");
    data.set("expectedAnnualSpend", "125000.50");
    expect(serializeRequestForm(descriptor, data).proposedPayload).toEqual({
      partnerCategory: "organization",
      legalName: "Acme Ltd",
      ownershipClass: "external",
      qualificationTypeCode: "compliance",
      tenantFields: { expectedAnnualSpend: 125000.5 },
    });
  });

  it("fails closed for duplicate keys and incompatible descriptors", () => {
    const duplicate = structuredClone(envelope);
    duplicate.requestForm.descriptor.sections[0]!.fields.push({ ...duplicate.requestForm.descriptor.sections[0]!.fields[0]! });
    expect(() => parsePublishedRequestForm(duplicate)).toThrow(/field keys are invalid/);
    expect(() => parsePublishedRequestForm({ requestForm: { ...envelope.requestForm, descriptor: { ...envelope.requestForm.descriptor, schema: "unknown" } } })).toThrow(/incompatible/);
  });
});

it("explicitly clears previously saved visible fields when serializing a draft update", () => {
  const {descriptor}=parsePublishedRequestForm(envelope);
  const data=new FormData();
  data.set("ownershipClass","external");
  const saved=serializeRequestForm(descriptor,data,{includeEmpty:true});
  expect(saved.proposedPayload).toMatchObject({legalName:null,qualificationTypeCode:null,tenantFields:{}});
  expect(serializeRequestForm(descriptor,data).proposedPayload).not.toHaveProperty("legalName");
});
