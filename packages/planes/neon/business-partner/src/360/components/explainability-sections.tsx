import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useState } from "react";
import {
  createBusinessPartner360ExplainabilityClient,
  explainabilityQueryKey,
  type ExplainabilitySection,
  type ExplainabilitySectionCode,
} from "../business-partner-360-explainability-client";
import { useBusinessPartner360 } from "../business-partner-360-context";
export function RequestsSection() {
  return <Section code="requests" />;
}
export function GovernanceActivitySection() {
  return <Section code="activity" />;
}
export function BusinessActivitySection() {
  return <Section code="business-activity" />;
}
function Section({ code }: { code: ExplainabilitySectionCode }) {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360(),
    client = useMemo(
      () => createBusinessPartner360ExplainabilityClient(http),
      [http],
    ),
    [value, setValue] = useState<ExplainabilitySection>(),
    [cursor, setCursor] = useState<string>(),
    [failed, setFailed] = useState(false),
    query = {
      tenantId: identity.scope?.tenantId ?? "unbound",
      principalId: identity.scope?.principalId ?? "unbound",
      businessPartnerId: summary.identity.id,
      sectionCode: code,
      roleLens,
      authEpoch: identity.scope?.authEpoch ?? 0,
      ...(summary.scope.operatingOrganizationId
        ? { operatingOrganizationId: summary.scope.operatingOrganizationId }
        : {}),
      ...(summary.scope.companyCodeId
        ? { companyCodeId: summary.scope.companyCodeId }
        : {}),
      ...(summary.scope.legalEntityId
        ? { legalEntityId: summary.scope.legalEntityId }
        : {}),
      asOf: summary.asOf,
      ...(cursor ? { cursor } : {}),
    },
    key = explainabilityQueryKey(query).join(":");
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    client
      .read(query, controller.signal)
      .then((next) =>
        setValue((current) =>
          cursor && current ? merge(current, next) : next,
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [client, key]);
  if (failed && !value)
    return (
      <Card>
        <h2>Section unavailable</h2>
        <p>Other Business Partner sections remain available.</p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const next =
    typeof value.data["nextCursor"] === "string"
      ? value.data["nextCursor"]
      : undefined;
  return (
    <div className="bp360-section-list">
      {code === "requests" ? (
        <Requests data={value.data} />
      ) : code === "activity" ? (
        <Activity data={value.data} />
      ) : (
        <Business data={value.data} />
      )}{" "}
      {next ? <button onClick={() => setCursor(next)}>Load more</button> : null}
    </div>
  );
}
function Requests({ data }: { data: Readonly<Record<string, unknown>> }) {
  const summary = record(data["openWork"]);
  return (
    <>
      <Card>
        <h2>Open work</h2>
        <p>
          {show(summary?.["active"])} active ·{" "}
          {show(summary?.["pendingApproval"])} pending approval ·{" "}
          {show(summary?.["returned"])} returned · {show(summary?.["failed"])}{" "}
          failed
        </p>
      </Card>
      {rows(data["items"]).map((item) => (
        <Card key={String(item["id"])}>
          <h2>
            {show(item["requestNo"])} · {show(item["status"])}
          </h2>
          <dl>
            <Field label="Kind" value={item["requestKind"]} />
            <Field label="Role" value={item["requestedRole"]} />
            <Field label="Source" value={item["sourceKind"]} />
            <Field label="Created" value={item["createdAt"]} />
            <Field label="Submitted" value={item["submittedAt"]} />
            <Field label="Approved" value={item["approvedAt"]} />
            <Field label="Applied" value={item["appliedAt"]} />
            <Field label="Result" value={item["applicationResultKind"]} />
          </dl>
          <p>
            {rows(item["evidence"]).length} evidence manifest entries ·{" "}
            {rows(item["materialization"]).length} materialized records
          </p>
          <a href={String(item["href"])}>Open governed request</a>
        </Card>
      ))}
    </>
  );
}
function Activity({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <>
      {rows(data["items"]).map((item) => (
        <Card key={String(item["id"])}>
          <h2>{show(item["title"])}</h2>
          <p>
            {show(item["occurredAt"])} · {show(item["sourceService"])} ·{" "}
            {show(item["outcome"])}
          </p>
          <dl>
            <Field label="Actor" value={item["actorId"]} />
            <Field label="Request" value={item["requestId"]} />
            <Field
              label="Changed fields"
              value={
                Array.isArray(item["changedFields"])
                  ? item["changedFields"].join(", ")
                  : undefined
              }
            />
          </dl>
          {item["evidenceHref"] ? (
            <a href={String(item["evidenceHref"])}>Open safe evidence</a>
          ) : null}
        </Card>
      ))}
    </>
  );
}
function Business({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <>
      {rows(data["providers"]).map((item) => (
        <Card key={String(item["provider"])}>
          <h2>{show(item["provider"])}</h2>
          <p>
            {show(item["state"])}
            {item["reasonCode"] ? ` · ${show(item["reasonCode"])}` : ""}
          </p>
          {rows(item["metrics"]).map((metric) => (
            <p key={String(metric["code"])}>
              {show(metric["label"])}: {show(metric["value"])}{" "}
              {show(metric["unit"] ?? "")}
            </p>
          ))}
          {item["href"] ? (
            <a href={String(item["href"])}>Open owning module</a>
          ) : null}
        </Card>
      ))}
    </>
  );
}
function merge(
  current: ExplainabilitySection,
  next: ExplainabilitySection,
): ExplainabilitySection {
  const existing = rows(current.data["items"]),
    incoming = rows(next.data["items"]);
  return { ...next, data: { ...next.data, items: [...existing, ...incoming] } };
}
function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{show(value)}</dd>
    </div>
  );
}
function rows(value: unknown) {
  return Array.isArray(value)
    ? (value.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      ) as readonly Readonly<Record<string, unknown>>[])
    : [];
}
function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
function show(value: unknown) {
  return value === undefined || value === null || value === ""
    ? "—"
    : String(value);
}
