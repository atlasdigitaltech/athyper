// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const test=vi.hoisted(()=>({bank:vi.fn(),activity:vi.fn()}));
vi.mock("@athyper/platform-shell-app-foundation",()=>({useApiClient:()=>http,useSessionIdentity:()=>({scope:{tenantId:"tenant",principalId:"user",authEpoch:1}})}));
const http={};
vi.mock("@athyper/product-neon-shell",()=>({useNeonWorkContext:()=>({companies:[{companyCodeId:"uk",displayName:"UK"},{companyCodeId:"eu",displayName:"EU"}]})}));
vi.mock("../business-partner-360-context",()=>({useBusinessPartner360:()=>({summary:{identity:{id:"bp"},scope:{},asOf:"2026-09-09",completeness:{readOnly:false},sections:["roles-scope","banking","business-activity"].map(code=>({code,authorization:"granted"}))},selectSection:vi.fn()})}));
vi.mock("../company-relationships",async()=>({...await vi.importActual("../company-relationships"),useCompanyRelationships:()=>({allowed:true,rows:[{companyCodeId:"uk",role:"supplier",roleStatus:"active",assignmentStatus:"active",profileStatus:"active"},{companyCodeId:"eu",role:"customer",roleStatus:"active",assignmentStatus:"active",profileStatus:"active"}]})}));
vi.mock("../business-partner-360-commercial-client",()=>({createBusinessPartner360CommercialClient:()=>({read:test.bank})}));
vi.mock("../business-partner-360-explainability-client",()=>({createBusinessPartner360ExplainabilityClient:()=>({read:test.activity})}));
vi.mock("@athyper/platform-ui",()=>({Card:({children}:any)=><section>{children}</section>}));
import {RelationshipOverview} from "./relationship-overview";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});test.bank.mockReset();test.activity.mockReset();test.bank.mockResolvedValue({data:{accounts:[{linkId:"local",companyAssignments:[{assignmentId:"same",companyCodeId:"uk",purpose:"payment",acceptanceCurrent:false}]},{linkId:"mesh:projection",companyAssignments:[{assignmentId:"same",companyCodeId:"uk",purpose:"payment",acceptanceCurrent:false}]}]}});test.activity.mockResolvedValue({data:{providers:[{provider:"finance",state:"unavailable",metrics:[]}]}});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("deduplicates local/disclosure acceptance and labels missing performance without fabricating totals",async()=>{await act(async()=>root.render(<RelationshipOverview/>));expect(host.textContent).toContain("Buying in 1 company · Selling in 1 company");expect(host.textContent).toContain("1 company account assignment requires acceptance review");expect(host.textContent).toContain("Unavailable values are not zero");expect(host.textContent).toContain("2026-01-01 – 2026-09-09");expect(test.bank.mock.calls[0]?.[0]).not.toHaveProperty("companyCodeId");});
it("filters relationship counts and requests bank/operational projections for the selected company",async()=>{await act(async()=>root.render(<RelationshipOverview/>));await act(async()=>{const s=host.querySelector('[aria-label="Overview company"]') as HTMLSelectElement;s.value="uk";s.dispatchEvent(new Event("change",{bubbles:true}));});expect(host.textContent).toContain("Buying in 1 company · Selling in 0 companies");expect(test.bank.mock.lastCall?.[0]).toMatchObject({companyCodeId:"uk"});expect(test.activity.mock.lastCall?.[0]).toMatchObject({companyCodeId:"uk"});expect(host.querySelector("a")?.href).toContain("companyCodeId=uk");});
