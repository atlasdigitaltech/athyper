import {describe,it,expect} from "vitest";
import {relationshipCounts,relationshipStatus,rolesHref,type Relationship} from "./company-relationships";
import {BUSINESS_PARTNER_360_PANEL,realignPartnerPanel} from "@athyper/product-neon-entity-extensions/business-partner/clients/panel-definition";
const row:Relationship={companyCodeId:"uk",companyName:"UK",operatingOrganizationId:"buying",operatingOrganizationName:"Buying",role:"supplier",roleStatus:"enabled",assignmentStatus:"active",profileStatus:"active"};
describe("company relationship projection",()=>{
 it("counts companies once across multiple operating organizations",()=>{expect(relationshipCounts([row,{...row,operatingOrganizationId:"other"},{...row,role:"customer"},{...row,companyCodeId:"eu",profileStatus:"draft"}])).toEqual({buying:1,selling:1,gaps:1});});
 it("does not mistake a role or organization assignment for company activation",()=>{expect(relationshipStatus({...row,profileStatus:undefined})).toBe("Not extended");expect(relationshipStatus({...row,assignmentStatus:"draft"})).toBe("Setup incomplete");expect(relationshipStatus({...row,roleStatus:"blocked"})).toBe("Inactive / blocked");});
 it("preserves company, organization and bank tab in deep links",()=>{const url=new URL(rolesHref("partner","uk","org","banks"),"https://test");expect(Object.fromEntries(url.searchParams)).toEqual({tab:"roles",section:"roles-scope",roleTab:"banks",companyCodeId:"uk",operatingOrganizationId:"org"});});
 it("upgrades older published layouts without dropping shared banking or existing tabs",()=>{const legacy={...BUSINESS_PARTNER_360_PANEL,sections:[...BUSINESS_PARTNER_360_PANEL.sections,"roles-scope","supplier-company","customer-company","qualifications-certificates"],tabs:BUSINESS_PARTNER_360_PANEL.tabs.filter(t=>t.key!=="roles"&&t.key!=="qualifications")};const result=realignPartnerPanel(legacy);expect(result.sections).toContain("banking");expect(result.sections).not.toContain("supplier-company");expect(result.sections).not.toContain("qualifications-certificates");expect(result.tabs.find(t=>t.key==="roles")?.label).toBe("Roles & scope");expect(result.tabs.find(t=>t.key==="qualifications")?.sectionKey).toBe("qualifications-certificates");expect(realignPartnerPanel(result)).toEqual(result);});
});
it("preserves a valid section-only panel without crashing", () => {
 const panel = {...BUSINESS_PARTNER_360_PANEL, tabs: BUSINESS_PARTNER_360_PANEL.tabs.filter(tab => tab.provider !== "360")};
 expect(realignPartnerPanel(panel)).toEqual(panel);
});
