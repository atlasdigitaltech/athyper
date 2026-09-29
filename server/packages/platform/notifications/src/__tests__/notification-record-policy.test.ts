import { Kysely,PostgresDialect,type Transaction } from "kysely";
import { expect,it } from "vitest";
import { createNotificationPreferenceRecordPolicy } from "../kysely-notification-preferences.js";
const context={planeKey:"neon" as const,tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222"};
const owner="33333333-3333-4333-8333-333333333333",descriptor={storage:{schema:"master",object:"principal_notification_preference"}};
function fixture(){
 const calls:{sql:string;parameters:readonly unknown[]}[]=[];
 const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{end:async()=>{},connect:async()=>({release(){},query:async(sql:string,parameters:readonly unknown[])=>{calls.push({sql,parameters});return{rows:sql.includes("SELECT event_code")?[{event_code:"sample.changed",channel:"in_app",status:"active",is_enabled:true,version:"42"}]:[]};}})} as any})});
 return {db,tx:db as unknown as Transaction<Record<string,never>>,calls};
}
it("uses the target owner's support/consent and preserves the admin audit actor",async()=>{
 const {db,tx,calls}=fixture(),policy=createNotificationPreferenceRecordPolicy();
 try{
  const values={principal_id:owner,event_code:"sample.changed",channel:"email",is_enabled:true,status:"active"};
  await expect(policy.validate({context,descriptor,values},tx)).rejects.toThrow("verified contact or consent");
  expect(calls.find(c=>c.sql.includes("master.contact_link"))?.parameters).toContain(owner);
  await policy.validate({context,descriptor,values:{...values,channel:"in_app"}},tx);
  await policy.committed({context,descriptor,record:{...values,channel:"in_app"}},tx);
  const invalidation=calls.find(c=>c.sql.includes("INSERT INTO event.outbox"));
  expect(invalidation?.parameters).toContain(context.principalId);
  expect(invalidation?.parameters).toContain(`${owner}:42`);
 }finally{await db.destroy();}
});
it("rejects internal version rows and unsupported channels; inheritance stays nullable",async()=>{
 const {db,tx}=fixture(),policy=createNotificationPreferenceRecordPolicy();
 try{
  const values={principal_id:owner,event_code:"sample.changed",channel:"email",is_enabled:null};
  await policy.validate({context,descriptor,values},tx);
  await expect(policy.validate({context,descriptor,values:{...values,event_code:"platform.preferences.version"}},tx)).rejects.toThrow("supported notification");
  await expect(policy.validate({context,descriptor,values:{...values,channel:"webhook"}},tx)).rejects.toThrow("supported notification");
 }finally{await db.destroy();}
});
