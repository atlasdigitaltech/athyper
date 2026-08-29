import assert from "node:assert/strict";
import test from "node:test";
import type { HttpClient } from "../../packages/platform/foundation/api-client/src/index";
import { createAtlasAnswerClient, createAtlasExperienceAdminClient } from "../../packages/platform/ai/agent-runtime/src/index";

test("Atlas answer client streams text and preserves authorized record citations", async () => {
  const calls: string[] = [];
  const client = {
    async request(operation: { readonly method: string; readonly path: string | ((params: Record<string, string | number>) => string) }, options?: { readonly params?: Record<string, string | number> }) {
      const path = typeof operation.path === "function" ? operation.path(options?.params ?? {}) : operation.path; calls.push(`${operation.method} ${path}`);
      if (path === "/api/atlas/admission") return { schema: "atlas-plane-admission/1", planeKey: "neon", chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, mutationToolsAllowed: false, invoiceExtractionAllowed: false, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "policy-1" };
      if (path === "/api/atlas/threads") return { threadId: "thread-1" };
      return stream([
        event("run.started", { publicModelId: "atlas-fast" }),
        event("source.cited", { callId: "call-1", toolCode: "business_partner_read", coordinate: { entityCode: "business_partner", recordId: "bp-1", revision: "7", descriptorHash: "descriptor-1" } }),
        event("message.delta", { messageId: "message-1", text: "Supplier BP-1 is active." }),
        event("run.completed", { messageId: "message-1", reason: "stop" }),
      ]);
    },
  } as unknown as HttpClient;
  const progress: string[] = [];
  const answer = await createAtlasAnswerClient({ client, createId: () => "request-1" }).answer("What is the supplier status?", { onProgress: (item) => progress.push(item.kind) });
  assert.equal(answer.text, "Supplier BP-1 is active.");
  assert.deepEqual(answer.actions, []);
  assert.deepEqual(answer.citations, [{ entityCode: "business_partner", recordId: "bp-1", revision: "7", descriptorHash: "descriptor-1", toolCode: "business_partner_read" }]);
  assert.deepEqual(progress, ["started", "citation", "text", "completed"]);
  assert.deepEqual(calls, ["GET /api/atlas/admission", "POST /api/atlas/threads", "POST /api/atlas/threads/thread-1/runs"]);
});

test("Atlas governed actions require an exact preview token and expose content-free audit history", async () => {
  const calls: { readonly path: string; readonly options?: Readonly<Record<string, unknown>> }[] = [];
  const client = {
    async request(operation: { readonly method: string; readonly path: string | ((params: Record<string, string | number>) => string) }, options?: Readonly<Record<string, unknown>> & { readonly params?: Record<string, string | number> }) {
      const path = typeof operation.path === "function" ? operation.path(options?.params ?? {}) : operation.path; calls.push({ path, options });
      if (path === "/api/atlas/admission") return { schema: "atlas-plane-admission/1", chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, mutationToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "policy-1" };
      if (path === "/api/atlas/threads") return { threadId: "thread-1" };
      if (path.endsWith("/runs")) return stream([
        event("run.started", { publicModelId: "atlas-fast" }),
        event("tool.previewed", { callId: "call-2", toolCode: "business_partner_update", proposalId: "proposal-1", summary: "Update Business Partner", access: "mutation", risk: "high", confirmationRequired: true, confirmationToken: "one-time-token", arguments: { businessPartnerId: "bp-1", displayName: "Updated Supplier" }, affectedEntityType: "business_partner", affectedEntityId: "10000000-0000-4000-8000-000000000001", expectedRowVersion: 7, expiresAt: "2026-08-29T12:05:00Z" }),
        event("run.completed", { messageId: "message-2", reason: "tool_call" }),
      ]);
      if (path.endsWith("/run")) return { proposalId: "proposal-1", outcome: "completed", commandId: "command-1", resultRevision: "8" };
      if (path.endsWith("/cancel")) return { proposalId: "proposal-1", outcome: "cancelled" };
      if (path === "/api/atlas/tools/history") return [{ proposalId: "proposal-1", status: "completed" }];
      throw new Error(`Unexpected operation ${path}`);
    },
  } as unknown as HttpClient;
  const atlas = createAtlasAnswerClient({ client, createId: () => "request-2" });
  const answer = await atlas.answer("Update this supplier name");
  assert.equal(answer.actions.length, 1);
  assert.deepEqual(answer.actions[0], { proposalId: "proposal-1", callId: "call-2", toolCode: "business_partner_update", summary: "Update Business Partner", access: "mutation", risk: "high", arguments: { businessPartnerId: "bp-1", displayName: "Updated Supplier" }, confirmationToken: "one-time-token", affectedEntityType: "business_partner", affectedEntityId: "10000000-0000-4000-8000-000000000001", expectedRowVersion: 7, expiresAt: "2026-08-29T12:05:00Z", status: "proposed" });
  assert.equal((await atlas.confirmAction(answer.actions[0]!)).outcome, "completed");
  assert.equal((await atlas.cancelAction(answer.actions[0]!)).outcome, "cancelled");
  assert.deepEqual(await atlas.actionHistory(), [{ proposalId: "proposal-1", status: "completed" }]);
  const confirmation = calls.find((call) => call.path.endsWith("/run"));
  assert.deepEqual(confirmation?.options?.body, { arguments: { businessPartnerId: "bp-1", displayName: "Updated Supplier" }, confirmationToken: "one-time-token" });
  assert.equal(confirmation?.options?.idempotencyKey, "atlas-confirm-proposal-1");
});

test("Atlas submits bounded attachment context and preserves verified attachment citations",async()=>{let runBody:unknown;const client={async request(operation:{readonly path:string|((params:Record<string,string|number>)=>string)},options?:{readonly params?:Record<string,string|number>;readonly body?:unknown}){const path=typeof operation.path==="function"?operation.path(options?.params??{}):operation.path;if(path==="/api/atlas/admission")return{schema:"atlas-plane-admission/1",chatAllowed:true,persistenceAllowed:true,readToolsAllowed:true,mutationToolsAllowed:false,allowedPublicModelIds:["atlas-fast"],allowedDataClasses:["internal"],policyRevision:"policy-1"};if(path==="/api/atlas/threads")return{threadId:"thread-1"};runBody=options?.body;return stream([event("run.started",{publicModelId:"atlas-fast"}),event("attachment.cited",{attachmentId:"10000000-0000-4000-8000-000000000001",fileName:"supplier.pdf",contentType:"application/pdf",sha256:"a".repeat(64)}),event("message.delta",{messageId:"message-1",text:"The document is valid."}),event("run.completed",{messageId:"message-1",reason:"stop"})]);}}as unknown as HttpClient;const answer=await createAtlasAnswerClient({client,createId:()=>"request-attachment"}).answer("Summarize this supplier document",{attachmentContextId:"20000000-0000-4000-8000-000000000002",attachmentIds:["10000000-0000-4000-8000-000000000001"]});assert.deepEqual((runBody as Record<string,unknown>).attachmentIds,["10000000-0000-4000-8000-000000000001"]);assert.equal((runBody as Record<string,unknown>).attachmentContextId,"20000000-0000-4000-8000-000000000002");assert.deepEqual(answer.attachmentCitations,[{attachmentId:"10000000-0000-4000-8000-000000000001",fileName:"supplier.pdf",contentType:"application/pdf",sha256:"a".repeat(64)}]);});

test("Atlas resumes a persisted thread and parses conversation history with structured tool results",async()=>{const calls:string[]=[];const thread={threadId:"10000000-0000-4000-8000-000000000001",tenantId:"tenant-1",planeKey:"neon",ownerPrincipalId:"principal-1",title:"Supplier review",status:"active",participants:[],rowVersion:2,lastMessageSequence:3,retention:{policyId:"thirty-days",expiresAt:"2026-09-29T00:00:00Z",purgeAfter:null,legalHold:false},createdAt:"2026-08-29T00:00:00Z",updatedAt:"2026-08-30T00:00:00Z"};const client={async request(operation:{readonly method:string;readonly path:string|((params:Record<string,string|number>)=>string);readonly parse?:(value:unknown)=>unknown},options?:{readonly params?:Record<string,string|number>}){const path=typeof operation.path==="function"?operation.path(options?.params??{}):operation.path;calls.push(`${operation.method} ${path}`);if(path==="/api/atlas/admission")return{schema:"atlas-plane-admission/1",chatAllowed:true,persistenceAllowed:true,readToolsAllowed:true,mutationToolsAllowed:false,allowedPublicModelIds:["atlas-fast"],allowedDataClasses:["internal"],policyRevision:"policy-1"};if(operation.method==="GET"&&path==="/api/atlas/threads")return operation.parse?.({items:[thread],nextCursor:null});if(path.endsWith("/messages"))return operation.parse?.({items:[{messageId:"20000000-0000-4000-8000-000000000002",threadId:thread.threadId,sequence:3,role:"tool",status:"completed",content:[{type:"tool_result",callId:"call-1",toolName:"supplier_list",result:[{supplier:"SUP-1",status:"Active"}]}],runId:"run-1",parentMessageId:null,createdAt:"2026-08-30T00:00:00Z",terminalAt:"2026-08-30T00:00:01Z"}],nextCursor:null});return stream([event("run.started",{publicModelId:"atlas-fast"}),event("message.delta",{messageId:"message-4",text:"Supplier remains active."}),event("run.completed",{messageId:"message-4",reason:"stop"})]);}}as unknown as HttpClient;const atlas=createAtlasAnswerClient({client,createId:()=>"request-resume"});assert.equal((await atlas.threads()).items[0]?.title,"Supplier review");assert.deepEqual((await atlas.messages(thread.threadId)).items[0]?.results,[[{supplier:"SUP-1",status:"Active"}]]);const answer=await atlas.answer("Check the supplier again",{threadId:thread.threadId});assert.equal(answer.threadId,thread.threadId);assert.equal(calls.filter((item)=>item==="POST /api/atlas/threads").length,0);assert.ok(calls.includes(`POST /api/atlas/threads/${thread.threadId}/runs`));});

test("Studio experience releases configure agents, prompts, sources, and widgets through governed relay operations",async()=>{const calls:{path:string;options?:Readonly<Record<string,unknown>>}[]=[];const definition={schema:"atlas-experience-definition/1",scope:"home",widgets:[{code:"home.recent",kind:"recent",title:"Recent work",enabled:true,planes:["neon"],order:10}],searchSources:[{code:"bp.records",kind:"record",label:"Partners",enabled:true,planes:["neon"],entityCode:"business_partner"}],prompts:[{code:"bp.find",label:"Find partner",prompt:"Find a partner",enabled:true,planes:["neon"],agentCode:"bp-guide"}],agents:[{code:"bp-guide",name:"BP Guide",description:"Grounded partner help",enabled:true,planes:["neon"],publicModelId:"atlas-fast",dataClass:"internal",promptRevision:"prompt-r1",toolCodes:["records_query"]}]};const projection={...definition,schema:"atlas-experience-projection/1",revision:4,contentHash:"a".repeat(64)};const release={releaseId:"release-1",tenantId:"tenant-1",revision:4,status:"draft",definition,contentHash:"a".repeat(64),createdAt:"2026-08-29T00:00:00Z",createdBy:"principal-1"};const client={async request(operation:{readonly path:string;readonly parse?:(value:unknown)=>unknown},options?:Readonly<Record<string,unknown>>){calls.push({path:operation.path,options});const value=operation.path==="/api/atlas/experience"?projection:release;return operation.parse?operation.parse(value):value;}} as unknown as HttpClient;const answer=createAtlasAnswerClient({client});assert.equal((await answer.experience())?.agents[0]?.code,"bp-guide");const admin=createAtlasExperienceAdminClient({client,createId:()=>"request-5"});assert.equal((await admin.saveDraft(definition,4)).revision,4);await admin.publish("home",4);assert.deepEqual(calls.map((item)=>item.path),["/api/atlas/experience","/api/admin/atlas/experience/draft","/api/admin/atlas/experience/publish"]);assert.equal(calls[1]?.options?.idempotencyKey,"atlas-experience-draft-request-5");});

function event(type: string, value: Readonly<Record<string, unknown>>): string { return `event: ${type}\ndata: ${JSON.stringify({ protocol: "atlas.sse/1", sequence: 1, runId: "run-1", threadId: "thread-1", emittedAt: "2026-08-29T00:00:00Z", event: { type, ...value } })}\n\n`; }
function stream(frames: readonly string[]): ReadableStream<Uint8Array> { const bytes = new TextEncoder().encode(frames.join("")); return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }); }
