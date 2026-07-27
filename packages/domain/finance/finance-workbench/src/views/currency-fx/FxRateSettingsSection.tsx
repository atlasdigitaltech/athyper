import Link from "next/link";
import { Download, ExternalLink, FilePlus2, Upload } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import type { FxNavigation, TenantFxPermissions } from "../../hooks/useCurrencyFxSetup";

export function FxRateSettingsSection({
  navigation,
  permissions,
}: {
  navigation: FxNavigation;
  permissions: TenantFxPermissions;
}) {
  return (
    <section id="fx-rates" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="fx-rate-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 id="fx-rate-settings-title" className="font-semibold">Rates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage governed exchange-rate records in the FX Rate entity.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={navigation.rateListHref}>
            Manage exchange rates <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 p-5">
        <PermissionLink
          allowed={permissions.addRate.allowed}
          reason={permissions.addRate.reasonCode}
          href={navigation.rateAddHref}
          label="Add rate"
          icon={<FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden />}
        />
        <PermissionLink
          allowed={permissions.importRates.allowed}
          reason={permissions.importRates.reasonCode}
          href={navigation.rateImportHref}
          label="Import rates"
          icon={<Upload className="mr-1.5 h-4 w-4" aria-hidden />}
        />
        <PermissionLink
          allowed={permissions.exportRates.allowed}
          reason={permissions.exportRates.reasonCode}
          href="/app/fx_rate/export"
          label="Export rates"
          icon={<Download className="mr-1.5 h-4 w-4" aria-hidden />}
        />
      </div>
    </section>
  );
}

function PermissionLink({
  allowed,
  reason,
  href,
  label,
  icon,
}: {
  allowed: boolean;
  reason: string | null;
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  if (!allowed) {
    return (
      <Button size="sm" variant="outline" disabled title={reason ?? undefined}>
        {icon}{label}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{icon}{label}</Link>
    </Button>
  );
}
