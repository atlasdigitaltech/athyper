"use client";
import React from "react";
import { useEntityNavigate } from "./entity-navigation";
import { ManagementNavigation } from "@athyper/platform-shell";
import {
  resolveEntityText,
  type EffectiveEntitySectionV1,
} from "@athyper/contract-platform-entity-list";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

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
  const navigate = useEntityNavigate();
  const locale = useOptionalI18n()?.localization.uiLocale;
  const intl = useEntityI18n();
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
  return <ManagementNavigation label={intl.message("list.chrome.entitySections")} moreLabel={intl.message("list.chrome.moreSections")} items={sections.map(section=>({key:section.key,label:resolveEntityText(section.label,locale),href:section.href,count:section.attentionCount,overflow:section.placement==="overflow"}))} currentKey={sections.find(section=>section.surfaceKey===current)?.key} onNavigate={onNavigate ?? navigate}/>;
}
