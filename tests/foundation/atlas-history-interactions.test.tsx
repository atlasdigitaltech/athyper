import { AtlasLearningReviewCard } from "../../packages/planes/studio/shell/src/atlas-learning-inbox";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AtlasWorkspace } from "../../packages/platform/shell/shell/src/atlas-workspace";
import { useAtlasAnswer, AtlasAnswerProvider } from "../../packages/platform/ai/agent-ui/src/index";
import type { AtlasAnswerClient } from "../../packages/platform/ai/agent-runtime/src/index";
import { ShellPersonalizationScopeProvider } from "../../packages/platform/shell/shell/src/personalization-scope";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local", pretendToBeVisual: true });
  Object.defineProperties(globalThis, {
    React: { configurable: true, value: React },
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    requestAnimationFrame: { configurable: true, value: dom.window.requestAnimationFrame.bind(dom.window) },
    cancelAnimationFrame: { configurable: true, value: dom.window.cancelAnimationFrame.bind(dom.window) },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

// History dismissal and Escape order run in the browser, where the shared side
// panel's portal, focus and modal isolation are real: ui-baseline.spec.ts
// "History closes on an outside click and Escape before Escape closes Atlas".


test("Atlas feedback binds the completed response and reuses its receipt when retrying", async () => {
 let controller: ReturnType<typeof useAtlasAnswer>;
 function Capture(){controller=useAtlasAnswer();return null;}
 const submissions: any[]=[];
 const runId="10000000-0000-4000-8000-000000000001",messageId="10000000-0000-4000-8000-000000000002";
 const client={experience:async()=>null,threads:async()=>({items:[]}),answer:async()=>({text:"Select the work context.",intent:{schemaVersion:1,kind:"clarify",strategy:"owner_scope",reason:"missing_scope",capabilityIds:[]},citations:[],attachmentCitations:[],actions:[],threadId:"thread",runId,messageId,publicModelId:"atlas-fast"}),feedback:async(value:unknown)=>{submissions.push(value);if(submissions.length===1)throw Error("offline");}} as unknown as AtlasAnswerClient;
 await act(async()=>root.render(<AtlasAnswerProvider options={{client}}><Capture/><ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user"><AtlasWorkspace mode="dock" planeName="Neon" onClose={()=>{}}/></ShellPersonalizationScopeProvider></AtlasAnswerProvider>));
 await act(async()=>controller!.ask("Show this record summary"));
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(item=>item.getAttribute("aria-label")===name||item.textContent===name)!;
 assert.ok(button("Not helpful"));
 await act(async()=>button("Not helpful").click());
 await act(async()=>button("Not what I meant").click());
 assert.match(document.body.textContent!,/Feedback could not be recorded/);
 await act(async()=>button("Not what I meant").click());
 assert.equal(submissions.length,2);
 assert.deepEqual(submissions[0],submissions[1]);
 assert.equal(submissions[0].runId,runId);assert.equal(submissions[0].messageId,messageId);
 assert.deepEqual(Object.keys(submissions[0]).sort(),["schemaVersion","feedbackId","runId","messageId","category","verdict"].sort());
 assert.equal(submissions[0].category,"intent");assert.equal(submissions[0].verdict,"wrong");
 assert.match(document.body.textContent!,/feedback recorded for review/);
 assert.equal(button("Not helpful").disabled,true);
});


test("Studio learning review binds rejection to the inbox revision and separates draft approval from publication",async()=>{
 const calls:{action:string;body:Record<string,unknown>}[]=[];
 const item={id:"receipt",revision:4,state:"pending",phrase:"company snapshot",capabilityId:"entity_read_record",entityCode:"business_partner",originPlane:"neon",sourceDescriptorHash:"source",proposalHash:"proposal"};
 const run=async(_item:unknown,action:string,body:Record<string,unknown>)=>{calls.push({action,body});};
 await act(async()=>root.render(<AtlasLearningReviewCard item={item} run={run}/>));
 const buttons=()=>Array.from(host.querySelectorAll("button"));
 assert.equal(buttons().find(button=>button.textContent==="Evaluate and create draft")?.disabled,true);
 assert.ok(host.textContent?.includes("Correction question"));
 await act(async()=>buttons().find(button=>button.textContent==="Reject correction")!.click());
 assert.deepEqual(calls,[{action:"reject",body:{revision:4}}]);
 await act(async()=>root.render(<AtlasLearningReviewCard item={{...item,state:"drafted",changeSetStatus:"in_review",changeSetRevision:7}} run={run}/>));
 assert.equal(buttons().some(button=>button.textContent?.startsWith("Publish")),false);
 await act(async()=>buttons().find(button=>button.textContent==="Approve draft")!.click());
 assert.deepEqual(calls[1],{action:"approve",body:{expectedRevision:7}});
});


test("Studio published fixture selection separates reviewer questions and exposes durable failures",async()=>{
 const calls:{action:string;body:Record<string,unknown>}[]=[];
 const item={id:"receipt",revision:4,state:"drafted",phrase:"company snapshot",capabilityId:"entity_read_record",entityCode:"business_partner",originPlane:"neon",sourceDescriptorHash:"source",proposalHash:"proposal",attemptCount:1,attempts:[{id:"attempt-1",status:"failed",startedAt:"2026-10-01T00:00:00Z",failureCode:"LEARNING_EVALUATION_FAILED"}]};
 await act(async()=>root.render(<AtlasLearningReviewCard item={item} run={async(_item,action,body)=>{calls.push({action,body});}}/>));
 assert.match(host.textContent!,/Evaluation attempts \(1\)/);
 assert.match(host.textContent!,/LEARNING_EVALUATION_FAILED/);
 const select=host.querySelector("select")!;
 await act(async()=>{select.value="published";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
 assert.equal(host.querySelectorAll("input").length,1);
 assert.equal(host.querySelector("input")?.placeholder,"Release UUID/test key");
 assert.ok(!host.textContent?.includes("Correction question"));
 assert.equal([...host.querySelectorAll("button")].find(button=>button.textContent==="Re-evaluate into a new draft")?.disabled,true);
 assert.deepEqual(calls,[]);
});
