"use client";

import { SectionNavigation, type SectionNavigationItem } from "@athyper/platform-shell";
import { usePathname } from "next/navigation";

const items: readonly SectionNavigationItem[] = [
  { href: "/mdg/business-partner", label: "Overview" },
  { href: "/mdg/business-partner/partners", label: "Manage" },
  { href: "/mdg/business-partner/requests", label: "Review & Approval" },
  { href: "/mdg/business-partner/mesh-proposals", label: "MESH Proposals" },
  { href: "/mdg/business-partner/new", label: "Create" },
];

export function BusinessPartnerNavigation() {
  const pathname = usePathname();
  const currentHref = items.slice(1).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ?? (pathname === items[0]?.href ? items[0].href : undefined);
  return <SectionNavigation items={items} currentHref={currentHref} label="Business Partner module"/>;
}
