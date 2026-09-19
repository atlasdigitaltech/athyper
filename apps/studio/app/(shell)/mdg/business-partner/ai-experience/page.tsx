import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
import type { Metadata } from "next";
import { SparklesIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { AtlasExperienceEditor } from "./experience-editor";

export const metadata: Metadata = { title: "Atlas Experience Configuration" };
export default function AtlasExperienceConfigurationPage() {
  return (
    <PageFrame width="wide" className="athyper-landing">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Atlas Experience"
        description="Configure and publish permission-aware Home widgets, search sources, starter prompts, and AI agent profiles."
        icon={<SparklesIcon />}
      />
      <BusinessPartnerInspection tab="ai-experience" />
      <AtlasExperienceEditor />
    </PageFrame>
  );
}
