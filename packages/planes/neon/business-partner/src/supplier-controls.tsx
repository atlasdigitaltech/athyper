"use client";
import { BankVerificationControls } from "./bank-verification-controls";

import { ApiTransportError } from "@athyper/platform-api-client";
import {
  useApiClient,
  useApplicationNavigation,
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
  type ReactNode,
} from "react";
import {
  createBusinessPartnerClient,
  type PartnerAggregate,
  type PartnerEligibility,
  type SupplierPreference,
} from "./client";

export const supplierControlPermissions = Object.freeze({
  qualification: "neon.supplier.qualification.admin",
  preference: "neon.supplier.preference.admin",
  activate: "neon.relationship.business_partner.activate",
  lifecycle: "neon.relationship.entity_case.create",
} as const);
const today = () => new Date().toISOString().slice(0, 10);

export function SupplierControls({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
  const navigation = useApplicationNavigation();
  const http = useApiClient(),
    api = useMemo(() => createBusinessPartnerClient(http), [http]);
  const work = useNeonWorkContext(),
    operating = useNeonOperatingOrganization(),
    grants = usePermissions(),
    toasts = useToasts();
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
  const [organizationId, setOrganizationId] = useState(""),
    [aggregate, setAggregate] = useState<PartnerAggregate>(),
    [readiness, setReadiness] = useState<PartnerEligibility>(),
    [preferences, setPreferences] = useState<readonly SupplierPreference[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState<string>(),
    [error, setError] = useState<string>();
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
  const reload = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(undefined);
    try {
      const [nextAggregate, nextReadiness, nextPreferences] = await Promise.all(
        [
          api.aggregate(businessPartnerId, organizationId),
          api.eligibility(
            businessPartnerId,
            organizationId,
            "activation",
            today(),
            undefined,
            companyCodeId,
            "supplier",
          ),
          api.preferences(
            businessPartnerId,
            organizationId,
            today(),
            undefined,
            companyCodeId,
          ),
        ],
      );
      setAggregate(nextAggregate);
      setReadiness(nextReadiness);
      setPreferences(nextPreferences);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, businessPartnerId, organizationId, companyCodeId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const supplier = aggregate?.suppliers[0];
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
  async function createQualification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(
      "qualification",
      () =>
        api.createQualification(businessPartnerId, {
          partnerRole: "supplier",
          operatingOrganizationId: organizationId,
          ...(companyCodeId ? { companyCodeId } : {}),
          qualificationTypeCode: required(data, "qualificationTypeCode"),
          effectiveFrom: required(data, "effectiveFrom"),
          ...(optional(data, "effectiveUntil")
            ? { effectiveUntil: optional(data, "effectiveUntil") }
            : {}),
          ...(optional(data, "nextReviewAt")
            ? { nextReviewAt: optional(data, "nextReviewAt") }
            : {}),
        }),
      "Qualification review opened",
    );
  }
  async function decideQualification(
    id: string,
    version: number,
    decision: "approved" | "conditional" | "rejected" | "suspended",
  ) {
    await run(
      `qualification-${id}`,
      () =>
        api.decideQualification(id, {
          expectedVersion: version,
          decision,
          reason: `SUPPLIER_QUALIFICATION_${decision.toUpperCase()}`,
        }),
      `Qualification ${decision}`,
    );
  }
  async function createPreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplier) return;
    const data = new FormData(event.currentTarget);
    await run(
      "preference",
      () =>
        api.createPreference(businessPartnerId, {
          supplierId: supplier.id,
          operatingOrganizationId: organizationId,
          ...(companyCodeId ? { companyCodeId } : {}),
          effectiveFrom: required(data, "effectiveFrom"),
          ...(optional(data, "effectiveUntil")
            ? { effectiveUntil: optional(data, "effectiveUntil") }
            : {}),
          rationale: required(data, "rationale"),
        }),
      "Preference review opened",
    );
  }
  async function decidePreference(
    item: SupplierPreference,
    decision: "approved" | "rejected",
  ) {
    await run(
      `preference-${item.id}`,
      () =>
        api.decidePreference(item.id, {
          expectedVersion: item.rowVersion,
          decision,
          reason: `SUPPLIER_PREFERENCE_${decision.toUpperCase()}`,
        }),
      `Preference ${decision}`,
    );
  }
  async function activate() {
    await run(
      "activate",
      async () => {
        if(!readiness)throw new Error("Refresh supplier readiness before creating the activation case.");
        const result=await api.proposeSupplierActivation(businessPartnerId,organizationId,companyCodeId,readiness);
        navigation.push(`/mdg/business-partner/requests/${encodeURIComponent(result.case.id)}`);
        return result;
      },
      "Supplier activation case created",
    );
  }
  async function bankChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyCodeId) return;
    const data = new FormData(event.currentTarget),
      profile = aggregate?.supplierCompanyProfiles.find(
        (item) => item.companyCodeId === companyCodeId,
      );
    if (!profile) {
      setError(
        "An active supplier company profile is required before bank verification can start.",
      );
      return;
    }
    await run(
      "bank",
      async () => {
        const result = await api.proposeBankChange(
          businessPartnerId,
          organizationId,
          companyCodeId,
          {
            bankProjectionId: required(data, "bankProjectionId"),
            supplierCompanyProfileId: profile.id,
            reasonCode: required(data, "reason"),
          },
        );
        navigation.push(
          `/mdg/business-partner/requests/${encodeURIComponent(result.case.id)}`,
        );
      },
      "Bank verification case created",
    );
  }
  async function lifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      action = required(data, "action") as
        "deactivate" | "reactivate" | "archive",
      reason = required(data, "reason"),
      dependencies = supplierLifecycleEvidence(aggregate, readiness);
    await run(
      "lifecycle",
      async () => {
        const result = await api.proposeLifecycle(businessPartnerId, action, {
          reasonCode: reason,
          priorStatus: aggregate?.businessPartner.status,
          dependencies,
        });
        navigation.push(
          `/mdg/business-partner/requests/${encodeURIComponent(result.case.id)}`,
        );
      },
      `${action} request created`,
    );
  }

  return (
    <PageSurface
      title="Supplier controls"
      description="Qualification, preference, payment readiness, activation, and terminal lifecycle changes use their native governed authorities."
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
          <Label htmlFor="supplier-controls-organization">
            Purchasing organization
          </Label>
          <Select
            id="supplier-controls-organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.currentTarget.value)}
          >
            <option value="">Select an authorized organization</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="supplier-controls-company">Payment company</Label>
          <Input
            id="supplier-controls-company"
            readOnly
            value={companyCodeId ?? "No company selected"}
          />
        </div>
      </Card>
      {error ? (
        <div className="bp-error" role="alert">
          <strong>Unable to complete the command</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {loading ? (
        <Card>
          <p>Loading supplier controls…</p>
        </Card>
      ) : supplier && readiness ? (
        <>
          <Card className="bp-section">
            <h2>Activation readiness</h2>
            <div className="bp-summary">
              <Badge tone={readiness.eligible ? "success" : "warning"}>
                {readiness.eligible ? "Ready" : "Blocked"}
              </Badge>
              <span>Supplier {supplier.supplierCode}</span>
              <span>Status {supplier.status}</span>
            </div>
            <dl className="bp-definition">
              <div>
                <dt>Decision fingerprint</dt>
                <dd>{readiness.decisionFingerprint}</dd>
              </div>
              <div>
                <dt>Business date</dt>
                <dd>{readiness.businessDate}</dd>
              </div>
            </dl>
            {readiness.reasons.length ? (
              <ul>
                {readiness.reasons.map((reason) => (
                  <li key={`${reason.code}-${reason.recordId ?? "scope"}`}>
                    <strong>{reason.code}</strong>
                    {reason.detail ? ` — ${reason.detail}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Role, organization, qualification, risk, block, and requested
                payment gates pass.
              </p>
            )}
            {grants.has(supplierControlPermissions.activate) &&
            supplier.status !== "active" ? (
              <Button
                loading={busy === "activate"}
                disabled={!readiness.eligible}
                onClick={() => void activate()}
              >
                Create activation case
              </Button>
            ) : null}
          </Card>
          <Card className="bp-section">
            <h2>Scoped qualifications</h2>
            {grants.has(supplierControlPermissions.qualification) ? (
              <form className="bp-grid" onSubmit={createQualification}>
                <div>
                  <Label htmlFor="supplier-qualification-type">
                    Qualification type
                  </Label>
                  <Input
                    id="supplier-qualification-type"
                    name="qualificationTypeCode"
                    required
                    defaultValue="supplier.initial"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-qualification-from">
                    Effective from
                  </Label>
                  <Input
                    id="supplier-qualification-from"
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-qualification-until">
                    Effective until
                  </Label>
                  <Input
                    id="supplier-qualification-until"
                    name="effectiveUntil"
                    type="date"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-qualification-review">
                    Next review
                  </Label>
                  <Input
                    id="supplier-qualification-review"
                    name="nextReviewAt"
                    type="date"
                  />
                </div>
                <Button type="submit" loading={busy === "qualification"}>
                  Open qualification
                </Button>
              </form>
            ) : null}
            <ControlTable
              headings={["Type", "Scope", "Decision", "Effective", "Action"]}
              rows={readiness.qualifications.map((item) => [
                item.qualificationTypeCode,
                item.companyCodeId ?? "Organization",
                item.decision,
                `${item.effectiveFrom ?? "—"} to ${item.effectiveUntil ?? "open"}`,
                item.decision === "pending" &&
                grants.has(supplierControlPermissions.qualification) ? (
                  <div className="bp-actions">
                    <Button
                      variant="secondary"
                      loading={busy === `qualification-${item.id}`}
                      onClick={() =>
                        void decideQualification(
                          item.id,
                          item.rowVersion,
                          "approved",
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      loading={busy === `qualification-${item.id}`}
                      onClick={() =>
                        void decideQualification(
                          item.id,
                          item.rowVersion,
                          "conditional",
                        )
                      }
                    >
                      Conditional
                    </Button>
                    <Button
                      variant="danger"
                      loading={busy === `qualification-${item.id}`}
                      onClick={() =>
                        void decideQualification(
                          item.id,
                          item.rowVersion,
                          "rejected",
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                ) : ["approved", "conditional"].includes(item.decision) &&
                  grants.has(supplierControlPermissions.qualification) ? (
                  <Button
                    variant="danger"
                    loading={busy === `qualification-${item.id}`}
                    onClick={() =>
                      void decideQualification(
                        item.id,
                        item.rowVersion,
                        "suspended",
                      )
                    }
                  >
                    Suspend qualification
                  </Button>
                ) : (
                  "—"
                ),
              ])}
              empty="No qualifications exist in this scope."
            />
          </Card>
          <Card className="bp-section">
            <h2>Supplier preference</h2>
            {grants.has(supplierControlPermissions.preference) ? (
              <form className="bp-grid" onSubmit={createPreference}>
                <div>
                  <Label htmlFor="supplier-preference-rationale">
                    Rationale
                  </Label>
                  <Input
                    id="supplier-preference-rationale"
                    name="rationale"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-preference-from">
                    Effective from
                  </Label>
                  <Input
                    id="supplier-preference-from"
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-preference-until">
                    Effective until
                  </Label>
                  <Input
                    id="supplier-preference-until"
                    name="effectiveUntil"
                    type="date"
                  />
                </div>
                <Button type="submit" loading={busy === "preference"}>
                  Propose preference
                </Button>
              </form>
            ) : null}
            <ControlTable
              headings={["Rationale", "Status", "Effective", "Action"]}
              rows={preferences.map((item) => [
                item.rationale,
                item.status,
                `${item.effectiveFrom} to ${item.effectiveUntil ?? "open"}`,
                item.status === "pending" &&
                grants.has(supplierControlPermissions.preference) ? (
                  <div className="bp-actions">
                    <Button
                      variant="secondary"
                      loading={busy === `preference-${item.id}`}
                      onClick={() => void decidePreference(item, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      loading={busy === `preference-${item.id}`}
                      onClick={() => void decidePreference(item, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                ) : item.status === "approved" &&
                  grants.has(supplierControlPermissions.preference) ? (
                  <Button
                    variant="secondary"
                    loading={busy === `preference-${item.id}`}
                    onClick={() =>
                      void run(
                        `preference-${item.id}`,
                        () =>
                          api.revokePreference(item.id, {
                            expectedVersion: item.rowVersion,
                            reason: "SUPPLIER_PREFERENCE_REVOKED",
                          }),
                        "Preference revoked",
                      )
                    }
                  >
                    Revoke
                  </Button>
                ) : (
                  "—"
                ),
              ])}
              empty="No preference designations exist in this scope."
            />
          </Card>
          {companyCodeId ? <BankVerificationControls key={`${businessPartnerId}:${companyCodeId}`} businessPartnerId={businessPartnerId} companyCodeId={companyCodeId} /> : null}
          {companyCodeId && grants.has(supplierControlPermissions.lifecycle) ? (
            <Card className="bp-section">
              <h2>Bank verification</h2>
              <p>
                A bank change enters the governed case workflow. Materialization
                starts the native maker/checker verification; activation remains
                blocked until payment readiness passes.
              </p>
              <form className="bp-grid" onSubmit={bankChange}>
                <div>
                  <Label htmlFor="supplier-bank-projection">
                    Received bank disclosure projection
                  </Label>
                  <Input
                    id="supplier-bank-projection"
                    name="bankProjectionId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-bank-reason">Reason code</Label>
                  <Input
                    id="supplier-bank-reason"
                    name="reason"
                    required
                    pattern="[A-Z][A-Z0-9_.-]{2,126}"
                    defaultValue="SUPPLIER_BANK_CHANGE"
                  />
                </div>
                <Button type="submit" loading={busy === "bank"}>
                  Create bank change case
                </Button>
              </form>
            </Card>
          ) : null}
          {grants.has(supplierControlPermissions.lifecycle) ? (
            <Card className="bp-section">
              <h2>Governed lifecycle change</h2>
              <p>
                Business Partner lifecycle changes create a reviewable entity case;
                this screen never updates master status directly.
              </p>
              <form className="bp-grid" onSubmit={lifecycle}>
                <div>
                  <Label htmlFor="supplier-lifecycle-action">Action</Label>
                  <Select id="supplier-lifecycle-action" name="action" required>
                    <option value="deactivate">Deactivate</option>
                    <option value="reactivate">Reactivate</option>
                    <option value="archive">Archive</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="supplier-lifecycle-reason">Reason code</Label>
                  <Input
                    id="supplier-lifecycle-reason"
                    name="reason"
                    required
                    pattern="[A-Z][A-Z0-9_.-]{2,126}"
                  />
                </div>
                <Button type="submit" loading={busy === "lifecycle"}>
                  Create lifecycle case
                </Button>
              </form>
            </Card>
          ) : null}
        </>
      ) : organizationId && !loading ? (
        <Card>
          <p>No supplier role is visible in this authorized scope.</p>
        </Card>
      ) : null}
    </PageSurface>
  );
}

function ControlTable({
  headings,
  rows,
  empty,
}: {
  headings: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  empty: string;
}) {
  return rows.length ? (
    <div className="bp-table-wrap">
      <table className="bp-table">
        <thead>
          <tr>
            {headings.map((item) => (
              <th key={item}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((item, cell) => (
                <td key={cell}>{item}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>{empty}</p>
  );
}
function required(data: FormData, name: string) {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${name} is required`);
  return value.trim();
}
function optional(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function supplierLifecycleEvidence(
  aggregate?: PartnerAggregate,
  readiness?: PartnerEligibility,
) {
  return Object.freeze([
    {
      code: "supplier_roles",
      count:
        aggregate?.suppliers.filter((item) => item.status === "active")
          .length ?? 0,
      blocking: false,
    },
    {
      code: "customer_roles",
      count:
        aggregate?.customers.filter((item) => item.status === "active")
          .length ?? 0,
      blocking: false,
    },
    {
      code: "active_organization_assignments",
      count:
        aggregate?.organizationAssignments.filter(
          (item) => item.status === "active",
        ).length ?? 0,
      blocking: false,
    },
    { code: "active_employments", count: 0, blocking: false },
    {
      code: "effective_blocks",
      count: readiness?.activeBlockIds.length ?? 0,
      blocking: Boolean(readiness?.activeBlockIds.length),
    },
    {
      code: "effective_qualifications",
      count:
        readiness?.qualifications.filter((item) =>
          ["approved", "conditional"].includes(item.decision),
        ).length ?? 0,
      blocking: false,
    },
  ]);
}
function errorMessage(cause: unknown): string {
  if (cause instanceof ApiTransportError)
    return cause.problem?.detail ?? cause.message;
  if (cause instanceof Error) return cause.message;
  return "Unexpected supplier controls error";
}
