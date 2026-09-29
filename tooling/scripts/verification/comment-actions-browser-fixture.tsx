import { CollaborationPresentationContext } from "../../../packages/platform/entity/runtime/form-detail/src/collaboration-visibility";
import { ToastProvider } from "../../../packages/platform/shell/app-foundation/src/toasts";
export { useToasts } from "../../../packages/platform/shell/app-foundation/src/toasts";
export { readBrowserCsrfToken } from "../../../packages/platform/shell/app-foundation/src/browser-csrf";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CompiledEntitySectionContent } from "../../../packages/platform/entity/runtime/form-detail/src/compiled-section-content";
import { ApiTransportError } from "@athyper/platform-api-client";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let item: any = {
  id,
  authorId: "owner",
  authorDisplayName: "Test Author",
  createdAt: "2026-09-22T05:00:00Z",
  visibility: "public",
  text: "Original comment",
  revision: 1,
  viewerReactions: [],
  reactions: [],
};
const calls: any[] = [];
Object.assign(window, { commentCalls: calls, editFails: false });
const client = {
  request: async (operation: any, options: any = {}) => {
    const path =
      typeof operation.path === "function"
        ? operation.path(options.params??{})
        : operation.path;
    calls.push({ path, method: operation.method, ...options });
    if (path.startsWith("/api/collab/participants?")) {
      await new Promise(resolve=>setTimeout(resolve, (window as any).mentionDelay ?? 0));
      if ((window as any).mentionMode === "error") throw new Error("Directory unavailable");
      return {items:(window as any).mentionMode === "empty" ? [] : (window as any).mentionMode === "self" ? [{id:"owner",displayName:"Catl Admin",username:"catl.admin"}] : [{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",displayName:"Alex Reviewer",username:"alex.reviewer"}]};
    }
    if (operation.method === "PATCH") {
      if ((window as any).editFails)
        throw new ApiTransportError("http", "Changed on server", 409);
      item = { ...item, ...options.body, revision: item.revision + 1 };
      return item;
    }
    if(operation.method === "DELETE" && path.endsWith(`/comments/${id}`)){if((window as any).deleteFails)throw new ApiTransportError("http","Delete failed",500);item={...item,tombstone:true,text:"",content:undefined,pinnedFiles:[]};return true;}
    if (path.endsWith("/history") && item.tombstone) return {items:[],deletion:{deletedAt:"2026-09-22T06:00:00Z"}};
    if (path.endsWith("/history"))
      return {
        items: [
          {
            revision: 2,
            text: "Latest saved revision",
            createdAt: item.createdAt,
          },
          { revision: 1, text: "Original comment", createdAt: item.createdAt },
        ],
      };
    if (path.endsWith("/preview")) return {state:"unavailable",detail:"Fixture preview unavailable"};
    if (path.endsWith("/flag")) {item={...item,reportStatus:"open",viewerReport:{reason:options.body.reasonCode,detail:options.body.detail,status:"open",submittedAt:"2026-09-22T06:00:00Z"}};return { id: "report" };}
    if (path.includes("/reactions")) {
      const liked = operation.method === "POST";
      item = {
        ...item,
        viewerReactions: liked ? ["thumbs_up"] : [],
        reactions: liked ? [{ code: "thumbs_up", count: 1 }] : [],
      };
      return { inserted: liked };
    }
    if(path.includes("/sections/attachments")) throw new Error("COMPILED_ENTITY_ARTIFACT_NOT_IN_RELEASE:country/presentation.detail");
    if(path.endsWith("/collaboration/attachments")) return {capability:{actions:(window as any).denyCommentFiles ? [] : [{key:"create"},{key:"finalize"}],allowedContentTypes:["application/pdf","image/png"],maxFileBytes:26214400}};
    if (path.endsWith("/drafts")) return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    if ((window as any).postedCommentId && path === "/api/collab/comments" && options?.method !== "GET") return { id: (window as any).postedCommentId };
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
  const [, refresh] = useState(0);
  const [full,setFull]=useState(false);Object.assign(window,{setFull});
  const [replyItems,setReplyItems]=useState<any[]|undefined>();Object.assign(window,{setReplyItems});
  const [groupFixture,setGroupFixture]=useState(false);Object.assign(window,{groupComments:()=>setGroupFixture(true)});
  const [replyCount,setReplyCount]=useState(0),[empty,setEmpty]=useState(false);
  Object.assign(window,{setReplyCount,emptyComments:()=>setEmpty(true),pinCommentFile:()=>{item={...item,content:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Evidence attached"}]},{type:"attachmentFile",attrs:{attachmentId:"proof-file",alt:"proof.pdf"}}]},pinnedFiles:[{attachmentId:"proof-file",fileName:"proof.pdf",version:2,sizeBytes:2048}]};refresh(value=>value+1);}});
  const [files,setFiles]=useState(false);Object.assign(window,{showFiles:()=>setFiles(true)});
  const resource: any = {
    presentation: { rendererKey: "platform.comments.v1", fields: [], childCollections: [] },
    capability: {
      actions: [
        "create",
        "mention",
        "draft",
        "react",
        "reply",
        "flag",
        "history",
        "update_own",
        "archive_own",
      ].map((key) => ({ key })),
      allowedAudiences: ["public", "private"],
      defaultAudience: "public",
      maxAttachments: 5,
      maxDepth: 5,
    },
    data: { items: empty?[]:groupFixture?[{...item,id:"early",authorId:"bob",authorDisplayName:"Bob",createdAt:"2026-09-21T01:00:00Z",text:"Early Bob"},{...item,id:"middle",authorId:"alice",authorDisplayName:"Alice",createdAt:"2026-09-22T01:00:00Z",text:"Alice comment"},{...item,id:"late",authorId:"bob",authorDisplayName:"Bob",createdAt:"2026-09-22T02:00:00Z",text:"Late Bob"}]:[{...item,replyCount}] },
  };
  if(files){resource.presentation.rendererKey="platform.attachments.v1";resource.capability.actions=["read","rename","category","folder"].map(key=>({key}));resource.data={workspaceRevision:"1",folders:[{id:"folder",name:"Evidence folder"}],items:[{id:"file",fileName:"proof.pdf",displayName:"proof.pdf",category:"general",revision:"1",processingStatus:"active",version:1}]};}
  return (
    <CollaborationPresentationContext.Provider value={full?"content":"pinned"}><section
      data-mode={full?"content":undefined}
      className="a-collaboration-panel"
      style={{ height: 600, width: 420 }}
    >
      <div className="a-collaboration-panel__body">
        <CompiledEntitySectionContent
          resource={resource}
          entityCode="fixture"
          recordId="record"
          onLoadMentionsPage={async(cursor)=>{
            calls.push({path:"mentions-page",cursor});
            return {data:{items:[{...item,id:cursor?"mentioned-page-2":item.id,text:cursor?"Second mentioned thread":"Mention exists in a visible reply",replyCount:1}],...(!cursor?{nextCursor:"next-mentions"}:{})}} as any;
          }}
          onLoadThreadPage={async(_root,cursor)=>{calls.push({path:"thread-page"});if((window as any).eightPages){const n=Number(cursor??0);return {data:{items:[{...item,id:`page-${n}`,text:`Reply page ${n+1}`,parentCommentId:id,threadDepth:1}],nextCursor:n<7?String(n+1):undefined}} as any;}return ({data:{items:replyItems??[{...item,id:"reply-fixture",text:"A reply",parentCommentId:id,threadDepth:1},{...item,id:"nested-fixture",text:"Nested reply",parentCommentId:"reply-fixture",threadDepth:2}],nextCursor:replyItems?"more":undefined}} as any);}}
          onChanged={() => refresh((value) => value + 1)}
        />
      </div>
    </section></CollaborationPresentationContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<ToastProvider><Fixture /></ToastProvider>);
