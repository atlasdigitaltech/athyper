// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SupplierProcessDocuments } from "./supplier-process-documents";
import { SupplierProcessPreview } from "./supplier-process-preview";
const { http } = vi.hoisted(() => ({ http: { request: vi.fn() } }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => http,
}));
let node: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  http.request.mockReset();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});
it("does not offer download or retry when the owning API denies capabilities", async () => {
  http.request.mockResolvedValue([
    {
      id: "job",
      purpose: "submitted_review_pack",
      status: "failed",
      gate_status: "pending",
      required_before: "review_execution",
      canDownload: false,
      canRetry: false,
    },
  ]);
  await act(async () =>
    root.render(<SupplierProcessDocuments caseId="case" rowVersion={1} />),
  );
  expect(node.textContent).toContain("Required before review execution");
  expect(node.querySelectorAll("button").length).toBe(0);
});
it("never substitutes a different job for a missing pinned document", async () => {
  http.request.mockResolvedValue([
    {
      id: "different",
      purpose: "decision_document",
      status: "ready",
      gate_status: "succeeded",
      required_before: "materialization",
      canDownload: false,
      canRetry: false,
    },
  ]);
  await act(async () =>
    root.render(
      <SupplierProcessDocuments
        caseId="case"
        rowVersion={1}
        pinnedJobId="missing"
      />,
    ),
  );
  expect(node.textContent).toContain(
    "No replacement document has been selected",
  );
  expect(node.textContent).not.toContain("Linked document");
});
it("does not evaluate unsaved changes against stale server facts", async () => {
  await act(async () =>
    root.render(
      <SupplierProcessPreview caseId="case" rowVersion={1} unsaved />,
    ),
  );
  expect(http.request).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Save the draft");
});
it("renders all three preview profiles from the owner response", async () => {
  for (const profile of ["simple", "standard", "enhanced"]) {
    http.request.mockResolvedValue({
      status: "ready",
      selection: {
        requestedRequirement: profile === "simple" ? "basic" : profile,
        candidateProfile: { code: profile },
        effectiveProfile: { code: profile },
        winningRuleId: "rule",
        minimumControls: [],
      },
    });
    await act(async () =>
      root.render(<SupplierProcessPreview caseId={profile} rowVersion={1} />),
    );
    expect(node.textContent).toContain(`Effective: ${profile}`);
  }
});

it("retries only the authorized document with the relay idempotency contract", async () => {
  const failed={id:"failed-job",purpose:"decision_document",status:"failed",gate_status:"pending",required_before:"materialization",canDownload:false,canRetry:true};
  http.request.mockResolvedValueOnce([failed]).mockResolvedValueOnce({jobId:failed.id,status:"pending"}).mockResolvedValueOnce([{...failed,status:"pending",canRetry:false}]);
  await act(async()=>root.render(<SupplierProcessDocuments caseId="case" rowVersion={9}/>));
  const retry=Array.from(node.querySelectorAll("button")).find(b=>b.textContent?.startsWith("Retry"));expect(retry).toBeDefined();
  await act(async()=>retry!.click());
  const [operation,options]=http.request.mock.calls[1]!;
  expect(operation.idempotency).toBe("required");expect(options.params).toEqual({jobId:"failed-job",action:"retry"});expect(options.idempotencyKey).toEqual(expect.any(String));
  expect(node.textContent).toContain("Required before materialization");expect(node.textContent).not.toContain("Retry decision document");
});

it("historical notice mode never exposes retry or another attempt's document",async()=>{
 http.request.mockResolvedValue([{id:"old",attempt_id:"attempt-old",purpose:"decision_document",status:"failed",gate_status:"pending",required_before:"materialization",canDownload:false,canRetry:true},{id:"new",attempt_id:"attempt-new",purpose:"activation_confirmation",status:"ready",gate_status:"succeeded",canDownload:true,canRetry:false}]);
 await act(async()=>root.render(<SupplierProcessDocuments caseId="case" rowVersion={2} pinnedJobId="old" pinnedAttemptId="attempt-old" onlyPinned/>));
 expect(node.querySelectorAll("button").length).toBe(0);expect(node.textContent).toContain("Linked document");expect(node.textContent).not.toContain('"jobId": "new"');
});
