import {describe,it,expect,vi} from "vitest";
import {Kysely,PostgresDialect} from "kysely";
import {KyselyBusinessPartnerOnboardingCycleCoordinator,type BusinessPartnerOnboardingCycleEvent} from "../business-partner-onboarding-cycle.js";
const event=(eventCode:string):BusinessPartnerOnboardingCycleEvent=>({tenantId:"tenant",principalId:"actor",eventCode,request:{id:"case",requestNo:"BP.TEST",kind:"new_partner",requestedRole:"supplier",source:{kind:"manual"},registrationMode:"direct",rowVersion:1,duplicateSummary:{}} as never});
function database(templateAvailable:boolean){
 const statements:{sql:string;parameters:readonly unknown[]}[]=[];
 let started=false;
 const client={release:()=>{},query:vi.fn(async(sql:string,parameters:readonly unknown[]=[])=>{
  statements.push({sql,parameters});
  if(sql.includes("governance.evaluate_cycle_completion"))return {rows:[{result:{ready:false}}]};
  if(sql.includes("FROM control.cycle_type"))return {rows:templateAvailable?[{id:"template",cycle_type_id:"type",revision_number:1,template_hash:"hash",template_json:{template:{tasks:[{id:"task",phaseId:"phase",code:"INVITATION",name:"Invitation",completionMode:"system",isMandatory:true,isWaivable:false}],dependencies:[]}}}]:[]};
  if(sql.includes("SELECT * FROM governance.cycle_run"))return {rows:started?[{id:"run",status:"running"}]:[]};
  if(sql.includes("INSERT INTO governance.cycle_run"))started=true;
  if(sql.includes("SELECT task.*"))return {rows:[{id:"invitation",code:"INVITATION",status:"ready"}]};
  return {rows:[]};
 })};
 const db=new Kysely({dialect:new PostgresDialect({pool:{connect:async()=>client,end:async()=>{}} as never})});
 return {db,statements};
}
describe("internal supplier cycle starts at submission",()=>{
 it.each(["created","updated","validated"])("does not access cycle configuration on draft %s",async suffix=>{
  const coordinator=new KyselyBusinessPartnerOnboardingCycleCoordinator();
  await expect(coordinator.advance(event(`business_partner.case.${suffix}`),undefined as never)).resolves.toBeUndefined();
 });
 it("still rejects submission without a template before writing a cycle",async()=>{
  const {db,statements}=database(false);
  try{await expect(new KyselyBusinessPartnerOnboardingCycleCoordinator().advance(event("business_partner.case.submitted"),db as never)).rejects.toMatchObject({code:"BUSINESS_PARTNER_ONBOARDING_TEMPLATE_UNAVAILABLE"});expect(statements.some(s=>s.sql.includes("INSERT"))).toBe(false);}finally{await db.destroy()}
 });
 it("creates one cycle on submission and completes the internal invitation prerequisite",async()=>{
  const {db,statements}=database(true),coordinator=new KyselyBusinessPartnerOnboardingCycleCoordinator();
  try{
   await coordinator.advance(event("business_partner.case.submitted"),db as never);
   await coordinator.advance(event("business_partner.case.submitted"),db as never);
   expect(statements.filter(s=>s.sql.includes("INSERT INTO governance.cycle_run"))).toHaveLength(1);
   expect(statements.some(s=>s.sql.includes("UPDATE governance.cycle_task SET status=")&&s.parameters.includes("invitation")&&s.parameters.includes("completed"))).toBe(true);
  }finally{await db.destroy()}
 });
 it("preserves the invitation-led external entry path",async()=>{
  const {db}=database(false),input=event("business_partner.case.created");
  try{await expect(new KyselyBusinessPartnerOnboardingCycleCoordinator().advance({...input,request:{...input.request,source:{kind:"portal"}}},db as never)).rejects.toMatchObject({code:"BUSINESS_PARTNER_ONBOARDING_TEMPLATE_UNAVAILABLE"});}finally{await db.destroy()}
 });
});
