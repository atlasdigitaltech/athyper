import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {resolveProcurementContext} from "../../packages/planes/neon/modules/procurement/src/index";

const company={companyCodeId:"20000000-0000-4000-8000-000000000001"};
const organization={id:"30000000-0000-4000-8000-000000000001",procurementProfileConfigured:true,companyAssignments:[company]};

describe("Neon procurement context guard",()=>{
  it("requires exact company before an organization",()=>assert.equal(resolveProcurementContext({businessDate:"2026-08-18"}).state,"company_required"));
  it("rejects a company outside the organization assignment",()=>assert.equal(resolveProcurementContext({company,organization:{...organization,companyAssignments:[]},businessDate:"2026-08-18"}).state,"organization_incompatible"));
  it("requires a configured procurement profile",()=>assert.equal(resolveProcurementContext({company,organization:{...organization,procurementProfileConfigured:false},businessDate:"2026-08-18"}).state,"profile_required"));
  it("builds only an exact command scope",()=>assert.deepEqual(resolveProcurementContext({company,organization,businessDate:"2026-08-18"}),{state:"ready",scope:{companyCodeId:company.companyCodeId,operatingOrganizationId:organization.id,businessDate:"2026-08-18"}}));
});
