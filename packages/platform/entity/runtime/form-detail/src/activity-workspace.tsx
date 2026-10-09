"use client";
import { ActivityDateRangeControl, readActivityRange, type ActivityRangeSelection } from "./activity-date-range";
import { RecordPanelActionContext, RecordPanelToolbarActions, useRecordPanelNewAction } from "./panel-header-action";
import { useContext, useEffect, useRef, useState } from "react";
import { ApiTransportError } from "@athyper/platform-api-client";
import { entityActivityClient } from "@athyper/platform-entity-descriptor-client";
import { useApiClient, useSessionIdentity, useExperienceRevision, usePermissions } from "@athyper/platform-shell-app-foundation";
import { sessionScopeKey } from "./session-scope-key";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { PlusIcon, HistoryIcon, RefreshCwIcon, SlidersHorizontalIcon } from "@athyper/platform-icons";
import { Button, PanelTabs, PanelFooter, Select } from "@athyper/platform-ui";
import type {
  ActivityAuditItem,
  ActivityEventFilters,
  ActivityVersionItem,
  ActivityComparison,
  ActivityDescription,
  ActivityPage,
  ActivitySnapshot,
  ActivitySnapshotItem,
  ActivityView,
} from "@athyper/contract-platform-entity-runtime";
import { ActivityEvents } from "./activity-events";
import { activityActorLabel } from "./activity-actor";
import { ActivityCollectionSection } from "./activity-collection-section";
import { ActivityComparison as ComparisonView } from "./activity-comparison";
import { formatActivityValue, type ActivityPresentation } from "./activity-comparison-model";
import { CollaborationPresentationContext, CollaborationVisibilityContext } from "./collaboration-visibility";
import { writeRecordLocation } from "./record/write-record-location";

/** Mounted once inside the shared record-panel portal. Side/full changes never recreate data or selection. */
export function ActivityWorkspace({
  entityCode,
  recordId,
  onExpand,
  fieldLabels = {},
  metadata,
}: {
  entityCode: string;
  recordId: string;
  onExpand: () => void;
  fieldLabels?: Readonly<Record<string, string>>;
  metadata?: ActivityPresentation;
}) {
  const client = useApiClient(),
    intl = useEntityI18n(),
    visible = useContext(CollaborationVisibilityContext);
  const identity = useSessionIdentity();
  const revision = useExperienceRevision();
  const permissions = [...usePermissions()].sort();
  const descriptionKey = JSON.stringify([sessionScopeKey(identity.scope, entityCode, recordId), revision, permissions]);
  const descriptionCache = useRef<{ key: string; expires: number; value: ActivityDescription } | undefined>(undefined);
  const compact = useContext(CollaborationPresentationContext) !== "content";
  const toolbarFirst = Boolean(useContext(RecordPanelActionContext)?.toolbarFirst);
  const [rangeSelection,setRangeSelection]=useState<ActivityRangeSelection>(readActivityRange);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [filters,setFilters]=useState<ActivityEventFilters>({});


  const [description, setDescription] = useState<ActivityDescription>();
  const [view, setView] = useState<ActivityView | undefined>(() => {
    const value =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("activityView")
        : null;
    return value === "timeline" || value === "auditLog" || value === "snapshots" || value === "versions"
      ? value
      : undefined;
  });
  const [days, setDays] = useState<number | undefined>(() => {
      if (typeof window === "undefined") return undefined;
      const value = new URLSearchParams(window.location.search).get(
        "activityDays",
      );
      return value && /^\d{1,3}$/.test(value) && Number(value) > 0
        ? Number(value)
        : undefined;
    }),
    [page, setPage] =
      useState<
        ActivityPage<
          ActivityAuditItem | ActivityVersionItem | ActivitySnapshotItem
        >
      >();
  const [selected, setSelected] = useState<readonly string[]>([]),
    [snapshot, setSnapshot] = useState<ActivitySnapshot>(),
    [comparison, setComparison] = useState<ActivityComparison>();
  const [collectionSections,setCollectionSections]=useState<NonNullable<ActivitySnapshot["collections"]>>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [incompatible, setIncompatible] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [capturing, setCapturing] = useState(false),
    [notice, setNotice] = useState(false);
  const request = useRef<AbortController | undefined>(undefined),
    detailRequest = useRef<AbortController | undefined>(undefined),
    captureRequest = useRef<AbortController | undefined>(undefined),
    captureKey = useRef<string | undefined>(undefined),
    defaultView = useRef<ActivityView | undefined>(undefined);
  const coordinates = { entityCode, recordId };
  const choose = (next: ActivityView) => {
    detailRequest.current?.abort();
    setPage(undefined);
    setView(next);
    setNotice(false);
    const url = new URL(window.location.href);
    url.searchParams.set("activityView", next);
    writeRecordLocation(url, "push");
  };
  useEffect(() => {
    const back = () => {
      const query = new URLSearchParams(window.location.search);
      setRangeSelection(readActivityRange());
      const range = query.get("activityDays");
      setDays(
        range && /^\d{1,3}$/.test(range) && Number(range) > 0
          ? Number(range)
          : undefined,
      );
      const selected = query.get("activityView");
      setView((previous) => {
        const next =
          selected === "timeline" || selected === "snapshots" ||
          selected === "auditLog" ||
          selected === "versions"
            ? selected
            : defaultView.current;
        if (previous !== next) setPage(undefined);
        return next;
      });
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  async function load(cursor?: string, refresh = false) {
    if (refresh) descriptionCache.current = undefined;
    request.current?.abort();
    detailRequest.current?.abort();
    setDetailBusy(false);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    setIncompatible(false);
    try {
      const cached = descriptionCache.current;
      const desc = cached?.key === descriptionKey && cached.expires > Date.now() ? cached.value : await entityActivityClient.describe(client, {
        ...coordinates,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      descriptionCache.current = { key: descriptionKey, expires: cached?.value === desc ? cached.expires : Date.now() + 30000, value: desc };
      defaultView.current = desc.defaultView ?? desc.views[0];
      setDescription(desc);
      const effective =
        view && desc.views.includes(view)
          ? view
          : (desc.defaultView ?? desc.views[0]);
      if (!effective) throw Error("Unavailable");
      if (effective !== view) {
        setView(effective);
        return;
      }
      const range = Math.min(days ?? desc.defaultRangeDays, desc.maxRangeDays);
      if (days !== undefined && range !== days) {
        setDays(range);
        return;
      }
      const next = await entityActivityClient.page(client, {
        ...coordinates,
        view: effective,
        days: range,
        ...(desc.supportsCalendarRanges ? {range:{...rangeSelection,timeZone:intl.localization.timeZone}}:{}),
        cursor,
        ...(["auditLog","timeline"].includes(effective)?{filters}:{}),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPage((previous) =>
        cursor && previous?.releaseHash === next.releaseHash
          ? { ...next, items: [...previous.items, ...next.items] }
          : next,
      );
      if (page && page.releaseHash !== next.releaseHash) {
        descriptionCache.current = undefined;
        setSelected([]);
        setSnapshot(undefined);
        setComparison(undefined);
        captureKey.current = undefined;
      }
    } catch {
      if (!controller.signal.aborted) {
        descriptionCache.current = undefined;
        setError(true);
        setDescription(undefined);
        setPage(undefined);
        setSelected([]);
        setSnapshot(undefined);
        setComparison(undefined);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (visible) void load();
    else {
      request.current?.abort();
      detailRequest.current?.abort();
    }
    return () => {
      request.current?.abort();
      detailRequest.current?.abort();
    };
  }, [client, entityCode, recordId, visible, view, days, filters, rangeSelection, intl.localization.timeZone, descriptionKey]);
  useEffect(
    () => () => captureRequest.current?.abort(),
    [client, entityCode, recordId],
  );
  async function inspect(id: string) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setError(false);
    setIncompatible(false);
    setDetailBusy(true);
    setComparison(undefined);
    setSnapshot(undefined);
    try {
      const value = await entityActivityClient.snapshot(client, {
        ...coordinates,
        id,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setSnapshot(value);
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof ApiTransportError && cause.status === 409) {
          setIncompatible(true);
          return;
        }
        setError(true);
        setPage(undefined);
        setDescription(undefined);
        setSelected([]);
      }
    } finally {
      if (!controller.signal.aborted) setDetailBusy(false);
    }
  }
  const snapshotItems: ActivitySnapshotItem[] = (page?.items ?? []).filter((item):item is ActivitySnapshotItem=>"capturedAt" in item);
  const orderedSelection = [...selected].sort((a, b) => {
    const left = snapshotItems.find(item => item.id === a), right = snapshotItems.find(item => item.id === b);
    return left && right ? left.sequence - right.sequence : 0;
  });
  async function compare() {
    if (selected.length !== 2) return;
    onExpand();
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setError(false);
    setIncompatible(false);
    setDetailBusy(true);
    setSnapshot(undefined);
    setComparison(undefined);
    setCollectionSections([]);
    try {
      const value = await entityActivityClient.compare(client, {
        ...coordinates,
        from: orderedSelection[0]!,
        to: orderedSelection[1]!,
        signal: controller.signal,
      });
      const detail=await entityActivityClient.snapshot(client,{...coordinates,id:value.to,signal:controller.signal});
      if (!controller.signal.aborted) {setCollectionSections(detail.collections??[]);setComparison(value);}
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof ApiTransportError && cause.status === 409) {
          setIncompatible(true);
          return;
        }
        setError(true);
        setPage(undefined);
        setDescription(undefined);
        setSelected([]);
      }
    } finally {
      if (!controller.signal.aborted) setDetailBusy(false);
    }
  }
  async function capture() {
    if (capturing) return;
    setCapturing(true);
    setError(false);
    setIncompatible(false);
    setNotice(false);
    captureKey.current ??= crypto.randomUUID();
    const controller = new AbortController();
    captureRequest.current = controller;
    try {
      await entityActivityClient.capture(client, {
        ...coordinates,
        idempotencyKey: captureKey.current,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        captureKey.current = undefined;
        setNotice(true);
        if (visibleRef.current) await load();
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setCapturing(false);
    }
  }
  useRecordPanelNewAction(view === "snapshots" && description?.canCapture ? {
    label:intl.message("activity.capture"), icon:<PlusIcon size={18}/>, disabled:capturing,
    onClick:()=>{void capture();}
  } : undefined);
  const declaredSections = comparison ? collectionSections : snapshot?.collections ?? [];
  const sectionOrder = [...new Set([...(metadata?.presentation?.navigation?.tabs ?? []).flatMap(tab=>tab.sectionKeys),...(metadata?.presentation?.sections ?? []).map(section=>section.key)])];
  const orderedSections = [...declaredSections].sort((a,b)=>{
    const rank=(key?:string)=>{const index=key?sectionOrder.indexOf(key):-1;return index<0?sectionOrder.length:index;};
    return rank(a.sectionKey)-rank(b.sectionKey);
  });
  const label = (key: string) => fieldLabels[key] ?? key;
  return (
    <section
      className="a-entity-activity"
      data-compact={compact}
      data-toolbar-first={toolbarFirst}
      aria-label={intl.message("activity.title")}
      aria-busy={busy || capturing || detailBusy}
    >
      {!description && toolbarFirst ? <div className="a-entity-activity__toolbar"><RecordPanelToolbarActions omitNew/></div> : null}
      {description ? (
        <>
          {!compact && !toolbarFirst ? <header className="a-entity-activity__intro">
            <span className="a-entity-activity__mark" aria-hidden="true">
              <HistoryIcon size={22} />
            </span>
            <div>
              <h2>
                {intl.message(
                  view === "timeline" ? "activity.timeline" : view === "snapshots"
                    ? "activity.snapshots"
                    : view === "versions"
                      ? "activity.versions"
                      : "activity.audit",
                )}
              </h2>
              <p>
                {intl.message(
                  view === "timeline" ? "activity.timelineIntro" : view === "snapshots"
                    ? "activity.snapshotIntro"
                    : view === "versions"
                      ? "activity.versionIntro"
                      : "activity.auditIntro",
                )}
              </p>
            </div>
          </header> : null}
          <div className="a-entity-activity__toolbar">
            <PanelTabs label={intl.message("activity.views")} value={view ?? ""} onValueChange={key => choose(key as ActivityView)} items={description.views.map(item => ({key:item,id:`activity-tab-${item}`,panelId:"activity-results",label:intl.message(item === "timeline" ? "activity.timeline" : item === "auditLog" ? "activity.audit" : item === "versions" ? "activity.versions" : "activity.snapshots")}))} />
            <div className="a-entity-activity__commands">
            <ActivityDateRangeControl description={description} days={days ?? description.defaultRangeDays} selection={rangeSelection} onChange={(selection,n)=>{
              setRangeSelection(selection);setDays(n);setPage(undefined);
              const url=new URL(window.location.href);
              url.searchParams.set("activityDays",String(n));url.searchParams.set("activityPeriod",selection.period);
              for(const [key,value] of [["activityStart",selection.startDate],["activityEnd",selection.endDate]] as const) {if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}
              writeRecordLocation(url,"push");
            }}/>
            <Button
              aria-label={intl.message("activity.refresh")}
              title={intl.message("activity.refresh")}
              variant="secondary"
              disabled={busy}
              onClick={() => void load(undefined, true)}
            >
              <RefreshCwIcon size={16} aria-hidden="true" />
              {!compact && !toolbarFirst ? intl.message("activity.refresh") : null}
            </Button>
            {view === "snapshots" && description.canCapture && !compact ? (
              <Button disabled={capturing} onClick={() => void capture()}>
                {intl.message(
                  capturing ? "activity.capturing" : "activity.capture",
                )}
              </Button>
            ) : null}
            <RecordPanelToolbarActions omitNew/>
            </div>
          </div>
          {!compact && (!toolbarFirst || view === "snapshots" || view === "versions") ? <p className="a-entity-activity__hint">
            {intl.message(
              view === "snapshots"
                ? "activity.coverage"
                : view === "versions"
                  ? "activity.versionCoverage"
                  : "activity.direct",
            )}
          </p> : null}
        </>
      ) : null}
      <div className="a-entity-activity__content">
      {error ? (
        <div className="a-entity-activity__feedback" role="alert">
          {intl.message("activity.unavailable")}{" "}
          <Button onClick={() => void load(undefined, true)}>
            {intl.message("action.retry")}
          </Button>
        </div>
      ) : null}
      {incompatible ? <p className="a-entity-activity__feedback" role="status">{intl.message("activity.incompatible")}</p> : null}
      {notice ? (
        <p className="a-entity-activity__feedback" role="status">
          {intl.message("activity.captured")}
        </p>
      ) : null}
      {!page && !error ? (
        <p className="a-entity-activity__empty" role="status">
          {intl.message("collaboration.loading")}
        </p>
      ) : null}
      {page ? (
        <div
          id="activity-results"
          role="tabpanel"
          aria-labelledby={`activity-tab-${view}`}
          tabIndex={0}
        >
          {!page.items.length ? (
            <div className="a-entity-activity__empty">
              <HistoryIcon size={28} aria-hidden="true" />
              <h3>{intl.message("activity.empty")}</h3>
              <p>
                {intl.message(
                  "activity.emptyAudit",
                )}
              </p>
            </div>
          ) : view === "auditLog" || view === "timeline" ? <ActivityEvents items={page.items.filter((item):item is ActivityAuditItem=>"event" in item)} timeline={view === "timeline"} fieldLabels={fieldLabels}/> : (
            <ol className="a-entity-activity__items" data-view={view}>
              {page.items.map((item) =>
                "occurredAt" in item ? (
                  <li key={item.id} className="a-entity-activity__event">
                    <div className="a-entity-activity__event-heading">
                      <strong>
                        {"version" in item
                          ? `${intl.message("activity.version")} ${item.version}`
                          : item.event}
                      </strong>
                      <span
                        className="a-entity-activity__outcome"
                        data-outcome={
                          "outcome" in item ? item.outcome : "success"
                        }
                      >
                        {"version" in item
                          ? intl.message("activity.committed")
                          : item.outcome === "success"
                            ? intl.message("activity.success")
                            : item.outcome === "failure"
                              ? intl.message("activity.failure")
                              : item.outcome === "denied"
                                ? intl.message("activity.denied")
                                : item.outcome}
                      </span>
                    </div>
                    <time dateTime={item.occurredAt}>
                      {intl.date(item.occurredAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <p className="a-entity-activity__actor">
                      {intl.message("activity.actor")}:{" "}
                      {activityActorLabel(item.actor, intl)}
                    </p>
                    {item.changedFields.length ? (
                      <div className="a-entity-activity__fields">
                        <span>{intl.message("activity.changedFields")}</span>
                        {item.changedFields.map((key) => (
                          <span className="a-entity-activity__field" key={key}>
                            {label(key)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ) : (
                  <li className="a-entity-activity__snapshot-row" key={item.id} data-selected={selected.includes(item.id)}>
                    <div className="a-entity-activity__snapshot-heading">
                      <input
                        type="checkbox"
                        aria-label={`${intl.message("activity.select")} ${item.sequence}`}
                        checked={selected.includes(item.id)}
                        disabled={
                          !selected.includes(item.id) && selected.length >= 2
                        }
                        onChange={() =>
                          setSelected((ids) =>
                            ids.includes(item.id)
                              ? ids.filter((id) => id !== item.id)
                              : [...ids, item.id],
                          )
                        }
                      />
                      <Button
                        variant="secondary"
                        onClick={() => void inspect(item.id)}
                      >
                        {intl.message("activity.snapshot")} {item.sequence}
                      </Button>
                    </div>
                    <time dateTime={item.capturedAt}>
                      {intl.date(item.capturedAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <p className="a-entity-activity__capture-actor">{intl.message("activity.capturedBy")}: {activityActorLabel(item.capturedBy, intl)}</p>
                    <details className="a-entity-activity__capture-info">
                      <summary aria-label={`${intl.message("activity.captureInfo")} ${item.sequence}`}>ⓘ</summary>
                      <p>{intl.message(item.coverage === "unknown" ? "activity.unknownCoverage" : item.coverage === "declared_fields" ? "activity.declaredCoverage" : "activity.authorizedCoverage")}</p>
                      <p>{intl.message("activity.sourceVersion")}: {item.sourceRecordVersion ?? intl.message("activity.unavailableVersion")}</p>
                    </details>
                  </li>
                ),
              )}
            </ol>
          )}
          {page.nextCursor ? (
            <Button disabled={busy} onClick={() => void load(page.nextCursor)}>
              {intl.message("activity.more")}
            </Button>
          ) : null}

        </div>
      ) : null}
      {detailBusy ? (
        <p role="status">{intl.message("collaboration.loading")}</p>
      ) : null}
      {snapshot && view === "snapshots" ? (
        <div className="a-entity-activity__detail">
          <Button variant="secondary" onClick={() => setSnapshot(undefined)}>
            {intl.message("activity.closeDetails")}
          </Button>
          <h3>
            {intl.message("activity.snapshot")} {snapshot.sequence}
          </h3>
          <dl>
            {snapshot.fields.map((field) => (
              <div key={field.key}>
                <dt>{label(field.key)}</dt>
                <dd>{field.reference && field.state === "value" && field.value !== null && field.value !== undefined && field.value !== "" ? intl.message("activity.linkedRecord") : formatActivityValue(field, metadata?.fields.find(item => item.key === field.key), intl)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {comparison && view === "snapshots" ? (
        <ComparisonView hasCollections={collectionSections.length>0} key={`${comparison.from}:${comparison.to}`} comparison={comparison} metadata={metadata} fieldLabels={fieldLabels} snapshots={snapshotItems} onClose={() => setComparison(undefined)} />
      ) : null}
      {view === "snapshots" && (comparison || snapshot) ? orderedSections.map(section=><ActivityCollectionSection key={`${entityCode}:${recordId}:${comparison?.from??""}:${comparison?.to??snapshot?.id}:${section.key}`} entityCode={entityCode} recordId={recordId} section={section} from={comparison?.from} to={comparison?.to??snapshot!.id}/>) : null}
      </div>
          {view === "snapshots" && selected.length > 0 ? (
            <PanelFooter className="a-entity-activity__selection">
              <p>
                {intl.message("activity.selectTwo")}{" "}
                <strong>{selected.length}/2</strong>
              </p>
              <Button
                variant="secondary"
                disabled={!selected.length}
                onClick={() => {
                  setSelected([]);
                  setComparison(undefined);
                }}
              >
                {intl.message("activity.clear")}
              </Button>
              {selected.length === 1 ? <Button variant="secondary" onClick={()=>void inspect(selected[0]!)}>{intl.message("activity.snapshot")}</Button> : null}
              <Button
                disabled={selected.length !== 2 || detailBusy}
                onClick={() => void compare()}
              >
                {intl.message("activity.compare")}
              </Button>
            </PanelFooter>
          ) : null}
      {compact && view === "snapshots" && description?.canCapture && !selected.length ? <PanelFooter><Button className="a-record-dock-action" variant="secondary" disabled={capturing} onClick={() => void capture()}><HistoryIcon aria-hidden="true"/>{intl.message(capturing ? "activity.capturing" : "activity.capture")}</Button></PanelFooter> : null}
    </section>
  );
}
