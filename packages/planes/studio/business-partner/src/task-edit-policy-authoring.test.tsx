// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { TaskEditPolicyAuthoring } from "./task-edit-policy-authoring";
import { exampleTaskEditPolicy } from "./task-edit-policy-example";
const state = vi.hoisted(() => ({ http: undefined as unknown }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({ useApiClient: () => state.http }));
it("submits fixtures to the owner and requires a separate publish action", async () => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 const calls: { path: string; init?: RequestInit }[] = [];
 const id = "11111111-1111-4111-8111-111111111111";
 const revision = { definition: { ...exampleTaskEditPolicy.definition, id }, tests: exampleTaskEditPolicy.tests, status: "pending_approval", hash: "a".repeat(64), createdBy: "maker", results: [{passed:true}] };
 state.http = createHttpClient({ csrfToken: () => "csrf", fetch: async (input, init) => { calls.push({path:String(input),init});return new Response(JSON.stringify(revision),{status:200,headers:{"content-type":"application/json"}}); } });
 const div = document.createElement("div"), root = createRoot(div); document.body.append(div);
 try {
  await act(async()=>root.render(<TaskEditPolicyAuthoring/>));
  await act(async()=>Array.from(div.querySelectorAll("button")).find(b=>b.textContent==="Validate and submit policy for approval")!.click());
  expect(calls).toHaveLength(1);expect(calls[0]!.path).toContain("/api/relay/studio/task-edit-policies");
  expect(JSON.parse(String(calls[0]!.init?.body)).tests).toHaveLength(4);
  expect(div.textContent).toContain("pending_approval");expect(div.textContent).toContain("Publish as independent checker");
  expect(calls.some(c=>c.path.endsWith("/publish"))).toBe(false);
 } finally { await act(async()=>root.unmount()); div.remove(); }
});
