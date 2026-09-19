"use client";
import {
  EntityIntakeForm,
  useEntityIntake,
  useDataValidation,
  type DisplayIssue,
} from "@athyper/platform-entity-form-detail";
import { submitBusinessPartnerIntake } from "./intake-submit";

import {
  useApiClient,
  useToasts,
} from "@athyper/platform-shell-app-foundation";
import { BusinessPartnerPageFrame } from "./page-frame";
import { Button, Card, Input, Label, Select } from "@athyper/platform-ui";
import {
  useNeonWorkContext,
  useNeonOperatingOrganization,
} from "@athyper/product-neon-shell";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createBusinessPartnerClient } from "./client";

export function NewCustomerRequest() {
  const intake = useEntityIntake();
  const [intakeCommandKey, setIntakeCommandKey] = useState(() =>
    crypto.randomUUID(),
  );
  const http = useApiClient(),
    api = useMemo(() => createBusinessPartnerClient(http), [http]),
    work = useNeonWorkContext(),
    operating = useNeonOperatingOrganization(),
    toast = useToasts(),
    [organizationId, setOrganizationId] = useState(""),
    [values, setValues] = useState({ registrationCountryCode: "", name: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
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
  useEffect(() => {
    setOrganizationId((current) =>
      organizations.some((item) => item.id === current)
        ? current
        : organizations.length === 1
          ? organizations[0]!.id
          : "",
    );
  }, [organizations]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const name = value(data, "name"),
        result = await api.onboardCustomer(
          {
            operatingOrganizationId: organizationId,
            ...(companyCodeId ? { companyCodeId } : {}),
            proposedPayload: {
              name,
              partnerCategory: "organization",
              ownershipClass: "external",
              customerType: "corporate",
              registrationCountryCode: value(
                data,
                "registrationCountryCode",
              ).toUpperCase(),
            },
          },
          intakeCommandKey,
        );
      intake?.markSaved();
      const completion = intake
        ? await submitBusinessPartnerIntake(api, result.request)
        : undefined;
      toast.push({
        tone: completion && !completion.submitted ? "warning" : "success",
        title: completion?.submitted
          ? "Customer request submitted"
          : "Customer request created",
        detail: completion?.detail ?? result.request.requestNo,
      });
      window.location.assign(
        `/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unexpected customer request error",
      );
      setBusy(false);
    }
  }
  return (
    <BusinessPartnerPageFrame
      contentOnly={Boolean(intake)}
      title="New customer onboarding request"
      description="Register an organization customer in an authorized sales scope."
      actions={
        <a
          className="a-button a-button--secondary"
          href="/mdg/business-partner/requests"
        >
          Cancel
        </a>
      }
    >
      <EntityIntakeForm
        onChangeCapture={() => setIntakeCommandKey(crypto.randomUUID())}
        detailsStep="details"
        reviewStep="review"
        submissionError={error}
        className="bp-form"
        onSubmit={submit}
      >
        <CustomerRequestFields
          organizationId={organizationId}
          organizations={organizations}
          values={values}
          onOrganizationChange={setOrganizationId}
          onValuesChange={setValues}
        />
        {error ? (
          <div className="bp-error" role="alert">
            {error}
          </div>
        ) : null}
        <Button type="submit" loading={busy} disabled={!organizationId}>
          {intake ? "Continue to review" : "Create customer draft"}
        </Button>
      </EntityIntakeForm>
    </BusinessPartnerPageFrame>
  );
}
function CustomerRequestFields({
  organizationId,
  organizations,
  values,
  onOrganizationChange,
  onValuesChange,
}: {
  readonly organizationId: string;
  readonly organizations: readonly { id: string; code: string; displayName: string }[];
  readonly values: { readonly registrationCountryCode: string; readonly name: string };
  readonly onOrganizationChange: (value: string) => void;
  readonly onValuesChange: (value: { registrationCountryCode: string; name: string }) => void;
}) {
  const validation = useDataValidation();
  const read = useRef<() => DisplayIssue[]>(() => []);
  read.current = () => {
    const issues: DisplayIssue[] = [];
    if (!organizationId)
      issues.push({ id: "customer-org", message: "Requesting organization is required." });
    if (!values.registrationCountryCode.trim())
      issues.push({ id: "customer-country", message: "Registration country is required." });
    else if (values.registrationCountryCode.trim().length !== 2)
      issues.push({ id: "customer-country", message: "Registration country must contain 2 characters." });
    if (!values.name.trim())
      issues.push({ id: "customer-name", message: "Registered name is required." });
    return issues;
  };
  useLayoutEffect(
    () => validation?.register("business-partner-customer-request", () => read.current()) ?? undefined,
    [validation?.register],
  );
  const messages = new Map(
    validation?.attempted
      ? Array.from(read.current(), (issue) => [issue.id, issue.message] as const)
      : [],
  );
  const fieldProps = (id: string) => ({
    "aria-invalid": messages.has(id) || undefined,
    "aria-describedby": messages.has(id) ? `${id}-error` : undefined,
  });
  const error = (id: string) =>
    messages.has(id) ? <p id={`${id}-error`} className="a-field-error" aria-live="polite">{messages.get(id)}</p> : null;
  return (
    <Card className="bp-section">
      <h2>Sales scope</h2>
      <div className="bp-grid">
        <div className="bp-field">
          <Label htmlFor="customer-org">Requesting organization</Label>
          <Select id="customer-org" value={organizationId} onChange={(event) => onOrganizationChange(event.currentTarget.value)} required {...fieldProps("customer-org")}>
            <option value="">Select an authorized organization</option>
            {organizations.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.displayName}</option>)}
          </Select>
          {error("customer-org")}
        </div>
        <div className="bp-field">
          <Label htmlFor="customer-country">Registration country</Label>
          <Input id="customer-country" name="registrationCountryCode" value={values.registrationCountryCode} onChange={(event) => onValuesChange({ ...values, registrationCountryCode: event.currentTarget.value })} required minLength={2} maxLength={2} {...fieldProps("customer-country")} />
          {error("customer-country")}
        </div>
        <div className="bp-field">
          <Label htmlFor="customer-name">Registered name</Label>
          <Input id="customer-name" name="name" value={values.name} onChange={(event) => onValuesChange({ ...values, name: event.currentTarget.value })} required maxLength={320} {...fieldProps("customer-name")} />
          {error("customer-name")}
        </div>
      </div>
    </Card>
  );
}
function value(data: FormData, name: string): string {
  const result = data.get(name);
  if (typeof result !== "string" || !result.trim())
    throw new Error(`${name} is required`);
  return result.trim();
}
function optional(data: FormData, name: string): string | undefined {
  const result = data.get(name);
  return typeof result === "string" && result.trim()
    ? result.trim()
    : undefined;
}
