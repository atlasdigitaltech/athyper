import { RelatedRecord } from "@athyper/platform-entity-form-detail";
import { RelatedSection } from "./related-section";
import { businessLabel, countryName } from "../display-values";
import { useRecordFooterSources } from "@athyper/platform-shell";
import { parseInstant } from "@athyper/platform-temporal";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useState } from "react";
import {
  createBusinessPartner360SectionClient,
  sectionQueryKey,
  type CommonSection as Section,
  type CommonSectionCode,
  type CommonSectionItem,
} from "../business-partner-360-section-client";
import { useBusinessPartner360 } from "../business-partner-360-context";
export function CommonSection({ code }: { readonly code: CommonSectionCode }) {
  return code === "contacts" || code === "addresses" ? (
    <RelatedSection code={code} />
  ) : (
    <LegacyCommonSection code={code} />
  );
}
function LegacyCommonSection({ code }: { readonly code: CommonSectionCode }) {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360(),
    client = useMemo(() => createBusinessPartner360SectionClient(http), [http]),
    [section, setSection] = useState<Section>(),
    [error, setError] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [loading, setLoading] = useState(true);
  const query = {
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
    key = sectionQueryKey(query).join(":");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    client
      .read(query, controller.signal)
      .then((value) =>
        setSection((current) =>
          cursor && current
            ? {
                ...value,
                data: {
                  ...value.data,
                  items: [...current.data.items, ...value.data.items],
                },
              }
            : value,
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, key]);
  useRecordFooterSources(
    !loading && !error && section?.sectionCode === code
      ? section.provenance
      : [],
  );
  if (loading && !section) return <Skeleton className="bp360-shell-skeleton" />;
  if (error && !section)
    return (
      <Card className="bp360-section-state">
        <h2>Section unavailable</h2>
        <p>The identity header and other sections remain available.</p>
      </Card>
    );
  if (!section || !section.data.items.length)
    return (
      <Card className="bp360-section-state">
        <h2>No records</h2>
        <p>
          No current records are available for this section and effective date.
        </p>
      </Card>
    );
  return (
    <div className="bp360-section-list">
      {[...section.data.items]
        .sort(
          (left, right) =>
            Number(right.kind === "canonical") -
            Number(left.kind === "canonical"),
        )
        .map((item) =>
          item.kind === "external_reference" ? (
            <Card
              key={`external_reference:${item.id}`}
              className="bp360-section-card"
            >
              {summary.recordHeader?.related?.find(
                (p) => p.source === "external-reference.v1",
              ) ? (
                <RelatedRecord
                  profile={summary.recordHeader.related.find(
                    (p) => p.source === "external-reference.v1",
                  )!}
                  values={{ ...item }}
                  restrictedFields={section.redactions.map((r) => r.fieldCode)}
                  hideScope
                />
              ) : (
                <p>
                  Presentation unavailable. Refresh after the record definition
                  is published.
                </p>
              )}
            </Card>
          ) : (
            <ItemCard
              key={`${item.kind ?? code}:${item.id}`}
              item={item}
              section={code}
              client={client}
              businessPartnerId={summary.identity.id}
            />
          ),
        )}
      {section.data.nextCursor ? (
        <button
          disabled={loading}
          onClick={() => setCursor(section.data.nextCursor)}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
export function ItemCard({
  item,
  section,
  client,
  businessPartnerId,
}: {
  item: CommonSectionItem;
  section: CommonSectionCode;
  client: ReturnType<typeof createBusinessPartner360SectionClient>;
  businessPartnerId: string;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const entries = fields(item, section);
  const hasValue = (value: unknown) =>
    value !== undefined && value !== null && value !== "";
  const emptyCount = entries.filter(([, value]) => !hasValue(value)).length;
  const [reveal, setReveal] = useState(false),
    [value, setValue] = useState<string>(),
    [failed, setFailed] = useState(false);
  useEffect(() => () => setValue(undefined), []);
  async function runReveal() {
    setFailed(false);
    const controller = new AbortController();
    try {
      const result = await client.revealTax(
        businessPartnerId,
        item.id,
        "business_verification",
        controller.signal,
      );
      setValue(result.value);
      const delay = Math.max(0, parseInstant(result.expiresAt) - Date.now());
      window.setTimeout(() => setValue(undefined), delay);
    } catch {
      setFailed(true);
    }
  }
  return (
    <Card className="bp360-section-card">
      <h2>{title(item, section)}</h2>
      <dl>
        {entries
          .filter(([, value]) => showEmpty || hasValue(value))
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{display(value)}</dd>
            </div>
          ))}
      </dl>
      {emptyCount ? (
        <button
          type="button"
          className="bp360-empty-toggle"
          onClick={() => setShowEmpty((value) => !value)}
        >
          {showEmpty ? "Hide" : "Show"} {emptyCount} missing{" "}
          {emptyCount === 1 ? "field" : "fields"}
        </button>
      ) : null}
      {item.industryCodeId ? (
        <details>
          <summary>Technical details</summary>
          <p>Classification ID: {item.industryCodeId}</p>
        </details>
      ) : null}
      {item.kind === "tax" && item.revealable ? (
        <div>
          {!reveal ? (
            <button onClick={() => setReveal(true)}>
              Reveal for approved purpose
            </button>
          ) : (
            <>
              <button onClick={() => void runReveal()}>
                Confirm audited reveal
              </button>
              <button
                onClick={() => {
                  setReveal(false);
                  setValue(undefined);
                }}
              >
                Close
              </button>
              {value ? (
                <p className="bp360-restricted-value" aria-live="polite">
                  {value}
                </p>
              ) : null}
              {failed ? (
                <p role="alert">The restricted value could not be revealed.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
function title(item: CommonSectionItem, section: CommonSectionCode) {
  if (section === "identity") {
    if (item.kind === "classification") return "Industry classification";
  }
  return (
    item.displayName ??
    item.formattedAddress ??
    item.registrationTypeCode ??
    item.memberName ??
    item.schemeCode ??
    item.externalCode ??
    item.code ??
    section
  );
}
function fields(
  item: CommonSectionItem,
  section: CommonSectionCode,
): readonly (readonly [string, unknown])[] {
  if (section === "identity")
    if (item.kind === "classification")
      return [
        ["Classification system", businessLabel(item.industryDomainCode)],
        ["Industry", item.industryName],
        ["Industry code", item.industryCode],
        ["Assignment", businessLabel(item.assignmentKind)],
        ["Primary", item.primary],
        ["Verified", item.verified],
        ["Effective from", item.effectiveFrom],
        ["Effective until", item.effectiveUntil],
      ];
    else
      return [
        ["Code", item.code],
        ["Legal name", item.legalName],
        ["Aliases", item.aliases?.join(", ")],
        ["Lifecycle", businessLabel(item.lifecycleStatus)],
        ["Ownership", businessLabel(item.ownershipClass)],
        ["Legal form", businessLabel(item.legalForm)],
        ["Country", countryName(item.registrationCountryCode)],
        ["Incorporation date", item.incorporationDate],
        ["Website", item.websiteUrl],
      ];
  if (section === "governance")
    return [
      ["Role", businessLabel(item.relationTypeCode)],
      ["Member", item.memberName],
      ["Member type", businessLabel(item.memberType)],
      ["Business title", item.businessTitle],
      ["Country", countryName(item.memberCountryCode)],
      ["Ownership", percentage(item.ownershipPercent)],
      ["Voting rights", percentage(item.votingPercent)],
      ["Beneficial ownership", percentage(item.beneficialOwnershipPercent)],
      ["Appointed", item.appointedDate],
      ["End of term", item.endOfTerm],
      ["Status", businessLabel(item.status)],
    ];
  return [
    ["Type", item.kind],
    ["Scheme", item.schemeCode ?? item.registrationTypeCode],
    ["Jurisdiction", item.jurisdictionCode ?? item.issuingCountryCode],
    ["Issuing authority", item.issuingAuthority],
    ["Value", item.maskedValue ?? item.externalId],
    ["Primary", item.primary],
    ["Verified", item.verified],
    ["Effective from", item.effectiveFrom],
    ["Effective until", item.effectiveUntil],
  ];
}
function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function percentage(value: number | undefined) {
  return value === undefined ? undefined : `${value}%`;
}
