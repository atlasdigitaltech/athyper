"use client";
import { writeRecordLocation } from "./write-record-location";
import { useEffect, useRef } from "react";
import {
  ChevronDownIcon,
  FileTextIcon,
  MessageCircleIcon,
  SettingsIcon,
} from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";
import type { EntityRuntimeActionPlan } from "@athyper/platform-entity-descriptor-client";
import type { EntityRuntimeHeaderNavigation } from "../entity-runtime-workspace";
export function RecordModeNavigation({
  collaborationFull,
  collaborationSection,
  navigation,
  view,
  sectionView,
  onViewChange,
  onSectionViewChange,
  collaboration,
  onOpenCollaboration,
}: {
  readonly collaborationFull?: boolean;
  readonly collaborationSection?: string;
  readonly navigation: EntityRuntimeHeaderNavigation;
  readonly view: "content" | "summary";
  readonly sectionView: boolean;
  readonly onViewChange: (view: "content" | "summary") => void;
  readonly onSectionViewChange: (value: boolean) => void;
  readonly collaboration?: EntityRuntimeHeaderNavigation["collaboration"];
  readonly onOpenCollaboration: (sectionKey: string) => void;
}) {
  const viewMenu = useDismissibleDetails();
  const available = new Map(
    navigation.sections.map((section) => [section.key, section]),
  );
  const configuredTabs = navigation.navigation?.tabs ?? [];
  // Collaboration remains a pair of authorized metadata sections, but it has one
  // record-header entry point. Keeping its child sections out of the main tab row
  // prevents comments and files from crowding the primary business navigation.
  const collaborationKeys = new Set(
    navigation.collaboration?.sections.map((section) => section.key) ?? [],
  );
  const directTabs = configuredTabs.filter(
    (tab) =>
      !tab.sectionKeys.some((key) => collaborationKeys.has(key)) &&
      tab.sectionKeys.some((key) => available.has(key)),
  );
  return (
    <nav className="a-entity-record__tabs" aria-label="Record views">
      {!configuredTabs.length
        ? navigation.sections.map((section) => (
            <button
              key={section.key}
              type="button"
              aria-current={
                section.key === navigation.activeSection ? "page" : undefined
              }
              onClick={() => navigation.onSelectSection(section.key)}
            >
              {section.label}
            </button>
          ))
        : null}
      {directTabs.map((tab) =>
        tab.sectionKeys.length > 1 ? (
          <SectionTabGroup
            key={tab.key}
            tab={tab}
            navigation={navigation}
            active={
              !collaborationFull &&
              tab.sectionKeys.includes(navigation.activeSection)
            }
          />
        ) : (
          <button
            key={tab.key}
            type="button"
            aria-current={
              !collaborationFull &&
              tab.sectionKeys.includes(navigation.activeSection)
                ? "page"
                : undefined
            }
            onClick={() =>
              selectSection(navigation, tab.sectionKeys[0]!, tab.key)
            }
          >
            {tab.label.defaultText}
          </button>
        ),
      )}
      {collaboration?.sections.map((section) => (
        <button
          key={section.key}
          type="button"
          className="a-entity-record__collaboration-control"
          aria-current={
            collaborationFull && collaborationSection === section.key
              ? "page"
              : undefined
          }
          aria-label={`Open ${section.key === "attachments" ? "Files" : section.key === "comments" ? "Comments" : section.label}`}
          title={section.label}
          onClick={() => onOpenCollaboration(section.key)}
        >
          {section.key === "comments" ? (
            <MessageCircleIcon aria-hidden="true" />
          ) : (
            <FileTextIcon aria-hidden="true" />
          )}
          <span>{section.key === "attachments" ? "Files" : "Comments"}</span>
        </button>
      ))}
      <details ref={viewMenu} className="a-entity-record__view-control">
        <summary aria-label="View settings">
          <SettingsIcon aria-hidden="true" />
        </summary>
        <div role="menu" aria-label="View settings">
          <p>View settings</p>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked="true"
            disabled
          >
            <span className="a-entity-record__view-setting-copy">
              Content view
            </span>
            <span className="a-entity-record__toggle" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sectionView}
            onClick={() => {
              onSectionViewChange(!sectionView);
              viewMenu.current?.removeAttribute("open");
            }}
          >
            <span className="a-entity-record__view-setting-copy">
              Section view
            </span>
            <span className="a-entity-record__toggle" aria-hidden="true" />
          </button>
          {navigation.summaryView ? (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={view === "summary"}
              onClick={() => {
                onViewChange(view === "summary" ? "content" : "summary");
                viewMenu.current?.removeAttribute("open");
              }}
            >
              <span className="a-entity-record__view-setting-copy">
                Summary view
              </span>
              <span className="a-entity-record__toggle" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </details>
    </nav>
  );
}
function SectionTabGroup({
  tab,
  navigation,
  active,
}: {
  tab: NonNullable<EntityRuntimeHeaderNavigation["navigation"]>["tabs"][number];
  navigation: EntityRuntimeHeaderNavigation;
  active: boolean;
}) {
  const menu = useDismissibleDetails();
  return (
    <details
      ref={menu}
      className="a-entity-record__group"
      data-active={active || undefined}
    >
      <summary aria-current={active ? "page" : undefined}>
        {tab.label.defaultText} <ChevronDownIcon aria-hidden="true" />
      </summary>
      <div role="menu" aria-label={`${tab.label.defaultText} sections`}>
        {tab.sectionKeys.map((key) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            aria-current={navigation.activeSection === key ? "page" : undefined}
            onClick={() => {
              selectSection(navigation, key, tab.key);
              menu.current?.removeAttribute("open");
            }}
          >
            {navigation.sections.find((section) => section.key === key)?.label}
          </button>
        ))}
      </div>
    </details>
  );
}
function useDismissibleDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        ref.current?.open &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      )
        ref.current.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.removeAttribute("open");
        ref.current.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return ref;
}

function selectSection(
  navigation: EntityRuntimeHeaderNavigation,
  sectionKey: string,
  tabKey: string,
) {
  navigation.onSelectSection(sectionKey);
  const next = new URL(window.location.href);
  next.searchParams.set("tab", tabKey);
  next.searchParams.set("section", sectionKey);
  writeRecordLocation(next, "replace");
}

export function RecordHeaderActions({
  actions,
  pendingAction,
  error,
  onExecute,
}: {
  readonly actions: readonly EntityRuntimeActionPlan[];
  readonly pendingAction?: string;
  readonly error?: string;
  readonly onExecute: (operationKey: string) => Promise<void>;
}) {
  const startFlows = actions.filter(
    (action) => action.interaction === "start_flow",
  );
  const menu = useDismissibleDetails();
  if (!startFlows.length) return null;
  return (
    <div className="a-record-page-header__actions">
      {startFlows.length ? (
        <details ref={menu} className="a-record-page-header__actions-menu">
          <summary className="a-button a-button--secondary">Actions</summary>
          <div>
            {startFlows.map((action) => (
              <Button
                key={action.operationKey}
                type="button"
                variant="secondary"
                disabled={Boolean(pendingAction)}
                loading={pendingAction === action.operationKey}
                onClick={() => {
                  menu.current?.removeAttribute("open");
                  void onExecute(action.operationKey);
                }}
              >
                {action.label.defaultText}
              </Button>
            ))}
            {error ? <p role="alert">{error}</p> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
