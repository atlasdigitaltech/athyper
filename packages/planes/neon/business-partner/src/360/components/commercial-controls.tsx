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
      asOf: summary.asOf,
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
      <Card>
        <h2>Commercial controls unavailable</h2>
        <p>Other Business Partner sections remain available.</p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const data = value.data;
  if (data["scopeState"] === "missing_scope")
    return (
      <Card>
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
    <SupplierControls data={data} />
  );
}
function Banking({
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
        <Card>
          <h2>No bank accounts</h2>
          <p>No effective masked bank links exist in this company scope.</p>
        </Card>
      ) : null}
      {!data["readOnly"] ? (
        <Card>
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
        Math.max(0, Date.parse(result.expiresAt) - Date.now()),
      );
    } catch {
      setFailed(true);
    }
  }
  return (
    <Card>
      <h2>
        {show(item["bankName"])} · {show(item["maskedAccount"])}
      </h2>
      <dl>
        <Field label="Holder" value={item["accountHolderName"]} />
        <Field label="Currency" value={item["currencyCode"]} />
        <Field label="Purpose" value={item["purpose"]} />
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
function SupplierControls({
  data,
}: {
  data: Readonly<Record<string, unknown>>;
}) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      <Cards
        title="Qualifications"
        items={rows(data["qualifications"])}
        fields={[
          "typeCode",
          "partnerRole",
          "decision",
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
          "commodityCategoryId",
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
      <Cards
        title="Certifications"
        items={rows(data["certifications"])}
        fields={[
          "name",
          "issuingBody",
          "certificateNumber",
          "status",
          "effectiveFrom",
          "effectiveUntil",
        ]}
      />
    </div>
  );
}
function Credit({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      <Cards
        title="Credit review"
        items={rows(data["reviews"])}
        fields={[
          "reviewTypeCode",
          "requestedCreditLimit",
          "currencyCode",
          "decision",
          "decisionReason",
          "effectiveFrom",
          "effectiveUntil",
          "reviewedAt",
        ]}
      />
      {!data["readOnly"] ? (
        <Card>
          <a href={String(data["createHref"])}>Start credit review</a>
        </Card>
      ) : null}
    </div>
  );
}
function Notice({ data }: { data: Readonly<Record<string, unknown>> }) {
  return data["readOnly"] ? (
    <Card>
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
  return (
    <Card>
      <h2>{title}</h2>
      {items.length ? (
        items.map((item, index) => (
          <div key={String(item["id"] ?? index)}>
            <dl>
              {fields.map((field) => (
                <Field key={field} label={label(field)} value={item[field]} />
              ))}
            </dl>
            {record(item["attachment"]) ? <AuthorizedAttachment attachment={record(item["attachment"])!} /> : null}
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
function AuthorizedAttachment({attachment}:{attachment:Readonly<Record<string,unknown>>}){const http=useApiClient(),client=useMemo(()=>createBusinessPartner360CommercialClient(http),[http]),[failed,setFailed]=useState(false);return <p><button type="button" onClick={()=>{setFailed(false);void client.downloadAttachment(String(attachment["attachmentId"])).then(result=>window.location.assign(result.url)).catch(()=>setFailed(true));}}>Open authorized attachment</button>{failed?<span role="alert"> The attachment is unavailable or the link expired.</span>:null}</p>;}
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
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
