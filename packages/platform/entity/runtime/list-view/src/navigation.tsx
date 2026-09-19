"use client";
import React from "react";
import { ManagementNavigation } from "@athyper/platform-shell";
import {
  resolveEntityText,
  type EffectiveEntitySectionV1,
} from "@athyper/contract-platform-entity-list";
import { useOptionalI18n } from "@athyper/platform-i18n/react";

export function EntityNavigationSkeleton() {
  return (
    <div
      className="athyper-section-nav a-management-navigation a-entity-navigation--loading"
      aria-hidden="true"
    >
      {[0, 1, 2].map((key) => (
        <span
          key={key}
          className="a-skeleton a-entity-navigation__placeholder"
        />
      ))}
    </div>
  );
}
export function EntityNavigation({
  sections = [],
  currentSurfaceKey,
  onNavigate,
  activePath,
}: {
  readonly sections?: readonly EffectiveEntitySectionV1[];
  readonly currentSurfaceKey?: string;
  readonly activePath?: string;
  readonly onNavigate?: (href: string) => void;
}) {
  const locale = useOptionalI18n()?.localization.uiLocale;
  if (!sections.length) return null;
  const pathname =
    activePath ??
    (typeof window === "undefined"
      ? ""
      : window.location.pathname.replace(/\/$/, ""));
  const current =
    currentSurfaceKey ??
    sections.find((section) =>
      [section.href, ...section.aliases].some(
        (href) => href.replace(/\/$/, "") === pathname,
      ),
    )?.surfaceKey;
  return <ManagementNavigation label={resolveEntityText({defaultLocale:"en",values:{en:"Entity sections",ms:"Bahagian entiti"}},locale)} moreLabel={resolveEntityText({defaultLocale:"en",values:{en:"More",ms:"Lagi"}},locale)} items={sections.map(section=>({key:section.key,label:resolveEntityText(section.label,locale),href:section.href,count:section.attentionCount,overflow:section.placement==="overflow"}))} currentKey={sections.find(section=>section.surfaceKey===current)?.key} onNavigate={onNavigate}/>;
}
