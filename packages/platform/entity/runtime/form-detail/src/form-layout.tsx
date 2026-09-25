"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EntitySectionNavigation,
  useEntitySectionScroll,
  type EntitySectionItem,
} from "./section-navigation";
import { EntityIntakeWorkspace } from "./intake-workspace";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
/** Layout only: the owning workflow supplies data, permissions, persistence, and actions. */
export function EntityFormLayout({
  sections,
  navigationLabel,
  mode = "create",
  header,
  footer,
  intakeWorkspace,
  children,
}: {
  sections: readonly EntitySectionItem[];
  navigationLabel: string;
  mode?: "create" | "amend" | "review" | "view";
  header?: ReactNode;
  footer?: ReactNode;
  /** Published intake presentation. Omit to retain the plain section/content form layout. */
  intakeWorkspace?: { readonly surface: EntityIntakeSurfaceV1; readonly guidance?: ReactNode; readonly status?: ReactNode; readonly actions?: ReactNode };
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(sections[0]?.key ?? ""),
    [revision, setRevision] = useState(0),
    [issues, setIssues] = useState<Record<string, number>>({});
  const signature = sections.map((s) => s.key).join(":");
  const current = sections.some((s) => s.key === active)
    ? active
    : (sections[0]?.key ?? "");
  useEntitySectionScroll({
    root,
    attribute: "data-form-section",
    contentSelector: ".a-form-layout__content",
    activeSection: current,
    navigationRevision: revision,
    scopeKey: signature,
    initialSection: sections[0]?.key,
    onObserve: setActive,
    getThreshold: () => {
      const rail = root.current?.querySelector<HTMLElement>(
        ".a-section-navigation",
      );
      if (!rail) return 0;
      if (rail.querySelector(".a-entity-record__picker")?.getClientRects().length)
        return rail.getBoundingClientRect().bottom + 16;
      return (parseFloat(getComputedStyle(rail).top) || 0) + 24;
    },
  });
  useEffect(() => {
    const content = root.current?.querySelector(".a-form-layout__content");
    if (!content) return;
    const update = () => {
      const next = Object.fromEntries(
        Array.from(
          content.querySelectorAll<HTMLElement>("[data-form-section]"),
        ).map((s) => [
          s.dataset.formSection!,
          s.querySelectorAll('[aria-invalid="true"]').length,
        ]),
      );
      setIssues((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-invalid"],
    });
    return () => observer.disconnect();
  }, [signature]);
  const navigation = (
      <EntitySectionNavigation
        className="a-form-layout__navigation"
        label={navigationLabel}
        sections={sections.map((s) => ({
          ...s,
          ...(issues[s.key] ? { status: `Issues: ${issues[s.key]}` } : {}),
        }))}
        activeSection={current}
        onNavigate={(key) => {
          setActive(key);
          setRevision((r) => r + 1);
        }}
      />
  );
  const content = <div className="a-form-layout__content">{children}</div>;
  if (intakeWorkspace)
    return <div ref={root}><EntityIntakeWorkspace surface={intakeWorkspace.surface} sectionNavigation={navigation} guidance={intakeWorkspace.guidance} status={intakeWorkspace.status} actions={intakeWorkspace.actions}>{content}</EntityIntakeWorkspace></div>;
  return <div ref={root} className="a-form-layout" data-mode={mode}>{header ? <div className="a-form-layout__header">{header}</div> : null}{navigation}{content}{footer ? <div className="a-form-layout__footer">{footer}</div> : null}</div>;
}
