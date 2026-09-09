import { describe, it, expect } from "vitest";
import { normalizeBankIdentifier as normalize } from "./bank-account-identifiers.js";
const iban = {accountIdType:"iban",accountIdentifier:"GB82 WEST 1234 5698 7654 32",bankCountryCode:"GB"};
describe("shared bank identifiers",()=>{
 it("normalizes IBAN separately from BIC",()=>expect(normalize({...iban,bic:" westgb2l "})).toEqual({identifier:"GB82WEST12345698765432",bic:"WESTGB2L"}));
 it.each(["GB83WEST12345698765432","GB82WEST1234569876543","MY1234567890","GB82-WEST12345698765432"])("rejects invalid structure or checksum %s",accountIdentifier=>expect(()=>normalize({...iban,accountIdentifier})).toThrow());
 it("rejects country mismatch",()=>expect(()=>normalize({...iban,bankCountryCode:"DE"})).toThrow());
 it("preserves domestic leading zeroes and requires the routing scheme",()=>{
  const input={accountIdType:"local",accountIdentifier:"00123456",bankCountryCode:"GB",clearingScheme:"sort_code",branchCode:"12-34-56"};
  expect(normalize(input).identifier).toBe("00123456");
  expect(()=>normalize({...input,clearingScheme:"aba"})).toThrow();
  expect(()=>normalize({...input,branchCode:"123"})).toThrow();
 });
 it("checks ABA checksum",()=>{
  const input={accountIdType:"local",accountIdentifier:"00123456",bankCountryCode:"US",clearingScheme:"aba",branchCode:"021000021"};
  expect(normalize(input).identifier).toBe("00123456");
  expect(()=>normalize({...input,branchCode:"021000022"})).toThrow();
 });
 it("rejects an identifier type that could bypass validation",()=>expect(()=>normalize({...iban,accountIdType:"anything"})).toThrow());
});
