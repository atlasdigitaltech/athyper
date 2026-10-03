"use client";
import type { EntityRuntimeResourceContext } from "@athyper/platform-entity-descriptor-client";
import { resolveRecordResourceContext } from "./resolve-resource-context";
import { entityStatusTone } from "@athyper/contract-platform-entity-runtime";
import { writeRecordLocation } from "./write-record-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PageHeader,
  PageWorkspace,
  useRecordBreadcrumb,
  useRecordPage,
} from "@athyper/platform-shell";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Badge } from "@athyper/platform-ui";
import { ProtectedValueProvider } from "../protected-value";
import { EntityRuntimeWorkspace } from "../entity-runtime-workspace";
import { RecordBody } from "./record-body";
import { RecordModeNavigation, RecordHeaderActions } from "./record-navigation";
import { createRecordRevealRequest } from "./protected-operation-registry";
import { useRecordCollaboration } from "./use-record-collaboration";
import {
  readSection,
  readResourceContext,
  resourceContextKey,
} from "./record-url-state";
import {
  readRecordViewPreference,
  writeRecordViewPreference,
} from "./record-view-preferences";
import type { EntityRecordAdapter } from "./record-contracts";
/** Metadata-driven page chrome shared by registered entities. */
export function EntityRecordPage({
  adapter,
  recordId,
  defaultResourceContext,
}: {
  readonly adapter: EntityRecordAdapter;
  readonly recordId: string;
  readonly defaultResourceContext?: EntityRuntimeResourceContext;
}) {
  const identity = useSessionIdentity();
  const scopeKey = [
    identity.scope?.tenantId,
    identity.scope?.principalId,
    identity.scope?.authEpoch,
    adapter.entityCode,
    recordId,
  ].join(":");
  return (
    <EntityRecordPageInstance
      key={scopeKey}
      adapter={adapter}
      recordId={recordId}
      defaultResourceContext={defaultResourceContext}
    />
  );
}
function EntityRecordPageInstance({
  adapter,
  recordId,
  defaultResourceContext,
}: {
  readonly adapter: EntityRecordAdapter;
  readonly recordId: string;
  readonly defaultResourceContext?: EntityRuntimeResourceContext;
}) {
  const { entityCode } = adapter;
  const preferenceKey =
    adapter.preferenceKey ?? `athyper.record-view.${entityCode}.v1`;
  useRecordPage();
  const http = useApiClient();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [breadcrumb, setBreadcrumb] = useState<RecordBreadcrumb>({ label: adapter.label });
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useRecordBreadcrumb(breadcrumb.label, adapter.recordHref(recordId), breadcrumb);
  const [section, setSection] = useState(() =>
    readSection(adapter.sectionForTab),
  );
  const [urlContext, setResourceContext] = useState(readResourceContext);
  const [explicitScope, setExplicitScope] = useState(hasExplicitScope);
  const resourceContext = useMemo(() => resolveRecordResourceContext(urlContext, defaultResourceContext, explicitScope),
    [urlContext, defaultResourceContext, explicitScope]);
  const reveal = useMemo(
    () =>
      createRecordRevealRequest(
        { http, entityCode, recordId, resourceContext },
        adapter.reveals,
      ),
    [http, entityCode, recordId, resourceContext, adapter.reveals],
  );
  const {
    collaborationFull,
    collaborationOpen,
    collaborationSection,
    collaborationPinned,
    setCollaborationPinned,
    setCollaborationFull,
    setCollaborationOpen,
    changeCollaborationFull,
    setCollaborationPanel,
    setCollaborationTab,
  } = useRecordCollaboration();
  const [actionError, setActionError] = useState<string>();
  const initialViewPreference = readRecordViewPreference(preferenceKey);
  const [view, setView] = useState<"content" | "summary">(() =>
    initialViewPreference.summary ? "summary" : "content",
  );
  const [sectionView, setSectionView] = useState(
    () => initialViewPreference.section,
  );
  const [pendingAction, setPendingAction] = useState<string>();
  useEffect(() => {
    const update = () => {
      setSection(readSection(adapter.sectionForTab));
      setResourceContext(readResourceContext());
      setExplicitScope(hasExplicitScope());
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [adapter.sectionForTab]);
  useEffect(() => {
    // The browser root is only used to dismiss the record identity. Once it has
    // passed, hand scrolling to the record panes instead of leaving a second page
    // scroll surface beneath a fixed workspace.
    const update = () =>
      setHeaderCollapsed((collapsed) =>
        collapsed ? window.scrollY > 16 : window.scrollY > 160,
      );
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    writeRecordViewPreference(preferenceKey, {
      summary: view === "summary",
      section: sectionView,
    });
  }, [preferenceKey, sectionView, view]);
  return (
    <ProtectedValueProvider
      resetKey={`${entityCode}:${recordId}:${section}:${resourceContextKey(resourceContext)}`}
      request={reveal}
    >
      <PageWorkspace
        width="wide"
        className={`a-entity-record${headerCollapsed ? " a-entity-record--header-collapsed" : ""}`}
      >
        <EntityRuntimeWorkspace
          entityCode={entityCode}
          recordId={recordId}
          surfaceKey="detail"
          deepLinkedSectionKey={section}
          contextKey={resourceContextKey(resourceContext)}
          resourceContext={resourceContext}
          sectionNavigation="header"
          continuousSections={sectionView}
          continuousScrollRoot={contentScrollRef}
          collaborationSectionKeys={["comments", "attachments"]}
          onSelectSection={(sectionKey, tabKey) => {
            const next = new URL(window.location.href);
            next.searchParams.set("section", sectionKey);
            if (tabKey) next.searchParams.set("tab", tabKey);
            if (collaborationFull) {
              next.searchParams.delete("collaborationMode");
              next.searchParams.set("panel", "closed");
              setCollaborationFull(false);
              setCollaborationOpen(false);
            }
            writeRecordLocation(next, "push");
            setSection(sectionKey);
          }}
          onObserveSection={(sectionKey) => {
            if (collaborationFull) return;
            const next = new URL(window.location.href);
            next.searchParams.set("section", sectionKey);
            writeRecordLocation(next, "replace");
            setSection(sectionKey);
          }}
          renderHeader={(values, revision, actions, navigation) => (
            <div className="a-record-page-header">
              <RecordBreadcrumbRegistration
                label={adapter.label}
                values={values}
                onChange={setBreadcrumb}
              />
              <PageHeader
                level="collection"
                title={text(values.name, adapter.label)}
                icon={adapter.icon}
                description={
                  <span className="a-entity-record-record-identity-line">
                    <span>
                      {[text(values.code), adapter.label]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <Badge
                      tone={entityStatusTone(values.statusTone)}
                    >
                      {text(
                        (
                          values.displayLabels as
                            Record<string, unknown> | undefined
                        )?.status,
                        "Status label unavailable",
                      )}
                    </Badge>
                  </span>
                }
                actions={
                  <RecordHeaderActions
                    actions={actions.filter((action) =>
                      Object.hasOwn(adapter.actions ?? {}, action.operationKey),
                    )}
                    pendingAction={pendingAction}
                    error={actionError}
                    onExecute={async (operationKey) => {
                      if (!Object.hasOwn(adapter.actions ?? {}, operationKey))
                        return;
                      setPendingAction(operationKey);
                      setActionError(undefined);
                      try {
                        await adapter.actions![operationKey]!({
                          http,
                          entityCode,
                          recordId,
                          resourceContext,
                          revision,
                        });
                      } catch (cause) {
                        setActionError(
                          cause instanceof Error
                            ? cause.message
                            : "Unable to start the action.",
                        );
                      } finally {
                        setPendingAction(undefined);
                      }
                    }}
                  />
                }
              />
              <RecordModeNavigation
                collaborationFull={collaborationFull && collaborationOpen}
                collaborationSection={collaborationSection ?? "comments"}
                navigation={navigation}
                view={view}
                sectionView={sectionView}
                onViewChange={setView}
                onSectionViewChange={setSectionView}
                collaboration={navigation.collaboration}
                onOpenCollaboration={setCollaborationTab}
              />
            </div>
          )}
          renderBody={({ navigation, content }) => (
            <RecordBody
              navigation={navigation}
              content={content}
              view={view}
              sectionView={
                sectionView &&
                Boolean(
                  navigation.navigation?.tabs.some(
                    (item) =>
                      item.sectionKeys.includes(navigation.activeSection),
                  ),
                )
              }
              entityCode={entityCode}
              recordId={recordId}
              resourceContext={resourceContext}
              contentScrollRef={contentScrollRef}
              collaborationFull={collaborationFull}
              onCollaborationFullChange={changeCollaborationFull}
              collaborationOpen={collaborationOpen}
              collaborationPinned={collaborationPinned}
              collaborationSection={collaborationSection}
              onCollaborationOpenChange={(open) => setCollaborationPanel(open)}
              onCollaborationPinnedChange={setCollaborationPinned}
              onCollaborationSectionChange={setCollaborationTab}
            />
          )}
        />
      </PageWorkspace>
    </ProtectedValueProvider>
  );
}

function RecordBreadcrumbRegistration({
  label: entityLabel,
  values,
  onChange,
}: {
  readonly label: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (breadcrumb: RecordBreadcrumb) => void;
}) {
  // `name` and `code` are semantic header bindings resolved from the published header metadata.
  // The breadcrumb shows them together; title and code also travel separately for layouts
  // that place them (Quick access).
  const name = text(values.name),
    code = text(values.code);
  const label =
    name && code ? `${name} (${code})` : name || code || entityLabel;
  useEffect(() => {
    onChange({ label, ...(name ? { title: name } : {}), ...(code ? { code } : {}) });
  }, [label, name, code, onChange]);
  return null;
}

interface RecordBreadcrumb { readonly label: string; readonly title?: string; readonly code?: string }

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
function hasExplicitScope(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  return ["legalEntityId", "companyCodeId", "operatingOrganizationId"].some(key => query.has(key));
}
