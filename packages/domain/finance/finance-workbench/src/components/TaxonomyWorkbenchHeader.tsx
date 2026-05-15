"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { WorkbenchMetaShell, type WorkbenchModeItem } from "@athyper/ui/composites";
import { ReportChooserSuffix } from "./ReportScaffold";
import {
  TAXONOMY_WORKBENCHES,
  getTaxonomyWorkbenchDefinition,
  type TaxonomyWorkbenchId,
  type TaxonomyWorkbenchMode,
} from "./taxonomyWorkbenchManifest";

const FINANCE_LINKS = [
  { label: "GL Workbench", href: "/finance/gl" },
  { label: "Financial Reports", href: "/finance/reports" },
] as const;

export function TaxonomyWorkbenchHeader({
  active,
  activeMode,
  onModeChange,
  subtitle,
  actions,
}: {
  active: TaxonomyWorkbenchId;
  activeMode?: TaxonomyWorkbenchMode;
  onModeChange?: (mode: TaxonomyWorkbenchMode) => void;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const definition = getTaxonomyWorkbenchDefinition(active);
  const homeLabel = `Back to ${definition.workspace === "supply-chain" ? "Supply Chain" : "Finance"}`;
  const workbenchLinks = Object.values(TAXONOMY_WORKBENCHES);

  function handleModeChange(mode: WorkbenchModeItem) {
    const target = definition.modes.find((item) => item.key === mode.key);
    if (target) onModeChange?.(target.key);
    if (target?.href) router.push(target.href);
  }

  return (
    <WorkbenchMetaShell
      label={definition.label}
      title={definition.title}
      subtitle={subtitle}
      backLabel={homeLabel}
      onBack={() => router.push(definition.homeHref)}
      modes={definition.modes}
      activeMode={activeMode ?? definition.activeMode}
      onModeChange={handleModeChange}
      actions={
        <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              title="Switch workbench"
              aria-label="Switch workbench"
            >
              Workbench
              <ReportChooserSuffix />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[250px]">
            {workbenchLinks.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => router.push(item.href)}
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <span>{item.title}</span>
                {item.id === active && <Check className="h-4 w-4" aria-hidden="true" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {FINANCE_LINKS.map((item) => (
              <DropdownMenuItem
                key={item.href}
                onSelect={() => router.push(item.href)}
                className="cursor-pointer"
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {actions}
        </>
      }
    />
  );
}
