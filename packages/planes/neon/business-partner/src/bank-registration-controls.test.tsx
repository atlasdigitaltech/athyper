// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {BankRegistrationControls} from "./bank-registration-controls";
const state=vi.hoisted(()=>({allowed:true,request:vi.fn()}));
vi.mock("@athyper/platform-shell-app-foundation",()=>({useApiClient:()=>({request:state.request}),usePermissions:()=>({has:()=>state.allowed})}));
vi.mock("@athyper/platform-ui",()=>({Card:({children}:any)=><section>{children}</section>,Button:({children,...props}:any)=><button {...props}>{children}</button>,Input:(props:any)=><input {...props}/>,Label:(props:any)=><label {...props}/>}));
let container:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});state.allowed=true;state.request.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const submit=async()=>{await act(async()=>container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));};
it("does not show capture without the registration grant",async()=>{
 state.allowed=false;await act(async()=>root.render(<BankRegistrationControls businessPartnerId="partner"/>));expect(container.querySelector("form")).toBeNull();
});
it("masks account input, normalizes codes and permits correction after validation rejection",async()=>{
 state.request.mockRejectedValueOnce({status:422}).mockResolvedValueOnce({registration:{account_last4:"5432",status:"active"}});
 await act(async()=>root.render(<BankRegistrationControls businessPartnerId="partner"/>));
 const field=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
 expect(field("accountIdentifier").type).toBe("password");
 field("currencyCode").value="gbp";field("bankCountryCode").value="gb";field("bic").value="testgb00";
 field("accountIdentifier").value="invalid";
 await submit();const first=state.request.mock.calls[0]![1];
 expect(first.body).toMatchObject({currencyCode:"GBP",bankCountryCode:"GB",bic:"TESTGB00"});
 expect(container.querySelector("fieldset")!.disabled).toBe(false);
 expect(container.textContent).toContain("Correct the fields");
 field("accountIdentifier").value="synthetic-corrected";await submit();
 expect(state.request.mock.calls[1]![1].body.accountIdentifier).toBe("synthetic-corrected");
 expect(state.request.mock.calls[1]![1].idempotencyKey).not.toBe(first.idempotencyKey);
});
it("guards rapid submissions and ignores a response after switching records",async()=>{
 let complete!:(value:unknown)=>void;state.request.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 const changed=vi.fn();await act(async()=>root.render(<BankRegistrationControls businessPartnerId="one" onChanged={changed}/>));
 await act(async()=>{const form=container.querySelector("form")!;for(let i=0;i<2;i++)form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(state.request).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<BankRegistrationControls businessPartnerId="two" onChanged={changed}/>));
 await act(async()=>complete({registration:{account_last4:"5432",status:"active"}}));
 expect(changed).not.toHaveBeenCalled();expect(container.querySelector('[role="status"]')).toBeNull();
});
it("keeps the same request after timeout and refreshes after confirmed capture",async()=>{
 const changed=vi.fn();state.request.mockRejectedValueOnce(Error("timeout")).mockResolvedValueOnce({registration:{bank_account_link_id:"link",account_last4:"5432",status:"active"}});
 await act(async()=>root.render(<BankRegistrationControls businessPartnerId="partner" onChanged={changed}/>));
 (container.querySelector('[name="accountIdentifier"]') as HTMLInputElement).value="GB82WEST12345698765432";
 await submit();const first=state.request.mock.calls[0]![1];expect(changed).not.toHaveBeenCalled();
 expect(container.textContent).toContain("Retry sends the same request safely");
 await submit();expect(state.request.mock.calls[1]![1]).toEqual(first);expect(first.body).not.toHaveProperty("companyCodeId");
 expect(changed).toHaveBeenCalledOnce();expect(container.textContent).toContain("ending 5432 saved");
 expect((container.querySelector('[name="accountIdentifier"]') as HTMLInputElement).value).toBe("");
});
