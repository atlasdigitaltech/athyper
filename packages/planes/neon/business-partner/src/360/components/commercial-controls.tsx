import { Banking } from "../../banking/bank-accounts";
import { Notice, Field, rows, record, show } from "../../banking/presentation";
import { CrosswalkEvidence } from "./crosswalk-evidence";
import { businessLabel, safeDocumentUrl } from "../display-values";
import { parseInstant } from "@athyper/platform-temporal";
import { useRecordFooterSources } from "@athyper/platform-shell";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useState } from "react";
import {
  commercialQueryKey,
  createBusinessPartner360CommercialClient,
  type CommercialSection,
  type CommercialSectionCode,
} from "@athyper/product-neon-entity-extensions/business-partner/clients/business-partner-360-commercial-client";
import { useBusinessPartner360 } from "../business-partner-360-context";
export function BankingSection() {
  return <Commercial code="banking" />;
}
export function SupplierControlsSection() {
  return <Commercial code="qualifications-certificates" />;
}
export function CreditReviewSection() {
  return <Commercial code="credit" />;
}
function Commercial({ code }: { code: CommercialSectionCode }) {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360(),
    client = useMemo(
      () => createBusinessPartner360CommercialClient(http),
      [http],
    ),
    [value, setValue] = useState<CommercialSection>(),
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
      ...(new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      ).has("asOf")
        ? { asOf: summary.asOf }
        : {}),
    },
    key = commercialQueryKey(query).join(":");
  useEffect(() => {
    const controller = new AbortController();
    setValue(undefined);
    setFailed(false);
    client
      .read(query, controller.signal)
      .then(setValue)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [client, key]);
  useRecordFooterSources(!failed && value ? value.provenance : []);
  if (failed)
    return (
      <Card className="bp360-section-card">
        <h2>Commercial controls unavailable</h2>
        <p>Other Business Partner sections remain available.</p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const data = value.data;
  if (data["scopeState"] === "missing_scope")
    return (
      <Card className="bp360-section-card">
        <h2>Select organization and company</h2>
        <p>Commercial controls require an explicit authorized scope.</p>
      </Card>
    );
  return code === "banking" ? (
    <Banking
      revealScope={summary.scope}
      sharedFactsOnly
      data={data}
      client={client}
      businessPartnerId={summary.identity.id}
    />
  ) : code === "credit" ? (
    <Credit data={data} />
  ) : (
    <SupplierControls data={data} asOf={summary.asOf} />
  );
}
export function SupplierControls({
  data,
  asOf = new Date().toISOString().slice(0, 10),
}: {
  asOf?: string;
  data: Readonly<Record<string, unknown>>;
}) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      <CertificateCards
        items={rows(data["certifications"])}
        asOf={asOf}
        readOnly={data["readOnly"] === true}
      />
      <Cards
        title="Commodity capabilities"
        items={rows(data["commodityCapabilities"])}
        fields={[
          "categoryCode",
          "categoryName",
          "commodityCodes",
          "partnerRole",
          "status",
          "effectiveFrom",
          "effectiveUntil",
          "notes",
        ]}
      />
      <Cards
        title="Qualifications"
        items={rows(data["qualifications"])}
        fields={[
          "typeCode",
          "partnerRole",
          "decision",
          "commodityCapabilities",
          "effectiveFrom",
          "effectiveUntil",
          "nextReviewAt",
        ]}
      />
      <Cards
        title="Preference designations"
        items={rows(data["preferences"])}
        fields={[
          "status",
          "rationale",
          "commodityCategoryIds",
          "effectiveFrom",
          "effectiveUntil",
        ]}
      />
      <Cards
        title="Operational blocks"
        items={rows(data["blocks"])}
        fields={[
          "roleScope",
          "operationCode",
          "reasonCode",
          "reason",
          "status",
          "effectiveFrom",
          "effectiveUntil",
        ]}
      />
      {data["scopeState"] === "global" ? (
        <p className="bp360-note">
          Showing partner certificates. Select organization and company in
          Overview for scoped qualifications and controls.
        </p>
      ) : null}
    </div>
  );
}
function Credit({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      <Cards
        title="Current approved limit"
        items={
          record(data["currentLimit"]) ? [record(data["currentLimit"])!] : []
        }
        fields={[
          "amount",
          "currencyCode",
          "decision",
          "effectiveFrom",
          "effectiveUntil",
          "creditReviewId",
        ]}
      />
      <Cards
        title="Credit review"
        items={rows(data["reviews"])}
        fields={[
          "reviewTypeCode",
          "requestedCreditLimit",
          "requestedCurrencyCode",
          "approvedCreditLimit",
          "approvedCurrencyCode",
          "decision",
          "decisionReason",
          "effectiveFrom",
          "effectiveUntil",
          "reviewedAt",
        ]}
      />
      {!data["readOnly"] ? (
        <Card className="bp360-section-card">
          <a href={String(data["createHref"])}>Start credit review</a>
        </Card>
      ) : null}
    </div>
  );
}
export function certificateValidity(
  item: Readonly<Record<string, unknown>>,
  asOf: string,
) {
  const until =
    typeof item.effectiveUntil === "string"
      ? item.effectiveUntil.slice(0, 10)
      : undefined;
  const from =
    typeof item.effectiveFrom === "string"
      ? item.effectiveFrom.slice(0, 10)
      : undefined;
  if (until && until <= asOf.slice(0, 10)) return "Expired";
  if (from && from > asOf.slice(0, 10)) return "Not yet valid";
  if (
    until &&
    parseInstant(`${until}T00:00:00Z`) -
      parseInstant(`${asOf.slice(0, 10)}T00:00:00Z`) <=
      30 * 86400000
  )
    return "Expiring soon";
  return until ? "Within validity period" : "Validity not specified";
}
function CertificateCards({
  items,
  asOf,
  readOnly,
}: {
  items: readonly Readonly<Record<string, unknown>>[];
  asOf: string;
  readOnly: boolean;
}) {
  return (
    <Card className="bp360-section-card">
      <h2>Certificates</h2>
      {!items.length ? (
        <p>No certificates available in this scope.</p>
      ) : (
        <div className="bp360-certificate-grid">
          {items.map((item, index) => (
            <article
              className="bp360-certificate"
              key={String(item.id ?? index)}
            >
              <span className="bp360-document-icon" aria-hidden="true">
                ▤
              </span>
              <h3>{show(item.name)}</h3>
              <p className="bp360-certificate-status">
                {certificateValidity(item, asOf)} ·{" "}
                {businessLabel(String(item.status ?? "Not verified"))}
              </p>
              <dl>
                <Field
                  label="Certificate number"
                  value={item.certificateNumber}
                />
                <Field label="Issuer" value={item.issuingBody} />
                <Field label="Valid from" value={item.effectiveFrom} />
                <Field label="Valid until" value={item.effectiveUntil} />
              </dl>
              {record(item.attachment) ? (
                <>
                  <p>{show(record(item.attachment)!.fileName)}</p>
                  <AuthorizedAttachment
                    attachment={record(item.attachment)!}
                    label="View certificate"
                  />
                </>
              ) : (
                <p>Certificate document not available</p>
              )}
              {item.manageHref && !readOnly ? (
                <a href={String(item.manageHref)}>Open certificate record</a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function Cards({
  title,
  items,
  fields,
}: {
  title: string;
  items: readonly Readonly<Record<string, unknown>>[];
  fields: readonly string[];
}) {
  if (
    !items.length &&
    ["Preference designations", "Operational blocks"].includes(title)
  )
    return null;
  return (
    <Card className="bp360-section-card">
      <h2>{title}</h2>
      {items.length ? (
        items.map((item, index) => (
          <div key={String(item["id"] ?? index)}>
            <dl>
              {fields.map((field) => (
                <Field key={field} label={label(field)} value={item[field]} />
              ))}
            </dl>
            {rows(item["commodityCodes"]).map((code, index) => <CrosswalkEvidence key={index} items={code["crosswalks"]} />)}
            {record(item["attachment"]) ? (
              <AuthorizedAttachment attachment={record(item["attachment"])!} />
            ) : null}
            {item["manageHref"] ? (
              <p>
                <a href={String(item["manageHref"])}>Open governing record</a>
              </p>
            ) : null}
          </div>
        ))
      ) : (
        <p>No effective records in this scope.</p>
      )}
    </Card>
  );
}
export function AuthorizedAttachment({
  attachment,
  label = "View document",
}: {
  label?: string;
  attachment: Readonly<Record<string, unknown>>;
}) {
  const http = useApiClient(),
    client = useMemo(
      () => createBusinessPartner360CommercialClient(http),
      [http],
    ),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(false),
    [url, setUrl] = useState<string>(),
    [expiresAt, setExpiresAt] = useState<string>();
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => setUrl(undefined),
      Math.max(0, parseInstant(expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return (
    <div className="bp360-document-action">
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          setLoading(true);
          setUrl(undefined);
          void client
            .downloadAttachment(String(attachment["attachmentId"]))
            .then((result) => {
              const next = safeDocumentUrl(result.url);
              if (!next) throw new Error("Invalid document URL");
              setUrl(next);
              setExpiresAt(result.expiresAt);
            })
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
        }}
        disabled={loading}
      >
        {loading ? "Preparing document…" : label}
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open document in new tab
        </a>
      ) : null}
      {failed ? (
        <span role="alert">
          {" "}
          The attachment is unavailable or the link expired.
        </span>
      ) : null}
    </div>
  );
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
