import { ToastProvider } from "../../../packages/platform/shell/app-foundation/src/toasts";
export { useToasts } from "../../../packages/platform/shell/app-foundation/src/toasts";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CompiledEntitySectionContent } from "../../../packages/platform/entity/runtime/form-detail/src/compiled-section-content";
import { CollaborationPresentationContext } from "../../../packages/platform/entity/runtime/form-detail/src/collaboration-visibility";
const calls: any[] = [];
const folders=[{id:"folder",name:"Evidence"}];
const fileChanges:Record<string,unknown>={};
Object.assign(window, { fileCalls: calls });
const client = {
  request: async (operation: any, options: any = {}) => {
    const path =
      typeof operation.path === "function"
        ? operation.path({})
        : operation.path;
    calls.push({ path, ...options });
    if(path.endsWith("/folders")){if(options.body.command==="create")folders.push({id:options.body.folderId,name:options.body.name});if(options.body.command==="move")fileChanges.folderId=options.body.folderId;return {revision:2};}
    if(path.endsWith("/category")){fileChanges.category=options.body.category;return {};}
    if(operation.method==="PATCH"){fileChanges.displayName=options.body.displayName;return {};}

    if(path.endsWith("/stage")){(window as any).stagedFiles=[...((window as any).stagedFiles??[]),options.body];return {attachmentId:options.body.attachmentId,uploadUrl:"https://storage.test/upload"};}
    if(path.endsWith("/finalize"))return {status:"active"};
    if (path.endsWith("/search")) {
      const q = options.body.q;
      if (q === "slow")
        await new Promise((resolve) => setTimeout(resolve, 500));
      if (q === "error") throw new Error("Unavailable");
      if (q === "empty") return { hits: [] };
      return {
        hits: [
          {
            attachmentId: options.body.after ? "second" : "result",
            fileName: options.body.after ? "second.pdf" : "Receipt.pdf",
            contentType: "application/pdf",
            snippet: `Transaction receipt ${q} payment details <script>unsafe</script>`,
          },
        ],
        ...(!options.body.after ? { nextCursor: "next" } : {}),
      };
    }
    if (path.endsWith("/preview"))
      return {
        state: "ready",
        url:
          options.body.rendition === "thumbnail_sm"
            ? "https://storage.test/thumb.png"
            : "https://storage.test/preview.pdf",
      };
    return {};
  },
};
export function useApiClient() {
  return client;
}
export function useSessionIdentity() {
  return { scope: { principalId: "owner" } };
}
function Fixture() {
  const [mode, setMode] = useState<"pinned" | "content">("pinned");
  const [fileName,setFileName]=useState("proof.pdf");
  const [empty,setEmpty]=useState(false);const [,refresh]=useState(0);
  Object.assign(window, { setFileMode: setMode,setFileName,refreshFiles:()=>refresh(v=>v+1),emptyFiles:()=>setEmpty(true) });
  const resource: any = {
    presentation: { rendererKey: "platform.attachments.v1", fields: [] },
    capability: {
      allowedContentTypes:["application/pdf","image/png"],maxFileBytes:1024,maxBatchCount:10,
      actions: [
        "read",
        "rename",
        "version",
        "create",
        "finalize",
        "search",
        "preview",
        "download",
        "folder",
        "category",
      ].map((key) => ({ key })),
    },
    data: {
      workspaceRevision: "1",
      folders: [...folders],
      items: [
        {
          id: "first",
          fileName,
          contentType: "application/pdf",
          sizeBytes: 1000,
          createdAt: "2026-09-22",
          version: 1,
          versionHistory:[{id:"first",version:1,fileName:"proof.pdf",status:"active"},{id:"old",version:0,fileName:"proof.pdf",status:"active"}],
          category: "general",
          processingStatus: "active",
          folderId: "folder",
          ...fileChanges,
        },
      ],
    },
  };
  if((window as any).showUploaded)resource.data.items.push(...((window as any).stagedFiles??[]).map((item:any)=>({...item,id:item.attachmentId,processingStatus:"active",version:1})));
  if(empty)resource.data.items=[];
  return (
    <CollaborationPresentationContext.Provider value={mode}>
      <section
        className="a-collaboration-panel"
        data-mode={mode}
        style={{
          position: "relative",
          height: "auto",
          width: mode === "content" ? "100%" : "min(420px,100%)",
        }}
      >
        <div className="a-collaboration-panel__body">
          <CompiledEntitySectionContent
            resource={resource}
            entityCode="fixture"
            recordId="record"
            onChanged={() => refresh(v=>v+1)}
          />
        </div>
      </section>
    </CollaborationPresentationContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<ToastProvider><Fixture /></ToastProvider>);
