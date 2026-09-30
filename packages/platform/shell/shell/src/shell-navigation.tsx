"use client";
import * as React from "react";
import {
  HomeIcon,
  StarIcon,
  HistoryIcon,
  resolveIcon,
} from "@athyper/platform-icons";
import type { DerivedShellNavigation } from "./core";
import type { ShellQuickAccessTab } from "./quick-access";
import { useShellI18n } from "./shell-i18n";

export interface ShellNavigationPeek {
  readonly label: string;
  readonly workspace: string;
  readonly top: number;
}
export function NavigationPanel({
  navigation,
  path,
  homeHref,
  firstLink,
  onNavigate,
  onPeek,
}: {
  readonly navigation: DerivedShellNavigation;
  readonly path: string;
  readonly homeHref: string;
  readonly firstLink: React.RefObject<HTMLAnchorElement | null>;
  readonly onNavigate: () => void;
  readonly onPeek: (peek?: ShellNavigationPeek) => void;
}) {
  const showPeek = (
    label: string,
    workspace: string,
    element: HTMLAnchorElement,
  ) => {
    const bounds = element.getBoundingClientRect();
    onPeek({ label, workspace, top: bounds.top + bounds.height / 2 });
  };
  return (
    <nav className="athyper-shell__navigation" aria-label="Home and workspaces">
      <ul>
        <li>
          <a
            ref={firstLink}
            href={homeHref}
            aria-current={path === homeHref ? "page" : undefined}
            onPointerEnter={(event) =>
              showPeek("Home", "Plane", event.currentTarget)
            }
            onPointerLeave={() => onPeek()}
            onFocus={(event) => showPeek("Home", "Plane", event.currentTarget)}
            onBlur={() => onPeek()}
            onClick={onNavigate}
          >
            <HomeIcon size={18} />
            <span className="athyper-shell__nav-label">Home</span>
          </a>
        </li>
        {navigation.workspaces.map((workspace) => {
          const Icon = resolveIcon(workspace.iconKey);
          return (
            <li key={workspace.code}>
              <a
                href={workspace.href}
                aria-current={
                  path === workspace.href ||
                  path.startsWith(`${workspace.href}/`)
                    ? "page"
                    : undefined
                }
                onPointerEnter={(event) =>
                  showPeek(workspace.name, "Workspace", event.currentTarget)
                }
                onPointerLeave={() => onPeek()}
                onFocus={(event) =>
                  showPeek(workspace.name, "Workspace", event.currentTarget)
                }
                onBlur={() => onPeek()}
                onClick={onNavigate}
              >
                <Icon size={18} />
                <span className="athyper-shell__nav-label">
                  {workspace.name}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
export function QuickAccessRailActions({
  activeTab,
  onOpen,
  onPeek,
}: {
  readonly activeTab?: ShellQuickAccessTab;
  readonly onOpen: (
    tab: ShellQuickAccessTab,
    opener: HTMLButtonElement,
  ) => void;
  readonly onPeek: (peek?: ShellNavigationPeek) => void;
}) {
  const t = useShellI18n().message;
  const showPeek = (label: string, element: HTMLButtonElement) => {
    const bounds = element.getBoundingClientRect();
    onPeek({
      label,
      workspace: t("shell.quick.label"),
      top: bounds.top + bounds.height / 2,
    });
  };
  const action = (
    kind: ShellQuickAccessTab,
    label: string,
    ariaLabel: string,
  ) => (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={activeTab === kind}
      aria-controls="athyper-quick-access"
      onPointerEnter={(event) => showPeek(label, event.currentTarget)}
      onPointerLeave={() => onPeek()}
      onFocus={(event) => showPeek(label, event.currentTarget)}
      onBlur={() => onPeek()}
      onClick={(event) => onOpen(kind, event.currentTarget)}
    >
      <QuickAccessGlyph kind={kind} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav
      className="athyper-shell__quick-actions"
      aria-label={t("shell.quick.label")}
    >
      {action(
        "favourites",
        t("shell.quick.favourites"),
        t("shell.quick.openFavourites"),
      )}
      {action("recent", t("shell.quick.recent"), t("shell.quick.openRecent"))}
    </nav>
  );
}
function QuickAccessGlyph({ kind }: { readonly kind: ShellQuickAccessTab }) {
  return kind === "favourites" ? <StarIcon /> : <HistoryIcon />;
}
