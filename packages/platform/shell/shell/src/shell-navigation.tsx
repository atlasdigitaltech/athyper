"use client";
import * as React from "react";
import {
  HomeIcon,
  resolveMetadataIcon,
} from "@athyper/platform-icons";
import type { DerivedShellNavigation } from "./core";
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
          const Icon = resolveMetadataIcon("workspace", workspace.iconKey);
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
