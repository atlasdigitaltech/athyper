import { BusinessPartnerAction } from "./governed-action";
import { useEffect, useState } from "react";
import { Card, Select } from "@athyper/platform-ui";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import { useBusinessPartner360 } from "../business-partner-360-context";
interface Decision {
  eligible: boolean;
  reasons: readonly { code: string; severity: string }[];
}
const eligibility = createOperation<Decision>({
  method: "GET",
  path: ({ id }) =>
    `/api/neon/business-partners/${encodeURIComponent(id)}/eligibility`,
  parse: (value) => value as Decision,
});
export function AccessScopeCard({requiredCoordinates}: {readonly requiredCoordinates?: readonly string[]} = {}) {
  const needsCompany = !requiredCoordinates || requiredCoordinates.includes("companyCodeId");
  const unsupported = requiredCoordinates?.some(key => !["companyCodeId", "operatingOrganizationId"].includes(key));
  const { summary, selectSection, selectScope } = useBusinessPartner360(),
    operating = useNeonOperatingOrganization(),
    work = useNeonWorkContext(),
    http = useApiClient();
  const [operation, setOperation] = useState("order"),
    [decisions, setDecisions] = useState<
      Partial<Record<"supplier" | "customer", Decision | null>>
    >({});
  const [organizationId, setOrganizationId] = useState(summary.scope.operatingOrganizationId ?? "");
  const [companyId, setCompanyId] = useState(summary.scope.companyCodeId ?? "");
  useEffect(() => { setOrganizationId(summary.scope.operatingOrganizationId ?? ""); setCompanyId(summary.scope.companyCodeId ?? ""); }, [summary.identity.id, summary.scope.operatingOrganizationId, summary.scope.companyCodeId]);
  const org = operating.organizations.find(
      (item) => item.id === organizationId,
    ),
    company = work.companies.find(
      (item) => item.companyCodeId === companyId,
    );
  const key = JSON.stringify([summary.identity.id, summary.scope, organizationId, companyId, operation]);
  useEffect(() => {
    setDecisions({});
    if (!org || !company) return;
    const controller = new AbortController();
    for (const role of ["supplier", "customer"] as const)
      void http
        .request(eligibility, {
          params: { id: summary.identity.id },
          query: {
            role,
            operatingOrganizationId: org.id,
            companyCodeId: company.companyCodeId,
            operationCode: operation,
            businessDate: summary.asOf,
          },
          signal: controller.signal,
        })
        .then((value) => {
          if (!controller.signal.aborted)
            setDecisions((current) => ({ ...current, [role]: value }));
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setDecisions((current) => ({ ...current, [role]: null }));
        });
    return () => controller.abort();
  }, [http, key, org?.id, company?.companyCodeId]);
  const visibility = {
    tenant: "Available across this tenant",
    organization: "Restricted to authorized organizations",
    company: "Restricted to authorized companies",
    organization_company:
      "Restricted to authorized organizations and companies",
  };
  return (
    <Card className="bp360-section-card">
      <h2>Transaction context</h2>
      <p>Choose the organization and company for transactions and setup requests. Partner-wide identity remains shared; access is checked again for the selected context.</p>
      <dl className="bp360-fields">
        <div>
          <dt>Directory visibility</dt>
          <dd>
            {summary.directoryScope
              ? visibility[summary.directoryScope]
              : "Published directory policy"}
          </dd>
        </div>
        <div>
          <dt>Selected transaction context</dt>
          <dd>
            {org && company
              ? `${org.displayName} / ${company.displayName}`
              : "Select an organization and company to check eligibility"}
          </dd>
        </div>
      </dl>
      <div className="bp360-fields">
        <label>Organization<Select aria-label="Transaction organization" value={organizationId} onChange={event => {setOrganizationId(event.target.value);setCompanyId("");}}><option value="">Select organization</option>{operating.organizations.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</Select></label>
        <label>Company<Select aria-label="Transaction company" value={companyId} disabled={!org} onChange={event => setCompanyId(event.target.value)}><option value="">Select company</option>{work.companies.filter(item => org?.companyAssignments.some(assignment => assignment.companyCodeId === item.companyCodeId)).map(item => <option key={item.companyCodeId} value={item.companyCodeId}>{item.code} · {item.displayName}</option>)}</Select></label>
      </div>
      {unsupported ? <p role="status">This operation requires a context that cannot be selected here.</p> : null}
      {selectScope ? <button type="button" disabled={unsupported || !org || (needsCompany && (!company || !org.companyAssignments.some(item => item.companyCodeId === company.companyCodeId)))} onClick={() => selectScope(org!.id, needsCompany ? company!.companyCodeId : "")}>Use this context</button> : null}
      <label>
        Transaction{" "}
        <Select
          value={operation}
          onChange={(event) => setOperation(event.target.value)}
        >
          <option value="order">Orders</option>
          <option value="invoice">Invoices</option>
          <option value="payment">Payments</option>
        </Select>
      </label>
      <dl className="bp360-fields">
        {(["supplier", "customer"] as const).map((role) => {
          const decision = decisions[role],
            missing = decision?.reasons.some((reason) =>
              [
                "ROLE_MISSING",
                "ORG_ASSIGNMENT_MISSING",
                "COMPANY_PROFILE_MISSING",
              ].includes(reason.code),
            );
          return (
            <div key={role}>
              <dt>
                {role === "supplier" ? "Supplier" : "Customer"} eligibility
              </dt>
              <dd>
                {!org || !company
                  ? "Select transaction context"
                  : decision === null
                    ? "Unavailable"
                    : !decision
                      ? "Checking…"
                      : decision.eligible
                        ? "Allowed"
                        : missing
                          ? "Not configured"
                          : "Blocked"}
              </dd>
              {decision && !decision.eligible ? (
                <small>
                  {decision.reasons
                    .filter((reason) => reason.severity === "blocking")
                    .map((reason) =>
                      reason.code.toLowerCase().replaceAll("_", " "),
                    )
                    .join(" · ")}
                </small>
              ) : null}
            </div>
          );
        })}
      </dl>
      <button type="button" onClick={() => selectSection("roles-scope")}>
        View roles &amp; scope
      </button>
      {summary.recordHeader?.actions
        .filter(
          (action) =>
            (action.operationKey ?? action.key) === "configure_company",
        )
        .map((action) => (
          <BusinessPartnerAction key={action.key} action={action} />
        ))}
    </Card>
  );
}
export function RecordTechnicalDetails() {
  const { summary } = useBusinessPartner360();
  const [copied, setCopied] = useState<string>();
  const rows = [
    ["Partner ID", summary.identity.id],
    ["Organization ID", summary.scope.operatingOrganizationId],
    ["Company ID", summary.scope.companyCodeId],
    ["Legal entity ID", summary.scope.legalEntityId],
  ];
  return (
    <details className="bp360-section-card">
      <summary>Technical details</summary>
      <dl>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value}{" "}
                <button
                  type="button"
                  aria-label={`Copy ${label}`}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(value!)
                      .then(() => setCopied(label))
                      .catch(() => setCopied("Copy unavailable"));
                  }}
                >
                  Copy
                </button>
              </dd>
            </div>
          ))}
      </dl>
      <span role="status">
        {copied
          ? copied === "Copy unavailable"
            ? copied
            : `${copied} copied`
          : ""}
      </span>
    </details>
  );
}
