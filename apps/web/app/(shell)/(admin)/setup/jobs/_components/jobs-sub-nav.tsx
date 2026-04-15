"use client";

/**
 * JobsSubNav
 *
 * Tab-strip shared by all five /setup/jobs/* pages.
 * Single source of truth — was copy-pasted into each page.
 */

import Link from "next/link";
import { Button } from "@athyper/ui/primitives";

const JOBS_TABS = [
  { href: "/setup/jobs",                label: "Queues" },
  { href: "/setup/jobs/dlq",            label: "Dead Letter" },
  { href: "/setup/jobs/history",        label: "Run History" },
  { href: "/setup/jobs/schedules",      label: "Schedules" },
  { href: "/setup/jobs/orchestrations", label: "Orchestrations" },
] as const;

export function JobsSubNav({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b pb-3">
      {JOBS_TABS.map((t) => (
        <Link key={t.href} href={t.href}>
          <Button
            size="sm"
            variant={active === t.href ? "primary" : "ghost"}
            className="h-7 text-xs"
          >
            {t.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
