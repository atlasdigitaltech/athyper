import {describe,expect,it} from "vitest";
import {parseEntityDirectoryScope} from "@athyper/server-contract-metadata";
describe("published directory rule validation",()=>{
 it.each(["tenant","organization","company","organization_company"])("accepts %s",mode=>{expect(parseEntityDirectoryScope({schemaVersion:1,mode})).toEqual({schemaVersion:1,mode});});
 it.each([null,{schemaVersion:1,mode:"all_tenants"},{schemaVersion:2,mode:"tenant"},{schemaVersion:1,mode:"tenant",sql:"TRUE"}])("rejects unsupported or executable policy input",value=>{expect(()=>parseEntityDirectoryScope(value)).toThrow();});
});
it("publishes supported directory filters without changing visibility",()=>{expect(parseEntityDirectoryScope({schemaVersion:1,mode:"tenant",filters:["organization","company"]})).toEqual({schemaVersion:1,mode:"tenant",filters:["organization","company"]});});
it.each([["unknown"],["company","company"],"company"])("rejects invalid filter declarations",filters=>{expect(()=>parseEntityDirectoryScope({schemaVersion:1,mode:"tenant",filters})).toThrow();});
it("validates published role choices and mandatory eligibility dependencies",()=>{
 const role={key:"partnerRole",label:"Role",emptyLabel:"All partners",options:[{value:"supplier",label:"Suppliers"}]};
 const eligibility={key:"eligibleOperation",label:"Eligibility",emptyLabel:"Any",options:[{value:"order",label:"Orders"}],requires:["partnerRole","organization","company"]};
 expect(parseEntityDirectoryScope({schemaVersion:1,mode:"tenant",quickFilters:[role,eligibility]}).quickFilters).toHaveLength(2);
 for(const filters of [[eligibility],[role,{...eligibility,requires:[]}],[{...role,options:[{value:"admin",label:"Admin"}]}],[role,role]]) expect(()=>parseEntityDirectoryScope({schemaVersion:1,mode:"tenant",quickFilters:filters})).toThrow();
});
