"use client";

import { ApiTransportError } from "@athyper/platform-api-client";
import {
  useApiClient,
  usePermissions,
  useToasts,
} from "@athyper/platform-shell-app-foundation";
import { PageSurface } from "@athyper/platform-surface-kit";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
} from "@athyper/platform-ui";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  createBusinessPartnerClient,
  type CustomerCreditReview,
  type CustomerDesignation,
  type PartnerAggregate,
  type PartnerEligibility,
} from "./client";

export const customerControlPermissions = {
  creditCreate: "neon.customer.credit.create",
  creditDecide: "neon.customer.credit.decide",
  designationCreate: "neon.customer.designation.create",
  designationDecide: "neon.customer.designation.decide",
  activate: "neon.customer.lifecycle.activate",
  suspend: "neon.customer.lifecycle.suspend",
  reactivate: "neon.customer.lifecycle.reactivate",
  deactivate: "neon.customer.lifecycle.deactivate",
  archive: "neon.customer.lifecycle.archive",
} as const;

export type CustomerLifecycleAction =
  "activate" | "suspend" | "reactivate" | "deactivate" | "archive";

export function customerLifecycleActions(
  status: string,
): readonly CustomerLifecycleAction[] {
  switch (status) {
    case "prospect":
      return ["activate"];
    case "active":
      return ["suspend", "deactivate"];
    case "suspended":
      return ["reactivate", "deactivate"];
    case "inactive":
      return ["archive"];
    default:
      return [];
  }
}

export function customerReadinessGuidance(code: string): Readonly<{
  owner: string;
  action: string;
}> {
  if (code.startsWith("CREDIT_REVIEW_"))
    return {
      owner: "Credit control",
      action: "Open or decide the scoped credit review",
    };
  if (code.startsWith("COMPANY_PROFILE_") || code === "PAYMENT_TERM_INVALID")
    return {
      owner: "Accounts receivable master data",
      action: "Correct the Customer company profile",
    };
  if (
    code === "ROLE_MISSING" ||
    code === "ROLE_INACTIVE" ||
    code === "ORG_ASSIGNMENT_MISSING" ||
    code === "ORG_COMPANY_INCOMPATIBLE"
  )
    return {
      owner: "Business Partner data steward",
      action: "Correct the role or sales-organization assignment",
    };
  if (code === "BLOCKED_FOR_OPERATION")
    return {
      owner: "Customer lifecycle operator",
      action: "Review and clear the effective operational block",
    };
  return {
    owner: "Customer operations",
    action: "Inspect the cited readiness evidence",
  };
}

export type CustomerControlHistoryRow = Readonly<{
  id: string;
  authority: "credit" | "designation";
  state: string;
  scope: string;
  version: number;
  changedAt: string;
  changedBy: string;
}>;

export function customerControlHistoryRows(
  reviews: readonly CustomerCreditReview[],
  designations: readonly CustomerDesignation[],
): readonly CustomerControlHistoryRow[] {
  return [
    ...reviews.map((item) => ({ id:item.id, authority:"credit" as const, state:item.decision, scope:`${item.operatingOrganizationId} · ${item.companyCodeId}`, version:item.rowVersion, changedAt:item.updatedAt ?? item.createdAt, changedBy:item.updatedBy ?? item.createdBy })),
    ...designations.map((item) => ({ id:item.id, authority:"designation" as const, state:item.status, scope:[item.operatingOrganizationId,item.companyCodeId,item.countryCode,item.channelCode].filter(Boolean).join(" · "), version:item.rowVersion, changedAt:item.updatedAt ?? item.createdAt, changedBy:item.updatedBy ?? item.createdBy })),
  ].sort((left,right) => right.changedAt.localeCompare(left.changedAt) || right.id.localeCompare(left.id));
}

export function CustomerControls({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
  const http = useApiClient();
  const api = useMemo(() => createBusinessPartnerClient(http), [http]);
  const work = useNeonWorkContext();
  const operating = useNeonOperatingOrganization();
  const grants = usePermissions();
  const toasts = useToasts();
  const companyCodeId =
    work.selection.mode === "company"
      ? work.selection.companyCodeId
      : undefined;
  const organizations = useMemo(
    () =>
      operating.organizations.filter(
        (item) =>
          !companyCodeId ||
          item.companyAssignments.some(
            (assignment) => assignment.companyCodeId === companyCodeId,
          ),
      ),
    [operating.organizations, companyCodeId],
  );
  const [organizationId, setOrganizationId] = useState("");
  const [aggregate, setAggregate] = useState<PartnerAggregate>();
  const [readiness, setReadiness] = useState<PartnerEligibility>();
  const [reviews, setReviews] = useState<readonly CustomerCreditReview[]>([]);
  const [designations, setDesignations] = useState<
    readonly CustomerDesignation[]
  >([]);
  const [creditDrafts, setCreditDrafts] = useState<
    Readonly<
      Record<
        string,
        Readonly<{ limit: string; currency: string; conditions: string }>
      >
    >
  >({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(
    () =>
      setOrganizationId((current) =>
        organizations.some((item) => item.id === current)
          ? current
          : organizations.length === 1
            ? organizations[0]!.id
            : "",
      ),
    [organizations],
  );
  const customer = aggregate?.customers[0];
  const reload = useCallback(async () => {
    if (!organizationId || !companyCodeId) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextAggregate = await api.aggregate(
        businessPartnerId,
        organizationId,
      );
      const [nextReadiness, nextReviews, nextDesignations] = await Promise.all([
        api.eligibility(
          businessPartnerId,
          organizationId,
          "activation",
          new Date().toISOString().slice(0, 10),
          undefined,
          companyCodeId,
          "customer",
        ),
        api.customerCreditReviews(
          businessPartnerId,
          organizationId,
          companyCodeId,
        ),
        api.customerDesignations(
          businessPartnerId,
          organizationId,
          companyCodeId,
        ),
      ]);
      setAggregate(nextAggregate);
      setReadiness(nextReadiness);
      setReviews(nextReviews);
      setDesignations(nextDesignations);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, businessPartnerId, organizationId, companyCodeId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const lifecycleActions = customerLifecycleActions(customer?.status ?? "");

  async function createCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !companyCodeId) return;
    const data = new FormData(event.currentTarget),
      limit = Number(data.get("creditLimit"));
    await run(
      "credit",
      () =>
        api.createCustomerCredit(businessPartnerId, {
          customerId: customer.id,
          operatingOrganizationId: organizationId,
          companyCodeId,
          reviewTypeCode: String(data.get("reviewTypeCode") || "initial"),
          requestedCreditLimit: Number.isFinite(limit) ? limit : undefined,
          requestedCurrencyCode: String(
            data.get("requestedCurrencyCode") || "",
          ).toUpperCase(),
          riskClassCode: String(data.get("riskClassCode") || ""),
          effectiveFrom: String(data.get("effectiveFrom") || ""),
          ...(data.get("effectiveUntil")
            ? { effectiveUntil: String(data.get("effectiveUntil")) }
            : {}),
        }),
      "Credit review created",
    );
  }
  async function decide(
    review: CustomerCreditReview,
    decision: "approved" | "conditional" | "rejected",
  ) {
    const draft = creditDrafts[review.id] ?? {
      limit: String(review.requestedCreditLimit ?? ""),
      currency: review.requestedCurrencyCode ?? "",
      conditions: "",
    };
    const approvedLimit = Number(draft.limit);
    const conditions = draft.conditions
      .split(/[\n,]/)
      .map((code) => code.trim())
      .filter(Boolean)
      .map((code) => ({ code }));
    await run(
      `decision-${review.id}`,
      () =>
        api.decideCustomerCredit(review.id, {
          expectedVersion: review.rowVersion,
          decision,
          reason: `CUSTOMER_CREDIT_${decision.toUpperCase()}`,
          ...(decision !== "rejected" &&
          Number.isFinite(approvedLimit) &&
          draft.currency
            ? {
                approvedCreditLimit: approvedLimit,
                approvedCurrencyCode: draft.currency.toUpperCase(),
              }
            : {}),
          ...(decision === "conditional" ? { conditions } : {}),
        }),
      `Credit review ${decision}`,
    );
  }
  async function createDesignation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    const data = new FormData(event.currentTarget),
      tier = Number(data.get("priorityTier"));
    await run(
      "designation",
      () =>
        api.createCustomerDesignation(businessPartnerId, {
          customerId: customer.id,
          operatingOrganizationId: organizationId,
          ...(companyCodeId ? { companyCodeId } : {}),
          ...(data.get("countryCode")
            ? { countryCode: String(data.get("countryCode")).toUpperCase() }
            : {}),
          ...(data.get("channelCode")
            ? { channelCode: String(data.get("channelCode")).toLowerCase() }
            : {}),
          designationType: String(data.get("designationType")),
          priorityTier: tier,
          effectiveFrom: String(data.get("effectiveFrom")),
          ...(data.get("effectiveUntil")
            ? { effectiveUntil: String(data.get("effectiveUntil")) }
            : {}),
          rationale: String(data.get("rationale")),
        }),
      "Customer designation opened",
    );
  }
  async function decideDesignation(
    item: CustomerDesignation,
    decision: "approved" | "rejected" | "revoked",
  ) {
    await run(
      `designation-${item.id}`,
      () =>
        api.decideCustomerDesignation(item.id, {
          expectedVersion: item.rowVersion,
          decision,
          reason: `CUSTOMER_DESIGNATION_${decision.toUpperCase()}`,
        }),
      `Customer designation ${decision}`,
    );
  }
  function updateCreditDraft(
    review: CustomerCreditReview,
    field: "limit" | "currency" | "conditions",
    value: string,
  ) {
    setCreditDrafts((current) => ({
      ...current,
      [review.id]: {
        ...(current[review.id] ?? {
          limit: String(review.requestedCreditLimit ?? ""),
          currency: review.requestedCurrencyCode ?? "",
          conditions: "",
        }),
        [field]: value,
      },
    }));
  }
  async function transition(action: CustomerLifecycleAction) {
    if (!customer || !companyCodeId) return;
    await run(
      action,
      () =>
        api.transitionCustomer(businessPartnerId, {
          customerId: customer.id,
          operatingOrganizationId: organizationId,
          companyCodeId,
          action,
          expectedVersion: customer.recordVersion,
          reasonCode: `CUSTOMER_${action.toUpperCase()}`,
          businessDate: new Date().toISOString().slice(0, 10),
        }),
      `Customer ${action} completed`,
    );
  }
  async function run(
    name: string,
    command: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(name);
    setError(undefined);
    try {
      await command();
      toasts.push({ tone: "success", title: success });
      await reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <PageSurface
      title="Customer credit and lifecycle"
      description="Credit approval is independent from registration approval; activation is pinned to current sales and AR readiness."
      actions={
        <a
          className="a-button a-button--secondary"
          href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`}
        >
          Back to partner
        </a>
      }
    >
      <Card className="bp-filter-bar">
        <div>
          <Label htmlFor="customer-controls-organization">
            Sales organization
          </Label>
          <Select
            id="customer-controls-organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.currentTarget.value)}
          >
            <option value="">Select an authorized sales organization</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="customer-controls-company">AR company</Label>
          <Input
            id="customer-controls-company"
            readOnly
            value={companyCodeId ?? "Select a company in the work context"}
          />
        </div>
      </Card>
      {error ? (
        <div className="bp-error" role="alert">
          <strong>Unable to complete the command</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {!companyCodeId ? (
        <Card>
          <p>
            Select a company in the NEON work context to review AR readiness.
          </p>
        </Card>
      ) : null}
      {loading ? (
        <Card>
          <p>Loading customer controls…</p>
        </Card>
      ) : customer ? (
        <>
          <Card className="bp-section">
            <h2>Readiness</h2>
            <div className="bp-summary">
              <Badge tone={readiness?.eligible ? "success" : "warning"}>
                {readiness?.eligible ? "Ready" : "Blocked"}
              </Badge>
              <span>Customer {customer.customerCode}</span>
              <span>Status {customer.status}</span>
              <span>Version {customer.recordVersion}</span>
            </div>
            {readiness?.reasons.length ? (
              <ul>
                {readiness.reasons.map((reason) => (
                  <li key={`${reason.code}-${reason.recordId ?? "scope"}`}>
                    <strong>{reason.code}</strong>
                    {reason.detail ? ` — ${reason.detail}` : ""}
                    <span>
                      {` — Owner: ${customerReadinessGuidance(reason.code).owner}. `}
                      {customerReadinessGuidance(reason.code).action}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Sales assignment, approved credit, and AR company-profile gates
                pass.
              </p>
            )}
            <div className="bp-actions">
              {lifecycleActions.includes("activate") &&
              grants.has(customerControlPermissions.activate) ? (
                <Button
                  loading={busy === "activate"}
                  disabled={!readiness?.eligible}
                  onClick={() => void transition("activate")}
                >
                  Activate
                </Button>
              ) : null}
              {lifecycleActions.includes("suspend") &&
              grants.has(customerControlPermissions.suspend) ? (
                <Button
                  variant="secondary"
                  loading={busy === "suspend"}
                  onClick={() => void transition("suspend")}
                >
                  Suspend
                </Button>
              ) : null}
              {lifecycleActions.includes("reactivate") &&
              grants.has(customerControlPermissions.reactivate) ? (
                <Button
                  loading={busy === "reactivate"}
                  disabled={!readiness?.eligible}
                  onClick={() => void transition("reactivate")}
                >
                  Reactivate
                </Button>
              ) : null}
              {lifecycleActions.includes("deactivate") &&
              grants.has(customerControlPermissions.deactivate) ? (
                <Button
                  variant="danger"
                  loading={busy === "deactivate"}
                  onClick={() => void transition("deactivate")}
                >
                  Deactivate
                </Button>
              ) : null}
              {lifecycleActions.includes("archive") &&
              grants.has(customerControlPermissions.archive) ? (
                <Button
                  variant="danger"
                  loading={busy === "archive"}
                  onClick={() => void transition("archive")}
                >
                  Archive
                </Button>
              ) : null}
            </div>
          </Card>
          <Card className="bp-section">
            <h2>Commercial credit review</h2>
            {grants.has(customerControlPermissions.creditCreate) ? (
              <form className="bp-grid" onSubmit={createCredit}>
                <div>
                  <Label htmlFor="customer-credit-type">Review type</Label>
                  <Input
                    id="customer-credit-type"
                    name="reviewTypeCode"
                    defaultValue="initial"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-credit-limit">Requested limit</Label>
                  <Input
                    id="customer-credit-limit"
                    name="creditLimit"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-credit-currency">
                    Requested currency
                  </Label>
                  <Input
                    id="customer-credit-currency"
                    name="requestedCurrencyCode"
                    minLength={3}
                    maxLength={3}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-risk-class">Risk class</Label>
                  <Input
                    id="customer-risk-class"
                    name="riskClassCode"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-credit-from">Effective from</Label>
                  <Input
                    id="customer-credit-from"
                    name="effectiveFrom"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-credit-until">Effective until</Label>
                  <Input
                    id="customer-credit-until"
                    name="effectiveUntil"
                    type="date"
                  />
                </div>
                <Button type="submit" loading={busy === "credit"}>
                  Open credit review
                </Button>
              </form>
            ) : null}
            {reviews.length ? (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Requested</th>
                    <th>Approved limit</th>
                    <th>Risk</th>
                    <th>Decision</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>{review.reviewTypeCode}</td>
                      <td>
                        {review.requestedCreditLimit ?? "—"}{" "}
                        {review.requestedCurrencyCode}
                      </td>
                      <td>
                        {review.approvedCreditLimit ?? "—"}{" "}
                        {review.approvedCurrencyCode}
                      </td>
                      <td>{review.riskClassCode ?? "—"}</td>
                      <td>
                        {review.decision}
                        {review.conditions.length
                          ? ` (${review.conditions
                              .map((condition) =>
                                String(condition["code"] ?? "condition"),
                              )
                              .join(", ")})`
                          : ""}
                      </td>
                      <td>
                        {review.decision === "pending" &&
                        grants.has(customerControlPermissions.creditDecide) ? (
                          <div className="bp-actions">
                            <Label htmlFor={`approved-limit-${review.id}`}>
                              Approved limit
                            </Label>
                            <Input
                              id={`approved-limit-${review.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                creditDrafts[review.id]?.limit ??
                                String(review.requestedCreditLimit ?? "")
                              }
                              onChange={(event) =>
                                updateCreditDraft(
                                  review,
                                  "limit",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            <Label htmlFor={`approved-currency-${review.id}`}>
                              Approved currency
                            </Label>
                            <Input
                              id={`approved-currency-${review.id}`}
                              minLength={3}
                              maxLength={3}
                              value={
                                creditDrafts[review.id]?.currency ??
                                review.requestedCurrencyCode ??
                                ""
                              }
                              onChange={(event) =>
                                updateCreditDraft(
                                  review,
                                  "currency",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            <Label htmlFor={`credit-conditions-${review.id}`}>
                              Conditional reason codes
                            </Label>
                            <Input
                              id={`credit-conditions-${review.id}`}
                              placeholder="PAYMENT_HISTORY_REQUIRED"
                              value={creditDrafts[review.id]?.conditions ?? ""}
                              onChange={(event) =>
                                updateCreditDraft(
                                  review,
                                  "conditions",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            <Button
                              variant="secondary"
                              loading={busy === `decision-${review.id}`}
                              onClick={() => void decide(review, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              loading={busy === `decision-${review.id}`}
                              disabled={
                                !(
                                  creditDrafts[review.id]?.conditions ?? ""
                                ).trim()
                              }
                              onClick={() => void decide(review, "conditional")}
                            >
                              Conditional
                            </Button>
                            <Button
                              variant="secondary"
                              loading={busy === `decision-${review.id}`}
                              onClick={() => void decide(review, "rejected")}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No customer credit reviews in this sales/company scope.</p>
            )}
          </Card>
          <Card className="bp-section">
            <h2>Account designations</h2>
            {grants.has(customerControlPermissions.designationCreate) ? (
              <form className="bp-grid" onSubmit={createDesignation}>
                <div>
                  <Label htmlFor="customer-designation-type">Designation</Label>
                  <Select id="customer-designation-type" name="designationType">
                    <option value="key_account">Key account</option>
                    <option value="strategic">Strategic</option>
                    <option value="priority_service">Priority service</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="customer-designation-tier">
                    Priority tier
                  </Label>
                  <Input
                    id="customer-designation-tier"
                    name="priorityTier"
                    type="number"
                    min="1"
                    max="5"
                    defaultValue="1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-designation-country">Geography (country)</Label>
                  <Input id="customer-designation-country" name="countryCode" minLength={2} maxLength={2} placeholder="MY" />
                </div>
                <div>
                  <Label htmlFor="customer-designation-channel">Sales channel</Label>
                  <Input id="customer-designation-channel" name="channelCode" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}" placeholder="direct" />
                </div>
                <div>
                  <Label htmlFor="customer-designation-from">
                    Effective from
                  </Label>
                  <Input
                    id="customer-designation-from"
                    name="effectiveFrom"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-designation-rationale">
                    Rationale
                  </Label>
                  <Input
                    id="customer-designation-rationale"
                    name="rationale"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer-designation-until">
                    Effective until
                  </Label>
                  <Input
                    id="customer-designation-until"
                    name="effectiveUntil"
                    type="date"
                  />
                </div>
                <Button type="submit" loading={busy === "designation"}>
                  Propose designation
                </Button>
              </form>
            ) : null}
            {designations.length ? (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>Priority</th>
                    <th>Geography / channel</th>
                    <th>Status</th>
                    <th>Effective</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {designations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.designationType}</td>
                      <td>{item.priorityTier ?? "—"}</td>
                      <td>{[item.countryCode,item.channelCode].filter(Boolean).join(" · ") || "All"}</td>
                      <td>{item.status}</td>
                      <td>{item.effectiveFrom}</td>
                      <td>
                        {item.status === "pending" &&
                        grants.has(
                          customerControlPermissions.designationDecide,
                        ) ? (
                          <div className="bp-actions">
                            <Button
                              variant="secondary"
                              loading={busy === `designation-${item.id}`}
                              onClick={() =>
                                void decideDesignation(item, "approved")
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              loading={busy === `designation-${item.id}`}
                              onClick={() =>
                                void decideDesignation(item, "rejected")
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : item.status === "approved" &&
                          grants.has(
                            customerControlPermissions.designationDecide,
                          ) ? (
                          <Button
                            variant="secondary"
                            loading={busy === `designation-${item.id}`}
                            onClick={() =>
                              void decideDesignation(item, "revoked")
                            }
                          >
                            Revoke
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No Customer designations in this sales scope.</p>
            )}
          </Card>
          <Card className="bp-section" id="customer-control-history">
            <h2>Credit and designation history</h2>
            <p>BP-CUS-008 reconciliation keeps credit authority, designation authority, and Customer lifecycle status independent.</p>
            <table className="bp-table">
              <thead><tr><th>Authority</th><th>State</th><th>Scope</th><th>Version</th><th>Changed</th><th>Actor</th></tr></thead>
              <tbody>{customerControlHistoryRows(reviews,designations).map(item=><tr key={`${item.authority}-${item.id}`}><td>{item.authority}</td><td>{item.state}</td><td>{item.scope}</td><td>{item.version}</td><td>{item.changedAt}</td><td>{item.changedBy}</td></tr>)}</tbody>
            </table>
            {!reviews.length && !designations.length ? <p>No credit or designation decisions have been recorded in this scope.</p> : null}
            <p><strong>Reconciled Customer lifecycle:</strong> {customer.status} · version {customer.recordVersion}. Control decisions do not mutate this lifecycle record.</p>
          </Card>
        </>
      ) : organizationId && companyCodeId && !loading ? (
        <Card>
          <p>No customer role is visible in this authorized scope.</p>
        </Card>
      ) : null}
    </PageSurface>
  );
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiTransportError)
    return cause.problem?.detail ?? cause.message;
  if (cause instanceof Error) return cause.message;
  return "Unexpected customer onboarding error";
}
