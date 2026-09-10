"use client";
import React, { useEffect, useId, useRef, type ReactNode } from "react";
import type { EntityRecordHeaderV1 } from "@athyper/contract-platform-entity-runtime";
import { resolveIcon } from "@athyper/platform-icons";
import { PageHeader, useRecordBreadcrumb } from "@athyper/platform-shell";
import { EntityRecordAction, type EntityActionHandlers } from "./record-action";
import { Badge } from "@athyper/platform-ui";

export function EntityRecordHeader({
  header,
  activeSection,
  onSelectSection,
  contextControls,
  technicalDetails,
  breadcrumbLabel,
  actionHandlers,
}: {
  readonly header: EntityRecordHeaderV1;
  readonly actionHandlers?: EntityActionHandlers;
  readonly activeSection?: string;
  readonly onSelectSection?: (key: string) => void;
  readonly contextControls?: ReactNode;
  readonly technicalDetails?: ReactNode;
  readonly breadcrumbLabel?: string;
}) {
  useRecordBreadcrumb(breadcrumbLabel ?? header.code ?? header.title);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismissOutside = (event: Event) => {
      root.current
        ?.querySelectorAll<HTMLDetailsElement>(".a-record-header__more[open]")
        .forEach((menu) => {
          if (event.target instanceof Node && !menu.contains(event.target))
            menu.open = false;
        });
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      root.current
        ?.querySelectorAll<HTMLDetailsElement>(".a-record-header__more[open]")
        .forEach((menu) => {
          menu.open = false;
          menu.querySelector("summary")?.focus();
        });
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, []);
  const id = useId(),
    Icon = resolveIcon(header.iconKey ?? "file-text");
  const actions = header.readOnly ? [] : header.actions;
  const direct = actions
    .filter((item) => item.placement !== "overflow")
    .slice(0, 2);
  const overflow = actions.filter((item) => !direct.includes(item));
  const primarySections = header.sections
    .filter((item) => item.placement === "direct")
    .slice(0, 5);
  const otherSections = header.sections.filter(
    (item) => !primarySections.includes(item),
  );
  const action = (item: EntityRecordHeaderV1["actions"][number]) =>
    <EntityRecordAction key={item.key} action={item} handlers={actionHandlers} readOnly={header.readOnly} />;
  const section = (item: EntityRecordHeaderV1["sections"][number]) => (
    <button
      key={item.key}
      type="button"
      aria-current={item.key === activeSection ? "page" : undefined}
      onClick={(event) => {
        onSelectSection?.(item.key);
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      {item.label}
      {item.count === undefined ? null : (
        <span className="a-record-header__count">{item.count}</span>
      )}
    </button>
  );
  return (
    <div ref={root} className="a-record-header" data-slot="record-header">
      <PageHeader
        level="collection"
        titleId="page-title"
        title={header.title}
        icon={<Icon />}
        description={[header.code, header.entityLabel, header.description]
          .filter(Boolean)
          .join(" · ")}
        metadata={
          <>
            {header.badges.map((badge, index) => (
              <Badge key={index} tone={badge.tone}>
                {badge.label}
              </Badge>
            ))}
            {header.readOnly ? (
              <Badge tone="warning">Historical read-only view</Badge>
            ) : null}
          </>
        }
        actions={
          <>
            {direct.map(action)}
            {overflow.length ? (
              <details className="a-record-header__more">
                <summary className="a-button a-button--secondary">
                  More actions
                </summary>
                <div>{overflow.map(action)}</div>
              </details>
            ) : null}
          </>
        }
      />
      {header.context.length || contextControls || technicalDetails ? (
        <div className="a-record-header__context">
          {header.context.length ? (
            <dl>
              {header.context.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {contextControls}
          {technicalDetails ? (
            <details className="a-record-header__technical">
              <summary>Technical details</summary>
              {technicalDetails}
            </details>
          ) : null}
        </div>
      ) : null}
      {header.sections.length ? (
        <nav
          className="athyper-section-nav a-record-header__nav"
          aria-label="Record sections"
        >
          <label className="a-record-header__picker" htmlFor={id}>
            Section
            <select
              aria-label="Section"
              id={id}
              value={activeSection ?? ""}
              onChange={(event) => onSelectSection?.(event.currentTarget.value)}
            >
              {header.sections.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.count === undefined ? "" : ` (${item.count})`}
                </option>
              ))}
            </select>
          </label>
          <div className="a-record-header__tabs">
            {primarySections.map(section)}
            {otherSections.length ? (
              <details className="a-record-header__more">
                <summary
                  className={
                    otherSections.some((item) => item.key === activeSection)
                      ? "is-current"
                      : undefined
                  }
                >
                  {otherSections.find((item) => item.key === activeSection)
                    ?.label ?? "More sections"}
                </summary>
                <div>{otherSections.map(section)}</div>
              </details>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
