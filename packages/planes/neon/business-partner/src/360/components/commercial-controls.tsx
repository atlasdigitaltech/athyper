import { businessLabel, safeDocumentUrl } from "../display-values";
import { parseInstant } from "@athyper/platform-temporal";
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
} from "../business-partner-360-commercial-client";
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
export function Banking({
  data,
  client,
  businessPartnerId,
}: {
  data: Readonly<Record<string, unknown>>;
  client: ReturnType<typeof createBusinessPartner360CommercialClient>;
  businessPartnerId: string;
}) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      {rows(data["accounts"]).map((item) => (
        <BankCard
          key={String(item["linkId"])}
          item={item}
          client={client}
          businessPartnerId={businessPartnerId}
        />
      ))}
      {!rows(data["accounts"]).length ? (
        <Card className="bp360-section-card">
          <h2>No bank accounts</h2>
          <p>No effective masked bank links exist in this company scope.</p>
        </Card>
      ) : null}
      {!data["readOnly"] ? (
        <Card className="bp360-section-card">
          <a href={String(data["manageHref"])}>Manage banking</a> ·{" "}
          <a href={String(data["verifyHref"])}>Open bank verification</a>
        </Card>
      ) : null}
    </div>
  );
}
function BankCard({
  item,
  client,
  businessPartnerId,
}: {
  item: Readonly<Record<string, unknown>>;
  client: ReturnType<typeof createBusinessPartner360CommercialClient>;
  businessPartnerId: string;
}) {
  const [value, setValue] = useState<string>(),
    [confirm, setConfirm] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => () => setValue(undefined), []);
  async function run() {
    setFailed(false);
    try {
      const result = await client.revealBank(
        businessPartnerId,
        String(item["linkId"]),
        "payment_verification",
      );
      setValue(result.value);
      window.setTimeout(
        () => setValue(undefined),
        Math.max(0, parseInstant(result.expiresAt) - Date.now()),
      );
    } catch {
      setFailed(true);
    }
  }
  return (
    <Card className="bp360-section-card">
      <h2>
        {show(item["bankName"])} · {show(item["maskedAccount"])}
      </h2>
      <dl>
        <Field label="Holder" value={item["accountHolderName"]} />
        <Field label="Currency" value={item["currencyCode"]} />
        <Field
          label="Purpose"
          value={businessLabel(String(item["purpose"] ?? ""))}
        />
        <Field label="Primary" value={item["primary"]} />
        <Field label="Account status" value={item["accountStatus"]} />
        <Field
          label="Verification"
          value={
            record(item["verificationState"])?.["status"] ??
            (item["verified"] ? "verified" : "not verified")
          }
        />
        <Field label="Effective from" value={item["effectiveFrom"]} />
        <Field label="Effective until" value={item["effectiveUntil"]} />
      </dl>
      {item["revealable"] ? (
        confirm ? (
          <div>
            <button onClick={() => void run()}>Confirm audited reveal</button>
            <button
              onClick={() => {
                setConfirm(false);
                setValue(undefined);
              }}
            >
              Close
            </button>
            {value ? <p className="bp360-restricted-value">{value}</p> : null}
            {failed ? (
              <p role="alert">The restricted value could not be revealed.</p>
            ) : null}
          </div>
        ) : (
          <button onClick={() => setConfirm(true)}>
            Reveal for approved purpose
          </button>
        )
      ) : null}
    </Card>
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

function Notice({ data }: { data: Readonly<Record<string, unknown>> }) {
  return data["readOnly"] ? (
    <Card className="bp360-section-card">
      <strong>Historical read-only view</strong>
      <p>Owning-service actions are disabled for an explicit as-of date.</p>
    </Card>
  ) : null;
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
function Field({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
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
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value)
    ? value.map(showListItem).join(", ")
    : String(value);
}
function showListItem(value: unknown) {
  const item = record(value);
  if (!item) return String(value);
  if (item["domainCode"] && item["code"])
    return `${String(item["domainCode"]).toUpperCase()} ${String(item["code"])}${item["name"] ? ` — ${String(item["name"])}` : ""}`;
  if (item["categoryCode"])
    return `${String(item["categoryCode"])}${item["categoryName"] ? ` — ${String(item["categoryName"])}` : ""}`;
  return String(value);
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
