"use client";
import { useState, useEffect, useRef, type RefObject } from "react";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  entityRuntimeClient,
  type EntityRuntimeResourceContext,
} from "@athyper/platform-entity-descriptor-client";
import { EntityCollaborationSurface } from "../collaboration-surface";
import { summaryRenderers } from "../registered-renderers";
import { Fields as MetadataFields } from "../section-primitives";
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
  const http = useApiClient();
  const [state, setState] = useState<{
    loading: boolean;
    cards?: readonly Readonly<{
      readonly key: string;
      readonly state: string;
      readonly data?: unknown;
    }>[];
    error?: string;
  }>({ loading: false });
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (view !== "summary" || !navigation.summaryView) return;
    const controller = new AbortController();
    setState({ loading: true });
    entityRuntimeClient
      .summary(http, {
        entityCode,
        recordId: recordId,
        surfaceKey: "detail",
        ...(resourceContext ? { resourceContext } : {}),
        signal: controller.signal,
      })
      .then(
        (value) =>
          !controller.signal.aborted &&
          setState({ loading: false, cards: value.cards }),
      )
      .catch(
        (error) =>
          !controller.signal.aborted &&
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Summary is unavailable.",
          }),
      );
    return () => controller.abort();
  }, [
    entityCode,
    recordId,
    http,
    navigation.summaryView,
    resourceContext,
    view,
  ]);
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
        {activeTabSection && (!sectionView || activeTab?.sectionDisplay !== "continuous") ? (
          <header className="a-entity-record-record-content__context">
            <h2>{activeTabSection.label}</h2>
          </header>
        ) : null}
        {content}
      </div>
      {view === "summary" && navigation.summaryView ? (
        <aside
          className="a-entity-record-summary-view"
          aria-label="Record summary"
        >
          {navigation.summaryView.cards.map((card) => {
            const result = state.cards?.find((item) => item.key === card.key);
            return (
              <section key={card.key}>
                <h2>{card.label.defaultText}</h2>
                {state.loading && !result ? (
                  <p role="status">Loading…</p>
                ) : result?.state === "empty" ? (
                  <p>No designated record.</p>
                ) : result?.state === "context_required" ? (
                  <p>Select context to view this summary.</p>
                ) : result?.state === "unavailable" ? (
                  <p>Unavailable.</p>
                ) : result?.data ? (
                  <SummaryData
                    value={result.data}
                    rendererKey={card.rendererKey}
                  />
                ) : state.error ? (
                  <p role="alert">{state.error}</p>
                ) : (
                  <p>Unavailable.</p>
                )}
              </section>
            );
          })}
        </aside>
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
function SummaryData({
  value,
  rendererKey,
}: {
  readonly value: unknown;
  readonly rendererKey: string;
}) {
  const summary =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const displayFields =
    summary && Array.isArray(summary.displayFields)
      ? summary.displayFields
      : [];
  if (displayFields.length && rendererKey !== "platform.address.summary.v1")
    return (
      <MetadataFields
        fields={displayFields}
        values={summary?.value as Record<string, unknown>}
      />
    );
  if (
    displayFields.length &&
    rendererKey === "platform.address.summary.v1" &&
    summary?.value &&
    typeof summary.value === "object"
  ) {
    const address = summary.value as Record<string, unknown>;
    const purpose = displayFields.find((field) => field.key === "purpose");
    value = {
      ...summary,
      value: {
        ...address,
        purpose:
          purpose?.options?.find(
            (option: { value: string }) => option.value === address.purpose,
          )?.label.defaultText ?? "Address purpose label unavailable",
      },
    };
  }
  const Renderer = summaryRenderers[rendererKey];
  if (Renderer) return <>{Renderer({ data: value })}</>;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return <p>{String(value ?? "—")}</p>;
  return (
    <dl>
      {Object.entries(value as Record<string, unknown>)
        .filter(
          ([, entry]) => entry !== null && entry !== undefined && entry !== "",
        )
        .slice(0, 6)
        .map(([key, entry]) => (
          <div key={key}>
            <dt>{key.replace(/[_-]/g, " ")}</dt>
            <dd>
              {Array.isArray(entry)
                ? entry.join(", ")
                : typeof entry === "object"
                  ? "Available"
                  : String(entry)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
