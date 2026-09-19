"use client";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRightIcon,
  BellIcon,
  MoreHorizontalIcon,
  InboxIcon,
  SearchIcon,
  SettingsIcon,
  AtlasBrandIcon,
  CircleCheckIcon,
  resolveIcon,
} from "@athyper/platform-icons";
import type { SupportedLocale } from "@athyper/platform-i18n";
import { ShellSurfaceBoundary } from "./shell-surface-boundary";
import { activityCount } from "./activity-counts";
import { useShellI18n } from "./shell-i18n";
import type { HeaderActionKind } from "./shell-surfaces";
import type { DerivedShellNavigation } from "./core";
import {
  ShellActivityCenter,
  type ShellActivityDataSource,
} from "./activity-center";
import { UtilitiesMenu } from "./shell-utilities-menu";

export function HeaderActions({
  navigation,
  activity,
  active,
  atlasOpen,
  onAtlasToggle,
  onActiveChange,
  applicationName,
  planeDescriptor,
  currentLocale,
  localePolicy,
  onLocaleChange,
}: {
  readonly navigation: DerivedShellNavigation;
  readonly activity?: ShellActivityDataSource;
  readonly active?: HeaderActionKind;
  readonly atlasOpen: boolean;
  readonly onAtlasToggle: (opener: HTMLButtonElement) => void;
  readonly onActiveChange: (next?: HeaderActionKind) => void;
  readonly applicationName: string;
  readonly planeDescriptor?: string;
  readonly currentLocale?: string;
  readonly localePolicy?: Readonly<{ enabledLocales: readonly SupportedLocale[] }>;
  readonly onLocaleChange?: (localeCode: SupportedLocale) => Promise<void>;
}) {
  const t = useShellI18n().message;
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const overflowButton = useRef<HTMLButtonElement>(null);
  const overflowPanel = useRef<HTMLDivElement>(null);
  const actionOpener = useRef<HTMLButtonElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const closeAction = useCallback(() => {
    if (activeRef.current !== active) return;
    onActiveChange();
    requestAnimationFrame(() => actionOpener.current?.focus());
  }, [active, onActiveChange]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        (active === "search" || active === "agent" || active === "utilities" || active === "more")
      )
        closeAction();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        root.current?.contains(target) ||
        target.closest(".athyper-activity-center") ||
        target.closest(".athyper-activity-center__scrim")
      )
        return;
      if (active === "search" || active === "agent" || active === "utilities" || active === "more")
        onActiveChange();
    };
    window.addEventListener("keydown", shortcut);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", shortcut);
      window.removeEventListener("pointerdown", outside);
    };
  }, [active, closeAction, onActiveChange]);
  useEffect(() => {
    if (active === "more")
      requestAnimationFrame(() =>
        overflowPanel.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus(),
      );
    if (active === "search")
      requestAnimationFrame(() => search.current?.focus());
  }, [active]);
  const results = navigation.routes
    .filter(
      (route) =>
        route.navigation !== "hidden" &&
        (!query.trim() ||
          `${route.label} ${route.workspaceName}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    )
    .slice(0, 8);
  const toggle = (kind: HeaderActionKind, opener: HTMLButtonElement) => {
    actionOpener.current = opener.closest(".athyper-shell__overflow-panel")
      ? overflowButton.current
      : opener;
    onActiveChange(active === kind ? undefined : kind);
  };
  const unreadCount = activityCount(activity, "notifications");
  const inboxCount = activityCount(activity, "inbox");
  return (
    <div
      className="athyper-shell__actions"
      ref={root}
      aria-label={t("shell.actions.label")}
    >
      <HeaderActionButton
        kind="search"
        label={t("shell.actions.search")}
        active={active === "search"}
        onClick={(opener) => toggle("search", opener)}
      />
      <HeaderActionButton
        kind="notifications"
        label={t("shell.actions.notifications")}
        active={active === "notifications"}
        count={unreadCount}
        controls="athyper-activity-center"
        onClick={(opener) => toggle("notifications", opener)}
      />
      <HeaderActionButton
        kind="inbox"
        label={t("shell.actions.inbox")}
        active={active === "inbox"}
        count={inboxCount}
        controls="athyper-activity-center"
        onClick={(opener) => toggle("inbox", opener)}
      />
      <HeaderActionButton
        kind="utilities"
        label={t("shell.actions.utilities")}
        active={active === "utilities"}
        onClick={(opener) => toggle("utilities", opener)}
      />
      <HeaderActionButton
        kind="agent"
        label="Atlas"
        active={atlasOpen}
        onClick={(opener) =>
          onAtlasToggle(
            opener.closest(".athyper-shell__overflow-panel")
              ? (overflowButton.current ?? opener)
              : opener,
          )
        }
      />
      <button
        ref={overflowButton}
        type="button"
        data-slot="more"
        aria-label="More application actions"
        aria-expanded={active === "more"}
        aria-controls="shell-action-overflow"
        onClick={(event) => toggle("more", event.currentTarget)}
      >
        <MoreHorizontalIcon />
        <span>More</span>
      </button>
      {active === "more" ? (
        <div
          ref={overflowPanel}
          id="shell-action-overflow"
          className="athyper-shell__action-panel athyper-shell__overflow-panel"
          role="dialog"
          aria-label="More application actions"
        >
          <HeaderActionButton
            kind="search"
            label={t("shell.actions.search")}
            active={false}
            onClick={(opener) => toggle("search", opener)}
          />
          <HeaderActionButton
            kind="inbox"
            label={t("shell.actions.inbox")}
            active={false}
            count={inboxCount}
            onClick={(opener) => toggle("inbox", opener)}
          />
          <HeaderActionButton
            kind="notifications"
            label={t("shell.actions.notifications")}
            active={false}
            count={unreadCount}
            onClick={(opener) => toggle("notifications", opener)}
          />
          <HeaderActionButton
            kind="utilities"
            label={t("shell.actions.utilities")}
            active={false}
            onClick={(opener) => toggle("utilities", opener)}
          />
          <HeaderActionButton
            kind="agent"
            label="Atlas"
            active={atlasOpen}
            onClick={(opener) =>
              onAtlasToggle(
                opener.closest(".athyper-shell__overflow-panel")
                  ? (overflowButton.current ?? opener)
                  : opener,
              )
            }
          />
        </div>
      ) : null}
      {active === "notifications" || active === "inbox" ? (
        <ShellSurfaceBoundary
          key={active}
          label="Activity recovery"
          onClose={closeAction}
        >
          <ShellActivityCenter
            activeTab={active}
            dataSource={activity}
            onTabChange={onActiveChange}
            onClose={closeAction}
          />
        </ShellSurfaceBoundary>
      ) : null}
      {active === "search" ? (
        <ShellSurfaceBoundary label="Search recovery" onClose={closeAction}>
          <section
            id={`header-${active}-panel`}
            className={`athyper-shell__action-panel athyper-shell__action-panel--${active}`}
            role="dialog"
            aria-label={actionTitle(active)}
          >
            {active === "search" ? (
              <>
                <header>
                  <div>
                    <strong>{t("shell.search.title")}</strong>
                    <small>{t("shell.search.help")}</small>
                  </div>
                  <kbd>Esc</kbd>
                </header>
                <label className="athyper-shell__search-field">
                  <SearchIcon />
                  <input
                    ref={search}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={t("shell.search.placeholder")}
                    autoComplete="off"
                  />
                </label>
                <nav aria-label={t("shell.search.results")}>
                  {results.length ? (
                    results.map((route) => {
                      const Icon = resolveIcon(route.iconKey);
                      return (
                        <a
                          key={route.id}
                          href={route.href}
                          onClick={() => onActiveChange()}
                        >
                          <span className="athyper-shell__search-result">
                            <Icon size={18} />
                            <span>
                              <strong>{route.label}</strong>
                              <small>{route.workspaceName}</small>
                            </span>
                          </span>
                          <ChevronRightIcon size={16} />
                        </a>
                      );
                    })
                  ) : (
                    <ActionEmpty
                      title={t("shell.search.empty")}
                      detail={t("shell.search.emptyHelp")}
                    />
                  )}
                </nav>
              </>
            ) : null}
          </section>
        </ShellSurfaceBoundary>
      ) : null}
      {active === "utilities" ? (
        <ShellSurfaceBoundary label="Utilities recovery" onClose={closeAction}>
          <section
            id="header-utilities-panel"
            className="athyper-shell__action-panel athyper-shell__action-panel--utilities"
            role="dialog"
            aria-label={t("shell.utilities.title")}
          >
            <header>
              <div>
                <strong>{t("shell.utilities.title")}</strong>
              </div>
              <kbd>Esc</kbd>
            </header>
            <UtilitiesMenu
              applicationName={applicationName}
              planeDescriptor={planeDescriptor}
              currentLocale={currentLocale}
              localePolicy={localePolicy}
              onLocaleChange={onLocaleChange}
            />
          </section>
        </ShellSurfaceBoundary>
      ) : null}
    </div>
  );
}
function HeaderActionButton({
  kind,
  label,
  active,
  count,
  controls,
  onClick,
}: {
  readonly kind: HeaderActionKind;
  readonly label: string;
  readonly active: boolean;
  readonly count?: number;
  readonly controls?: string;
  readonly onClick: (opener: HTMLButtonElement) => void;
}) {
  const t = useShellI18n().message;
  const counted = kind === "notifications" || kind === "inbox";
  return (
    <button
      type="button"
      data-slot={kind}
      data-count-state={
        counted
          ? count === undefined
            ? "unknown"
            : count === 0
              ? "zero"
              : "known"
          : undefined
      }
      aria-label={`${label}${counted ? (count === undefined ? ", count unavailable" : `, ${count} ${t(kind === "notifications" ? "shell.actions.unread" : "shell.actions.open")}`) : ""}`}
      aria-expanded={active}
      aria-controls={
        controls ?? (kind === "agent" ? undefined : `header-${kind}-panel`)
      }
      title={label}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <HeaderGlyph kind={kind} />
      <span>{label}</span>
      {count !== undefined && count > 0 ? (
        <b className="athyper-shell__action-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </b>
      ) : null}
    </button>
  );
}
function HeaderGlyph({ kind }: { readonly kind: HeaderActionKind }) {
  if (kind === "search") return <SearchIcon />;
  if (kind === "notifications") return <BellIcon />;
  if (kind === "inbox") return <InboxIcon />;
  if (kind === "utilities") return <SettingsIcon />;
  return <AtlasBrandIcon />;
}
function ActionEmpty({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="athyper-shell__action-empty">
      <span aria-hidden="true">
        <CircleCheckIcon size={18} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
function actionTitle(kind: HeaderActionKind): string {
  return kind === "agent"
    ? "Atlas — AI Agent by Athyper"
    : kind[0]!.toUpperCase() + kind.slice(1);
}
