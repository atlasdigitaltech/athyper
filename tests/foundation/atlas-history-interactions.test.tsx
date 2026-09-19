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

for (const mode of ["dock", "fullscreen"] as const) {
  test(`Atlas ${mode} history dismisses outside and with Escape before closing the workspace`, async () => {
    let closed = 0;
    const client = { experience: async () => null, threads: async () => ({ items: [] }) } as unknown as AtlasAnswerClient;
    await act(async () => root.render(
      <AtlasAnswerProvider options={{ client }}>
        <ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user">
          <AtlasWorkspace mode={mode} planeName="Neon" onClose={() => { closed += 1; }} />
        </ShellPersonalizationScopeProvider>
      </AtlasAnswerProvider>
    ));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Conversation history"]')!;
    const panel = () => host.querySelector(".athyper-atlas-workspace__history");
    const toggle = async () => act(async () => { trigger.click(); });
    if (!panel()) await toggle();
    await act(async () => { panel()!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); });
    assert.ok(panel(), "clicking inside keeps history open");
    await act(async () => { host.querySelector(".athyper-atlas-workspace__conversation")!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); });
    assert.equal(panel(), null);
    assert.equal(closed, 0);
    await toggle();
    await act(async () => { document.body.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(panel(), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(closed, 0);
    await toggle();
    await toggle();
    assert.equal(panel(), null, "history trigger still toggles closed");
    await act(async () => { trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(closed, 1, "Escape closes the workspace once history is closed");
  });
}


test("Atlas feedback binds the completed response and reuses its receipt when retrying", async () => {
 let controller: ReturnType<typeof useAtlasAnswer>;
 function Capture(){controller=useAtlasAnswer();return null;}
 const submissions: any[]=[];
 const runId="10000000-0000-4000-8000-000000000001",messageId="10000000-0000-4000-8000-000000000002";
 const client={experience:async()=>null,threads:async()=>({items:[]}),answer:async()=>({text:"Select the work context.",intent:{schemaVersion:1,kind:"clarify",strategy:"owner_scope",reason:"missing_scope",capabilityIds:[]},citations:[],attachmentCitations:[],actions:[],threadId:"thread",runId,messageId,publicModelId:"atlas-fast"}),feedback:async(value:unknown)=>{submissions.push(value);if(submissions.length===1)throw Error("offline");}} as unknown as AtlasAnswerClient;
 await act(async()=>root.render(<AtlasAnswerProvider options={{client}}><Capture/><ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user"><AtlasWorkspace mode="dock" planeName="Neon" onClose={()=>{}}/></ShellPersonalizationScopeProvider></AtlasAnswerProvider>));
 await act(async()=>controller!.ask("Show this record summary"));
 const send=()=>[...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Send feedback")!;
 assert.ok(send());
 assert.match(host.textContent!,/Clarification needed/);
 await act(async()=>send().click());
 assert.match(host.textContent!,/Feedback could not be recorded/);
 await act(async()=>send().click());
 assert.equal(submissions.length,2);
 assert.deepEqual(submissions[0],submissions[1]);
 assert.equal(submissions[0].runId,runId);assert.equal(submissions[0].messageId,messageId);
 assert.deepEqual(Object.keys(submissions[0]).sort(),["schemaVersion","feedbackId","runId","messageId","category","verdict"].sort());
 assert.match(host.textContent!,/Feedback recorded for review/);
 assert.equal(send().closest("fieldset")!.disabled,true);
});


test("Studio learning review binds rejection to the inbox revision and separates draft approval from publication",async()=>{
 const calls:{action:string;body:Record<string,unknown>}[]=[];
 const item={id:"receipt",revision:4,state:"pending",phrase:"company snapshot",capabilityId:"entity_read_record",entityCode:"business_partner",originPlane:"neon",sourceDescriptorHash:"source",proposalHash:"proposal"};
 const run=async(_item:unknown,action:string,body:Record<string,unknown>)=>{calls.push({action,body});};
 await act(async()=>root.render(<AtlasLearningReviewCard item={item} run={run}/>));
 const buttons=()=>Array.from(host.querySelectorAll("button"));
 assert.equal(buttons().find(button=>button.textContent==="Evaluate and create draft")?.disabled,true);
 assert.ok(host.textContent?.includes("First unseen read question"));
 await act(async()=>buttons().find(button=>button.textContent==="Reject correction")!.click());
 assert.deepEqual(calls,[{action:"reject",body:{revision:4}}]);
 await act(async()=>root.render(<AtlasLearningReviewCard item={{...item,state:"drafted",changeSetStatus:"in_review",changeSetRevision:7}} run={run}/>));
 assert.equal(buttons().some(button=>button.textContent?.startsWith("Publish")),false);
 await act(async()=>buttons().find(button=>button.textContent==="Approve draft")!.click());
 assert.deepEqual(calls[1],{action:"approve",body:{expectedRevision:7}});
});
