import type { Metadata } from "next";
import { SettingsIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { ExperienceComposer } from "./experience-composer";

export const metadata: Metadata = { title: "Experience Composer" };
const initialDefinition = {
  schema: "athyper-experience-surface/1",
  id: "neon.home",
  revision: 1,
  scope: { kind: "home", plane: "neon" },
  title: "Home",
  description: "Choose what to work on.",
  visual: { kind: "icon", key: "home" },
  blocks: [
    { id: "welcome.heading", type: "heading", text: "Welcome" },
    {
      id: "inbox.shortcut",
      type: "shortcut",
      title: "My actionable work",
      actions: [
        {
          action: "catalog.navigate",
          label: "Open inbox",
          input: { path: "/inbox" },
        },
      ],
    },
  ],
} as const;

export default function ExperienceComposerPage() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="module"
        context="Entity Studio · Experience & Navigation Design"
        title="Experience Composer"
        description="Compose validated Home, Workspace, Module, and Entity surfaces from governed blocks and registries."
        icon={<SettingsIcon />}
        metadata={
          <>
            <span>Draft, then human publish</span>
            <span>Schema v1</span>
          </>
        }
      />
      <ExperienceComposer initialDefinition={initialDefinition} />
    </PageFrame>
  );
}
