"use client";
import {
  ManagementWorkspace,
  ManagementNavigation,
  PageHeader,
  WorkspaceToolPanel,
  ActivityQueryControls,
  ActivityNotificationActions,
  BrowserAlertsSetting,
  ActivityFeed,
  ActivityDetail,
  activityDensityOverride,
  activityCount,
  activityEntries,
  useReadingPane,
} from "@athyper/platform-shell";
import { BellIcon, InboxIcon, SlidersHorizontalIcon } from "@athyper/platform-icons";
import { Button, FilterChipGroup, PanelHeader } from "@athyper/platform-ui";
import { useEffect, useState } from "react";
import { defaultActivityQuery } from "@athyper/contract-platform-activity";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { NotificationControls } from "./notification-controls";
import { useActivityCenterData } from "./index";


/** Full view of the activity panel, composed exactly like an entity list:
 * the wide management frame, a collection header with the result count, the
 * section navigation, then the shared toolbar and feed. Notification
 * preferences open in the docked side panel. */
export function ActivityCenterPage({
  kind,
}: {
  readonly kind: "notifications" | "inbox";
}) {
  const data = useActivityCenterData();
  const intl = useEntityI18n();
  const text = (key: string, values?: Record<string, string | number>) => intl.message(`activity.page.${key}`, values);
  const [settings, setSettings] = useState(false);
  const query = data.queries?.[kind];
  const defaults = defaultActivityQuery(kind, query?.timeZone);
  const filtered = Boolean(
    query &&
      Object.keys(defaults).some(
        (key) =>
          !["sort", "group", "density", "timeZone"].includes(key) &&
          query[key as keyof typeof query] !==
            defaults[key as keyof typeof defaults],
      ),
  );
  const clear = () => {
    if (query)
      data.onQueryChange?.(kind, {
        ...defaults,
        sort: query.sort,
        group: query.group,
        density: query.density,
      });
  };
  const scope = (
    kind === "notifications" ? query?.read === "unread" : query?.attention
  )
    ? "attention"
    : "all";
  const setScope = (value: string) => {
    if (query)
      data.onQueryChange?.(kind, {
        ...query,
        ...(kind === "notifications"
          ? { read: value === "attention" ? "unread" : "all" }
          : { attention: value === "attention" }),
      });
  };
  const title = text(kind === "notifications" ? "title.notifications" : "title.inbox");
  // Reading pane (80rem and wider): the list on the left, the selected item in
  // full on the right. The first row is shown until the person picks another.
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const wide = useReadingPane(content);
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => setSelectedId(undefined), [kind]);
  const items = (kind === "notifications" ? data.notifications : data.inbox) ?? [];
  const entries = activityEntries(kind, items);
  const selected =
    entries.find((entry) => entry.item.id === selectedId) ??
    entries
      .flatMap((entry) => entry.similar.map((item) => ({ item, similar: [] })))
      .find((entry) => entry.item.id === selectedId) ??
    entries[0];
  const paneId = `athyper-activity-detail-${kind}`;
  const pane = wide && Boolean(selected) && !(data.errors?.[kind] ?? data.error);
  const matching = data.queryInfo?.[kind]?.matchingCount;
  const count =
    data.loading || data.errors?.[kind] || matching === undefined
      ? undefined
      : intl.message(kind === "notifications" ? "activity.controls.notificationCount" : "activity.controls.taskCount", { count: matching });
  const sectionCount = (tab: "notifications" | "inbox") => activityCount(data, tab);
  return (
    <ManagementWorkspace
      className="athyper-activity-page"
      header={
        <PageHeader
          level="collection"
          title={title}
          description={
            <>
              {/* Section-specific purpose, shown once in the page header. */}
              <span>{text(kind === "notifications" ? "description.notifications" : "description.inbox")}</span>
              {count ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span aria-live="polite">{count}</span>
                </>
              ) : null}
            </>
          }
          icon={kind === "notifications" ? <BellIcon /> : <InboxIcon />}
          actions={
            kind === "notifications" ? (
              <Button
                variant="secondary"
                aria-expanded={settings}
                onClick={() => setSettings((value) => !value)}
              >
                <SlidersHorizontalIcon size={16} />
                {text("preferences")}
              </Button>
            ) : undefined
          }
        />
      }
      navigation={
        <ManagementNavigation
          label={text("type")}
          currentKey={kind}
          items={(["notifications", "inbox"] as const).map((key) => ({
            key,
            label: text(key === "notifications" ? "title.notifications" : "title.inbox"),
            href:
              key === "inbox"
                ? (data.inboxHref ?? "/inbox")
                : (data.notificationsHref ?? "/notifications"),
            ...(sectionCount(key) !== undefined ? { count: sectionCount(key) } : {}),
          }))}
        />
      }
    >
      {/* One list panel, as on entity lists: toolbar, quick views, then grouped rows. */}
      <div className="athyper-activity-page__panel">
      <ActivityQueryControls kind={kind} data={data} />
      {!data.collections?.[kind] ? <div className="athyper-activity-page__toolbar">
        <FilterChipGroup
          label={text(kind === "notifications" ? "filters.notifications" : "filters.inbox")}
          value={scope}
          onValueChange={setScope}
          items={[
            { value: "all", label: text("scope.all") },
            {
              value: "attention",
              label: text(kind === "notifications" ? "scope.unread" : "scope.attention"),
            },
          ]}
        />
        {kind === "notifications" ? <ActivityNotificationActions data={data} /> : null}
      </div> : null}
      <div
        ref={setContent}
        id={`athyper-activity-content-${kind}`}
        className="athyper-activity-page__content"
        data-density={activityDensityOverride(data, kind)}
        data-reading-pane={pane || undefined}
        aria-label={title}
        role="region"
      >
        <div className="athyper-activity-page__list" data-activity-list>
          <ActivityFeed
            kind={kind}
            data={data}
            filtered={filtered}
            onShowAll={clear}
            selection={
              pane ? { selectedId: selected?.item.id, onSelect: setSelectedId, controls: paneId } : undefined
            }
          />
        </div>
        {pane && selected ? (
          <div className="athyper-activity-page__reading">
            <ActivityDetail id={paneId} kind={kind} item={selected.item} similar={selected.similar} data={data} />
          </div>
        ) : null}
      </div>
      </div>
      {kind === "notifications" ? (
        <WorkspaceToolPanel
          id="notification-preferences"
          open={settings}
          onOpenChange={setSettings}
          labels={{
            region: text("preferences"),
            close: text("closePreferences"),
            pin: intl.message("list.controls.pin"),
            unpin: intl.message("list.controls.unpin"),
            resize: text("resizePreferences"),
          }}
          className="athyper-notification-preferences-panel"
        >
          {(frame) => (
            <>
              <PanelHeader
                icon={<SlidersHorizontalIcon size={18} />}
                title={text("preferences")}
                subtitle={text("preferencesHint")}
                capabilities={frame.capabilities}
              />
              <NotificationControls deviceSettings={<BrowserAlertsSetting data={data} />} />
            </>
          )}
        </WorkspaceToolPanel>
      ) : null}
    </ManagementWorkspace>
  );
}
