"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Select } from "@athyper/platform-ui";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { useNeonWorkContext } from "@athyper/product-neon-shell";
import { useBusinessPartner360 } from "../business-partner-360-context";
import {
  useCompanyRelationships,
  relationshipCounts,
  rolesHref,
} from "../company-relationships";
import { createBusinessPartner360CommercialClient } from "../business-partner-360-commercial-client";
import { createBusinessPartner360ExplainabilityClient } from "../business-partner-360-explainability-client";
type Row = Readonly<Record<string, unknown>>;
const rows = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
export function RelationshipOverview() {
  const { summary, selectSection } = useBusinessPartner360(),
    relationships = useCompanyRelationships(),
    work = useNeonWorkContext(),
    http = useApiClient(),
    identity = useSessionIdentity();
  const bankClient = useMemo(
      () => createBusinessPartner360CommercialClient(http),
      [http],
    ),
    activityClient = useMemo(
      () => createBusinessPartner360ExplainabilityClient(http),
      [http],
    );
  const [company, setCompany] = useState(summary.scope.companyCodeId ?? "");
  const [bank, setBank] = useState<{ key: string; data: Row }>(),
    [activity, setActivity] = useState<{ key: string; data: Row }>();
  const companyOrganizations = [
    ...new Set(
      relationships.rows
        ?.filter((row) => row.companyCodeId === company)
        .map((row) => row.operatingOrganizationId)
        .filter(Boolean) ?? [],
    ),
  ];
  const organization =
    company &&
    company === summary.scope.companyCodeId &&
    summary.scope.operatingOrganizationId
      ? summary.scope.operatingOrganizationId
      : companyOrganizations.length === 1
        ? companyOrganizations[0]
        : undefined;
  const key = [
    summary.identity.id,
    identity.scope?.tenantId,
    identity.scope?.principalId,
    identity.scope?.authEpoch,
    company,
    organization,
    summary.asOf,
  ].join(":");
  const granted = (code: string) =>
    summary.sections.some(
      (s) => s.code === code && s.authorization === "granted",
    );
  useEffect(() => {
    if (!identity.scope) return;
    const controller = new AbortController();
    const query = {
      tenantId: identity.scope.tenantId,
      principalId: identity.scope.principalId,
      authEpoch: identity.scope.authEpoch,
      businessPartnerId: summary.identity.id,
      roleLens: "all" as const,
      ...(company ? { companyCodeId: company } : {}),
      ...(organization ? { operatingOrganizationId: organization } : {}),
      ...(summary.completeness.readOnly ? { asOf: summary.asOf } : {}),
    };
    if (granted("banking") && (!company || organization))
      void bankClient
        .read({ ...query, sectionCode: "banking" }, controller.signal)
        .then((v) => {
          if (!controller.signal.aborted) setBank({ key, data: v.data });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setBank({ key, data: { unavailable: true } });
        });
    if (granted("business-activity") && company && organization)
      void activityClient
        .read({ ...query, sectionCode: "business-activity" }, controller.signal)
        .then((v) => {
          if (!controller.signal.aborted) setActivity({ key, data: v.data });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setActivity({ key, data: { unavailable: true } });
        });
    return () => controller.abort();
  }, [bankClient, activityClient, key]);
  const visible = relationships.rows?.filter(
      (r) => !company || r.companyCodeId === company,
    ),
    counts = visible ? relationshipCounts(visible) : undefined;
  const accounts =
    bank?.key === key && !bank.data["unavailable"]
      ? rows(bank.data["accounts"])
      : undefined;
  const pending = accounts
    ? new Set(
        accounts.flatMap((a) =>
          rows(a["companyAssignments"])
            .filter(
              (u) =>
                (!company || u["companyCodeId"] === company) &&
                u["acceptanceCurrent"] === false,
            )
            .map(
              (u) =>
                u["assignmentId"] ??
                `${a["sourceAccountId"] ?? a["bankProjectionId"] ?? a["linkId"]}:${u["companyCodeId"]}:${u["purpose"]}`,
            ),
        ),
      ).size
    : undefined;
  const providers =
    activity?.key === key ? rows(activity.data["providers"]) : [];
  const setupDate = summary.asOf.slice(0, 10);
  const parsedSetupDate = new Date(`${setupDate}T00:00:00Z`);
  const setupDateLabel = Number.isNaN(parsedSetupDate.getTime())
    ? setupDate
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsedSetupDate);
  const href = rolesHref(
    summary.identity.id,
    company || undefined,
    company === summary.scope.companyCodeId
      ? summary.scope.operatingOrganizationId
      : undefined,
  );
  return (
    <>
      <Card className="bp360-section-card bp360-relationship-card">
        <div className="bp360-relationship-header">
          <h2>Relationship summary</h2>
          <label className="bp360-relationship-filter">
            <span className="bp360-relationship-filter-label">
              Company{" "}
              <small
                id="bp-summary-filter-hint"
                title="Filters this summary without changing transaction context."
              >
                Summary only
              </small>
            </span>
            <Select
              aria-label="Overview company"
              aria-describedby="bp-summary-filter-hint"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All authorized companies</option>
              {work.companies.map((c) => (
                <option key={c.companyCodeId} value={c.companyCodeId}>
                  {c.displayName}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {counts ? (
          <dl className="bp360-relationship-metrics">
            <div>
              <dt>Buying relationships</dt>
              <dd>
                {counts.buying}{" "}
                <span>{counts.buying === 1 ? "company" : "companies"}</span>
              </dd>
            </div>
            <div>
              <dt>Selling relationships</dt>
              <dd>
                {counts.selling}{" "}
                <span>{counts.selling === 1 ? "company" : "companies"}</span>
              </dd>
            </div>
            <div
              className={
                counts.gaps > 0
                  ? "bp360-relationship-metrics__attention"
                  : undefined
              }
            >
              <dt>Setup gaps</dt>
              <dd>
                {counts.gaps}
                {counts.gaps > 0 ? <span>Needs attention</span> : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p role="status" className="bp-context-note">
            {relationships.error
              ? "Company relationships unavailable"
              : relationships.allowed
                ? "Loading company relationships…"
                : "Company relationships are not available to you."}
          </p>
        )}
        {pending !== undefined && pending > 0 ? (
          <p>
            {pending} company account{" "}
            {pending === 1 ? "assignment requires" : "assignments require"}{" "}
            acceptance review
          </p>
        ) : null}
        <div className="bp360-relationship-footer">
          <p className="bp-context-note">
            Setup as of <time dateTime={setupDate}>{setupDateLabel}</time>
          </p>
          {relationships.allowed ? (
            <a className="bp360-secondary-link" href={href}>
              Manage roles &amp; scope
            </a>
          ) : null}
        </div>
      </Card>
      <Card className="bp360-section-card">
        <h2>Performance &amp; financials</h2>
        {providers.some((p) => p["state"] === "ready") ? (
          <details>
            <summary>Latest operational snapshots</summary>
            {providers
              .filter((p) => p["state"] === "ready")
              .map((p) => (
                <section key={String(p["provider"])}>
                  <h3>{String(p["provider"])}</h3>
                  <p>Observed {String(p["observedAt"])}</p>
                  {rows(p["metrics"]).map((m) => (
                    <p key={String(m["code"])}>
                      {String(m["label"])}: {String(m["value"])}{" "}
                      {String(m["unit"] ?? "")}
                    </p>
                  ))}
                </section>
              ))}
          </details>
        ) : (
          <p className="bp-context-note">
            No performance or financial data is available yet.
          </p>
        )}
        {granted("business-activity") ? (
          <button onClick={() => selectSection("business-activity")}>
            View business transactions
          </button>
        ) : null}
      </Card>
      <Card className="bp360-section-card">
        <h2>Risk assessment</h2>
        <p>
          Review the underlying evidence; missing evidence does not mean low
          risk.
        </p>
        <div className="bp-actions">
          {[
            ["qualifications-certificates", "Qualifications & compliance"],
            ["credit", "Credit exposure & review"],
            ["governance", "Governance evidence"],
          ]
            .filter(([code]) => granted(code!))
            .map(([code, label]) => (
              <button key={code} onClick={() => selectSection(code!)}>
                {label}
              </button>
            ))}
        </div>
        <p>
          Bank review:{" "}
          {pending === undefined
            ? "Unavailable"
            : `${pending} company assignments require acceptance review`}
        </p>
        {relationships.allowed ? (
          <a
            href={rolesHref(
              summary.identity.id,
              company || undefined,
              company === summary.scope.companyCodeId
                ? summary.scope.operatingOrganizationId
                : undefined,
              "banks",
            )}
          >
            Review company bank accounts
          </a>
        ) : null}
      </Card>
    </>
  );
}
