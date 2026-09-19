import {describe,expect,it} from "vitest";
import {assertBusinessPartnerExportPrivacy} from "./transfer-service.js";

describe("Business Partner generic export privacy",()=>{
  it.each(["person.first_name","employment.company_code_id","workforce.status","external_worker.worker_number","date_of_birth"])("rejects %s",field=>{expect(()=>assertBusinessPartnerExportPrivacy("business_partner",{_transfer:{fields:["code",field]}})).toThrowError(expect.objectContaining({statusCode:403,code:"BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN"}));});
  it("allows safe Business Partner fields and does not constrain governed workforce modules",()=>{expect(()=>assertBusinessPartnerExportPrivacy("business_partner",{_transfer:{fields:["code","display_name","status"]}})).not.toThrow();expect(()=>assertBusinessPartnerExportPrivacy("employee",{_transfer:{fields:["employee_number"]}})).not.toThrow();});
});
