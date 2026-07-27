"use client";

import { useRouter } from "next/navigation";
import {
  DashboardHero,
  DashboardHost,
  type DashboardExperience,
  type DashboardHeroExperience,
} from "@athyper/dashboard-ui";
import { RuntimeListIntentPrefetchLinks } from "@athyper/runtime-list/islands";
import { bffFetch } from "@/lib/bff-fetch";

const widgetsExperience: DashboardExperience = {
  plane: "neon",
  title: "My operations",
  subtitle: "Assigned work, business exceptions, recent documents, and setup readiness.",
  registrations: [
    { id: "assigned-work", title: "My assigned work", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "assigned-work", freshnessMs: 30_000 } },
    { id: "pending-approvals", title: "Pending approvals", kind: "attention", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "pending-approvals", freshnessMs: 30_000 } },
    { id: "finance-exceptions", title: "Finance readiness and close exceptions", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "finance-exceptions", freshnessMs: 60_000 } },
    { id: "invoice-exceptions", title: "Invoice and purchasing exceptions", kind: "status", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "invoice-exceptions", freshnessMs: 30_000 } },
    { id: "recent-documents", title: "Recent documents", kind: "recent", layout: { columnSpan: 2 }, permission: "dashboard.neon.read", query: { key: "recent-documents", freshnessMs: 30_000 } },
    { id: "frequent-saved-views", title: "Frequently used saved views", kind: "saved-views", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "frequent-saved-views", freshnessMs: 60_000 } },
    { id: "setup-readiness", title: "Setup readiness", kind: "setup-readiness", layout: { columnSpan: 1 }, permission: "dashboard.neon.read", query: { key: "setup-readiness", freshnessMs: 60_000 } },
  ],
};

const HERO_SUGGESTIONS = [
  { label: "Purchase invoices", href: "/app/purchase_invoice" },
  { label: "Suppliers",         href: "/app/supplier" },
  { label: "Journal entries",   href: "/app/journal_entry" },
  { label: "Saved views",       href: "/saved-views" },
] as const;

const HERO_PLACEHOLDERS = [
  "Ask about invoices, POs, exceptions…",
  "Find a supplier by name or ID…",
  "Show overdue approvals…",
  "Any journal entry from last week…",
  "What needs my attention today?",
] as const;

const intentPrefetchEntities = (
  process.env.NEXT_PUBLIC_ATHYPER_DASHBOARD_PREFETCH_ENTITIES
  ?? "journal_entry"
).split(",").map((value) => value.trim()).filter(Boolean);

export function NeonDashboardClient({ userName }: { userName: string }) {
  const router = useRouter();
  const hero: DashboardHeroExperience = {
    plane: "neon",
    copilotLabel: "Neon",
    suggestions: HERO_SUGGESTIONS,
    placeholders: HERO_PLACEHOLDERS,
    onSearch: (query) => router.push(`/app/purchase_invoice?q=${encodeURIComponent(query)}`),
  };

  return (
    <div className="space-y-6">
      <DashboardHero {...hero} userName={userName} />
      <DashboardHost experience={widgetsExperience} fetcher={bffFetch} />
      <section className="mt-6 rounded-xl border bg-card p-5" aria-labelledby="runtime-list-shortcuts">
        <h2 id="runtime-list-shortcuts" className="mb-3 text-sm font-semibold">Operational list shortcuts</h2>
        <RuntimeListIntentPrefetchLinks targets={intentPrefetchEntities.map((entityCode) => ({
          entityCode,
          href: `/app/${encodeURIComponent(entityCode)}`,
          label: entityCode.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "),
          policy: { mode: "stale_while_revalidate", prefetch: "intent" },
        }))} />
      </section>
    </div>
  );
}
