"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEntityApplication, EntityApplicationSection } from "@athyper/platform-entity-list-view";
import { NeonEntityList } from "@athyper/product-neon-list-view";
type ListDensity = "compact" | "comfortable" | "spacious";

export function EntityApplicationRoute({entityCode,initialDensity,fallback}:{readonly entityCode:string;readonly initialDensity?:ListDensity;readonly fallback?:ReactNode}) {
  const app=useEntityApplication(),path=usePathname();
  const section=app?.descriptor.navigation?.find(item=>item.href===path || item.aliases.includes(path));
  if(section?.content) return <EntityApplicationSection key={section.key} sectionKey={section.key} initialDensity={initialDensity}/>;
  if(app?.descriptor.application && path===app.descriptor.application.basePath) return <EntityApplicationSection initialDensity={initialDensity}/>;
  return fallback ?? <NeonEntityList entityCode={entityCode} initialDensity={initialDensity}/>;
}
