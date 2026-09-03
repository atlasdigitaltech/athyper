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
        <ChangeLink id={summary.identity.id} section={code} />
      </Card>
    );
  return (
    <div className="bp360-section-list">
      <div className="bp360-section-toolbar">
        <ChangeLink id={summary.identity.id} section={code} />
        {section.provenance[0] ? (
          <small>
            Source: {section.provenance[0].sourceObject} · observed{" "}
            {new Date(section.provenance[0].observedAt).toLocaleString()}
          </small>
        ) : null}
      </div>
      {section.data.items.map((item) => (
        <ItemCard
          key={`${item.kind ?? code}:${item.id}`}
          item={item}
          section={code}
          client={client}
          businessPartnerId={summary.identity.id}
        />
      ))}
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
function ChangeLink({ id, section }: { id: string; section: string }) {
  return (
    <a
      href={`/mdg/business-partner/requests?targetBusinessPartnerId=${encodeURIComponent(id)}&requestKind=amend_partner&section=${encodeURIComponent(section)}`}
    >
      Propose change
    </a>
  );
}
function ItemCard({
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
      const delay = Math.max(0, Date.parse(result.expiresAt) - Date.now());
      window.setTimeout(() => setValue(undefined), delay);
    } catch {
      setFailed(true);
    }
  }
  return (
    <Card className="bp360-section-card">
      <h2>{title(item, section)}</h2>
      <dl>
        {fields(item, section).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{display(value)}</dd>
          </div>
        ))}
      </dl>
      {item.channels?.length ? (
        <ul>
          {item.channels.map((channel, index) => (
            <li key={String(channel["id"] ?? index)}>
              {display(channel["type"])} · {display(channel["value"])} ·{" "}
              {channel["verified"] ? "verified" : "unverified"}
            </li>
          ))}
        </ul>
      ) : null}
      {item.events?.length ? (
        <ul>
          {item.events.map((event, index) => (
            <li key={String(event["id"] ?? index)}>
              {display(event["eventType"])} · {display(event["occurredAt"])}
            </li>
          ))}
        </ul>
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
    return [
      ["Code", item.code],
      ["Legal name", item.legalName],
      ["Aliases", item.aliases?.join(", ")],
      ["Lifecycle", item.lifecycleStatus],
      ["Ownership", item.ownershipClass],
      ["Legal form", item.legalForm],
      ["Country", item.registrationCountryCode],
      [
        "Industry",
        item.industryDomainCode && item.industryCodeId
          ? `${item.industryDomainCode}: ${item.industryCodeId}`
          : undefined,
      ],
      ["External system", item.sourceSystemCode],
      ["External ID", item.externalId],
    ];
  if (section === "contacts")
    return [
      ["Title", item.businessTitle],
      ["Department", item.departmentName],
      ["Primary", item.primary],
      ["Effective from", item.effectiveFrom],
      ["Effective until", item.effectiveUntil],
    ];
  if (section === "addresses")
    return [
      ["Purpose", item.purpose],
      ["Address", item.lines?.join(", ")],
      ["Locality", item.locality],
      ["Region", item.region],
      ["Postal code", item.postalCode],
      ["Country", item.countryCode],
      ["Primary", item.primary],
      ["Validation", item.validationStatus],
      ["Effective from", item.effectiveFrom],
      ["Effective until", item.effectiveUntil],
    ];
  if (section === "governance")
    return [
      ["Role", item.relationTypeCode],
      ["Member", item.memberName],
      ["Member type", item.memberType],
      ["Business title", item.businessTitle],
      ["Country", item.memberCountryCode],
      ["Ownership", percentage(item.ownershipPercent)],
      ["Voting rights", percentage(item.votingPercent)],
      ["Beneficial ownership", percentage(item.beneficialOwnershipPercent)],
      ["Appointed", item.appointedDate],
      ["End of term", item.endOfTerm],
      ["Status", item.status],
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
