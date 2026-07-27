"use client";

import { useRouter } from "next/navigation";
import {
  DashboardHero,
  DashboardHost,
  type DashboardExperience,
  type DashboardHeroExperience,
} from "@athyper/dashboard-ui";
import { bffFetch } from "@/lib/bff-fetch";

const widgetsExperience: DashboardExperience = {
  plane: "admin",
  title: "Platform operations",
  subtitle: "Tenant, security, delivery, metadata, and support health.",
  registrations: [
    { id: "tenant-health", title: "Tenant health", description: "Subscription and module state", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.admin.read", query: { key: "tenant-health", freshnessMs: 60_000 } },
    { id: "security-actions", title: "Required security actions", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.admin.read", query: { key: "security-actions", freshnessMs: 30_000 } },
    { id: "failed-jobs", title: "Failed or delayed jobs", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.admin.read", query: { key: "failed-jobs", freshnessMs: 30_000 } },
    { id: "metadata-drift", title: "Metadata publication drift", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.admin.read", query: { key: "metadata-drift", freshnessMs: 60_000 } },
    { id: "notification-health", title: "Notification delivery health", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.admin.read", query: { key: "notification-health", freshnessMs: 30_000 } },
    { id: "support-grants", title: "Active support grants", kind: "metric", layout: { columnSpan: 1 }, permission: "dashboard.admin.privileged", query: { key: "support-grants", freshnessMs: 30_000 } },
    { id: "privileged-activity", title: "Recent privileged activity", kind: "recent", layout: { columnSpan: 2 }, permission: "dashboard.admin.privileged", query: { key: "privileged-activity", freshnessMs: 30_000 } },
  ],
};

const HERO_SUGGESTIONS = [
  { label: "Setup",         href: "/setup" },
  { label: "Notifications", href: "/notifications" },
  { label: "Inbox",         href: "/inbox" },
  { label: "Saved views",   href: "/saved-views" },
] as const;

const HERO_PLACEHOLDERS = [
  "Find a tenant or subscription…",
  "Any required security actions?",
  "Show failed or delayed jobs…",
  "Which tenants have metadata drift?",
  "What needs my attention today?",
] as const;

export function AdminDashboardClient({ userName }: { userName: string }) {
  const router = useRouter();
  const hero: DashboardHeroExperience = {
    plane: "admin",
    copilotLabel: "Admin",
    suggestions: HERO_SUGGESTIONS,
    placeholders: HERO_PLACEHOLDERS,
    onSearch: (query) => router.push(`/inbox?q=${encodeURIComponent(query)}`),
  };

  return (
    <div className="space-y-6">
      <DashboardHero {...hero} userName={userName} />
      <DashboardHost experience={widgetsExperience} fetcher={bffFetch} />
    </div>
  );
}
