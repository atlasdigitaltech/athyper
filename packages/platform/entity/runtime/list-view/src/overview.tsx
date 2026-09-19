"use client";
import {
  EntityFavourites,
  EntityFavouritesRuntime,
} from "./overview-favourites";
import { useOverviewMessage } from "./overview-messages";
import React, { useEffect, useState, type ReactNode } from "react";
import {
  encodeListLocationState,
  resolveEntityText,
  type EntityApplicationDescriptorV1,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type EntityListScopeCoordinateV1,
  type ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  entityListDescriptorOperation,
  entityListOperation,
  entityListQuery,
  entityListScopeQuery,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  ClockIcon,
  DatabaseIcon,
  HistoryIcon,
  LayoutIcon,
  RefreshCwIcon,
  StarIcon,
} from "@athyper/platform-icons";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { parseInstant } from "@athyper/platform-temporal";
import { Button } from "@athyper/platform-ui";

interface OverviewLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly description?: string;
}
interface OverviewMetric extends OverviewLink {
  readonly value?: string;
  readonly loading?: boolean;
}
interface OverviewFocus extends OverviewLink {
  readonly count?: number;
}
interface OverviewRecord {
  readonly key: string;
  readonly label: string;
  readonly detail?: string;
  readonly href?: string;
  readonly timestamp?: string;
}
export interface EntityOverviewProps {
  /** Deferred summary area; opt in when ready to reintroduce it. */
  readonly showSummary?: boolean;
  readonly metrics: readonly OverviewMetric[];
  readonly focus: readonly OverviewFocus[];
  readonly shortcuts: readonly OverviewLink[];
  readonly records: readonly OverviewRecord[];
  readonly favouritesPanel?: ReactNode;
  readonly recentTitle?: string;
  readonly recentHref?: string;
  readonly scopeLabel?: string;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onRefresh?: () => void;
}

/** Shared presentation: adapters supply authorized facts, never synthetic scores or events. */
export function EntityOverview({
  showSummary = false,
  metrics,
  focus,
  shortcuts,
  records,
  favouritesPanel,
  recentTitle,
  recentHref,
  scopeLabel,
  loading,
  error,
  onRefresh,
}: EntityOverviewProps) {
  const message = useOverviewMessage();
  const numbered = focus.filter((item) => item.count !== undefined);
  const actionable = numbered.filter((item) => item.count! > 0);
  // Counts in different queues may overlap. Do not add them and claim a record total.
  const clear =
    focus.length > 0 && numbered.length === focus.length && !actionable.length;
  const headline = actionable.length
    ? `${actionable.length} ${actionable.length === 1 ? "area needs" : "areas need"} attention`
    : clear
      ? "You’re up to date"
      : "A clear view. Your next move.";
  const summary = actionable.length
    ? "Your work queues are ready. Start with the items that need a decision."
    : clear
      ? "No items are flagged in your available work queues."
      : "Explore your records, pick up your work, and keep things moving.";
  return (
    <section className="a-entity-pulse" aria-label="Entity overview">
      {showSummary ? (
        <>
          <div className="a-entity-pulse__toolbar">
            <span>
              <span className="a-entity-pulse__dot" />
              Entity pulse
              {scopeLabel ? (
                <span className="a-entity-pulse__scope">{scopeLabel}</span>
              ) : null}
            </span>
            {onRefresh ? (
              <Button
                variant="ghost"
                size="small"
                disabled={loading}
                onClick={onRefresh}
                aria-label="Refresh overview"
              >
                <RefreshCwIcon size={15} />
                Refresh
              </Button>
            ) : null}
          </div>
          <div className="a-entity-pulse__hero">
            <div className="a-entity-pulse__hero-icon">
              {clear ? <CircleCheckIcon size={28} /> : <LayoutIcon size={28} />}
            </div>
            <div className="a-entity-pulse__hero-copy">
              <span className="a-entity-pulse__eyebrow">
                YOUR WORK, AT A GLANCE
              </span>
              <h2>{headline}</h2>
              <p>{summary}</p>
            </div>
            {(actionable[0] ?? shortcuts[0] ?? focus[0]) ? (
              <a
                className="a-button a-button--primary"
                href={(actionable[0] ?? shortcuts[0] ?? focus[0])!.href}
              >
                {actionable.length ? "View work queue" : "Explore records"}
                <ChevronRightIcon size={16} />
              </a>
            ) : null}
            <div className="a-entity-pulse__orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </>
      ) : null}
      {error ? (
        <div className="a-entity-pulse__notice" role="alert">
          {error}
          {onRefresh ? (
            <button type="button" onClick={onRefresh} disabled={loading}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {showSummary && metrics.length ? (
        <div className="a-entity-pulse__metrics" aria-label="Record metrics">
          {metrics.map((metric, index) => (
            <a
              className="a-entity-pulse__metric"
              href={metric.href}
              key={metric.key}
              aria-busy={metric.loading || undefined}
            >
              <span className="a-entity-pulse__metric-top">
                <span>{metric.label}</span>
                <span className="a-entity-pulse__metric-icon">
                  {index === 0 ? (
                    <DatabaseIcon size={18} />
                  ) : (
                    <StarIcon size={18} />
                  )}
                </span>
              </span>
              {metric.loading ? (
                <span
                  className="a-skeleton a-entity-pulse__number-skeleton"
                  aria-label="Loading count"
                />
              ) : (
                <strong>{metric.value ?? "—"}</strong>
              )}
              <span className="a-entity-pulse__metric-bottom">
                <span>{metric.description ?? "Open view"}</span>
                <ChevronRightIcon size={16} />
              </span>
            </a>
          ))}
        </div>
      ) : null}
      <div className="a-entity-pulse__workspace">
        <Panel
          title={message("entity.overview.focus.title")}
          description={message("entity.overview.focus.description")}
          icon={<ClipboardCheckIcon size={19} />}
          className="a-entity-pulse__focus"
        >
          {focus.length ? (
            <div className="a-entity-pulse__focus-list">
              {focus.map((item) => (
                <a
                  href={item.href}
                  key={item.key}
                  className="a-entity-pulse__focus-row"
                >
                  <span
                    className="a-entity-pulse__focus-marker"
                    data-attention={!!item.count}
                  >
                    <ClipboardCheckIcon size={19} />
                  </span>
                  <span className="a-entity-pulse__row-copy">
                    <strong>{item.label}</strong>
                    <small>
                      {item.description ??
                        (item.count === 0
                          ? "Nothing flagged. Open to see your queue."
                          : "Open your queue to see available work.")}
                    </small>
                  </span>
                  {item.count !== undefined ? (
                    <span
                      className="a-entity-pulse__count"
                      data-attention={item.count > 0}
                    >
                      {item.count.toLocaleString()}
                    </span>
                  ) : null}
                  <ChevronRightIcon size={17} />
                </a>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CircleCheckIcon size={25} />}
              title={message("entity.overview.focus.empty")}
              description={message("entity.overview.focus.emptyDescription")}
            />
          )}
        </Panel>
        <Panel
          title={message("entity.overview.shortcuts.title")}
          description={message("entity.overview.shortcuts.description")}
          icon={<StarIcon size={19} />}
        >
          {shortcuts.length ? (
            <div className="a-entity-pulse__shortcuts">
              {shortcuts.map((item) => (
                <a href={item.href} key={item.key}>
                  <span className="a-entity-pulse__row-copy">
                    <strong>{item.label}</strong>
                    {item.description ? (
                      <small>{item.description}</small>
                    ) : null}
                  </span>
                  <ChevronRightIcon size={17} />
                </a>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<LayoutIcon size={25} />}
              title={message("entity.overview.shortcuts.empty")}
              description={message("entity.overview.shortcuts.emptyDescription")}
            />
          )}
        </Panel>
      </div>
      <div className="a-entity-pulse__workspace a-entity-pulse__record-panels">
        <Panel
          title={recentTitle ?? message("entity.overview.recent.title")}
          description={
            !recentTitle || recentTitle === message("entity.overview.recent.title")
              ? message("entity.overview.recent.description")
              : message("entity.overview.recent.previewDescription")
          }
          icon={<HistoryIcon size={19} />}
          action={
            recentHref ? (
              <a className="a-entity-pulse__text-link" href={recentHref}>
                {message("entity.overview.viewRecords")}
                <ChevronRightIcon size={15} />
              </a>
            ) : undefined
          }
        >
          {loading ? (
            <div
              className="a-entity-pulse__loading"
              role="status"
              aria-label="Loading records"
            >
              {[0, 1, 2].map((key) => (
                <div
                  className="a-skeleton a-entity-pulse__row-skeleton"
                  key={key}
                />
              ))}
            </div>
          ) : records.length ? (
            <div className="a-entity-pulse__records">
              {records.map((record) => {
                const content = (
                  <>
                    <span
                      className="a-entity-pulse__record-avatar"
                      aria-hidden="true"
                    >
                      {record.label.slice(0, 2).toLocaleUpperCase()}
                    </span>
                    <span className="a-entity-pulse__row-copy">
                      <strong>{record.label}</strong>
                      {record.detail ? <small>{record.detail}</small> : null}
                    </span>
                    {record.timestamp ? (
                      <span className="a-entity-pulse__time">
                        <ClockIcon size={14} />
                        {record.timestamp}
                      </span>
                    ) : null}
                    {record.href ? <ChevronRightIcon size={16} /> : null}
                  </>
                );
                return record.href ? (
                  <a
                    className="a-entity-pulse__record"
                    key={record.key}
                    href={record.href}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="a-entity-pulse__record" key={record.key}>
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<HistoryIcon size={26} />}
              title={
                error ? message("entity.overview.recent.error") : message("entity.overview.recent.empty")
              }
              description={
                error
                  ? message("entity.overview.recent.errorDescription")
                  : message("entity.overview.recent.emptyDescription")
              }
            />
          )}
        </Panel>
        {favouritesPanel ?? (
          <EntityFavourites
            records={[]}
            loading={loading}
            browseHref={recentHref}
          />
        )}
      </div>
    </section>
  );
}
function Panel({
  title,
  description,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`a-entity-pulse__panel ${className}`}
      aria-label={title}
    >
      <div className="a-entity-pulse__panel-heading">
        <div>
          <h3>
            {icon}
            {title}
          </h3>
          <p>{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="a-entity-pulse__empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function overviewCount(
  page: EntityListResultV1,
  locale?: string,
): string | undefined {
  const { total, countMode, hasNext } = page.pagination;
  if (total !== undefined && countMode !== "none")
    return `${countMode === "approximate" ? "≈" : ""}${new Intl.NumberFormat(locale).format(total)}`;
  return !hasNext
    ? new Intl.NumberFormat(locale).format(page.rows.length)
    : undefined;
}
export function overviewListState(
  descriptor: EntityListDescriptorV1,
): ListLocationStateV1 {
  const updated = overviewUpdatedField(descriptor);
  return {
    ...descriptor.surface.defaultState,
    filters: [],
    query: undefined,
    standardViewKey: undefined,
    group: undefined,
    columns: [
      ...new Set([
        descriptor.entity.identityField,
        ...descriptor.fields
          .filter(
            (field) =>
              field.semanticRole === "title" || field.key === updated?.key,
          )
          .map((field) => field.key),
      ]),
    ],
    sort: updated
      ? [{ field: updated.key, direction: "desc" }]
      : descriptor.surface.defaultState.sort,
    pageSize: Math.min(...descriptor.limits.allowedPageSizes),
  };
}
function overviewUpdatedField(descriptor: EntityListDescriptorV1) {
  return descriptor.fields.find(
    (field) =>
      field.sortable &&
      field.valueKind === "datetime" &&
      (field.semanticRole === "updated_at" ||
        field.key === "updated_at" ||
        field.key === "updatedAt"),
  );
}
interface Snapshot {
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly page?: EntityListResultV1;
  readonly views: Readonly<Record<string, EntityListResultV1>>;
  readonly failed: boolean;
}

export function EntityOverviewRuntime({
  showSummary = false,
  client,
  application,
  scopeCoordinate,
}: {
  readonly showSummary?: boolean;
  readonly client: HttpClient;
  readonly application: EntityApplicationDescriptorV1;
  readonly scopeCoordinate?: EntityListScopeCoordinateV1;
}) {
  const locale = useOptionalI18n()?.localization.uiLocale;
  const message = useOverviewMessage();
  const sections = application.navigation ?? [];
  const collection =
    sections.find(
      (section) =>
        section.content?.kind === "entity_list" &&
        section.content.entityCode === application.entity.code,
    ) ?? sections.find((section) => section.content?.kind === "entity_list");
  const entityCode = collection?.content?.entityCode;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const scopeKey = JSON.stringify(scopeCoordinate ?? {});
  const authorityKey = `${entityCode}:${scopeKey}:${application.revision.descriptorHash}:${application.scope.fingerprint}`;
  const [loadedKey, setLoadedKey] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(undefined);
    setLoadedKey(undefined);
    setError(false);
    setLoading(true);
    if (!entityCode || application.scope.status !== "ready") {
      setLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      try {
        const descriptor = await client.request(entityListDescriptorOperation, {
          params: { entityCode },
          query: entityListScopeQuery(scopeCoordinate),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (descriptor.scope.status !== "ready")
          throw new Error("Scope required");
        const state = overviewListState(descriptor);
        const views = showSummary
          ? (descriptor.standardViews ?? []).slice(0, 3)
          : [];
        const requests = [undefined, ...views.map((view) => view.key)].map(
          (standardViewKey) =>
            client
              .request(entityListOperation, {
                params: { entityCode },
                query: {
                  ...entityListQuery(
                    { ...state, standardViewKey },
                    descriptor,
                    scopeCoordinate,
                  ),
                  ...(!showSummary ? { countMode: "none" } : {}),
                },
                signal: controller.signal,
              })
              .then((page) => {
                if (
                  page.descriptorHash !== descriptor.revision.descriptorHash ||
                  page.scopeFingerprint !== descriptor.scope.fingerprint
                )
                  throw new Error("Scope changed");
                return page;
              }),
        );
        const results = await Promise.allSettled(requests);
        if (controller.signal.aborted) return;
        const pages: Record<string, EntityListResultV1> = {};
        results.slice(1).forEach((result, index) => {
          if (result.status === "fulfilled")
            pages[views[index]!.key] = result.value;
        });
        const first = results[0]!;
        setSnapshot({
          descriptor,
          state,
          page: first.status === "fulfilled" ? first.value : undefined,
          views: pages,
          failed: results.some((result) => result.status === "rejected"),
        });
        setLoadedKey(authorityKey);
        setError(results.some((result) => result.status === "rejected"));
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [client, authorityKey, application.scope.status, attempt, showSummary]);
  const data = loadedKey === authorityKey ? snapshot : undefined;
  const pending =
    loading ||
    (!!entityCode &&
      !error &&
      loadedKey !== authorityKey &&
      application.scope.status === "ready");
  const label = (item: { label: Parameters<typeof resolveEntityText>[0] }) =>
    resolveEntityText(item.label, locale);
  const href = (standardViewKey?: string) => {
    if (!collection) return "";
    if (!data) return collection.href;
    const query = encodeListLocationState(
      { ...data.state, pageSize: undefined, standardViewKey },
      data.descriptor,
      { includeViewIds: false },
    );
    // Explicitly use the system view so personal defaults cannot change the metric destination.
    query.set("vid", "system");
    return `${collection.href}?${query}`;
  };
  const metrics: OverviewMetric[] = collection
    ? [
        {
          key: "all",
          label: "All records",
          href: href(),
          value: data?.page ? overviewCount(data.page, locale) : undefined,
          loading: pending,
          description:
            data?.page?.pagination.countMode === "cached"
              ? "Recently calculated count"
              : data?.page && overviewCount(data.page, locale) === undefined
                ? "Count unavailable · explore records"
                : "Across your current scope",
        },
        ...(data?.descriptor.standardViews ?? []).slice(0, 3).map((view) => ({
          key: view.key,
          label: label(view),
          href: href(view.key),
          value: data?.views[view.key]
            ? overviewCount(data.views[view.key]!, locale)
            : undefined,
          description:
            data?.views[view.key]?.pagination.countMode === "cached"
              ? "Recently calculated count"
              : "Open view",
        })),
      ]
    : [];
  const focus: OverviewFocus[] = sections
    .filter(
      (section) =>
        section.content?.kind !== "overview" &&
        (section.content?.kind === "task_list" ||
          section.attentionCount !== undefined),
    )
    .map((section) => ({
      key: section.key,
      label: label(section),
      href: section.href,
      count: section.attentionCount,
    }));
  const shortcuts: OverviewLink[] = [
    ...(collection
      ? [
          {
            key: collection.key,
            label: label(collection),
            href: href(),
            description: message("entity.overview.searchRecords"),
          },
        ]
      : []),
    ...(data?.descriptor.standardViews ?? []).slice(0, 3).map((view) => ({
      key: view.key,
      label: label(view),
      href: href(view.key),
      description: message("entity.overview.openView"),
    })),
  ];
  const updated = data ? overviewUpdatedField(data.descriptor) : undefined;
  const records: OverviewRecord[] = (data?.page?.rows ?? [])
    .slice(0, 5)
    .map((row) => {
      const titleField = data!.descriptor.fields.find(
        (field) => field.semanticRole === "title",
      );
      const identity = row.values[data!.descriptor.entity.identityField];
      const title = titleField ? row.values[titleField.key] : undefined;
      const raw = updated ? row.values[updated.key] : undefined;
      const instant = typeof raw === "string" ? parseInstant(raw) : NaN;
      return {
        key: row.id,
        label: String(title ?? identity ?? row.id),
        detail:
          title && identity && title !== identity
            ? String(identity)
            : undefined,
        href: data!.descriptor.entity.detailRouteTemplate?.replace(
          ":recordId",
          encodeURIComponent(row.id),
        ),
        timestamp: Number.isFinite(instant)
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(instant)
          : undefined,
      };
    });
  return (
    <EntityOverview
      showSummary={showSummary}
      metrics={metrics}
      focus={focus}
      shortcuts={shortcuts}
      records={records}
      favouritesPanel={
        data && entityCode && collection ? (
          <EntityFavouritesRuntime
            key={authorityKey}
            client={client}
            entityCode={entityCode}
            scopeCoordinate={scopeCoordinate}
            detailRouteTemplate={data.descriptor.entity.detailRouteTemplate}
            browseHref={href()}
            refreshKey={attempt}
          />
        ) : undefined
      }
      recentTitle={updated ? undefined : message("entity.overview.recent.preview")}
      recentHref={collection ? href() : undefined}
      scopeLabel={application.scope.labels
        .map((item) => item.value)
        .join(" · ")}
      loading={pending}
      error={
        error
          ? "Some overview data couldn’t be loaded. You can still open your available views."
          : undefined
      }
      onRefresh={() => setAttempt((value) => value + 1)}
    />
  );
}
