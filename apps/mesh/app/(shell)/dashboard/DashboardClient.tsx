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
  plane: "mesh",
  title: "Exchange operations",
  subtitle: "Connection, envelope, acknowledgement, delivery, and onboarding health.",
  registrations: [
    { id: "active-connections", title: "Active connections", kind: "metric", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "active-connections", freshnessMs: 60_000 } },
    { id: "inbound-envelopes", title: "Inbound envelopes", kind: "metric", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "inbound-envelopes", freshnessMs: 30_000 } },
    { id: "outbound-envelopes", title: "Outbound envelopes", kind: "metric", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "outbound-envelopes", freshnessMs: 30_000 } },
    { id: "awaiting-ack", title: "Awaiting acknowledgement", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "awaiting-ack", freshnessMs: 30_000 } },
    { id: "failed-exchanges", title: "Failed or rejected exchanges", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "failed-exchanges", freshnessMs: 30_000 } },
    { id: "delivery-sla", title: "Delivery SLA", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "delivery-sla", freshnessMs: 30_000 } },
    { id: "onboarding-status", title: "Buyer/supplier onboarding", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.mesh.read", query: { key: "onboarding-status", freshnessMs: 60_000 } },
    { id: "recent-exchange-documents", title: "Recent exchange documents", kind: "recent", layout: { columnSpan: 2 }, permission: "dashboard.mesh.read", query: { key: "recent-exchange-documents", freshnessMs: 30_000 } },
  ],
};

const HERO_SUGGESTIONS = [
  { label: "Inbox",       href: "/inbox" },
  { label: "Governance",  href: "/governance" },
  { label: "Content",     href: "/content" },
  { label: "Saved views", href: "/saved-views" },
] as const;

const HERO_PLACEHOLDERS = [
  "Find a partner exchange or envelope…",
  "Show acknowledgements pending…",
  "Which deliveries missed SLA today?",
  "Any onboarding blockers this week?",
  "What needs my attention today?",
] as const;

export function MeshDashboardClient({ userName }: { userName: string }) {
  const router = useRouter();
  const hero: DashboardHeroExperience = {
    plane: "mesh",
    copilotLabel: "Mesh",
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
