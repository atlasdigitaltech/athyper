// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createHttpClient} from "@athyper/platform-api-client";
import {BankingWorkspace} from "./banking-workspace";
const state=vi.hoisted(()=>({http:undefined as unknown}));
vi.mock("@athyper/platform-shell-app-foundation",()=>({useApiClient:()=>state.http,usePermissions:()=>({has:()=>true}),useSessionIdentity:()=>({scope:{tenantId:"tenant",principalId:"principal",authEpoch:1}}),readBrowserCsrfToken:()=>"csrf"}));
vi.mock("@athyper/product-neon-shell",()=>({useNeonWorkContext:()=>({status:"ready",selection:{mode:"company",companyCodeId:"uk"},companies:[{companyCodeId:"uk",displayName:"CirrusAtlantic UK"}]})}));
vi.mock("@athyper/platform-surface-kit",()=>({PageSurface:({title,children}:any)=><main><h1>{title}</h1>{children}</main>}));
vi.mock("@athyper/platform-ui",()=>({Card:({children}:any)=><section>{children}</section>,Button:({children,loading,...props}:any)=><button {...props}>{children}</button>,Input:(props:any)=><input {...props}/>,Label:(props:any)=><label {...props}/>}));
const transport=vi.fn<typeof fetch>();let container:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});transport.mockReset();state.http=createHttpClient({fetch:transport,csrfToken:()=>"csrf"});container=document.createElement("div");document.body.append(container);root=createRoot(container);transport.mockImplementation(async(input)=>{
 const url=String(input);
 if(url.includes("/business-partner-bank-verifications/"))return Response.json({id:"review",business_partner_id:"partner",company_code_id:"uk",status:"verified"});
 return Response.json({schemaVersion:1,data:{scopeState:url.includes("companyCodeId")?"scoped":"global",supplierCompanyProfileId:"profile",accounts:[{linkId:"mesh:projection",bankProjectionId:"projection",maskedAccount:"•••• 4821",bankName:"Example Bank",source:"MESH",companyAssignments:[{companyCodeId:"uk",verificationId:"review"}]}]}});
 });});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it("opens management unscoped even if the shell has selected a company",async()=>{
 await act(async()=>root.render(<BankingWorkspace businessPartnerId="partner"/>));
 expect(String(transport.mock.calls[0]?.[0])).not.toContain("companyCodeId");expect(container.textContent).toContain("Manage banking");expect(container.textContent).toContain("Select a company");
 const select=container.querySelector("#banking-company") as HTMLSelectElement;
 await act(async()=>{select.value="uk";select.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(transport.mock.calls.some(call=>String(call[0]).includes("companyCodeId=uk"))).toBe(true);expect(container.textContent).toContain("Register a bank account");
});
it("loads the selected company's real verification and offers the latest disclosure review",async()=>{
 await act(async()=>root.render(<BankingWorkspace businessPartnerId="partner" mode="verification" initialCompanyCodeId="uk" initialBankProjectionId="projection"/>));
 expect(transport.mock.calls.some(call=>String(call[0]).includes("/business-partner-bank-verifications/review"))).toBe(true);
 expect(container.textContent).toContain("Start review of latest disclosure");expect(container.textContent).toContain("Apply verified bank change");
});
