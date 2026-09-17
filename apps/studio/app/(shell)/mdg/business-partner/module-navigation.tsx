"use client";

import {
  ManagementNavigation,
  type SectionNavigationItem,
} from "@athyper/platform-shell";
import { usePathname, useSearchParams } from "next/navigation";

const items: readonly SectionNavigationItem[] = [
  { href: "/mdg/business-partner", label: "Overview" },
  { href: "/mdg/business-partner/model", label: "Data Model" },
  { href: "/mdg/business-partner/validation", label: "Validation" },
  { href: "/mdg/business-partner/matching", label: "Matching" },
  { href: "/mdg/business-partner/workflows", label: "Workflows" },
  { href: "/mdg/business-partner/publication", label: "Publication" },
  { href: "/mdg/business-partner/operations", label: "Operations & Proof" },
  { href: "/mdg/business-partner/ai-experience", label: "Atlas Experience" },
];

export function BusinessPartnerNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const inspect = params.get("inspect");
  const query = new URLSearchParams();
  if (inspect) query.set("inspect", inspect);
  const object = params.get("object");
  if (inspect && object) query.set("object", object);
  const suffix = query.size ? `?${query}` : "";
  const currentHref =
    items
      .slice(1)
      .find(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.href ?? (pathname === items[0]?.href ? items[0].href : undefined);
  return (
    <ManagementNavigation
      appearance="flat"
      items={items.map((item) => ({
        ...item,
        key: item.href,
        href: item.href + suffix,
      }))}
      currentKey={currentHref}
      label="Business Partner configuration"
    />
  );
}
