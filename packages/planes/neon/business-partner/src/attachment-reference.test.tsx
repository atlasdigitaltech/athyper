// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Collection } from "../../../../platform/entity/runtime/form-detail/src/section-primitives";
import { entityRuntimeClient } from "@athyper/platform-entity-descriptor-client";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@athyper/platform-shell-app-foundation", () => ({useApiClient: () => mocks}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
it("preserves the compiled download binding through the browser parser and rejects invalid flags", async () => {
  const payload = {releaseId:"release",releaseHash:`sha256:${"a".repeat(64)}`,revision:"1",sectionKey:"certificates",presentation:{rendererKey:"platform.related-collection.v1",fields:[],childCollections:[{key:"certifications",rendererKey:"platform.related-collection.v1",fields:[{key:"document_attachment_id",attachmentDownload:true}]}]},data:{}};
  const client = {request: async (operation: any) => operation.parse(payload)} as any;
  const input = {entityCode:"business_partner",recordId:id,surfaceKey:"detail",sectionKey:"certificates"};
  const result = await entityRuntimeClient.section(client,input);
  expect(result.presentation.childCollections[0].fields[0].attachmentDownload).toBe(true);
  (payload.presentation.childCollections[0].fields[0] as any).attachmentDownload = "true";
  await expect(entityRuntimeClient.section(client,input)).rejects.toThrow();
});
it("downloads only on demand through the authorized endpoint and never displays raw failure details", async () => {
  const host = document.createElement("div"), root = createRoot(host);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    mocks.request.mockReset();
    await act(async () => root.render(<Collection fields={[{key:"document",attachmentDownload:true}]} items={[{id:"cert",document:id}]} />));
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockRejectedValueOnce(new Error("secret-storage-key"));
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).not.toContain("secret-storage-key");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    mocks.request.mockResolvedValueOnce({url:"https://storage.test/evidence?signature=fixture"});
    await act(async () => host.querySelector("button")!.click());
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][0].path({})).toBe(`/api/attachments/${id}/download`);
    expect(click).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("signature");
  } finally { await act(async () => root.unmount()); click.mockRestore(); }
});
it("does not create download actions for redacted, missing or malformed attachment references", async () => {
  const host = document.createElement("div"), root = createRoot(host);
  try {
    for (const value of [undefined,null,"javascript:alert(1)","storage/key"]) {
      await act(async () => root.render(<Collection fields={[{key:"document",attachmentDownload:true}]} items={[{document:value}]} />));
      expect(host.querySelector("button")).toBeNull();
    }
    await act(async () => root.render(<Collection fields={[{key:"document"}]} items={[{document:id}]} />));
    expect(host.querySelector("button")).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
