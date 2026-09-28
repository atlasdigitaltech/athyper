"use client";
import { useState, useEffect, useRef, type RefObject } from "react";
import { type EntityRuntimeResourceContext } from "@athyper/platform-entity-descriptor-client";
import { RecordSummaryPanel } from "./record-summary-panel";
import { EntityCollaborationSurface } from "../collaboration-surface";
import type { EntityRuntimeHeaderNavigation } from "../entity-runtime-workspace";
export function RecordBody({
  collaborationFull,
  onCollaborationFullChange,
  navigation,
  content,
  view,
  sectionView,
  entityCode,
  recordId,
  resourceContext,
  contentScrollRef,
  collaborationOpen,
  collaborationPinned,
  collaborationSection,
  onCollaborationOpenChange,
  onCollaborationPinnedChange,
  onCollaborationSectionChange,
}: {
  readonly collaborationFull: boolean;
  readonly onCollaborationFullChange: (full: boolean) => void;
  readonly navigation: EntityRuntimeHeaderNavigation;
  readonly content: React.ReactNode;
  readonly view: "content" | "summary";
  readonly sectionView: boolean;
  readonly entityCode: string;
  readonly recordId: string;
  readonly resourceContext?: EntityRuntimeResourceContext;
  readonly contentScrollRef: RefObject<HTMLDivElement | null>;
  readonly collaborationOpen: boolean;
  readonly collaborationPinned: boolean;
  readonly collaborationSection?: string;
  readonly onCollaborationOpenChange: (open: boolean) => void;
  readonly onCollaborationPinnedChange: (pinned: boolean) => void;
  readonly onCollaborationSectionChange: (sectionKey: string) => void;
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<number | undefined>(undefined);
  const activeTab = navigation.navigation?.tabs.find((tab) =>
    tab.sectionKeys.includes(navigation.activeSection),
  );
  const sectionKeys = activeTab?.sectionKeys ?? [];
  const tabSections = sectionKeys.flatMap(
    (key) => navigation.sections.find((section) => section.key === key) ?? [],
  );
  const activeTabSection = tabSections.find(
    (section) => section.key === navigation.activeSection,
  );
  useEffect(
    () => () => {
      if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
    },
    [],
  );
  const pinnedPanels = sectionView || view === "summary";
  const markScrolling = () => {
    setIsScrolling(true);
    if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
    scrollTimeout.current = window.setTimeout(() => setIsScrolling(false), 700);
  };
  return (
    <div
      className={`a-entity-record-record-body${view === "summary" ? " a-entity-record-record-body--summary" : ""}${sectionView ? " a-entity-record-record-body--sections" : ""}${pinnedPanels ? " a-entity-record-record-body--pinned" : ""}`}
    >
      {sectionView ? (
        <aside
          className="a-entity-record-section-outline"
          aria-label={`${activeTab?.label.defaultText ?? "Record"} sections`}
        >
          {tabSections.map((section) => (
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
          ))}
        </aside>
      ) : null}
      <div
        ref={contentScrollRef}
        className={`a-entity-record-record-content${isScrolling ? " is-scrolling" : ""}`}
        aria-label="Record content"
        onScroll={markScrolling}
      >
        {activeTabSection &&
        (!sectionView || activeTab?.sectionDisplay !== "continuous") ? (
          <header className="a-entity-record-record-content__context">
            <h2>{activeTabSection.label}</h2>
          </header>
        ) : null}
        {content}
      </div>
      {view === "summary" && navigation.summaryView ? (
        <RecordSummaryPanel
          summaryView={navigation.summaryView}
          entityCode={entityCode}
          recordId={recordId}
          resourceContext={resourceContext}
        />
      ) : null}
      {navigation.collaboration ? (
        <EntityCollaborationSurface
          fullView={collaborationFull}
          onFullViewChange={onCollaborationFullChange}
          open={collaborationOpen}
          pinned={collaborationPinned}
          activeSectionKey={collaborationSection}
          sections={navigation.collaboration.sections}
          onOpenChange={onCollaborationOpenChange}
          onPinnedChange={onCollaborationPinnedChange}
          onActiveSectionChange={onCollaborationSectionChange}
          preloadSection={navigation.collaboration.preloadSection}
          renderSection={navigation.collaboration.renderSection}
        />
      ) : null}
    </div>
  );
}
