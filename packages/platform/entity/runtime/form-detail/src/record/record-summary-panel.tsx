"use client";
import { useState, useEffect } from "react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import {
  entityRuntimeClient,
  type EntityRuntimeResourceContext,
} from "@athyper/platform-entity-descriptor-client";
import type { EntityRuntimeHeaderNavigation } from "../entity-runtime-workspace";
import { summaryRenderers } from "../registered-renderers";
import { Fields as MetadataFields } from "../section-primitives";
type Props = {
  summaryView: NonNullable<EntityRuntimeHeaderNavigation["summaryView"]>;
  entityCode: string;
  recordId: string;
  resourceContext?: EntityRuntimeResourceContext;
};
export function RecordSummaryPanel(props: Props) {
  const identity = useSessionIdentity();
  return (
    <SummaryResource
      key={JSON.stringify([
        identity.scope,
        props.entityCode,
        props.recordId,
        props.resourceContext,
        props.summaryView,
      ])}
      {...props}
    />
  );
}
function SummaryResource({
  summaryView,
  entityCode,
  recordId,
  resourceContext,
}: Props) {
  const intl = useEntityI18n();
  const [retry, setRetry] = useState(0);
  const http = useApiClient();
  const [state, setState] = useState<{
    loading: boolean;
    cards?: readonly Readonly<{
      readonly key: string;
      readonly state: string;
      readonly data?: unknown;
    }>[];
    error?: string;
  }>({ loading: true });
  useEffect(() => {
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
              "summary.unavailable",
          }),
      );
    return () => controller.abort();
  }, [entityCode, recordId, http, summaryView, resourceContext, retry]);
  return (
    <>
      <aside
        className="a-entity-record-summary-view"
        aria-label={intl.message("summary.title")}
      >
        {summaryView.cards.map((card) => {
          const result = state.cards?.find((item) => item.key === card.key);
          if (state.cards && !result) return null;
          return (
            <section key={card.key}>
              <h2>{intl.text(card.label)}</h2>
              {state.loading && !result ? (
                <p role="status">{intl.message("summary.loading")}</p>
              ) : result?.state === "empty" ? (
                <p>{intl.message("summary.empty")}</p>
              ) : result?.state === "context_required" ? (
                <p>{intl.message("summary.context")}</p>
              ) : result?.state === "unavailable" ? (
                <p>{intl.message("summary.unavailable")}</p>
              ) : result?.data ? (
                <SummaryData
                  value={result.data}
                  rendererKey={card.rendererKey}
                />
              ) : state.error ? (
                <p role="alert">{intl.message(state.error)}</p>
              ) : (
                <p>{intl.message("summary.unavailable")}</p>
              )}
            </section>
          );
        })}
        {state.error ||
        state.cards?.some((card) => card.state === "unavailable") ? (
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {intl.message("entity.retry")}
          </button>
        ) : null}
      </aside>
    </>
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
