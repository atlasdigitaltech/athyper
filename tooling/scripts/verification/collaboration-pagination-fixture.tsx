import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useEntityRuntimeSectionWorkspace } from "../../../packages/platform/entity/runtime/form-detail/src/use-section-resource";
let pending: (() => void)[] = [];
Object.assign(window, {
  holdPages: false,
  releasePages: () => {
    pending.splice(0).forEach((resolve) => resolve());
  },
});
export const entityRuntimeClient = {
  bootstrap: async () => ({
    releaseId: "r",
    releaseHash: "h",
    plan: { sections: [{ key: "comments" }], initialSectionKeys: ["comments"] },
  }),
  section: async (_: unknown, input: any) => {
    if (input.cursor && (window as any).holdPages)
      await new Promise<void>((resolve) => pending.push(resolve));
    const offset = Number(input.cursor ?? 0);
    return {
      releaseId: "r",
      releaseHash: "h",
      revision: "1",
      data: {
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `${input.recordId}-${offset + i + 1}`,
          text: `Comment ${offset + i + 1}`,
        })),
        nextCursor: offset < 175 ? String(offset + 25) : undefined,
      },
    };
  },
};
const client = {} as any;
function Fixture() {
  const [record, setRecord] = useState("A");
  const workspace = useEntityRuntimeSectionWorkspace({
    client,
    entityCode: "fixture",
    recordId: record,
    surfaceKey: "detail",
    cacheScope: "test",
  });
  const rows =
    (workspace.sections.comments?.resource?.data as any)?.items ?? [];
  return (
    <>
      <button onClick={() => setRecord("B")}>Next record</button>
      <button onClick={() => workspace.loadMore("comments")}>Load more</button>
      <button onClick={() => workspace.invalidate("comments")}>
        Like comment 90
      </button>
      <p role="status">
        {record}: {rows.length}
      </p>
      <ul>
        {rows.map((row: any) => (
          <li key={row.id}>{row.id}</li>
        ))}
      </ul>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
