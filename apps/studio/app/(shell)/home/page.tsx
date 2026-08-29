import type { Metadata } from "next";
import { PlatformHome } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Home" };
const MDG_ACCESS = { moduleCode: "pub" } as const;

export default function StudioHomePage() {
  return <PlatformHome
    citationRoutes={{ metadata_entity: "/mdg/business-partner/model", business_partner_definition: "/mdg/business-partner/model" }}
    suggestions={["Priority Tasks", "Today’s Work", "Pending Approvals"]}
    workspaces={[{ name: "Master Data Governance", description: "Design and publish the governance configuration used by Neon and Mesh.", href: "/mdg", status: "Available workspace", modules: ["Business Partner"], access: MDG_ACCESS }]}
    quickActions={[
      { label: "Business Partner model", description: "Inspect governed entities and fields", href: "/mdg/business-partner/model", access: MDG_ACCESS },
      { label: "Validation rules", description: "Review data-quality requirements", href: "/mdg/business-partner/validation", access: MDG_ACCESS },
      { label: "Publication configuration", description: "Review the contract published to each plane", href: "/mdg/business-partner/publication", access: MDG_ACCESS },
    ]}
    searchItems={[
      { title: "Master Data Governance", description: "Open the MDG configuration workspace", href: "/mdg", category: "Workspace", keywords: ["mdg", "master data"], access: MDG_ACCESS },
      { title: "Business Partner model", description: "Inspect the governed entity model and fields", href: "/mdg/business-partner/model", category: "Definition", keywords: ["schema", "entity", "attributes"], access: MDG_ACCESS },
      { title: "Validation rules", description: "Review Business Partner data-quality rules", href: "/mdg/business-partner/validation", category: "Policy", keywords: ["required", "quality", "rule"], access: MDG_ACCESS },
      { title: "Matching policy", description: "Configure duplicate detection and match decisions", href: "/mdg/business-partner/matching", category: "Policy", keywords: ["duplicate", "deduplication"], access: MDG_ACCESS },
      { title: "Governance workflows", description: "Review lifecycle and approval configuration", href: "/mdg/business-partner/workflows", category: "Workflow", keywords: ["priority tasks", "today’s work", "pending approvals", "approval", "review"], access: MDG_ACCESS },
      { title: "Publication configuration", description: "Review definitions published to Neon and Mesh", href: "/mdg/business-partner/publication", category: "Publication", keywords: ["deploy", "release", "planes"], access: MDG_ACCESS },
      { title: "Business Partner configuration", description: "Open the governed module configuration", href: "/mdg/business-partner", category: "Module", keywords: ["studio", "configuration"], access: MDG_ACCESS },
    ]}
  />;
}
