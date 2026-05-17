"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorkbenchMetaShell, type WorkbenchModeItem } from "@athyper/ui/composites";
import {
  getTaxonomyWorkbenchDefinition,
  type TaxonomyWorkbenchId,
  type TaxonomyWorkbenchMode,
} from "./taxonomyWorkbenchManifest";

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
      actions={actions}
    />
  );
}
