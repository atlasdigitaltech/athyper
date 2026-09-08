"use client";
import React from "react";
import {
  resolveEntityText,
  type EffectiveEntitySectionV1,
} from "@athyper/contract-platform-entity-list";
import { useOptionalI18n } from "@athyper/platform-i18n/react";

export function EntityNavigationSkeleton() {
  return (
    <div
      className="athyper-section-nav a-entity-navigation a-entity-navigation--loading"
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
  const link = (section: EffectiveEntitySectionV1) => (
    <a
      key={section.key}
      href={section.href}
      onClick={(event) => {
        if (
          onNavigate &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          onNavigate(section.href);
        }
      }}
      aria-current={section.surfaceKey === current ? "page" : undefined}
    >
      {resolveEntityText(section.label, locale)}
      {section.attentionCount !== undefined && section.attentionCount > 0 ? (
        <span className="a-entity-navigation__count">
          {section.attentionCount}
        </span>
      ) : null}
    </a>
  );
  const overflow = sections.filter(
    (section) => section.placement === "overflow",
  );
  const more = resolveEntityText(
    { defaultLocale: "en", values: { en: "More", ms: "Lagi" } },
    locale,
  );
  const label = resolveEntityText(
    {
      defaultLocale: "en",
      values: { en: "Entity sections", ms: "Bahagian entiti" },
    },
    locale,
  );
  return (
    <nav className="athyper-section-nav a-entity-navigation" aria-label={label}>
      {sections.filter((section) => section.placement === "direct").map(link)}
      {overflow.length ? (
        <details className="a-entity-navigation__more">
          <summary
            className={
              overflow.some((section) => section.surfaceKey === current)
                ? "is-current"
                : undefined
            }
          >
            {more} <span aria-hidden="true">▾</span>
          </summary>
          <div className="a-entity-navigation__overflow">
            {overflow.map(link)}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
