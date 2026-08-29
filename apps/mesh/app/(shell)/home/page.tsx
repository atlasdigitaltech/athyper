import type { Metadata } from "next";
import { PlatformHome } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Home" };
const MDG_ACCESS = { moduleCode: "fnd" } as const;

export default function MeshHomePage() {
  return <PlatformHome
    plane="Mesh"
    pendingApprovalsHref="/mdg/business-partner/requests"
    citationRoutes={{ network_account: "/mdg/business-partner/profile", business_partner_profile: "/mdg/business-partner/profile" }}
    suggestions={["My organization", "Partner relationships", "Profile requests", "Publication status"]}
    workspaces={[{ name: "Master Data Governance", description: "Maintain and exchange trusted partner information across the business network.", href: "/mdg", status: "Available workspace", modules: ["Business Partner"], access: MDG_ACCESS }]}
    quickActions={[
      { label: "Maintain my organization", description: "Review the profile shared with connected partners", href: "/mdg/business-partner/profile", access: MDG_ACCESS },
      { label: "Profile change requests", description: "Track governed updates and their status", href: "/mdg/business-partner/requests", access: MDG_ACCESS },
      { label: "Partner relationships", description: "Review connected customers and suppliers", href: "/mdg/business-partner/relationships", access: MDG_ACCESS },
    ]}
    searchItems={[
      { title: "Master Data Governance", description: "Open the MDG exchange workspace", href: "/mdg", category: "Workspace", keywords: ["mdg", "master data"], access: MDG_ACCESS },
      { title: "My organization", description: "Maintain the authenticated organization profile", href: "/mdg/business-partner/profile", category: "Profile", keywords: ["supplier profile", "customer profile", "company"], access: MDG_ACCESS },
      { title: "Partner relationships", description: "View connected supplier and customer relationships", href: "/mdg/business-partner/relationships", category: "Network", keywords: ["connections", "customers", "suppliers"], access: MDG_ACCESS },
      { title: "Profile change requests", description: "Track governed profile submissions", href: "/mdg/business-partner/requests", category: "Work", keywords: ["update", "approval", "request"], access: MDG_ACCESS },
      { title: "Business Partner exchange", description: "Open the Business Partner network module", href: "/mdg/business-partner", category: "Module", keywords: ["publication", "synchronization", "matching"], access: MDG_ACCESS },
    ]}
  />;
}
