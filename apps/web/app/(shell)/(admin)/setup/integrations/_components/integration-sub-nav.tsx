"use client";

/**
 * IntegrationSubNav
 *
 * Tab-strip shared by all seven /setup/integrations/* pages.
 * Single source of truth — previously copied verbatim into each page.
 */

import Link from "next/link";
import { Button } from "@athyper/ui/primitives";

const INTEGRATION_TABS = [
  { href: "/setup/integrations",              label: "Endpoints" },
  { href: "/setup/integrations/providers",    label: "Providers" },
  { href: "/setup/integrations/outbox",       label: "Outbox" },
  { href: "/setup/integrations/deliveries",   label: "Deliveries" },
  { href: "/setup/integrations/webhooks",     label: "Webhooks" },
  { href: "/setup/integrations/connectors",   label: "Connectors" },
  { href: "/setup/integrations/connections",  label: "Connections" },
] as const;

export function IntegrationSubNav({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b pb-3">
      {INTEGRATION_TABS.map((t) => (
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
