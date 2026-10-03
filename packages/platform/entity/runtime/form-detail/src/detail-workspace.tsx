"use client";
import { EntityReferencePreviewProvider, ReferenceOrigin } from "./reference-preview";
import { EntityRecordFields } from "./record-fields";
import { RegisteredEntitySection } from "./registered-renderers/entity-section-component";
import { EntityRelatedSection } from "./related-entity-section";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  resolveRecordHeader,
  type EntityDetailDescriptorV1,
  type EntityRecordV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  PageWorkspace,
  useAtlasBusinessContextPublisher,
  useRecordFooterInformation,
} from "@athyper/platform-shell";
import { Card } from "@athyper/platform-ui";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { localizeEntityLabels } from "@athyper/platform-i18n/entity-labels";
import { DetailCollaboration } from "./detail-collaboration";
import { EntityRecordHeader } from "./record-header";
import { RecordSummaryPanel } from "./record/record-summary-panel";
import { MetadataIcon, RecordModeNavigation, RecordSectionMenu } from "./record/record-navigation";
import {
  EntitySectionNavigation,
  useEntitySectionScroll,
} from "./section-navigation";
import { writeRecordLocation } from "./record/write-record-location";
import {
  readRecordViewPreference,
  writeRecordViewPreference,
} from "./record/record-view-preferences";

/** Receives an already authorized presentation. No entity or plane selects layout. */
export function MetadataDetailWorkspace({
  descriptor: sourceDescriptor,
  record,
  entityCode,
  preferenceKey,
  editHref,
  status,
}: {
  descriptor: EntityDetailDescriptorV1;
  record: EntityRecordV1;
  entityCode: string;
  preferenceKey: string;
  editHref?: string;
  status?: string;
}) {
  const intl = useEntityI18n();
  const descriptor = useMemo(() => localizeEntityLabels(sourceDescriptor, intl), [sourceDescriptor, intl]);
  const presentation = useMemo(() => {
    const published = descriptor.presentation!;
    if (published.navigation || !published.sections.some(section => section.key === "overview")) return published;
    return {...published,
      sections: published.sections.map(section => section.key === "overview" && section.label === descriptor.entity.pluralLabel ? {...section,label:descriptor.entity.label} : section),
      navigation: {mode: "scroll" as const, tabs: [{key:"overview",label:intl.message("detail.overview"),sectionKeys:published.sections.map(section=>section.key)}]},
    };
  }, [descriptor, intl]);
  useRecordFooterInformation({recordId: record.id, metadataRelease: descriptor.revision.release,
    ...(record.version === undefined ? {} : {recordRevision: record.version})});
  const sections = presentation.sections;
  const tabs = presentation.navigation?.tabs ?? [];
  const readLocation = () => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("section");
    const tab = tabs.find((tab) => tab.key === url.searchParams.get("tab"));
    return (
      sections.find(
        (section) =>
          section.key === requested &&
          (!tab || tab.sectionKeys.includes(section.key)),
      )?.key ??
      tab?.sectionKeys[0] ??
      tabs[0]?.sectionKeys[0] ??
      sections[0]?.key ??
      ""
    );
  };
  const [active, setActive] = useState(readLocation);
  const [revision, setRevision] = useState(0);
  const [sectionView, setSectionView] = useState(
    () => readRecordViewPreference(preferenceKey).section,
  );
  const [summaryView, setSummaryView] = useState(() => readRecordViewPreference(preferenceKey).summary);
  const summary = useMemo(() => presentation.summaryView ? { cards: presentation.summaryView.cards.map(card => ({ ...card, label: { labelKey: `summary.${card.key}`, defaultText: card.label } })) } : undefined, [presentation.summaryView]);
  const root = useRef<HTMLDivElement>(null),
    navigation = useRef<HTMLDivElement>(null);
  const navigationId = useId();
  const activeTab =
    tabs.find((tab) => tab.sectionKeys.includes(active)) ?? tabs[0];
  const visible = activeTab
    ? activeTab.sectionKeys.flatMap(key => sections.find(section => section.key === key) ?? [])
    : sections;
  const selected =
    visible.find((section) => section.key === active) ?? visible[0];
  const continuous = presentation.navigation?.mode === "scroll";
  // One shared reading line for explicit jumps, passive tracking and the rail.
  // Measure the complete band: it can wrap when a collaboration panel is docked.
  useEffect(() => {
    const band = navigation.current?.closest<HTMLElement>('[data-slot="page-navigation"]');
    if (!band || !root.current) return;
    const update = () => root.current?.style.setProperty("--detail-navigation-height", `${band.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(band);
    return () => observer.disconnect();
  }, []);
  useAtlasBusinessContextPublisher({
    kind: "record",
    entityCode,
    recordId: record.id,
    section: selected?.key,
    dirty: false,
    savedRevision:
      record.version === undefined ? undefined : String(record.version),
  });
  const select = (key: string, explicit: boolean, showRecord?: (update: (url: URL) => void) => void, tabKey?: string) => {
    if (!sections.some((section) => section.key === key)) return;
    setActive(key);
    if (explicit) setRevision((value) => value + 1);
    const write = (update: (url: URL) => void) => showRecord
      ? showRecord(update)
      : writeRecordLocation(update, explicit ? "push" : "replace");
    write(
      (url) => {
        url.searchParams.set("section", key);
        const tab = tabs.find((tab) => (!tabKey || tab.key === tabKey) && tab.sectionKeys.includes(key));
        if (tab) url.searchParams.set("tab", tab.key);
      },
    );
  };
  useEffect(() => {
    const restore = () => {
      setActive(readLocation());
      setRevision((value) => value + 1);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [presentation]);
  useEntitySectionScroll({
    root,
    attribute: "data-detail-section",
    contentSelector: ".a-metadata-detail__sections",
    activeSection: selected?.key ?? "",
    navigationRevision: revision,
    scopeKey: `${descriptor.revision.release}:${activeTab?.key ?? "record"}`,
    enabled: continuous,
    initialSection: visible[0]?.key,
    firstSectionAtPageTop: true,
    fallbackSelector: "[data-detail-section]",
    onObserve: (key) => select(key, false),
    getThreshold: () =>
      Math.max(0, navigation.current?.closest('[data-slot="page-navigation"]')?.getBoundingClientRect().bottom ?? 0)
        + (root.current ? parseFloat(getComputedStyle(root.current).rowGap) || 0 : 0) + 1,
  });
  const header = resolveRecordHeader(presentation, record.values, {
    choiceLabels: Object.fromEntries(descriptor.fields.map(field => [field.key, Object.fromEntries((field.options ?? []).map(option => [option.value, option.label]))])),
    entityLabel: descriptor.entity.label,
    fallbackTitle: descriptor.entity.label,
    labels: Object.fromEntries(
      descriptor.fields.map((field) => [field.key, field.label]),
    ),
    actions: presentation.actions.flatMap((action) =>
      action.operationKey === "patch" &&
      editHref &&
      descriptor.actions.some((item) => item.kind === "edit")
        ? [
            {
              key: action.key,
              label: action.label,
              placement: action.placement,
              href: editHref,
            },
          ]
        : [],
    ),
  });
  return (
    <EntityReferencePreviewProvider sourceKey={`${entityCode}:${record.id}`}><ReferenceOrigin recordTitle={header.title}><DetailCollaboration
      entityCode={entityCode}
      recordId={record.id}
      recordTitle={header.title}
      entityLabel={descriptor.entity.label}
      kinds={descriptor.collaboration ?? []}
      activity={descriptor.activity}
      activityPresentation={descriptor}
      fieldLabels={Object.fromEntries(descriptor.fields.map(field=>[field.key,field.label]))}
      renderRecord={(collaboration) => (
        <PageWorkspace
          width="wide"
          className="a-metadata-detail"
          status={status ? <p role="status">{status}</p> : null}
          header={
            <EntityRecordHeader
              header={header}
              showNavigation={false}
              breadcrumbLabel={header.title}
            />
          }
          navigationKind="record-mode"
          navigationBand="shell"
          navigation={
            tabs.length > 0 ||
            sections.length > 1 ||
            summary ||
            collaboration.sections.length ? (
              <div ref={navigation} className="a-metadata-detail__navigation" data-section-menu={activeTab && activeTab.sectionKeys.length > 1 && tabs[tabs.length - 1]?.key === activeTab.key ? "joined" : undefined}>
                {tabs.length > 0 ? (
                  <div
                    role="tablist"
                    aria-label="Record modes"
                    onKeyDown={(event) => {
                      const buttons = Array.from(
                        event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "[role=tab]",
                        ),
                      );
                      const index = buttons.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      if (index < 0) return;
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % buttons.length
                          : event.key === "ArrowLeft"
                            ? (index - 1 + buttons.length) % buttons.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? buttons.length - 1
                                : undefined;
                      if (next !== undefined) {
                        event.preventDefault();
                        buttons[next]?.focus();
                      }
                    }}
                  >
                    {tabs.map((tab) => (
                      <div key={tab.key} className="a-metadata-detail__tab-group" role="presentation">
                      <button
                        role="tab"
                        type="button"
                        id={`${navigationId}-${tab.key}`}
                        aria-controls={`${navigationId}-panel`}
                        aria-selected={!collaboration.full && tab.key === activeTab?.key}
                        tabIndex={tab.key === activeTab?.key ? 0 : -1}
                        onClick={() => {
                          // Mode changes preserve document position; section selection alone requests scrolling.
                          if (tab.key === activeTab?.key) {
                            if (collaboration.full) collaboration.showRecord();
                            return;
                          }
                          setActive(tab.sectionKeys[0]!);
                          const write = collaboration.full ? collaboration.showRecord : writeRecordLocation;
                          write((url) => {
                            url.searchParams.set("tab", tab.key);
                            url.searchParams.set(
                              "section",
                              tab.sectionKeys[0]!,
                            );
                          });
                        }}
                      >
                        <MetadataIcon role="record-tab" iconKey={tab.iconKey ?? tab.sectionKeys.map((key) => sections.find((section) => section.key === key)?.iconKey).find(Boolean)} />
                        <span>{tab.label}</span>
                      </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activeTab && activeTab.sectionKeys.length > 1 ? <RecordSectionMenu
                  label={activeTab.label} compact {...(activeTab.iconKey ? { iconKey: activeTab.iconKey } : {})} active={!collaboration.full}
                  sections={activeTab.sectionKeys.flatMap(key => sections.find(section => section.key === key) ?? [])}
                  activeSection={collaboration.full ? "" : selected?.key ?? ""}
                  onSelect={key => select(key, true, collaboration.full ? collaboration.showRecord : undefined)}
                /> : null}
                <RecordModeNavigation
                  navigation={{
                    sections: [],
                    summaryView: summary,
                    activeSection: selected?.key ?? "",
                    onSelectSection: (key, tabKey) => select(key, true, undefined, tabKey),
                  }}
                  view={summaryView && summary ? "summary" : "content"}
                  onViewChange={(value) => {
                    setSummaryView(value === "summary");
                    writeRecordViewPreference(preferenceKey, { section: sectionView, summary: value === "summary" });
                  }}
                  sectionView={sectionView}
                  sectionSettings={sections.length > 1}
                  onSectionViewChange={(value) => {
                    setSectionView(value);
                    writeRecordViewPreference(preferenceKey, {
                      section: value,
                      summary: summaryView,
                    });
                  }}
                  collaboration={{
                    sections: collaboration.sections,
                    preloadSection: () => {},
                    renderSection: () => null,
                  }}
                  collaborationFull={collaboration.full}
                  collaborationSection={collaboration.active}
                  onOpenCollaboration={collaboration.open}
                />
              </div>
            ) : null
          }
        >
          {collaboration.surface}
          <div
            ref={root}
            id={`${navigationId}-panel`}
            role={tabs.length > 0 ? "tabpanel" : undefined}
            aria-labelledby={
              tabs.length > 0 ? `${navigationId}-${activeTab?.key}` : undefined
            }
            className="a-metadata-detail__layout"
            data-rail={(sectionView && visible.length > 1) || undefined}
            data-summary={Boolean(summaryView && summary) || undefined}
            data-tab-sections={Boolean(activeTab) || undefined}
            hidden={collaboration.full}
          >
            {visible.length > 1 && (sectionView || !activeTab) ? (
              <EntitySectionNavigation
                className={
                  sectionView
                    ? "a-metadata-detail__rail"
                    : "a-metadata-detail__selector"
                }
                sections={visible}
                activeSection={selected?.key ?? ""}
                onNavigate={(key) => select(key, true)}
                label="Record sections"
              />
            ) : null}
            <div className="a-metadata-detail__sections">
              {(continuous ? visible : selected ? [selected] : []).map(
                (section) => (
                  <section
                    key={section.key}
                    data-detail-section={section.key}
                    tabIndex={-1}
                    aria-labelledby={`${navigationId}-section-${section.key}`}
                  >
                    <ReferenceOrigin sectionLabel={section.label}><Card className="a-record-detail-content">
                      <h2 id={`${navigationId}-section-${section.key}`}>
                        {section.label}
                      </h2>
                      {section.relationshipKey ? <EntityRelatedSection descriptor={descriptor} ownerRecordId={record.id}
                        canCreate={descriptor.relationshipCapabilities?.[section.relationshipKey]?.create ?? false}
                        relationshipKey={section.relationshipKey} sectionLabel={section.label} {...(section.iconKey ? { sectionIconKey: section.iconKey } : {})} /> :
                        section.component ? <RegisteredEntitySection component={section.component} fields={section.fields} renderField={key => <EntityRecordFields descriptor={descriptor} record={record} fieldKeys={[key]} />} /> :
                        <EntityRecordFields descriptor={descriptor} record={record} fieldKeys={section.fields} />}
                    </Card></ReferenceOrigin>
                  </section>
                ),
              )}
              {continuous ? (
                <div className="a-metadata-detail__tail" aria-hidden="true" />
              ) : null}
            </div>
            {summaryView && summary && !collaboration.full ? <RecordSummaryPanel
              key={`${entityCode}:${record.id}:${descriptor.revision.release}:${record.version ?? ""}`}
              summaryView={summary} entityCode={entityCode} recordId={record.id}
            /> : null}
          </div>
        </PageWorkspace>
      )}
    /></ReferenceOrigin></EntityReferencePreviewProvider>
  );
}
