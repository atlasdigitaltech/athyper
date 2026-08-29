import type { Metadata } from "next";
import { PlatformHome } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Home" };
const MDG_ACCESS = { moduleCode: "fnd" } as const;
const BP_READ_ACCESS = { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner.read"] } as const;
const REQUEST_READ_ACCESS = { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner_request.read"] } as const;
const REQUEST_CREATE_ACCESS = { moduleCode: "fnd", requiredPermissions: ["neon.relationship.business_partner_request.create"] } as const;

export default function NeonHomePage() {
  return <PlatformHome
    citationRoutes={{ business_partner: "/mdg/business-partner/{recordId}", business_partner_request: "/mdg/business-partner/requests/{recordId}" }}
    suggestions={["Priority Tasks", "Today’s Work", "Pending Approvals"]}
    workspaces={[{ name: "Master Data Governance", description: "Create, validate, approve, and maintain trusted master records.", href: "/mdg", status: "Available workspace", modules: ["Business Partner"], access: MDG_ACCESS }]}
    quickActions={[
      { label: "New supplier request", description: "Start governed supplier onboarding", href: "/mdg/business-partner/new", access: REQUEST_CREATE_ACCESS },
      { label: "Review onboarding requests", description: "Continue validation and approval work", href: "/mdg/business-partner/requests", access: REQUEST_READ_ACCESS },
      { label: "Browse business partners", description: "Find suppliers, customers, and dual-role partners", href: "/mdg/business-partner/partners", access: BP_READ_ACCESS },
    ]}
    searchItems={[
      { title: "Master Data Governance", description: "Open the MDG workspace dashboard", href: "/mdg", category: "Workspace", keywords: ["mdg", "master data"], access: MDG_ACCESS },
      { title: "Business Partners", description: "Browse governed supplier and customer records", href: "/mdg/business-partner/partners", category: "Records", keywords: ["supplier", "customer", "dual role"], access: BP_READ_ACCESS },
      { title: "Onboarding requests", description: "Review validation and approval requests", href: "/mdg/business-partner/requests", category: "Work", keywords: ["pending approval", "priority tasks", "today’s work", "review", "workflow"], access: REQUEST_READ_ACCESS },
      { title: "New supplier request", description: "Start a governed supplier onboarding request", href: "/mdg/business-partner/new", category: "Action", keywords: ["create supplier", "onboard"], access: REQUEST_CREATE_ACCESS },
      { title: "Business Partner overview", description: "Open the Business Partner module", href: "/mdg/business-partner", category: "Module", keywords: ["duplicate checks", "governance"], access: MDG_ACCESS },
    ]}
  />;
}
