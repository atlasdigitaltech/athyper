"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useEffect, useRef } from "react";
import {
  ChevronDownIcon,
  SettingsIcon,
  resolveMetadataIcon,
  type IconRole,
} from "@athyper/platform-icons";
import { Button, SettingsMenu, SettingsSwitch } from "@athyper/platform-ui";
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
  sectionSettings = true,
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
  readonly sectionSettings?: boolean;
}) {
  const intl = useEntityI18n();
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
    <nav className="a-entity-record__tabs" aria-label={intl.message("navigation.recordViews")}>
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
              <MetadataIcon role="record-section" iconKey={section.iconKey} />
              <span>{section.label}</span>
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
            <MetadataIcon role="record-tab" iconKey={tabIconKey(tab, available)} />
            <span>{intl.text(tab.label)}</span>
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
          aria-label={intl.message("navigation.openSection", {section: section.key === "attachments" ? intl.message("collaboration.files") : section.key === "comments" ? intl.message("collaboration.comments") : section.label})}
          onClick={() => onOpenCollaboration(section.key)}
        >
          <MetadataIcon role={collaborationRole(section.key)} iconKey={section.iconKey} />
          <span>{section.key === "attachments" ? intl.message("collaboration.files") : section.key === "comments" ? intl.message("collaboration.comments") : section.label}</span>
        </button>
      ))}
      {sectionSettings || navigation.summaryView ? <SettingsMenu className="a-entity-record__view-control" label={intl.message("navigation.settings")} icon={<SettingsIcon aria-hidden="true" />}>
        <SettingsSwitch label={intl.message("navigation.contentView")} checked disabled />
        {sectionSettings ? <SettingsSwitch label={intl.message("navigation.sectionView")} checked={sectionView} closeOnChange onCheckedChange={() => onSectionViewChange(!sectionView)} /> : null}
        {navigation.summaryView ? <SettingsSwitch label={intl.message("navigation.summaryView")} checked={view === "summary"} closeOnChange onCheckedChange={() => onViewChange(view === "summary" ? "content" : "summary")} /> : null}
      </SettingsMenu> : null}
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
  const intl = useEntityI18n();
  const available = new Map(navigation.sections.map((section) => [section.key, section]));
  return <RecordSectionMenu label={intl.text(tab.label)} active={active} iconKey={tabIconKey(tab, available)}
    sections={tab.sectionKeys.flatMap(key => navigation.sections.find(section => section.key === key) ?? [])}
    activeSection={navigation.activeSection}
    onSelect={key => selectSection(navigation, key, tab.key)} />;
}

/** Shared section picker for both record compositions; receives authorized sections only. */
export function RecordSectionMenu({ label, sections, activeSection, active, onSelect, compact = false, iconKey }: {
  label: string;
  sections: readonly { key: string; label: string; iconKey?: string }[];
  /** Metadata icon for the group's tab; the record-tab fallback applies when absent. */
  iconKey?: string;
  activeSection: string;
  active: boolean;
  onSelect: (key: string) => void;
  compact?: boolean;
}) {
  const menu = useDismissibleDetails();
  return (
    <details
      ref={menu}
      className="a-entity-record__group"
      data-active={active || undefined}
    >
      <summary aria-label={compact ? `${label} sections` : undefined} aria-current={active ? "page" : undefined}
        onKeyDown={event => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault(); event.stopPropagation();
          menu.current?.setAttribute("open", "");
          menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
        }}>
        {compact ? null : <><MetadataIcon role="record-tab" iconKey={iconKey} /><span>{label}</span></>}
        <ChevronDownIcon className="a-entity-record__group-chevron" aria-hidden="true" />
      </summary>
      <div role="menu" aria-label={`${label} sections`} onKeyDown={event => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % items.length
          : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
          : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : undefined;
        if (next !== undefined) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
      }}>
        {sections.map(({key, label: sectionLabel, iconKey: sectionIconKey}) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            aria-current={activeSection === key ? "page" : undefined}
            onClick={() => {
              menu.current?.removeAttribute("open");
              menu.current?.querySelector<HTMLElement>("summary")?.focus();
              onSelect(key);
            }}
          >
            <MetadataIcon role="record-section" iconKey={sectionIconKey} />
            <span>{sectionLabel}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
/** Metadata first: the tab's own icon, then its first authorized section's icon;
 * the record-tab role fallback applies when neither is published. */
function tabIconKey(
  tab: NonNullable<EntityRuntimeHeaderNavigation["navigation"]>["tabs"][number],
  available: ReadonlyMap<string, { readonly iconKey?: string }>,
): string | undefined {
  return tab.iconKey ?? tab.sectionKeys.map((key) => available.get(key)?.iconKey).find(Boolean);
}

/** Collaboration capabilities are platform sections; their key names the role. */
function collaborationRole(sectionKey: string): IconRole {
  return sectionKey === "comments" || sectionKey === "attachments" || sectionKey === "activity" ? sectionKey : "record-section";
}

/** Record navigation icon: published metadata first, then the role fallback. */
export function MetadataIcon({ role, iconKey }: { readonly role: IconRole; readonly iconKey?: string | undefined }) {
  const Icon = resolveMetadataIcon(role, iconKey);
  return <Icon className="a-entity-record__tab-icon" aria-hidden="true" />;
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
  navigation.onSelectSection(sectionKey, tabKey);
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
  const intl = useEntityI18n();
  const startFlows = actions.filter(
    (action) => action.interaction === "start_flow",
  );
  const menu = useDismissibleDetails();
  if (!startFlows.length) return null;
  return (
    <div className="a-record-page-header__actions">
      {startFlows.length ? (
        <details ref={menu} className="a-record-page-header__actions-menu">
          <summary className="a-button a-button--secondary">{intl.message("action.actions")}</summary>
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
                {intl.text(action.label)}
              </Button>
            ))}
            {error ? <p role="alert">{error}</p> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
