// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock("@athyper/platform-shell", () => ({useRecordPage:()=>{}, PageHeader:()=>null}));
vi.mock("@athyper/platform-shell-app-foundation", () => ({useApiClient:()=>({request}), useSessionIdentity:()=>({scope:{tenantId:"tenant",principalId:"user",authEpoch:3}})}));
vi.mock("@athyper/product-neon-shell", () => ({
  useNeonWorkContext:()=>{throw new Error("Record opening must not inherit shell company");},
  useNeonOperatingOrganization:()=>{throw new Error("Record opening must not inherit shell organization");}
}));
import { BusinessPartner360Shell } from "./business-partner-360";
it("opens an unscoped record without adding shell coordinates to its request or URL", async()=>{
 document.body.innerHTML='<div id="root"></div>';
 window.history.replaceState({}, "", "/mdg/business-partner/record");
 const previous=Object.getOwnPropertyDescriptor(globalThis,"IS_REACT_ACT_ENVIRONMENT");
 Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{configurable:true,value:true});
 const root=createRoot(document.getElementById("root")!);
 try{
  await act(async()=>root.render(<BusinessPartner360Shell businessPartnerId="record"/>));
  expect(request).toHaveBeenCalled();
  const args=request.mock.calls[0] as unknown as [unknown,{query:Record<string,unknown>}];
  expect(args[1].query).not.toHaveProperty("operatingOrganizationId");
  expect(args[1].query).not.toHaveProperty("companyCodeId");
  expect(args[1].query).not.toHaveProperty("legalEntityId");
  expect(window.location.search).toBe("");
 }finally{await act(async()=>root.unmount());if(previous)Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",previous);else Reflect.deleteProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT");}
});
