import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBusinessPartner360WorkforceClient,
  type EvidencePurpose,
  type PersonEvidenceReveal,
  type WorkforceSection as WorkforceSectionContract,
  workforceQueryKey,
} from "../business-partner-360-workforce-client";
import { useBusinessPartner360 } from "../business-partner-360-context";

export function WorkforceSection() {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens, section } = useBusinessPartner360();
  const client = useMemo(
    () => createBusinessPartner360WorkforceClient(http),
    [http],
  );
  const [value, setValue] = useState<WorkforceSectionContract>(),
    [failed, setFailed] = useState(false);
  const explicitAsOf =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("asOf");
  const query = {
    tenantId: identity.scope?.tenantId ?? "unbound",
    principalId: identity.scope?.principalId ?? "unbound",
    businessPartnerId: summary.identity.id,
    sectionCode: "workforce" as const,
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
    ...(explicitAsOf ? { asOf: summary.asOf } : {}),
  };
  const key = workforceQueryKey(query).join(":");
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
        <h2>Person and workforce unavailable</h2>
        <p>Other authorized Business Partner sections remain available.</p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const data = value.data,
    personal = record(data["personal"]);
  if (!personal)
    return (
      <Card>
        <h2>No person record</h2>
        <p>
          This Business Partner has no applicable person or workforce record.
        </p>
      </Card>
    );
  return (
    <div className="bp360-section-list">
      {data["historical"] ? (
        <Card>
          <strong>Historical read-only view</strong>
          <p>
            Employment, assignments, engagements, and placements are effective
            on {show(data["asOf"])}. Sensitive reveals and actions are disabled.
          </p>
        </Card>
      ) : null}
      <PersonalCard
        value={personal}
        client={client}
        cleanupKey={`${key}:${section}`}
        readOnly={Boolean(data["readOnly"])}
      />
      <Rows
        title="Employment"
        values={rows(data["employments"])}
        fields={[
          "employmentNumber",
          "employmentType",
          "employmentStatus",
          "legalEntityId",
          "companyCodeId",
          "primary",
          "hireDate",
          "serviceDate",
          "probationEndDate",
          "terminationDate",
          "status",
        ]}
      />
      <Rows
        title="Assignments"
        values={rows(data["assignments"])}
        fields={[
          "assignmentType",
          "companyCodeId",
          "positionId",
          "orgUnitId",
          "jobId",
          "managerEmployeeId",
          "siteId",
          "fte",
          "effectiveFrom",
          "effectiveUntil",
          "status",
        ]}
      />
      <Rows
        title="Onboarding / offboarding"
        values={rows(data["peopleCases"])}
        fields={[
          "kind",
          "status",
          "targetDate",
          "completedAt",
          "workflowRequestId",
        ]}
      />
      <Engagements values={rows(data["engagements"])} />
    </div>
  );
}

function PersonalCard({
  value,
  client,
  cleanupKey,
  readOnly,
}: {
  value: Readonly<Record<string, unknown>>;
  client: ReturnType<typeof createBusinessPartner360WorkforceClient>;
  cleanupKey: string;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false),
    [purpose, setPurpose] = useState<EvidencePurpose>("employment"),
    [reveal, setReveal] = useState<PersonEvidenceReveal>(),
    [failed, setFailed] = useState(false),
    controller = useRef<AbortController | undefined>(undefined),
    timer = useRef<number | undefined>(undefined),
    trigger = useRef<HTMLButtonElement | null>(null),
    dialog = useRef<HTMLDivElement | null>(null);
  function clear() {
    controller.current?.abort();
    controller.current = undefined;
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
    setReveal(undefined);
    setFailed(false);
  }
  useEffect(() => {
    clear();
    setOpen(false);
    return clear;
  }, [cleanupKey]);
  useEffect(()=>{if(open)requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>("select,button")?.focus());},[open]);
  function close(){clear();setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());}
  async function run() {
    clear();
    const next = new AbortController();
    controller.current = next;
    try {
      const result = await client.reveal(
        String(value["personId"]),
        purpose,
        fieldsFor(purpose),
        next.signal,
      );
      if (next.signal.aborted) return;
      setReveal(result);
      timer.current = window.setTimeout(
        () => setReveal(undefined),
        Math.max(0, Date.parse(result.expiresAt) - Date.now()),
      );
    } catch {
      if (!next.signal.aborted) setFailed(true);
    }
  }
  const allowed = Boolean(value["sensitiveRevealAllowed"]) && !readOnly;
  return (
    <Card>
      <h2>Personal</h2>
      <dl>
        {[
          "code",
          "displayName",
          "preferredName",
          "firstName",
          "middleName",
          "lastName",
          "countryCode",
          "status",
        ].map((field) => (
          <Field key={field} label={label(field)} value={value[field]} />
        ))}
      </dl>
      {allowed && !open ? (
        <button ref={trigger} onClick={() => setOpen(true)}>Reveal restricted fields</button>
      ) : null}
      {open ? (
        <div
          className="bp360-restricted-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Restricted personal fields"
          data-sensitive-state={reveal?"revealed":"pending"}
          ref={dialog}
          onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close();}}}
        >
          <strong>Purpose-bound restricted access</strong>
          <p>This action requires MFA, is audited, and is never cached.</p>
          <label>
            Approved purpose{" "}
            <select
              value={purpose}
              onChange={(event) => {
                clear();
                setPurpose(event.currentTarget.value as EvidencePurpose);
              }}
            >
              <option value="employment">Employment</option>
              <option value="payroll">Payroll</option>
              <option value="benefits">Benefits</option>
              <option value="compliance">Compliance</option>
            </select>
          </label>
          <div className="bp-actions">
            <button onClick={() => void run()}>Confirm audited reveal</button>
            <button
              onClick={() => {
                close();
              }}
            >
              Close and clear
            </button>
          </div>
          {reveal ? (
            <dl data-sensitive-value="true">
              {Object.entries(reveal.fields).map(([field, fieldValue]) => (
                <Field key={field} label={label(field)} value={fieldValue} />
              ))}
            </dl>
          ) : null}
          {reveal?.redactedFields.length ? (
            <p>Not disclosed: {reveal.redactedFields.join(", ")}</p>
          ) : null}
          {failed ? (
            <div role="alert">
              <p>Step-up or purpose authorization is required.</p>
              <form
                method="post"
                action={`/api/auth/step-up/start?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              >
                <button type="submit">Verify with MFA</button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Engagements({
  values,
}: {
  values: readonly Readonly<Record<string, unknown>>[];
}) {
  return (
    <Card>
      <h2>Engagements</h2>
      {values.length ? (
        values.map((item) => (
          <section key={String(item["id"])}>
            <dl>
              {[
                "workerNumber",
                "classification",
                "supplierId",
                "companyCodeId",
                "legalEntityId",
                "engagementModel",
                "status",
                "onboardingStatus",
                "accessStatus",
                "startDate",
                "endDate",
              ].map((field) => (
                <Field key={field} label={label(field)} value={item[field]} />
              ))}
            </dl>
            <Rows
              title="Placements"
              values={rows(item["placements"])}
              fields={[
                "companyCodeId",
                "positionId",
                "orgUnitId",
                "managerEmployeeId",
                "projectId",
                "siteId",
                "allocationPercent",
                "primary",
                "effectiveFrom",
                "effectiveUntil",
                "status",
              ]}
            />
            {item["href"] ? (
              <a href={String(item["href"])}>Open governed engagement</a>
            ) : null}
          </section>
        ))
      ) : (
        <p>No effective external-worker engagements.</p>
      )}
    </Card>
  );
}
function Rows({
  title,
  values,
  fields,
}: {
  title: string;
  values: readonly Readonly<Record<string, unknown>>[];
  fields: readonly string[];
}) {
  return (
    <Card>
      <h2>{title}</h2>
      {values.length ? (
        values.map((item, index) => (
          <dl key={String(item["id"] ?? index)}>
            {fields.map((field) => (
              <Field key={field} label={label(field)} value={item[field]} />
            ))}
          </dl>
        ))
      ) : (
        <p>No effective records.</p>
      )}
    </Card>
  );
}
function Field({ label: caption, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt>{caption}</dt>
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
  if (typeof value === "object") return "Restricted structured value";
  return String(value);
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function fieldsFor(purpose: EvidencePurpose) {
  return purpose === "employment"
    ? ["dateOfBirth", "nationalityCountryCode", "emergencyContact"]
    : purpose === "payroll"
      ? [
          "dateOfBirth",
          "nationalIdType",
          "nationalIdToken",
          "taxIdentifierToken",
        ]
      : purpose === "benefits"
        ? ["dateOfBirth", "gender", "maritalStatus", "emergencyContact"]
        : [
            "dateOfBirth",
            "nationalityCountryCode",
            "nationalIdType",
            "nationalIdToken",
            "passportNumberToken",
          ];
}
