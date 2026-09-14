import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { GraphEditor } from "./graph-editor";
export const metadata: Metadata = { title: "Meta Entity Graphs" };
export default function GraphPage() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="module"
        context="Entity Studio"
        title="Meta Entity Graphs"
        description="Edit a working draft and track its active local preview."
      />
      <GraphEditor />
    </PageFrame>
  );
}
