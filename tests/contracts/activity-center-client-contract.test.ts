import assert from "node:assert/strict";
import test from "node:test";
import { notificationInboxOperation, notificationPushConfigurationOperation } from "@athyper/platform-communications-notifications-client";
import { workInboxOperation } from "@athyper/platform-shell-work-inbox";

test("notification client parses the normalized server inbox contract",()=>{
  const result=notificationInboxOperation.parse?.({notifications:[{id:"00000000-0000-4000-8000-000000000001",tenantId:"00000000-0000-4000-8000-000000000002",principalId:"00000000-0000-4000-8000-000000000003",planeKey:"neon",templateKey:"workflow.work_item.assigned",eventCode:"workflow.work_item.created",title:"Approve invoice",body:"Approval is waiting",priority:"high",subject:"Approve invoice",payload:{entity_id:"invoice-1"},createdAt:"2026-08-25T00:00:00.000Z"}],unreadCount:1,nextCursor:"cursor"});
  assert.equal(result?.notifications[0]?.templateKey,"workflow.work_item.assigned");
  assert.equal(result?.notifications[0]?.subject,"Approve invoice");
  assert.equal(result?.unreadCount,1);
});

test("work inbox client parses actionable row versions",()=>{
  const result=workInboxOperation.parse?.({totalCount:1,data:[{id:"00000000-0000-4000-8000-000000000001",tenantId:"00000000-0000-4000-8000-000000000002",workTypeCode:"approval",title:"Approve invoice",sourceEntityCode:"purchase_invoice",sourceEntityId:"00000000-0000-4000-8000-000000000004",availableAt:"2026-08-25T00:00:00.000Z",priority:"urgent",payload:{},status:"open",rowVersion:2,createdAt:"2026-08-25T00:00:00.000Z",createdBy:"00000000-0000-4000-8000-000000000003"}]});
  assert.equal(result?.data[0]?.rowVersion,2);
  assert.equal(result?.data[0]?.priority,"urgent");
});

test("notification client exposes only a public Web Push enrollment key",()=>{
  const result=notificationPushConfigurationOperation.parse?.({webPush:{available:true,publicKey:"BPublicVapidKey"}});
  assert.deepEqual(result,{webPush:{available:true,publicKey:"BPublicVapidKey"}});
  assert.throws(()=>notificationPushConfigurationOperation.parse?.({webPush:{available:true}}),/public key/i);
});
