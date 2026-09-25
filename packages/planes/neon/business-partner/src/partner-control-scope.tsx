import { Card, Input, Label, Select } from "@athyper/platform-ui";

/** Shared scope UI only; Customer and Supplier retain their own command authorities. */
export function PartnerControlScope({id, organizationLabel, companyLabel, organizations, organizationId, companyCodeId, onOrganizationChange, error}: {
  readonly id: string;
  readonly organizationLabel: string;
  readonly companyLabel: string;
  readonly organizations: readonly {id: string; code: string; displayName: string}[];
  readonly organizationId: string;
  readonly companyCodeId?: string;
  readonly onOrganizationChange: (id: string) => void;
  readonly error?: string;
}) {
  return <>
    <Card className="bp-filter-bar">
      <div>
        <Label htmlFor={`${id}-organization`}>{organizationLabel}</Label>
        <Select id={`${id}-organization`} value={organizationId} onChange={event => onOrganizationChange(event.currentTarget.value)}>
          <option value="">Select an authorized organization</option>
          {organizations.map(item => <option key={item.id} value={item.id}>{item.code} · {item.displayName}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${id}-company`}>{companyLabel}</Label>
        <Input id={`${id}-company`} readOnly value={companyCodeId ?? "Select a company in the work context"} />
      </div>
    </Card>
    {error ? <div className="bp-error" role="alert"><strong>Unable to complete the command</strong><p>{error}</p></div> : null}
    {!companyCodeId ? <Card><p>Select a company in the NEON work context to review readiness.</p></Card> : null}
  </>;
}
