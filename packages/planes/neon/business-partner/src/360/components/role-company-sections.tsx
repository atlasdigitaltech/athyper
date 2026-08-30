import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useState } from "react";
import {
  createBusinessPartner360RoleClient,
  roleCompanyQueryKey,
  type RoleCompanySection,
  type RoleCompanySectionCode,
} from "../business-partner-360-role-client";
import { useBusinessPartner360 } from "../business-partner-360-context";
export function RolesScopeSection() {
  return <ScopedSection code="roles-scope" />;
}
export function SupplierCompanySection() {
  return <ScopedSection code="supplier-company" />;
}
export function CustomerCompanySection() {
  return <ScopedSection code="customer-company" />;
}
function ScopedSection({ code }: { code: RoleCompanySectionCode }) {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360(),
    client = useMemo(() => createBusinessPartner360RoleClient(http), [http]),
    [value, setValue] = useState<RoleCompanySection>(),
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
    key = roleCompanyQueryKey(query).join(":");
  useEffect(() => {
    const controller = new AbortController();
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
        <h2>Scoped section unavailable</h2>
        <p>The global identity view remains available.</p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const data = value.data,
    state = String(data["scopeState"] ?? "scoped"),
    readOnly = Boolean(data["readOnly"]);
  if (state === "missing_scope")
    return (
      <Card>
        <h2>Select organization and company</h2>
        <p>This section never infers company configuration from row order.</p>
      </Card>
    );
  return (
    <div className="bp360-section-list">
      {state === "global" ? (
        <Card>
          <strong>Global identity view</strong>
          <p>Select an authorized scope to narrow assignments.</p>
        </Card>
      ) : null}
      {state === "historical" ? (
        <Card>
          <strong>Historical read-only view</strong>
          <p>Governed actions are disabled for an explicit as-of date.</p>
        </Card>
      ) : null}
      {code === "roles-scope" ? (
        <Roles data={data} />
      ) : code === "supplier-company" ? (
        <Supplier data={data} />
      ) : (
        <Customer data={data} />
      )}{" "}
      {!readOnly ? <Actions id={summary.identity.id} code={code} /> : null}
    </div>
  );
}
function Roles({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <>
      <Cards
        title="Roles"
        rows={array(data["roles"])}
        fields={["role", "roleCode", "status"]}
      />
      <Cards
        title="Operating-organization assignments"
        rows={array(data["organizationAssignments"])}
        fields={[
          "partnerRole",
          "operatingOrganizationId",
          "effectiveFrom",
          "effectiveUntil",
          "status",
        ]}
      />
      <Cards
        title="Legal-entity assignments"
        rows={array(data["legalEntityAssignments"])}
        fields={["legalEntityId", "effectiveFrom", "effectiveUntil"]}
      />
      <Cards
        title="Work assignments"
        rows={array(data["workAssignments"])}
        fields={[
          "legalEntityId",
          "companyCodeId",
          "orgUnitId",
          "positionId",
          "assignmentType",
          "fte",
          "effectiveFrom",
          "effectiveUntil",
        ]}
      />
    </>
  );
}
function Supplier({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <>
      <ObjectCard
        title="Supplier role"
        value={record(data["supplier"])}
        fields={["code", "type", "status"]}
      />
      <ObjectCard
        title="Procurement assignment"
        value={record(data["organizationAssignment"])}
        fields={[
          "operatingOrganizationId",
          "effectiveFrom",
          "effectiveUntil",
          "status",
        ]}
      />
      <ObjectCard
        title="Accounts payable configuration"
        value={record(data["profile"])}
        fields={[
          "companyCodeId",
          "currencyCode",
          "paymentTermId",
          "defaultAccountingProfileId",
          "defaultDimensionSetId",
          "preferredRemittanceBankLinkId",
          "status",
        ]}
      />
    </>
  );
}
function Customer({ data }: { data: Readonly<Record<string, unknown>> }) {
  return (
    <>
      <ObjectCard
        title="Customer role"
        value={record(data["customer"])}
        fields={["code", "type", "keyAccount", "status"]}
      />
      <ObjectCard
        title="Sales assignment"
        value={record(data["organizationAssignment"])}
        fields={[
          "operatingOrganizationId",
          "effectiveFrom",
          "effectiveUntil",
          "status",
        ]}
      />
      <ObjectCard
        title="Accounts receivable configuration"
        value={record(data["profile"])}
        fields={[
          "companyCodeId",
          "currencyCode",
          "paymentTermId",
          "defaultAccountingProfileId",
          "defaultDimensionSetId",
          "statementCycleCode",
          "status",
        ]}
      />
    </>
  );
}
function Actions({ id, code }: { id: string; code: RoleCompanySectionCode }) {
  return (
    <Card>
      <h2>Governed actions</h2>
      <div className="bp-actions">
        <a href={`/mdg/business-partner/${encodeURIComponent(id)}/roles/new`}>
          Add role
        </a>
        <a
          href={`/mdg/business-partner/${encodeURIComponent(id)}/scope/new?kind=assign_organization`}
        >
          Assign organization
        </a>
        {code !== "roles-scope" ? (
          <a
            href={`/mdg/business-partner/${encodeURIComponent(id)}/scope/new?kind=configure_company&role=${code === "supplier-company" ? "supplier" : "customer"}`}
          >
            Configure company
          </a>
        ) : null}
      </div>
    </Card>
  );
}
function Cards({
  title,
  rows,
  fields,
}: {
  title: string;
  rows: readonly Readonly<Record<string, unknown>>[];
  fields: readonly string[];
}) {
  return (
    <Card>
      <h2>{title}</h2>
      {rows.length ? (
        rows.map((row, index) => (
          <dl key={String(row["id"] ?? index)}>
            {fields.map((field) => (
              <div key={field}>
                <dt>{label(field)}</dt>
                <dd>{show(row[field])}</dd>
              </div>
            ))}
          </dl>
        ))
      ) : (
        <p>No effective assignments in this scope.</p>
      )}
    </Card>
  );
}
function ObjectCard({
  title,
  value,
  fields,
}: {
  title: string;
  value?: Readonly<Record<string, unknown>>;
  fields: readonly string[];
}) {
  return (
    <Card>
      <h2>{title}</h2>
      {value ? (
        <dl>
          {fields.map((field) => (
            <div key={field}>
              <dt>{label(field)}</dt>
              <dd>{show(value[field])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Not configured in the selected scope.</p>
      )}
    </Card>
  );
}
function array(value: unknown) {
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
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
