// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {createHttpClient} from "@athyper/platform-api-client";
import {BankVerificationControls} from "./bank-verification-controls";
const state=vi.hoisted(()=>({http:undefined as unknown}));
vi.mock("@athyper/platform-shell-app-foundation",()=>({readBrowserCsrfToken:()=>"csrf",useApiClient:()=>state.http,usePermissions:()=>({has:()=>true})}));
vi.mock("@athyper/platform-ui",()=>({Card:({children}:any)=><section>{children}</section>,Button:({children,loading,...props}:any)=><button {...props}>{children}</button>,Input:(props:any)=><input {...props}/>,Label:({children,...props}:any)=><label {...props}>{children}</label>}));
let container:HTMLDivElement,root:Root;
const transport=vi.fn<typeof fetch>();
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});transport.mockReset();state.http=createHttpClient({fetch:transport,csrfToken:()=>"csrf"});container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root.render(<BankVerificationControls businessPartnerId="partner" companyCodeId="company"/>));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const button=(text:string)=>[...container.querySelectorAll("button")].find(node=>node.textContent===text);
async function click(node:HTMLElement){await act(async()=>node.click());}
async function input(id:string,value:string){const node=container.querySelector(`#${id}`) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));});}
async function load(status:string,partner="partner"){await input("bank-verification-id","verification");transport.mockResolvedValueOnce(Response.json({id:"verification",business_partner_id:partner,company_code_id:"company",status,created_by:"maker",candidate_bank_account_link_id:"candidate"}));await click(button("Load bank verification")!);}
it("never exposes apply for a pending verification",async()=>{await load("pending_verification");expect(button("Apply verified bank change")).toBeUndefined();expect(button("Verify bank change")!.disabled).toBe(true);});
it("offers MFA step-up for protected bank operations",()=>{expect(button("Verify bank change with MFA")).toBeDefined();expect(container.querySelector('form[action^="/api/auth/step-up/start"] input[name="csrfToken"]')).toBeDefined();});
it("requires explicit confirmation to apply and removes the control after the native receipt",async()=>{await load("verified");expect(button("Apply verified bank change")!.disabled).toBe(true);await click(container.querySelector('input[type="checkbox"]')!);transport.mockResolvedValueOnce(Response.json({verification:{id:"verification",business_partner_id:"partner",company_code_id:"company",status:"applied",created_by:"maker",applied_by:"checker",candidate_bank_account_link_id:"candidate"},replayed:false}));await click(button("Apply verified bank change")!);expect(container.textContent).toContain("native application receipt is recorded");expect(button("Apply verified bank change")).toBeUndefined();});
it("refuses a verification for another partner",async()=>{await load("verified","other-partner");expect(container.textContent).toContain("different partner or company");expect(button("Apply verified bank change")).toBeUndefined();});
it("clears loaded authority when its ID changes",async()=>{await load("verified");await input("bank-verification-id","other");expect(button("Apply verified bank change")).toBeUndefined();});
it("refreshes company acceptance after applying a verification",async()=>{
 const onApplied=vi.fn();
 await act(async()=>root.render(<BankVerificationControls businessPartnerId="partner" companyCodeId="company" onApplied={onApplied}/>));
 await load("verified");
 const confirmation=container.querySelector('input[type="checkbox"]') as HTMLInputElement;
 await click(confirmation);
 transport.mockResolvedValueOnce(Response.json({verification:{id:"verification",business_partner_id:"partner",company_code_id:"company",status:"applied"}}));
 await click(button("Apply verified bank change")!);
 expect(onApplied).toHaveBeenCalledTimes(1);
});
