import{describe,expect,it}from"vitest";import{evaluateEntitlement,revisePlan}from"./index.js";describe("entitlements",()=>{it("creates effective-dated immutable revisions per plan",()=>{const starter=revisePlan([],{planCode:"starter",effectiveFrom:"2026-01-01T00:00:00Z",modules:[],features:[],limits:{users:2}});const one=revisePlan(starter,{planCode:"pro",effectiveFrom:"2026-01-01T00:00:00Z",modules:["buy"],features:["saved_views"],limits:{users:10}});const two=revisePlan(one,{planCode:"pro",effectiveFrom:"2026-06-01T00:00:00Z",modules:["buy"],features:["saved_views"],limits:{users:20}});expect(two.filter(r=>r.planCode==="pro")).toMatchObject([{revision:1,effectiveTo:"2026-06-01T00:00:00Z"},{revision:2}]);expect(two.find(r=>r.planCode==="starter")).not.toHaveProperty("effectiveTo");expect(evaluateEntitlement(two,"pro","2026-07-01T00:00:00Z",{limit:"users",usage:20})).toMatchObject({entitled:false,reason:"limit_exceeded"});expect(evaluateEntitlement(two,"starter","2026-07-01T00:00:00Z",{feature:"saved_views"})).toMatchObject({entitled:false,reason:"not_in_plan"});});});

it("treats null as unlimited and zero as no capacity, and rejects invalid usage/quotas",()=>{
  const history=revisePlan([],{planCode:"base",effectiveFrom:"2026-01-01T00:00:00Z",modules:[],features:[],limits:{users:null,bytes:0}});
  expect(evaluateEntitlement(history,"base","2026-02-01T00:00:00Z",{limit:"users",usage:Number.MAX_SAFE_INTEGER}).entitled).toBe(true);
  expect(evaluateEntitlement(history,"base","2026-02-01T00:00:00Z",{limit:"bytes",usage:0}).entitled).toBe(false);
  for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN]){
    expect(()=>revisePlan([],{planCode:"base",effectiveFrom:"2026-01-01T00:00:00Z",modules:[],features:[],limits:{users:value}})).toThrow();
    expect(evaluateEntitlement(history,"base","2026-02-01T00:00:00Z",{limit:"users",usage:value}).entitled).toBe(false);
  }
});
