"use client";
import { parseInstant } from "@athyper/platform-temporal";
import { ApiTransportError } from "@athyper/platform-api-client";
import { readBrowserCsrfToken, useApiClient, useApplicationNavigation, useFeature, usePermissions, useToasts } from "@athyper/platform-shell-app-foundation";
import { PageSurface } from "@athyper/platform-surface-kit";
import { Badge, Button, Card, Input, Label, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/platform-ui";
import { useNeonOperatingOrganization, useNeonWorkContext } from "@athyper/product-neon-shell";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { statusTone } from "./workflow";
import { createBusinessPartnerClient, type PartnerAggregate, type PartnerEligibility, type PartnerRequest, type RequestStatus, type RequestView } from "./client";
import { isRequestFieldVisible, requestFormDefaults, serializeRequestForm, type PublishedRequestForm, type RequestFormField, type RequestFormRepeatableComponent } from "./request-form-descriptor";
import { buildRelationshipExtensions, newAddress, newContact, type AddressDraft, type ContactDraft } from "./request-relationships";
import { BusinessPartner360Shell } from "./360/business-partner-360";
import { caseStatusUiState, DecisionDialog, failureUiState, GovernedCaseContract, GovernedCaseSummary, governedCaseActions, UnsavedChangesDialog, useGuardedNavigation } from "./case-experience";
import { DuplicateEvidence, ValidationEvidence } from "./validation-experience";
import { MaterializationResultProof } from "./result-experience";
export * from "./client";
export * from "./request-form-descriptor";
export * from "./workflow";
export * from "./result-experience";
export { CustomerControls } from "./customer-controls";
export { SupplierControls } from "./supplier-controls";
export { NewCustomerRequest } from "./customer-request";
export * from "./360/business-partner-360-client";
export * from "./360/business-partner-360-section-client";
export * from "./360/business-partner-360-role-client";
export * from "./role-extension-experience";
export * from "./applicant-experience";
export * from "./mesh-proposal-experience";

export function BusinessPartnerRecord({ businessPartnerId }: { readonly businessPartnerId: string }) {
  return useFeature("neon.business_partner.view_360") ? <BusinessPartner360Shell businessPartnerId={businessPartnerId} /> : <BusinessPartnerAggregateDetail businessPartnerId={businessPartnerId} />;
}

export function BusinessPartnerScopeConfiguration({ businessPartnerId, initialCompanyCodeId="", initialOrganizationId="", initialRole="supplier", initialKind="assign_organization" }: { readonly businessPartnerId: string; initialCompanyCodeId?:string; initialOrganizationId?:string; initialRole?:"supplier"|"customer"; initialKind?:"assign_organization"|"configure_company" }) {
  const api = usePartnerApi(),
    work = useNeonWorkContext(),
    operating = useNeonOperatingOrganization(),
    toast = useToasts(),
    navigation = useApplicationNavigation();
  const [kind, setKind] = useState<"assign_organization" | "configure_company">(initialKind),
    [role, setRole] = useState<"supplier" | "customer">(initialRole),
    [organizationId, setOrganizationId] = useState(initialOrganizationId),
    [companyCodeId, setCompanyCodeId] = useState(initialCompanyCodeId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const selectedOrganization=operating.organizations.find(o=>o.id===organizationId);
  const companyAvailable=work.companies.some(c=>c.companyCodeId===companyCodeId)&&selectedOrganization?.companyAssignments.some(a=>a.companyCodeId===companyCodeId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      if (!selectedOrganization || (companyCodeId && !companyAvailable)) throw new Error("Select an authorized company and operating organization.");
      if (kind === "configure_company" && !companyCodeId) throw new Error("Select a company before creating a finance configuration request.");
      const proposedPayload =
        kind === "assign_organization"
          ? {
              effectiveFrom: value(data, "effectiveFrom"),
              ...(optionalValue(data, "effectiveUntil") ? { effectiveUntil: optionalValue(data, "effectiveUntil") } : {}),
            }
          : {
              currencyCode: value(data, "currencyCode").toUpperCase(),
              paymentTermId: value(data, "paymentTermId"),
              defaultAccountingProfileId: value(data, "defaultAccountingProfileId"),
              ...(optionalValue(data, "defaultDimensionSetId")
                ? {
                    defaultDimensionSetId: optionalValue(data, "defaultDimensionSetId"),
                  }
                : {}),
              ...(role === "supplier"
                ? {
                    preferredRemittanceBankLinkId: value(data, "preferredRemittanceBankLinkId"),
                  }
                : {
                    ...(optionalValue(data, "statementCycleCode")
                      ? {
                          statementCycleCode: optionalValue(data, "statementCycleCode"),
                        }
                      : {}),
                  }),
            };
      const result = await api.configureScope({
        businessPartnerId,
        kind,
        role,
        operatingOrganizationId: organizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        proposedPayload,
      });
      toast.push({
        tone: "success",
        title: result.replayed ? "Existing request opened" : "Configuration request created",
        detail: `${result.request.requestNo} must pass validation and independent approval.`,
      });
      navigation.push(`/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }
  return (
    <PageSurface
      title="Configure Business Partner scope"
      description="Govern role assignment and company finance activation independently from the partner identity."
      actions={
        <a className="a-button a-button--secondary" href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`}>
          Cancel
        </a>
      }
    >
      <form className="bp-form" onSubmit={submit}>
        <Card className="bp-section">
          <div className="bp-grid">
            <Field label="Configuration" htmlFor="bp-scope-kind">
              <Select id="bp-scope-kind" value={kind} onChange={(event) => setKind(event.currentTarget.value as typeof kind)}>
                <option value="assign_organization">Assign operating organization</option>
                <option value="configure_company">Configure company finance profile</option>
              </Select>
            </Field>
            <Field label="Role" htmlFor="bp-scope-role">
              <Select id="bp-scope-role" value={role} onChange={(event) => setRole(event.currentTarget.value as typeof role)}>
                <option value="supplier">Supplier</option>
                <option value="customer">Customer</option>
              </Select>
            </Field>
            <Field label="Company" htmlFor="bp-extension-company"><Select id="bp-extension-company" value={companyCodeId} onChange={event=>{const id=event.target.value;setCompanyCodeId(id);const choices=operating.organizations.filter(o=>o.companyAssignments.some(a=>a.companyCodeId===id));setOrganizationId(choices.length===1?choices[0]!.id:"");}}><option value="">Select company</option>{work.companies.map(c=><option key={c.companyCodeId} value={c.companyCodeId}>{c.displayName}</option>)}</Select></Field>
            <Field label="Operating organization" htmlFor="bp-extension-organization"><Select id="bp-extension-organization" value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">Select organization</option>{operating.organizations.filter(o=>!companyCodeId||o.companyAssignments.some(a=>a.companyCodeId===companyCodeId)).map(o=><option key={o.id} value={o.id}>{o.displayName}</option>)}</Select></Field>
            {kind === "assign_organization" ? (
              <>
                <Field label="Effective from" htmlFor="bp-effective-from">
                  <Input id="bp-effective-from" name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </Field>
                <Field label="Effective until" htmlFor="bp-effective-until">
                  <Input id="bp-effective-until" name="effectiveUntil" type="date" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Selected company" htmlFor="bp-selected-company">
                  <Input id="bp-selected-company" value={work.companies.find(c=>c.companyCodeId===companyCodeId)?.displayName ?? "Select a company"} readOnly />
                </Field>
                <Field label="Currency" htmlFor="bp-currency">
                  <Input id="bp-currency" name="currencyCode" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" />
                </Field>
                <Field label="Payment term ID" htmlFor="bp-payment-term">
                  <Input id="bp-payment-term" name="paymentTermId" required pattern="[0-9a-fA-F-]{36}" />
                </Field>
                <Field label="Accounting profile ID" htmlFor="bp-accounting-profile">
                  <Input id="bp-accounting-profile" name="defaultAccountingProfileId" required pattern="[0-9a-fA-F-]{36}" />
                </Field>
                <Field label="Dimension set ID" htmlFor="bp-dimension-set">
                  <Input id="bp-dimension-set" name="defaultDimensionSetId" pattern="[0-9a-fA-F-]{36}" />
                </Field>
                {role === "supplier" ? (
                  <Field label="Remittance bank link ID" htmlFor="bp-bank-link">
                    <Input id="bp-bank-link" name="preferredRemittanceBankLinkId" required pattern="[0-9a-fA-F-]{36}" />
                  </Field>
                ) : (
                  <Field label="Statement cycle" htmlFor="bp-statement-cycle">
                    <Input id="bp-statement-cycle" name="statementCycleCode" pattern="[a-z][a-z0-9_.-]+" />
                  </Field>
                )}
              </>
            )}
          </div>
        </Card>
        {error ? <ErrorNotice detail={error} /> : null}
        <div className="bp-form-actions">
          <Button type="submit" loading={busy} disabled={!organizationId || (kind === "configure_company" && !companyCodeId)}>
            Create governed request
          </Button>
        </div>
      </form>
    </PageSurface>
  );
}

function usePartnerApi() {
  const http = useApiClient();
  return useMemo(() => createBusinessPartnerClient(http), [http]);
}
export function BusinessPartnerHome({ children }: { readonly children: ReactNode }) {
  const permissions = usePermissions();
  return (
    <PageSurface
      title="Business Partners"
      description="Organization-scoped partner master and governed onboarding."
      actions={
        <div className="bp-actions">
          <a className="a-button a-button--secondary" href="/mdg/business-partner/requests">
            Onboarding requests
          </a>
          {permissions.has("neon.relationship.entity_case.create") ? (
            <>
              <a className="a-button a-button--secondary" href="/mdg/business-partner/customer/new">
                New customer
              </a>
              <a className="a-button a-button--primary" href="/mdg/business-partner/new">
                New supplier
              </a>
            </>
          ) : null}
        </div>
      }
    >
      {children}
    </PageSurface>
  );
}
function useOrganizationSelection() {
  const operating = useNeonOperatingOrganization(),
    work = useNeonWorkContext(),
    company = work.selection.mode === "company" ? work.selection : undefined;
  const compatible = useMemo(() => operating.organizations.filter((item) => !company || item.companyAssignments.some((assignment) => assignment.companyCodeId === company.companyCodeId)), [operating.organizations, company?.companyCodeId]);
  const [selected, setSelected] = useState("");
  useEffect(() => setSelected((current) => (compatible.some((item) => item.id === current) ? current : compatible.length === 1 ? compatible[0]!.id : "")), [compatible]);
  return { operating, company, compatible, selected, setSelected };
}
function OrganizationField({ value, onChange, required = true }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const selection = useOrganizationSelection();
  useEffect(() => {
    if (!value && selection.selected) onChange(selection.selected);
  }, [value, selection.selected, onChange]);
  return (
    <Field label="Operating organization" htmlFor="bp-operating-organization">
      <Select id="bp-operating-organization" required={required} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Select an authorized procurement or sales organization</option>
        {selection.compatible.map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} · {item.displayName}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function BusinessPartnerRequestList() {
  const api = usePartnerApi(),
    selection = useOrganizationSelection(),
    [status, setStatus] = useState<RequestStatus | "">(""),
    [items, setItems] = useState<readonly PartnerRequest[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!selection.selected) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    api
      .list(selection.selected, status || undefined, controller.signal)
      .then(setItems)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, selection.selected, status]);
  const state = loading ? "loading" : error ? "error" : !selection.selected || !items.length ? "empty" : "ready";
  return (
    <div data-ui-state={state}>
      <PageSurface
        title="Business Partner onboarding"
        description="Create, validate, approve and materialize governed partner requests."
        actions={
          <div className="bp-actions">
            <a className="a-button a-button--secondary" href="/mdg/business-partner">
              Partner master
            </a>
            <a className="a-button a-button--primary" href="/mdg/business-partner/new">
              New supplier request
            </a>
          </div>
        }
      >
        <Card className="bp-filter-bar">
          <OrganizationSelect selection={selection} value={selection.selected} onChange={selection.setSelected} />
          <Field label="Status" htmlFor="bp-status-filter">
            <Select id="bp-status-filter" value={status} onChange={(event) => setStatus(event.currentTarget.value as RequestStatus | "")}>
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        {error ? <ErrorNotice detail={error} /> : null}
        {loading ? <RequestSkeleton /> : selection.selected ? <RequestTable items={items} /> : <Empty title="Choose an operating organization" detail="Commercial requests are organization-scoped and contain supplier or customer data only." />}
      </PageSurface>
    </div>
  );
}

export function NewBusinessPartnerRequest() {
  const api = usePartnerApi(),
    work = useNeonWorkContext(),
    toast = useToasts(),
    [organizationId, setOrganizationId] = useState(""),
    [publishedForm, setPublishedForm] = useState<PublishedRequestForm>(),
    [answers, setAnswers] = useState<Readonly<Record<string, unknown>>>({}),
    [addresses,setAddresses]=useState<readonly AddressDraft[]>([newAddress()]),
    [contacts,setContacts]=useState<readonly ContactDraft[]>([newContact()]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string>();
  const navigation = useGuardedNavigation(dirty),
    companyCodeId = work.selection.mode === "company" ? work.selection.companyCodeId : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.requestForm(controller.signal).then(result => {
      setPublishedForm(result);
      setAnswers(requestFormDefaults(result.descriptor));
      const components=result.descriptor.sections.flatMap(section=>section.components??[]),addressComponent=components.find(component=>component.kind==="addresses"),contactComponent=components.find(component=>component.kind==="contacts");
      if(addressComponent)setAddresses([{...newAddress(),purpose:addressComponent.lookups.purposes[0]!.value}]);
      if(contactComponent)setContacts([{...newContact(),channels:[{...newContact().channels[0]!,channelType:contactComponent.lookups.channels![0]!.value,purpose:contactComponent.lookups.purposes[0]!.value}]}]);
      setError(undefined);
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publishedForm) return;
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const serialized = serializeRequestForm(publishedForm.descriptor, data);
      const componentKinds=new Set(publishedForm.descriptor.sections.flatMap(section=>(section.components??[]).map(component=>component.kind))),extensions=componentKinds.size?await buildRelationshipExtensions(componentKinds.has("addresses")?addresses:[],componentKinds.has("contacts")?contacts:[]):undefined;
      const result = await api.create({
        operatingOrganizationId: organizationId || serialized.operatingOrganizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        expectedForm: publishedForm.definition,
        proposedPayload: serialized.proposedPayload,
        ...(extensions?{extensions}:{}),
      });
      toast.push({
        tone: "success",
        title: result.replayed ? "Existing request opened" : "Request created",
        detail: `${result.request.requestNo} is ready for validation.`,
      });
      setDirty(false);
      navigation.navigate(`/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`, true);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }
  return (
    <div data-ui-state={busy ? "mutation-pending" : error ? "mutation-failure" : "ready"}>
      <PageSurface
        title={publishedForm?.descriptor.title ?? "New supplier onboarding request"}
        description={publishedForm?.descriptor.description ?? "Loading the published request definition."}
        actions={
          <Button variant="secondary" onClick={() => navigation.navigate("/mdg/business-partner/requests")}>
            Cancel
          </Button>
        }
      >
        {loading ? <RequestSkeleton /> : publishedForm ? <form className="bp-form" data-definition-release={publishedForm.definition.releaseId} onSubmit={submit} onChangeCapture={(event) => { const target=event.target as unknown as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;setDirty(true);if(target.name)setAnswers(current=>({...current,[target.name]:target instanceof HTMLInputElement&&target.type==="checkbox"?target.checked:target.value}));}}>
          {publishedForm.descriptor.sections.map(section => <Card className="bp-section" key={section.key}>
            <h2>{section.title}</h2>
            {section.description ? <p className="bp-context-note">{section.description}</p> : null}
            <div className="bp-grid">
              {section.fields.filter(field => isRequestFieldVisible(field, answers)).map(field => field.widget === "operating_organization" ? <div className="bp-field--wide" key={field.key}><OrganizationField value={organizationId} onChange={value => {setOrganizationId(value);setAnswers(current=>({...current,[field.key]:value}));}} required={field.required}/>{companyCodeId ? <p className="bp-context-note">Company context will be pinned to this request.</p> : null}</div> : <DynamicRequestField field={field} key={field.key}/>) }
              {section.components?.map(component=>component.kind==="addresses"?<AddressCollection key={component.key} component={component} items={addresses} onChange={setAddresses}/>:<ContactCollection key={component.key} component={component} items={contacts} onChange={setContacts}/>) }
            </div>
          </Card>)}
          {error ? <ErrorNotice detail={error} /> : null}
          <div className="bp-form-actions">
            <Button type="submit" loading={busy} disabled={!organizationId}>
              {publishedForm.descriptor.submitLabel}
            </Button>
          </div>
        </form> : <ErrorNotice detail={error ?? "The published Supplier request definition is unavailable."} />}
        <UnsavedChangesDialog navigation={navigation} />
      </PageSurface>
    </div>
  );
}

function AddressCollection({component,items,onChange}:{readonly component:RequestFormRepeatableComponent;readonly items:readonly AddressDraft[];readonly onChange:(items:readonly AddressDraft[])=>void}){
 const update=(index:number,patch:Partial<AddressDraft>)=>onChange(items.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));
 return <fieldset className="bp-repeatable bp-field--wide"><legend>{component.title}</legend>{items.map((item,index)=><Card className="bp-repeatable__item" key={item.key}><div className="bp-repeatable__header"><h3>Address {index+1}</h3>{items.length>component.minItems?<Button type="button" variant="secondary" onClick={()=>onChange(items.filter(candidate=>candidate.key!==item.key))}>Remove</Button>:null}</div><div className="bp-grid"><Field label="Purpose" htmlFor={`${item.key}-purpose`}><Select id={`${item.key}-purpose`} value={item.purpose} onChange={event=>update(index,{purpose:event.currentTarget.value})}>{component.lookups.purposes.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field><Field label="Country" htmlFor={`${item.key}-country`}><Select id={`${item.key}-country`} required value={item.countryCode} onChange={event=>update(index,{countryCode:event.currentTarget.value})}><option value="">Select country</option>{component.lookups.countries!.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field><Field label="Address line 1" htmlFor={`${item.key}-line1`}><Input id={`${item.key}-line1`} required value={item.line1} onChange={event=>update(index,{line1:event.currentTarget.value})}/></Field><Field label="Address line 2" htmlFor={`${item.key}-line2`}><Input id={`${item.key}-line2`} value={item.line2} onChange={event=>update(index,{line2:event.currentTarget.value})}/></Field><Field label="City" htmlFor={`${item.key}-city`}><Input id={`${item.key}-city`} required value={item.city} onChange={event=>update(index,{city:event.currentTarget.value})}/></Field><Field label="Region" htmlFor={`${item.key}-region`}><Input id={`${item.key}-region`} value={item.region} onChange={event=>update(index,{region:event.currentTarget.value})}/></Field><Field label="Postal code" htmlFor={`${item.key}-postal`}><Input id={`${item.key}-postal`} value={item.postalCode} onChange={event=>update(index,{postalCode:event.currentTarget.value})}/></Field><label className="bp-primary-choice"><input type="radio" name="primary-address" checked={item.isPrimary} onChange={()=>onChange(items.map(candidate=>({...candidate,isPrimary:candidate.key===item.key})))}/> Primary address</label></div></Card>)}{items.length<component.maxItems?<Button type="button" variant="secondary" onClick={()=>onChange([...items,{...newAddress(items.length),purpose:component.lookups.purposes[0]!.value}])}>{component.addLabel}</Button>:null}</fieldset>;
}

function ContactCollection({component,items,onChange}:{readonly component:RequestFormRepeatableComponent;readonly items:readonly ContactDraft[];readonly onChange:(items:readonly ContactDraft[])=>void}){
 const update=(index:number,patch:Partial<ContactDraft>)=>onChange(items.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));
 const updateChannel=(contactIndex:number,channelIndex:number,patch:Partial<ContactDraft["channels"][number]>)=>update(contactIndex,{channels:items[contactIndex]!.channels.map((channel,index)=>index===channelIndex?{...channel,...patch}:channel)});
 return <fieldset className="bp-repeatable bp-field--wide"><legend>{component.title}</legend>{items.map((item,index)=><Card className="bp-repeatable__item" key={item.key}><div className="bp-repeatable__header"><h3>Contact {index+1}</h3>{items.length>component.minItems?<Button type="button" variant="secondary" onClick={()=>onChange(items.filter(candidate=>candidate.key!==item.key))}>Remove</Button>:null}</div><div className="bp-grid"><Field label="Contact name" htmlFor={`${item.key}-name`}><Input id={`${item.key}-name`} required value={item.contactName} onChange={event=>update(index,{contactName:event.currentTarget.value})}/></Field><Field label="Business title" htmlFor={`${item.key}-title`}><Input id={`${item.key}-title`} value={item.businessTitle} onChange={event=>update(index,{businessTitle:event.currentTarget.value})}/></Field><Field label="Department" htmlFor={`${item.key}-department`}><Input id={`${item.key}-department`} value={item.departmentName} onChange={event=>update(index,{departmentName:event.currentTarget.value})}/></Field><label className="bp-primary-choice"><input type="radio" name="primary-contact" checked={item.isPrimary} onChange={()=>onChange(items.map(candidate=>({...candidate,isPrimary:candidate.key===item.key})))}/> Primary contact</label></div>{item.channels.map((channel,channelIndex)=><div className="bp-channel-row" key={channel.key}><Select aria-label="Channel type" value={channel.channelType} onChange={event=>updateChannel(index,channelIndex,{channelType:event.currentTarget.value})}>{component.lookups.channels!.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select><Select aria-label="Channel purpose" value={channel.purpose} onChange={event=>updateChannel(index,channelIndex,{purpose:event.currentTarget.value})}>{component.lookups.purposes.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select><Input aria-label="Channel value" required value={channel.value} onChange={event=>updateChannel(index,channelIndex,{value:event.currentTarget.value})}/><label><input type="radio" name={`primary-channel-${item.key}`} checked={channel.isPrimary} onChange={()=>update(index,{channels:item.channels.map(candidate=>({...candidate,isPrimary:candidate.key===channel.key}))})}/> Primary</label>{item.channels.length>1?<Button type="button" variant="secondary" onClick={()=>update(index,{channels:item.channels.filter(candidate=>candidate.key!==channel.key)})}>Remove</Button>:null}</div>)}<Button type="button" variant="secondary" onClick={()=>update(index,{channels:[...item.channels,{key:`channel-${crypto.randomUUID()}`,channelType:component.lookups.channels![0]!.value,value:"",purpose:component.lookups.purposes[0]!.value,isPrimary:false}]})}>Add channel</Button></Card>)}{items.length<component.maxItems?<Button type="button" variant="secondary" onClick={()=>{const item=newContact(items.length);onChange([...items,{...item,channels:[{...item.channels[0]!,channelType:component.lookups.channels![0]!.value,purpose:component.lookups.purposes[0]!.value}]}]);}}>{component.addLabel}</Button>:null}</fieldset>;
}

function DynamicRequestField({field}:{readonly field:RequestFormField}) {
  const id=`bp-dynamic-${field.key}`,
    common={id,name:field.key,required:field.required} as const,
    initial=field.defaultValue === undefined ? undefined : String(field.defaultValue);
  if(field.widget==="lookup")return <Field label={field.label} htmlFor={id} hint={field.helpText}><Select {...common} defaultValue={initial??""}><option value="">{field.required?`Select ${field.label.toLowerCase()}`:"None"}</option>{field.lookup!.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
  if(field.widget==="textarea")return <div className="bp-field--wide"><Field label={field.label} htmlFor={id} hint={field.helpText}><textarea {...common} className="a-input bp-textarea" maxLength={field.maxLength} placeholder={field.placeholder} defaultValue={initial}/></Field></div>;
  if(field.widget==="checkbox")return <Field label={field.label} htmlFor={id} hint={field.helpText}><Input {...common} type="checkbox" defaultChecked={field.defaultValue===true}/></Field>;
  const type=field.widget==="url"?"url":field.widget==="integer"||field.widget==="decimal"?"number":"text";
  return <Field label={field.label} htmlFor={id} hint={field.helpText}><Input {...common} type={type} step={field.widget==="decimal"?"any":undefined} maxLength={field.maxLength} placeholder={field.placeholder} autoComplete={field.autoComplete} defaultValue={initial}/></Field>;
}

export function BusinessPartnerRequestDetail({ requestId }: { readonly requestId: string }) {
  const api = usePartnerApi(),
    toast = useToasts(),
    [view, setView] = useState<RequestView>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [errorState, setErrorState] = useState<ReturnType<typeof failureUiState>>(),
    [busy, setBusy] = useState<string>(),
    [lastSuccess, setLastSuccess] = useState(false),
    [activeTab, setActiveTab] = useState("overview");
  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setErrorState(undefined);
    try {
      setView(await api.view(requestId));
    } catch (cause) {
      setError(message(cause));
      setErrorState(failureUiState(cause));
    } finally {
      setLoading(false);
    }
  }, [api, requestId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const syncTab = () => {
      const tab =
        window.sessionStorage.getItem(`business-partner-request-tab:${requestId}`) ??
        window.location.hash.slice(1);
      if (["overview", "case", "validation", "workflow", "evidence", "result"].includes(tab))
        setActiveTab(tab);
    };
    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, [requestId]);
  const actions = view ? governedCaseActions(view.case) : [];
  async function run(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    setLastSuccess(false);
    setError(undefined);
    setErrorState(undefined);
    try {
      await work();
      setLastSuccess(true);
      toast.push({ tone: "success", title: `${label(name)} completed` });
      await reload();
    } catch (cause) {
      setError(message(cause));
      setErrorState(failureUiState(cause, true));
    } finally {
      setBusy(undefined);
    }
  }
  if (loading && !view) return <RequestDetailSkeleton />;
  if (error && !view)
    return (
      <div data-ui-state={errorState ?? "error"}>
        <PageSurface title="Business Partner request">
          <ErrorNotice detail={error} />
        </PageSurface>
      </div>
    );
  if (!view)
    return (
      <div data-ui-state="empty">
        <PageSurface title="Business Partner request">
          <Empty title="Case unavailable" detail="No governed case view was returned." />
        </PageSurface>
      </div>
    );
  const request = view.request,
    caseView = view.case,
    uiState = busy ? "mutation-pending" : (errorState ?? (lastSuccess ? "mutation-success" : caseStatusUiState(caseView.status))),
    applyLabel = request.kind === "amend_partner"
      ? "Apply amendment"
      : request.kind === "configure_company"
        ? "Apply company configuration"
        : request.targetBusinessPartnerId
          ? "Apply role extension"
          : "Create Business Partner",
    awaitingMaterializer = request.status === "approved" && !actions.includes("apply"),
    decisionReady = Boolean(view.workflow&&["open","claimed","in_progress"].includes(view.workflow.workItemStatus));
  return (
    <div data-ui-state={uiState}>
      <PageSurface
        title={request.requestNo}
        description={`${label(caseView.kind)} · created ${formatDate(caseView.timestamps.createdAt)}`}
        actions={
          <div className="bp-actions">
            <a className="a-button a-button--secondary" href="/mdg/business-partner/requests">
              All requests
            </a>
            {actions.includes("open_partner") && request.materializedBusinessPartnerId ? (
              <a className="a-button a-button--primary" href={`/mdg/business-partner/${encodeURIComponent(request.materializedBusinessPartnerId)}`}>
                Open partner
              </a>
            ) : null}
          </div>
        }
      >
        <GovernedCaseSummary value={caseView} />
        <div className="bp-summary">
          <span>Source {label(request.source.kind)}</span>
          <span>Role {label(request.requestedRole ?? "not_set")}</span>
        </div>
        {error ? <ErrorNotice detail={error} mfa={error.toLowerCase().includes("mfa") || error.toLowerCase().includes("assurance")} /> : null}
        <Tabs
          value={activeTab}
          onValueChange={(tab) => {
            setActiveTab(tab);
            window.sessionStorage.setItem(`business-partner-request-tab:${requestId}`, tab);
            window.history.replaceState(window.history.state, "", `#${tab}`);
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="case">Case</TabsTrigger>
            <TabsTrigger value="validation">Validation ({view.validationFindings.length})</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="result">Result</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <RequestOverview request={request} editable={actions.includes("edit")} />
          </TabsContent>
          <TabsContent value="case">
            <GovernedCaseContract value={caseView} />
          </TabsContent>
          <TabsContent value="validation">
            <ValidationPanel view={view} />
          </TabsContent>
          <TabsContent value="workflow">
            <WorkflowPanel view={view} />
          </TabsContent>
          <TabsContent value="evidence">
            <EvidencePanel request={request} />
          </TabsContent>
          <TabsContent value="result">
            <MaterializationResultProof proof={view.materializationProof} />
          </TabsContent>
        </Tabs>
        <Card className="bp-command-bar">
          <div>
            <strong>Available actions</strong>
            <p>Commands use governed version {caseView.rowVersion} and preserve idempotency evidence.</p>
            {awaitingMaterializer ? <p>This request is approved and awaiting an authorized materializer. Continue with the designated executor account.</p> : null}
          </div>
          <div className="bp-actions">
            {actions.includes("validate") ? (
              <Button variant="secondary" loading={busy === "validate"} onClick={() => void run("validate", () => api.validate(caseView.id, caseView.rowVersion))}>
                Validate
              </Button>
            ) : null}
            {actions.includes("submit") ? (
              <Button loading={busy === "submit"} onClick={() => void run("submit", () => api.submit(caseView.id, caseView.rowVersion))}>
                Submit for approval
              </Button>
            ) : null}
            {decisionReady&&actions.includes("return") ? <DecisionButton label="Return" decision="return" view={view} busy={busy} run={run} api={api} /> : null}
            {decisionReady&&actions.includes("reject") ? <DecisionButton label="Reject" decision="reject" view={view} busy={busy} run={run} api={api} /> : null}
            {decisionReady&&actions.includes("approve") ? <DecisionButton label="Approve" decision="approve" view={view} busy={busy} run={run} api={api} /> : null}
            {actions.includes("apply") ? (
              <Button loading={busy === "apply"} onClick={() => void run("apply", () => api.apply(caseView.id, caseView.rowVersion))}>
                {applyLabel}
              </Button>
            ) : null}
          </div>
        </Card>
      </PageSurface>
    </div>
  );
}

export function BusinessPartnerAggregateDetail({ businessPartnerId }: { readonly businessPartnerId: string }) {
  const api = usePartnerApi(),
    selection = useOrganizationSelection(),
    [aggregate, setAggregate] = useState<PartnerAggregate>(),
    [eligibility, setEligibility] = useState<PartnerEligibility>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!selection.selected) return;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    Promise.all([api.aggregate(businessPartnerId, selection.selected, controller.signal), api.eligibility(businessPartnerId, selection.selected, "purchasing", new Date().toISOString().slice(0, 10), controller.signal, selection.company?.companyCodeId)])
      .then(([nextAggregate, nextEligibility]) => {
        setAggregate(nextAggregate);
        setEligibility(nextEligibility);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, businessPartnerId, selection.selected, selection.company?.companyCodeId]);
  return (
    <PageSurface
      title={aggregate?.businessPartner.displayName ?? aggregate?.businessPartner.name ?? "Business Partner"}
      description={aggregate ? `${aggregate.businessPartner.code} · ${label(aggregate.businessPartner.partnerCategory)}` : "Scoped partner aggregate"}
      actions={
        <div className="bp-actions">
          <a className="a-button a-button--secondary" href="/mdg/business-partner">Back to partners</a>
          <a className="a-button a-button--secondary" href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/scope/new`}>Assign organization / configure company</a>
          <a className="a-button a-button--secondary" href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/customer`}>Customer credit &amp; lifecycle</a>
          <a className="a-button a-button--primary" href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/roles/new`}>Add supplier/customer role</a>
        </div>
      }
    >
      <Card className="bp-filter-bar">
        <OrganizationSelect selection={selection} value={selection.selected} onChange={selection.setSelected} />
      </Card>
      {error ? <ErrorNotice detail={error} /> : null}
      {loading ? <RequestSkeleton /> : aggregate && eligibility ? <AggregateTabs aggregate={aggregate} eligibility={eligibility} /> : selection.selected ? null : <Empty title="Choose an operating organization" detail="Partner details are authorized and loaded within an organization scope." />}
    </PageSurface>
  );
}

function MeshProfileDecisionEvidence({payload}:{payload:Readonly<Record<string,unknown>>}) {
  const preview=payload["meshChangePreview"],choices=payload["meshChangeDecisions"];
  if(!preview||typeof preview!=="object"||!choices||typeof choices!=="object")return null;
  const fields=(preview as Record<string,unknown>)["fields"];
  if(!Array.isArray(fields))return null;
  return <section><h3>Retained profile field decisions</h3><p>Resolution {String(payload["meshChangeResolutionId"])}. These choices are fixed for this case.</p><table><caption>Values reviewed for amendment</caption><thead><tr><th scope="col">Field</th><th scope="col">Last accepted</th><th scope="col">Incoming</th><th scope="col">Current at proposal</th><th scope="col">Decision</th></tr></thead><tbody>{fields.map((raw,index)=>{const field=raw as Record<string,unknown>;return <tr key={index}><th scope="row">{String(field["path"])}</th><td>{String(field["baseline"]??"—")}</td><td>{String(field["incoming"]??"—")}</td><td>{String(field["current"]??"—")}</td><td>{(choices as Record<string,unknown>)[String(field["path"])]==="source"?"Use incoming":"Keep current"}</td></tr>;})}</tbody></table></section>;
}

function RequestOverview({ request, editable }: { request: PartnerRequest; editable: boolean }) {
  const payload = request.proposedPayload;
  return (
    <div className="bp-card-grid">
      <Card className="bp-section">
        <h2>Proposed identity</h2>
        <MeshProfileDecisionEvidence payload={payload} />
        <Definition
          values={[
            ["Registered name", payload["name"]],
            ["Legal name", payload["legalName"] ?? payload["legal_name"]],
            ["Display name", payload["displayName"] ?? payload["display_name"]],
            ["Country", payload["registrationCountryCode"] ?? payload["registration_country_code"]],
            ["Category", payload["partnerCategory"] ?? payload["partner_category"]],
            ["Supplier type", payload["supplierType"] ?? payload["supplier_type"]],
          ]}
        />
        {editable ? (
          <p>
            <a href={`/mdg/business-partner/requests/${encodeURIComponent(request.id)}/edit`}>Edit draft fields</a>
          </p>
        ) : null}
      </Card>
      <Card className="bp-section">
        <h2>Lifecycle</h2>
        <Definition
          values={[
            ["Status", label(request.status)],
            ["Submitted", formatDate(request.submittedAt)],
            ["Approved", formatDate(request.approvedAt)],
            ["Applied", formatDate(request.appliedAt)],
            ["Business Partner ID", request.materializedBusinessPartnerId],
          ]}
        />
      </Card>
    </div>
  );
}
function ValidationPanel({ view }: { view: RequestView }) {
  return <ValidationEvidence view={view} />;
}
function WorkflowPanel({ view }: { view: RequestView }) {
  return (
    <div className="bp-card-grid"><Card className="bp-section">
      <h2>Onboarding cycle</h2>
      {view.onboardingCycle?<><Definition values={[["Template",`${view.onboardingCycle.template.code} v${view.onboardingCycle.template.version}`],["Cycle run",view.onboardingCycle.runId],["Status",label(view.onboardingCycle.status)],["Started",formatDate(view.onboardingCycle.startedAt)],["Completed",formatDate(view.onboardingCycle.completedAt)]]}/><ol className="bp-workflow-timeline" aria-label="Onboarding cycle timeline">{view.onboardingCycle.tasks.map((task,index)=><li key={task.id} data-status={task.status}><div><strong>{index+1}. {task.name}</strong> <Badge tone={task.status==="completed"?"success":task.status==="blocked"?"danger":task.status==="ready"?"warning":"neutral"}>{label(task.status)}</Badge></div><p>{label(task.completionMode)}{task.completedAt?` · ${formatDate(task.completedAt)}`:""}</p></li>)}</ol><p>{view.onboardingCycle.subjects.length} linked subject{view.onboardingCycle.subjects.length===1?"":"s"}; the case is the primary cycle subject.</p></>:<p>The supplier onboarding cycle starts when a new supplier request or invitation is created.</p>}
    </Card><Card className="bp-section">
      <h2>Approval workflow</h2>
      {view.workflow ? (
        <><Definition
          values={[
            ["Definition", `${view.workflow.definition.code} v${view.workflow.definition.version}`],
            ["Workflow request", view.workflow.requestId],
            ["Work item", view.workflow.workItemId],
            ["Task owner", view.workflow.ownerPrincipalId],
            ["Task status", label(view.workflow.workItemStatus)],
            ["Task version", view.workflow.workItemVersion],
            ["Submitter", view.request.submittedBy],
            ["Approver", view.request.approvedBy],
          ]}
        />
        <ol className="bp-workflow-timeline" aria-label="Workflow timeline">
          {view.workflow.stages.map(stage=><li key={stage.id} data-status={stage.status}><div><strong>{stage.stageNo}. {label(stage.name)}</strong> <Badge tone={stage.status==="completed"?"success":stage.status==="active"?"warning":"neutral"}>{label(stage.outcome??stage.status)}</Badge></div><p>{label(stage.mode)} · {stage.quorum.required} of {stage.quorum.eligibleCount} approvals required</p>{stage.dueAt?<p>Due {formatDate(stage.dueAt)}{stage.escalateAt?` · Escalates ${formatDate(stage.escalateAt)}`:""}</p>:null}{stage.remindersAt.length?<p>Reminders: {stage.remindersAt.map(formatDate).join(", ")}</p>:null}{stage.workItems.length?<ul>{stage.workItems.map(item=><li key={item.id}><span>{item.ownerPrincipalId??"Unassigned"}</span> · <span>{label(item.decision??item.status)}</span>{item.dueAt?` · due ${formatDate(item.dueAt)}`:""}</li>)}</ul>:stage.status==="pending"?<p>Work items are created when this stage becomes active.</p>:null}</li>)}
        </ol></>
      ) : (
        <p>This request has not entered approval.</p>
      )}
    </Card></div>
  );
}
function EvidencePanel({ request }: { request: PartnerRequest }) {
  return (
    <div className="bp-card-grid">
      <DuplicateEvidence request={request} />
      <Card className="bp-section">
        <h2>Change impact</h2>
        <JsonSummary value={request.changeImpact} />
      </Card>
    </div>
  );
}
function AggregateTabs({ aggregate, eligibility }: { aggregate: PartnerAggregate; eligibility: PartnerEligibility }) {
  const partner = aggregate.businessPartner,
    roleCount = aggregate.suppliers.length + aggregate.customers.length;
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="readiness">Readiness</TabsTrigger>
        <TabsTrigger value="roles">Roles ({roleCount})</TabsTrigger>
        <TabsTrigger value="organizations">Organizations ({aggregate.organizationAssignments.length})</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding ({aggregate.onboardingRequests.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="bp-card-grid">
          <Card className="bp-section">
            <h2>Identity</h2>
            <Definition
              values={[
                ["Code", partner.code],
                ["Registered name", partner.name],
                ["Legal name", partner.legalName],
                ["Display name", partner.displayName],
                ["Category", label(partner.partnerCategory)],
                ["Country", partner.registrationCountryCode],
                ["Legal form", partner.legalForm],
                ["Status", label(partner.status)],
              ]}
            />
          </Card>
          <Card className="bp-section">
            <h2>Profile</h2>
            <Definition
              values={[
                ["Incorporated", partner.incorporationDate],
                ["Website", partner.websiteUrl],
                ["Aliases", partner.aliases.join(", ")],
                ["Created", formatDate(partner.createdAt)],
                ["Updated", formatDate(partner.updatedAt)],
              ]}
            />
            {partner.description ? <p>{partner.description}</p> : null}
          </Card>
        </div>
      </TabsContent>
      <TabsContent value="readiness">
        <Card className="bp-section">
          <h2>Supplier purchasing readiness</h2>
          <p>
            <Badge tone={eligibility.eligible ? "success" : "danger"}>{eligibility.eligible ? "Eligible" : "Not eligible"}</Badge> <Badge tone={eligibility.preferredSupplier ? "success" : "neutral"}>{eligibility.preferredSupplier ? "Preferred supplier" : "Standard supplier"}</Badge>
          </p>
          <Definition
            values={[
              ["Business date", eligibility.businessDate],
              ["Operation", label(eligibility.operationCode)],
              ["Effective preference", eligibility.effectivePreferenceIds.join(", ") || "None"],
              ["Decision fingerprint", eligibility.decisionFingerprint],
            ]}
          />
          {eligibility.reasons.length ? (
            <ul className="bp-findings">
              {eligibility.reasons.map((reason) => (
                <li key={`${reason.code}:${reason.recordId ?? ""}`}>
                  <Badge tone={reason.severity === "blocking" ? "danger" : "warning"}>{label(reason.severity)}</Badge>
                  <div>
                    <strong>{label(reason.code)}</strong>
                    {reason.recordId ? <span>{reason.recordId}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No readiness blockers were found.</p>
          )}
        </Card>
      </TabsContent>
      <TabsContent value="roles">
        <CommercialRoleCards aggregate={aggregate} />
      </TabsContent>
      <TabsContent value="organizations">
        <Cards
          items={aggregate.organizationAssignments}
          empty="No active organization assignment is visible."
          render={(item) => (
            <Card className="bp-section" key={item.id}>
              <h2>
                {item.operatingOrganizationCode} · {item.operatingOrganizationName}
              </h2>
              <Definition
                values={[
                  ["Role", label(item.partnerRole)],
                  ["Status", label(item.status)],
                  ["Effective from", item.effectiveFrom],
                  ["Effective until", item.effectiveUntil],
                ]}
              />
            </Card>
          )}
        />
      </TabsContent>
      <TabsContent value="onboarding">
        <RequestTable items={aggregate.onboardingRequests} />
      </TabsContent>
    </Tabs>
  );
}
function CommercialRoleCards({ aggregate }: { aggregate: PartnerAggregate }) {
  if (!aggregate.suppliers.length && !aggregate.customers.length) return <Empty title="Nothing to show" detail="No Supplier or Customer role is visible in this scope." />;
  return (
    <div className="bp-card-grid">
      {aggregate.suppliers.map((item) => (
        <Card className="bp-section" key={item.id}>
          <h2>Supplier · {item.supplierCode}</h2>
          <Definition
            values={[
              ["Type", label(item.supplierType)],
              ["Status", label(item.status)],
              ["Created", formatDate(item.createdAt)],
            ]}
          />
          <p>
            <a href={`/mdg/business-partner/${encodeURIComponent(aggregate.businessPartner.id)}/supplier`}>Open supplier controls</a>
          </p>
        </Card>
      ))}
      {aggregate.customers.map((item) => (
        <Card className="bp-section" key={item.id}>
          <h2>Customer · {item.customerCode}</h2>
          <Definition
            values={[
              ["Type", label(item.customerType)],
              ["Status", label(item.status)],
              ["Designations", item.designations.length],
              ["Created", formatDate(item.createdAt)],
            ]}
          />
          <p>
            <a href={`/mdg/business-partner/${encodeURIComponent(aggregate.businessPartner.id)}/customer`}>Open customer controls</a>
          </p>
        </Card>
      ))}
    </div>
  );
}
function DecisionButton({ label: caption, decision, view, busy, run, api }: { label: string; decision: "return" | "reject" | "approve"; view: RequestView; busy?: string; run: (name: string, work: () => Promise<unknown>) => Promise<void>; api: ReturnType<typeof createBusinessPartnerClient> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={decision === "reject" ? "danger" : decision === "return" ? "secondary" : "primary"} loading={busy === decision} onClick={() => setOpen(true)}>
        {caption}
      </Button>
      <DecisionDialog
        decision={decision}
        open={open}
        busy={busy === decision}
        onOpenChange={setOpen}
        onConfirm={async (reason) => {
          if (!view.workflow) return;
          await run(decision, () =>
            api.decide(view.case.id, {
              workflowRequestId: view.workflow!.requestId,
              workItemId: view.workflow!.workItemId,
              expectedRequestVersion: view.case.rowVersion,
              expectedWorkItemVersion: view.workflow!.workItemVersion,
              decision,
              reason,
            }),
          );
          setOpen(false);
        }}
      />
    </>
  );
}
function RequestTable({ items }: { items: readonly PartnerRequest[] }) {
  if (!items.length) return <Empty title="No onboarding requests" detail="Create a request to start a governed Business Partner lifecycle." />;
  return (
    <div className="bp-table-wrap">
      <table className="bp-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Partner</th>
            <th>Role</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <a href={`/mdg/business-partner/requests/${encodeURIComponent(item.id)}`}>{item.requestNo}</a>
              </td>
              <td>{String(item.proposedPayload["displayName"] ?? item.proposedPayload["legalName"] ?? item.proposedPayload["name"] ?? "—")}</td>
              <td>{label(item.requestedRole ?? "—")}</td>
              <td>
                <Badge tone={statusTone(item.status)}>{label(item.status)}</Badge>
              </td>
              <td>{formatDate(item.updatedAt ?? item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function OrganizationSelect({ selection, value, onChange }: { selection: ReturnType<typeof useOrganizationSelection>; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Operating organization" htmlFor="bp-list-organization">
      <Select id="bp-list-organization" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Select organization</option>
        {selection.compatible.map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} · {item.displayName}
          </option>
        ))}
      </Select>
    </Field>
  );
}
function Field({ label: caption, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bp-field">
      <Label htmlFor={htmlFor}>{caption}</Label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
function Definition({ values }: { values: readonly (readonly [string, unknown])[] }) {
  return (
    <dl className="bp-definition">
      {values.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
function JsonSummary({ value }: { value: Readonly<Record<string, unknown>> }) {
  return Object.keys(value).length ? <Definition values={Object.entries(value)} /> : <p>No evidence recorded.</p>;
}
function Cards<T>({ items, empty, render }: { items: readonly T[]; empty: string; render: (item: T) => ReactNode }) {
  return items.length ? <div className="bp-card-grid">{items.map(render)}</div> : <Empty title="Nothing to show" detail={empty} />;
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="bp-empty">
      <h2>{title}</h2>
      <p>{detail}</p>
    </Card>
  );
}
function ErrorNotice({ detail, mfa = false }: { detail: string; mfa?: boolean }) {
  return (
    <div className="bp-error" role="alert">
      <strong>Unable to complete the request</strong>
      <p>{detail}</p>
      {mfa ? (
        <form method="post" action={`/api/auth/step-up/start?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/mdg/business-partner/requests")}`}>
          <input type="hidden" name="csrfToken" value={readBrowserCsrfToken() ?? ""} />
          <Button type="submit">Verify with MFA</Button>
        </form>
      ) : null}
    </div>
  );
}
function RequestSkeleton() {
  return (
    <div className="bp-card-grid" data-ui-state="loading">
      <Skeleton label="Loading requests" className="bp-skeleton" />
      <Skeleton label="Loading requests" className="bp-skeleton" />
    </div>
  );
}
function RequestDetailSkeleton() {
  return (
    <div data-ui-state="loading">
      <PageSurface title="Loading request">
        <RequestSkeleton />
      </PageSurface>
    </div>
  );
}
const statuses: readonly RequestStatus[] = ["draft", "validation_failed", "pending_approval", "returned", "approved", "rejected", "applying", "applied", "failed", "cancelled", "superseded"];
function value(data: FormData, name: string): string {
  const result = data.get(name);
  if (typeof result !== "string" || !result.trim()) throw new Error(`${label(name)} is required`);
  return result.trim();
}
function optionalValue(data: FormData, name: string): string | undefined {
  const result = data.get(name);
  return typeof result === "string" && result.trim() ? result.trim() : undefined;
}
function label(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: unknown): string {
  return typeof value === "string" && Number.isFinite(parseInstant(value))
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
      }).format(new Date(value))
    : "—";
}
function display(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function message(cause: unknown): string {
  if (cause instanceof ApiTransportError) return cause.problem?.detail ?? cause.message;
  if (cause instanceof Error) return cause.message;
  return "Unexpected Business Partner error";
}

export function BusinessPartnerRequestEdit({ requestId }: { readonly requestId: string }) {
  const api = usePartnerApi(),
    toast = useToasts(),
    [view, setView] = useState<RequestView>(),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string>(),
    [errorState, setErrorState] = useState<ReturnType<typeof failureUiState>>();
  const navigation = useGuardedNavigation(dirty);
  useEffect(() => {
    const controller = new AbortController();
    api
      .view(requestId, controller.signal)
      .then(setView)
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(message(cause));
          setErrorState(failureUiState(cause));
        }
      });
    return () => controller.abort();
  }, [api, requestId]);
  if (error && !view)
    return (
      <div data-ui-state={errorState ?? "error"}>
        <PageSurface title="Edit Business Partner request">
          <ErrorNotice detail={error} />
        </PageSurface>
      </div>
    );
  if (!view) return <RequestDetailSkeleton />;
  const request = view.request,
    caseView = view.case,
    href = `/mdg/business-partner/requests/${encodeURIComponent(caseView.id)}`;
  if (!governedCaseActions(caseView).includes("edit"))
    return (
      <div data-ui-state="unauthorized">
        <PageSurface title={`Edit ${request.requestNo}`}>
          <ErrorNotice detail="This governed case is not editable for the current principal and version. Return to its review page for available actions." />
        </PageSurface>
      </div>
    );
  const payload = request.proposedPayload;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setErrorState(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await api.patch(caseView.id, {
        expectedVersion: caseView.rowVersion,
        proposedPayload: {
          ...payload,
          name: value(data, "name"),
          legalName: value(data, "legalName"),
          displayName: optionalValue(data, "displayName"),
          registrationCountryCode: value(data, "registrationCountryCode").toUpperCase(),
          legalForm: optionalValue(data, "legalForm"),
          websiteUrl: optionalValue(data, "websiteUrl"),
          description: optionalValue(data, "description"),
        },
      });
      toast.push({
        tone: "success",
        title: "Draft saved",
        detail: "Validation evidence was reset because governed fields changed.",
      });
      setDirty(false);
      navigation.navigate(href, true);
    } catch (cause) {
      setError(message(cause));
      setErrorState(failureUiState(cause, true));
      setBusy(false);
    }
  }
  return (
    <div data-ui-state={busy ? "mutation-pending" : (errorState ?? "ready")}>
      <PageSurface
        title={`Edit ${request.requestNo}`}
        description="Saving changes invalidates prior validation evidence and preserves optimistic concurrency."
        actions={
          <Button variant="secondary" onClick={() => navigation.navigate(href)}>
            Cancel
          </Button>
        }
      >
        <form className="bp-form" onSubmit={save} onChangeCapture={() => setDirty(true)}>
          <GovernedCaseSummary value={caseView} />
          <Card className="bp-section">
            <div className="bp-grid">
              <Field label="Registered name" htmlFor="bp-edit-name">
                <Input id="bp-edit-name" name="name" required maxLength={255} defaultValue={textValue(payload["name"])} />
              </Field>
              <Field label="Legal name" htmlFor="bp-edit-legal-name">
                <Input id="bp-edit-legal-name" name="legalName" required maxLength={255} defaultValue={textValue(payload["legalName"] ?? payload["legal_name"])} />
              </Field>
              <Field label="Display name" htmlFor="bp-edit-display-name">
                <Input id="bp-edit-display-name" name="displayName" maxLength={255} defaultValue={textValue(payload["displayName"] ?? payload["display_name"])} />
              </Field>
              <Field label="Registration country" htmlFor="bp-edit-country">
                <Input id="bp-edit-country" name="registrationCountryCode" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" defaultValue={textValue(payload["registrationCountryCode"] ?? payload["registration_country_code"])} />
              </Field>
              <Field label="Legal form" htmlFor="bp-edit-legal-form">
                <Input id="bp-edit-legal-form" name="legalForm" maxLength={80} defaultValue={textValue(payload["legalForm"] ?? payload["legal_form"])} />
              </Field>
              <Field label="Website" htmlFor="bp-edit-website">
                <Input id="bp-edit-website" name="websiteUrl" type="url" maxLength={2048} defaultValue={textValue(payload["websiteUrl"] ?? payload["website_url"])} />
              </Field>
            </div>
            <Field label="Description" htmlFor="bp-edit-description">
              <textarea id="bp-edit-description" name="description" className="a-input bp-textarea" maxLength={2000} defaultValue={textValue(payload["description"])} />
            </Field>
          </Card>
          {error ? <ErrorNotice detail={error} /> : null}
          <div className="bp-form-actions">
            <Button type="submit" loading={busy}>
              Save draft
            </Button>
          </div>
        </form>
        <UnsavedChangesDialog navigation={navigation} />
      </PageSurface>
    </div>
  );
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function AuthorizedNewBusinessPartnerRequest() {
  const permissions = usePermissions();
  if (!permissions.has("neon.relationship.entity_case.create"))
    return (
      <div data-ui-state="unauthorized">
        <PageSurface title="New supplier onboarding request" description="Create authority is assigned per operating organization.">
          <ErrorNotice detail="You do not have permission to create Business Partner requests in the selected context." />
        </PageSurface>
      </div>
    );
  return <NewBusinessPartnerRequest />;
}

export { BusinessPartnerTransactionSelector } from "./transaction-selector";

export { BankingWorkspace } from "./banking-workspace";
