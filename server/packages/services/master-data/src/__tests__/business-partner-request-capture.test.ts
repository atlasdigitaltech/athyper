import { describe, it, expect } from "vitest";
import { validateRequestCapture } from "../business-partner-request-capture.js";
const bank = {
  clientItemKey: "bank-1",
  definitionFieldCode: "bank_accounts",
  accountHolderName: "Example Ltd",
  bankName: "Example Bank",
  bankCountryCode: "MY",
  accountIdType: "local_account",
  protectedValueToken: "bank:11111111-1111-4111-8111-111111111111",
  maskedValue: "••••1234",
  valueHash: "a".repeat(64),
};
const doc = {
  clientItemKey: "doc-1",
  definitionFieldCode: "supporting_documents",
  sectionCode: "bankAccounts",
  entryKey: "bank-1",
  attachmentId: "22222222-2222-4222-8222-222222222222",
  documentType: "bank_confirmation",
};
describe("request-only capture boundary", () => {
  it("accepts a protected bank entry and its document", () =>
    expect(() =>
      validateRequestCapture({
        bankAccounts: [bank],
        supportingDocuments: [doc],
      }),
    ).not.toThrow());
  it("rejects raw account details and operational decisions", () => {
    for (const extra of [
      { accountIdentifier: "0001234" },
      { isVerified: "true" },
      { paymentDestination: "true" },
    ])
      expect(() =>
        validateRequestCapture({ bankAccounts: [{ ...bank, ...extra }] }),
      ).toThrow();
  });
  it("rejects orphaned document associations", () =>
    expect(() =>
      validateRequestCapture({
        bankAccounts: [bank],
        supportingDocuments: [{ ...doc, entryKey: "removed-bank" }],
      }),
    ).toThrow());
  it("rejects invalid dates and incompatible expiry", () => {
    for (const extra of [
      { issuedOn: "2026-02-30" },
      { issuedOn: "2026-09-13", expiresOn: "2025-01-01" },
    ])
      expect(() =>
        validateRequestCapture({
          bankAccounts: [bank],
          supportingDocuments: [{ ...doc, ...extra }],
        }),
      ).toThrow();
  });
});
it("permits incomplete capture in drafts but rejects it at submission",()=>{
 const incomplete={bankAccounts:[{clientItemKey:"bank-1",definitionFieldCode:"bank_accounts",accountHolderName:"Example"}],supportingDocuments:[{clientItemKey:"doc-1",definitionFieldCode:"supporting_documents",sectionCode:"bankAccounts",entryKey:"bank-1",documentType:"bank_confirmation"}]};
 expect(()=>validateRequestCapture(incomplete,true)).not.toThrow();
 expect(()=>validateRequestCapture(incomplete)).toThrow();
 expect(()=>validateRequestCapture({bankAccounts:[{...incomplete.bankAccounts[0],accountIdentifier:"000123"}]},true)).toThrow();
});

it("requires directory coordinates and keeps unlisted capture separate from a directory match",()=>{
 expect(()=>validateRequestCapture({bankAccounts:[{...bank,bankSource:'directory'}]})).toThrow(/Select a published bank/);
 expect(()=>validateRequestCapture({bankAccounts:[{...bank,bankSource:'unlisted'}]})).not.toThrow();
 expect(()=>validateRequestCapture({bankAccounts:[{...bank,bankSource:'unlisted',bankInstitutionId:'11111111-1111-4111-8111-111111111111'}]})).toThrow(/cannot claim/);
 expect(()=>validateRequestCapture({bankAccounts:[{...bank,bankSource:'directory',bankInstitutionId:'not-an-id'}]},true)).toThrow(/coordinate/);
});
