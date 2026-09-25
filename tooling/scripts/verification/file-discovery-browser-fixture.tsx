import { ApiTransportError } from "@athyper/platform-api-client";
import { ToastProvider } from "../../../packages/platform/shell/app-foundation/src/toasts";
export { useToasts } from "../../../packages/platform/shell/app-foundation/src/toasts";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CompiledEntitySectionContent } from "../../../packages/platform/entity/runtime/form-detail/src/compiled-section-content";
import { CollaborationPresentationContext } from "../../../packages/platform/entity/runtime/form-detail/src/collaboration-visibility";
const calls: any[] = [];
const folders = [{ id: "folder", name: "Evidence" }];
const fileChanges: Record<string, unknown> = {};
Object.assign(window, { fileCalls: calls });
const client = {
  request: async (operation: any, options: any = {}) => {
    const path =
      typeof operation.path === "function"
        ? operation.path({})
        : operation.path;
    calls.push({ path, ...options });
    if (path.endsWith("/browse")) {
      if ((window as any).slowBrowse) await new Promise(resolve=>setTimeout(resolve,200));
      const body = options.body;
      const rows = [...((window as any).fileRows ?? []), ...((window as any).hiddenFiles ?? [])];
      return {items: rows.filter((item:any) =>
        (!body.attachmentId || item.id === body.attachmentId) &&
        (!body.name || (body.exactName ? item.fileName === body.name : item.fileName.toLowerCase().includes(body.name.toLowerCase()))) &&
        (!body.folderId || item.folderId === body.folderId) &&
        (!body.unfiled || !item.folderId) &&
        (!body.category || (item.category ?? "general") === body.category)).map((item:any)=>{
          const {versionHistory,...summary}=item;
          return body.includeHistory ? {...summary,versionHistory} : summary;
        })};
    }
    if (path.endsWith("/folders")) {
      if ((window as any).folderConflict) {
        (window as any).folderConflict = false;
        (window as any).workspaceRevision = 2;
        throw new ApiTransportError("http", "Refresh folder list", 409, {
          code: "ATTACHMENT_WORKSPACE_REVISION_CONFLICT",
        });
      }
      if (options.body.command === "create")
        folders.push({ id: options.body.folderId, name: options.body.name });
      if (options.body.command === "move")
        fileChanges.folderId = options.body.folderId;
      return { revision: 2 };
    }
    if (path.endsWith("/category")) {
      fileChanges.category = options.body.category;
      return {};
    }
    if (operation.method === "PATCH") {
      fileChanges.displayName = options.body.displayName;
      return {};
    }

    if (path.endsWith("/download"))
      return { url: "https://storage.test/download" };
    if (path.endsWith("/archive"))
      return { legalHold: Boolean((window as any).legalHold), activeLinks: 1 };
    if (path.endsWith("/status"))
      return { status: (window as any).pendingFile ? "processing" : "active" };
    if (path.endsWith("/stage")) {
      (window as any).stagedFiles = [
        ...((window as any).stagedFiles ?? []),
        options.body,
      ];
      return {
        attachmentId: options.body.attachmentId,
        uploadUrl: "https://storage.test/upload",
      };
    }
    if (path.endsWith("/finalize")) return { status: "active" };
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
            snippet:
              q === "narrow"
                ? `narrow ${"short detail ".repeat(17)}`
                : q === "long"
                  ? `long ${"detail ".repeat(100)}FINAL WORDS`
                  : `Transaction receipt ${q} payment details <script>unsafe</script>`,
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
  const [fileName, setFileName] = useState("proof.pdf");
  const [canSearch, setCanSearch] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [, refresh] = useState(0);
  Object.assign(window, {
    setFileMode: setMode,
    setCanSearch,
    setFileName,
    refreshFiles: () => refresh((v) => v + 1),
    emptyFiles: () => setEmpty(true),
    setLegalHold: (value: boolean) => {
      (window as any).legalHold = value;
      refresh(v => v + 1);
    },
  });
  const resource: any = {
    presentation: { rendererKey: "platform.attachments.v1", fields: [], childCollections: [] },
    capability: {
      allowedContentTypes: ["application/pdf", "image/png"],
      maxFileBytes: 1024,
      maxBatchCount: 10,
      actions: [
        "read",
        "archive",
        "rename",
        "version",
        "create",
        "finalize",
        "search",
        "preview",
        "download",
        "folder",
        "category",
      ]
        .filter((key) => canSearch || key !== "search")
        .filter((key) => key !== "archive" || Boolean((window as any).legalHold))
        .map((key) => ({ key })),
    },
    data: {
      workspaceRevision: String((window as any).workspaceRevision ?? 1),
      folders: [...folders],
      items: [
        {
          id: "first",
          fileName,
          contentType: "application/pdf",
          sizeBytes: 1000,
          createdAt: "2026-09-22",
          version: 1,
          revision: "1",
          versionHistory: [
            {
              id: "first",
              version: 1,
              fileName: "proof.pdf",
              status: "active",
            },
            { id: "old", version: 0, fileName: "proof.pdf", status: "active" },
          ],
          category: "general",
          processingStatus: (window as any).pendingFile
            ? "processing"
            : "active",
          folderId: "folder",
          ...fileChanges,
        },
      ],
    },
  };
  if ((window as any).showUploaded)
    resource.data.items.push(
      ...((window as any).stagedFiles ?? []).map((item: any) => ({
        ...item,
        id: item.attachmentId,
        processingStatus: "active",
        version: 1,
      })),
    );
  if (empty) resource.data.items = [];
  (window as any).fileRows = resource.data.items;
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
            onChanged={() => refresh((v) => v + 1)}
          />
        </div>
      </section>
    </CollaborationPresentationContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <Fixture />
  </ToastProvider>,
);
