import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {validateCaseContractUpdate, type ActiveCaseContract} from "../business-partner-case-contract-service.js";
const canonical = (v:unknown):string => JSON.stringify(v, (_key,value)=>value && typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const canonicalizer={canonicalBytes:(v:unknown)=>new TextEncoder().encode(canonical(v)),sha256:(v:Uint8Array)=>createHash("sha256").update(v).digest("hex")};
const base:ActiveCaseContract={id:"base",tenantId:"tenant",entityId:"entity",publicationKey:"key",contractHash:"a".repeat(64),releaseNo:1,contract:{type:"object",additionalProperties:false,required:["name","requestedRole"],properties:{name:{type:"string",minLength:1},requestedRole:{type:"string",enum:["supplier","customer"]}}}};
function packet(){return {tenantId:base.tenantId,publicationKey:base.publicationKey,previous:{contractId:base.id,recordedContractHash:base.contractHash},candidate:{contract:{...structuredClone(base.contract),required:["name"],properties:{...structuredClone(base.contract.properties as object),expectedBusinessPartnerVersion:{type:"integer",minimum:1},reasonCode:{type:"string"}}}}};}
describe("case contract native review",()=>{
 it("accepts the R4 extension and optional role without changing existing properties",()=>expect(validateCaseContractUpdate(packet(),base,canonicalizer)).toEqual(packet().candidate.contract));
 it("accepts the governed organization and company configuration fields",()=>{
  const p=packet(),properties=p.candidate.contract.properties;
  for(const name of ["effectiveFrom","effectiveUntil","currencyCode","paymentTermId","defaultAccountingProfileId","defaultDimensionSetId","preferredRemittanceBankLinkId","statementCycleCode"])Reflect.set(properties,name,{type:"string"});
  expect(validateCaseContractUpdate(p,base,canonicalizer)).toEqual(p.candidate.contract);
 });
 it("accepts the governed role extension fields",()=>{
  const p=packet(),properties=p.candidate.contract.properties;
  Reflect.set(properties,"partnerCategory",{type:"string",enum:["organization","person"]});
  for(const name of ["legalClassification","supplierType","customerType"])Reflect.set(properties,name,{type:"string"});
  expect(validateCaseContractUpdate(p,base,canonicalizer)).toEqual(p.candidate.contract);
 });
 it.each(["tenantId","publicationKey"])("rejects a mismatched %s",field=>{const p=packet();Reflect.set(p,field,"other");expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("SOURCE_CONFLICT");});
 it("rejects stale source coordinates",()=>{const p=packet();p.previous.contractId="stale";expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("SOURCE_CONFLICT");});
 it("rejects narrowing a published field",()=>{const p=packet();Reflect.set(p.candidate.contract.properties,"name",{type:"string",minLength:5});expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("EXISTING_PROPERTY_CHANGED");});
 it("rejects removing identity requirements",()=>{const p=packet();p.candidate.contract.required=[];expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("INCOMPATIBLE_SCHEMA");});
 it("rejects unknown schema extensions",()=>{const p=packet();Reflect.set(p.candidate.contract.properties,"authorizationOverride",{type:"boolean"});expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("UNSUPPORTED_PROPERTY");});
 it("rejects weakening the optimistic concurrency minimum",()=>{const p=packet();p.candidate.contract.properties.expectedBusinessPartnerVersion.minimum=0;expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("UNSUPPORTED_CONSTRAINT");});
 it("rejects unsupported constraints on company configuration fields",()=>{const p=packet();Reflect.set(p.candidate.contract.properties,"currencyCode",{type:"number"});expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("UNSUPPORTED_CONSTRAINT");});
 it("rejects unsupported constraints on role extension fields",()=>{const p=packet();Reflect.set(p.candidate.contract.properties,"partnerCategory",{type:"string"});expect(()=>validateCaseContractUpdate(p,base,canonicalizer)).toThrow("UNSUPPORTED_CONSTRAINT");});
});
