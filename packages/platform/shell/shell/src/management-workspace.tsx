"use client";
import React, { type ReactNode, type HTMLAttributes } from "react";
import { PageFrame } from "./page-foundation";
import { EntityPageLayout } from "./entity-page-layout";
import { PageNavigationSlot, PageWorkspace } from "./page-workspace";

/** Shared collection chrome; record pages retain EntityPageLayout's ownership behavior. */
export function ManagementWorkspace({
  header,
  navigation,
  contextControl,
  status,
  toolbar,
  actions,
  actionOutcome,
  children,
  className,
}: {
  readonly header: ReactNode;
  readonly navigation: ReactNode;
  readonly contextControl?: ReactNode;
  readonly status?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly actions?: ReactNode;
  readonly actionOutcome?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <PageFrame
      width="wide"
      className={["a-management-workspace", className]
        .filter(Boolean)
        .join(" ")}
    >
      <EntityPageLayout
        collectionHeader={header}
        collectionNavigation={<PageNavigationSlot navigation={navigation} context={contextControl} kind="application" band="shell" />}
      >
        <PageWorkspace
          contentOnly
          status={status}
          toolbar={toolbar}
          actions={actions}
          actionOutcome={actionOutcome}
        >
          {children}
        </PageWorkspace>
      </EntityPageLayout>
    </PageFrame>
  );
}
export interface ManagementNavigationItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly href: string;
  readonly count?: number;
  readonly overflow?: boolean;
}
export function ManagementNavigation({
  items,
  currentKey,
  label,
  onNavigate,
  moreLabel = "More",
  appearance = "card",
}: {
  readonly items: readonly ManagementNavigationItem[];
  readonly currentKey?: string;
  readonly label: string;
  readonly onNavigate?: (href: string) => void;
  readonly moreLabel?: string;
  readonly appearance?: "card" | "flat";
}) {
  const link = (item: ManagementNavigationItem) => (
    <a
      key={item.key}
      href={item.href}
      aria-current={item.key === currentKey ? "page" : undefined}
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
          onNavigate(item.href);
        }
      }}
    >
      {item.label}
      {item.count !== undefined && item.count > 0 ? (
        <span className="a-management-navigation__count">{item.count}</span>
      ) : null}
    </a>
  );
  const overflow = items.filter((item) => item.overflow);
  return (
    <nav
      className="athyper-section-nav a-management-navigation"
      data-appearance={appearance}
      data-navigation-kind="application"
      aria-label={label}
    >
      {items.filter((item) => !item.overflow).map(link)}
      {overflow.length ? (
        <details className="a-management-navigation__more">
          <summary
            className={
              overflow.some((item) => item.key === currentKey)
                ? "is-current"
                : undefined
            }
          >
            {moreLabel} <span aria-hidden="true">▾</span>
          </summary>
          <div className="a-management-navigation__overflow">
            {overflow.map(link)}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
/** Slots stay module-owned: saved views, search and permitted controls. */
export function ManagementToolbar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={["a-management-toolbar", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
