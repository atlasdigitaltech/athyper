"use client";

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
  Skeleton,
} from "@athyper/platform-ui";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createBusinessPartnerClient, type PartnerAggregate } from "./client";

export type CommercialRole = "supplier" | "customer";

export function availableRoleExtensions(
  aggregate: PartnerAggregate,
): readonly CommercialRole[] {
  const result: CommercialRole[] = [];
  if (!aggregate.suppliers.some((item) => item.status !== "retired"))
    result.push("supplier");
  if (!aggregate.customers.some((item) => item.status !== "retired"))
    result.push("customer");
  return Object.freeze(result);
}

export function roleAuthoritySnapshot(aggregate: PartnerAggregate) {
  return Object.freeze({
    businessPartner: Object.freeze({
      id: aggregate.businessPartner.id,
      code: aggregate.businessPartner.code,
      name: aggregate.businessPartner.name,
      status: aggregate.businessPartner.status,
    }),
    suppliers: Object.freeze(
      aggregate.suppliers.map((item) =>
        Object.freeze({
          id: item.id,
          code: item.supplierCode,
          status: item.status,
        }),
      ),
    ),
    customers: Object.freeze(
      aggregate.customers.map((item) =>
        Object.freeze({
          id: item.id,
          code: item.customerCode,
          status: item.status,
          designations: Object.freeze(
            item.designations.map((designation) =>
              Object.freeze({
                id: designation.id,
                type: designation.type,
                priorityTier: designation.priorityTier,
                effectiveFrom: designation.effectiveFrom,
                effectiveUntil: designation.effectiveUntil,
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

export function GovernedBusinessPartnerRoleExtension({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
  const permissions = usePermissions();
  if (!permissions.has("neon.relationship.entity_case.create")) {
    return (
      <div data-ui-state="unauthorized">
        <PageSurface
          title="Add Business Partner role"
          description="Role extension authority is scoped by operating organization."
        >
          <Notice>
            You do not have permission to create a governed role-extension case.
          </Notice>
        </PageSurface>
      </div>
    );
  }
  return <RoleExtensionForm businessPartnerId={businessPartnerId} />;
}

function RoleExtensionForm({
  businessPartnerId,
}: {
  businessPartnerId: string;
}) {
  const http = useApiClient();
  const api = useMemo(() => createBusinessPartnerClient(http), [http]);
  const operating = useNeonOperatingOrganization();
  const work = useNeonWorkContext();
  const toast = useToasts();
  const navigation = useApplicationNavigation();
  const companyCodeId =
    work.selection.mode === "company"
      ? work.selection.companyCodeId
      : undefined;
  const compatible = useMemo(
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
  const [role, setRole] = useState<CommercialRole>("supplier");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setOrganizationId((current) =>
      compatible.some((item) => item.id === current)
        ? current
        : compatible.length === 1
          ? compatible[0]!.id
          : "",
    );
  }, [compatible]);

  useEffect(() => {
    setAggregate(undefined);
    if (!organizationId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    api
      .aggregate(businessPartnerId, organizationId, controller.signal)
      .then(setAggregate)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Unable to load target",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, businessPartnerId, organizationId]);

  const available = aggregate ? availableRoleExtensions(aggregate) : [];
  useEffect(() => {
    if (available.length && !available.includes(role)) setRole(available[0]!);
  }, [available, role]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aggregate || !available.includes(role)) return;
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const code = requiredValue(data, "roleCode").toUpperCase();
      const type = requiredValue(data, "roleType");
      const result = await api.extend({
        businessPartnerId,
        role,
        operatingOrganizationId: organizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        proposedPayload:
          role === "supplier"
            ? { supplierCode: code, supplierType: type }
            : { customerCode: code, customerType: type },
      });
      toast.push({
        tone: "success",
        title: result.replayed
          ? "Existing extension opened"
          : "Role extension created",
        detail: `${result.request.requestNo} reuses ${aggregate.businessPartner.code} and has an independent approval lifecycle.`,
      });
      navigation.push(
        `/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create extension",
      );
      setBusy(false);
    }
  }

  return (
    <div data-ui-state={busy ? "mutation-pending" : error ? "error" : "ready"}>
      <PageSurface
        title="Add Business Partner role"
        description="Reuse one organization identity while governing Supplier and Customer authority independently."
        actions={
          <a
            className="a-button a-button--secondary"
            href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`}
          >
            Cancel
          </a>
        }
      >
        <Card className="bp-section">
          <Field label="Operating organization" htmlFor="bp-r2-organization">
            <Select
              id="bp-r2-organization"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.currentTarget.value)}
              required
            >
              <option value="">Select an authorized organization</option>
              {compatible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        {loading ? <Skeleton label="Loading existing authorities" /> : null}
        {aggregate ? <ExistingAuthority aggregate={aggregate} /> : null}
        {aggregate && available.length === 0 ? (
          <Notice>
            This Business Partner already has active Supplier and Customer
            roles. No role extension is available.
          </Notice>
        ) : null}
        {aggregate && available.length ? (
          <form className="bp-form" onSubmit={submit}>
            <Card className="bp-section">
              <h2>Requested role</h2>
              <div className="bp-grid">
                <Field label="Role" htmlFor="bp-r2-role">
                  <Select
                    id="bp-r2-role"
                    value={role}
                    onChange={(event) =>
                      setRole(event.currentTarget.value as CommercialRole)
                    }
                  >
                    <option
                      value="supplier"
                      disabled={!available.includes("supplier")}
                    >
                      Supplier
                    </option>
                    <option
                      value="customer"
                      disabled={!available.includes("customer")}
                    >
                      Customer
                    </option>
                  </Select>
                </Field>
                <Field label={`${title(role)} code`} htmlFor="bp-r2-role-code">
                  <Input
                    id="bp-r2-role-code"
                    name="roleCode"
                    required
                    maxLength={63}
                    pattern="[A-Za-z][A-Za-z0-9_.-]+"
                  />
                </Field>
                <Field label={`${title(role)} type`} htmlFor="bp-r2-role-type">
                  <Select
                    id="bp-r2-role-type"
                    name="roleType"
                    defaultValue={role === "supplier" ? "general" : "corporate"}
                    key={role}
                  >
                    {role === "supplier" ? (
                      <>
                        <option value="general">General</option>
                        <option value="strategic">Strategic</option>
                        <option value="service">Service</option>
                        <option value="carrier">Carrier</option>
                        <option value="intercompany">Intercompany</option>
                      </>
                    ) : (
                      <>
                        <option value="corporate">Corporate</option>
                        <option value="individual">Individual</option>
                        <option value="government">Government</option>
                        <option value="intercompany">Intercompany</option>
                      </>
                    )}
                  </Select>
                </Field>
              </div>
            </Card>
            {error ? <Notice>{error}</Notice> : null}
            <div className="bp-form-actions">
              <Button type="submit" loading={busy}>
                Create extension request
              </Button>
            </div>
          </form>
        ) : null}
        {error && !aggregate ? <Notice>{error}</Notice> : null}
      </PageSurface>
    </div>
  );
}

function ExistingAuthority({ aggregate }: { aggregate: PartnerAggregate }) {
  return (
    <Card className="bp-section">
      <h2>Identity and existing authority</h2>
      <dl className="bp-definition">
        <div>
          <dt>Business Partner</dt>
          <dd>{aggregate.businessPartner.code}</dd>
        </div>
        <div>
          <dt>Organization name</dt>
          <dd>{aggregate.businessPartner.name}</dd>
        </div>
        <div>
          <dt>Identity status</dt>
          <dd>{title(aggregate.businessPartner.status)}</dd>
        </div>
      </dl>
      <p>
        Existing roles are retained unchanged. The approved case may add only
        the selected missing role.
      </p>
      <div className="bp-actions" aria-label="Existing commercial roles">
        {aggregate.suppliers.map((item) => (
          <Badge key={item.id} tone="neutral">
            Supplier · {item.supplierCode} · {title(item.status)}
          </Badge>
        ))}
        {aggregate.customers.map((item) => (
          <Badge key={item.id} tone="neutral">
            Customer · {item.customerCode} · {title(item.status)}
          </Badge>
        ))}
        {!aggregate.suppliers.length && !aggregate.customers.length ? (
          <span>No commercial role yet</span>
        ) : null}
      </div>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="bp-field">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="bp-error" role="status">
      {children}
    </div>
  );
}

function requiredValue(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${title(name)} is required`);
  return value.trim();
}

function title(value: string): string {
  return value
    .replaceAll(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
