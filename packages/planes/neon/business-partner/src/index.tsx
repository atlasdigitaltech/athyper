"use client";
import { businessLabel } from "./360/display-values";
import { businessPartnerErrorMessage, useCommandRunner } from "./command-feedback";
import { useOrganizationSelection } from "./use-organization-selection";
import { SupplierProcessPreview } from "./supplier-process-preview";
import { SupplierProcessCorrection } from "./supplier-process-correction";
import { PageNavigation, PageResourceBoundary, PageWorkspace, useDeepLinkedTabState, useRecordBreadcrumb, useRegisterEntityTaskHeader, type PageResourceStatus } from "@athyper/platform-shell";
import { BusinessPartnerPageFrame } from "./page-frame";
import { RequestLifecycle, RequestWorkspaceOverview, RequestWorkspaceDetails, RequestActivity, requestKind, requestTab } from "./request-workspace";
import { restoreProfileAnswers } from "./request-relationships";
import { RequestAttachmentField, RequestAttachmentScope } from "./request-attachment-field";
import { EntityDataSurface, EntityIntakeBackButton, EntityDraftSaveButton, dataSurfaceDefaults, dataSurfaceValues, EntityIntakeForm, useEntityIntake } from "@athyper/platform-entity-form-detail";
import { createOperation, entityApplicationDescriptorOperation } from "@athyper/platform-api-client";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
import { PartnerReferenceField } from "./partner-reference-field";
import { requestFormFromSurface } from "./meta-request-form";
import { submitBusinessPartnerIntake } from "./intake-submit";

import { parseInstant } from "@athyper/platform-temporal";
import { ApiTransportError } from "@athyper/platform-api-client";
import {
  readBrowserCsrfToken,
  useApiClient,
  useSessionIdentity,
  useApplicationNavigation,
  useFeature,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@athyper/platform-ui";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { statusTone } from "./workflow";
import {
  createBusinessPartnerClient,
  type PartnerAggregate,
  type PartnerEligibility,
  type PartnerRequest,
  type RequestStatus,
  type RequestView,
} from "./client";
import {
  serializeRequestForm,
  type PublishedRequestForm,
} from "./request-form-descriptor";
import {
  buildRelationshipExtensions,
  buildProfileExtensions,
  hiddenProfileChangeMessage,
  type AddressDraft,
  type ContactDraft,
} from "./request-relationships";
import { BusinessPartner360Shell } from "./360/business-partner-360";
import {
  caseStatusUiState,
  DecisionDialog,
  failureUiState,
  GovernedCaseContract,
  GovernedCaseSummary,
  governedCaseActions,
  UnsavedChangesDialog,
  useGuardedNavigation,
} from "./case-experience";
import { DuplicateEvidence, ValidationEvidence } from "./validation-experience";
import { MaterializationResultProof } from "./result-experience";
import { BusinessPartnerRequestEntry } from "./request-entry";
export { BusinessPartnerRequestEntry } from "./request-entry";
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

export { BusinessPartnerPageFrame };

export function BusinessPartnerRecord({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
  return useFeature("neon.business_partner.view_360") ? (
    <BusinessPartner360Shell businessPartnerId={businessPartnerId} />
  ) : (
    <BusinessPartnerAggregateDetail businessPartnerId={businessPartnerId} />
  );
}

export function BusinessPartnerScopeConfiguration({
  businessPartnerId,
  initialCompanyCodeId = "",
  initialOrganizationId = "",
  initialRole = "supplier",
  initialKind = "assign_organization",
}: {
  readonly businessPartnerId: string;
  initialCompanyCodeId?: string;
  initialOrganizationId?: string;
  initialRole?: "supplier" | "customer";
  initialKind?: "assign_organization" | "configure_company";
}) {
  const api = usePartnerApi(),
    work = useNeonWorkContext(),
    operating = useNeonOperatingOrganization(),
    toast = useToasts(),
    navigation = useApplicationNavigation();
  const [kind, setKind] = useState<"assign_organization" | "configure_company">(
      initialKind,
    ),
    [role, setRole] = useState<"supplier" | "customer">(initialRole),
    [organizationId, setOrganizationId] = useState(initialOrganizationId),
    [companyCodeId, setCompanyCodeId] = useState(initialCompanyCodeId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const selectedOrganization = operating.organizations.find(
    (o) => o.id === organizationId,
  );
  const companyAvailable =
    work.companies.some((c) => c.companyCodeId === companyCodeId) &&
    selectedOrganization?.companyAssignments.some(
      (a) => a.companyCodeId === companyCodeId,
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      if (!selectedOrganization || (companyCodeId && !companyAvailable))
        throw new Error(
          "Select an authorized company and operating organization.",
        );
      if (kind === "configure_company" && !companyCodeId)
        throw new Error(
          "Select a company before creating a finance configuration request.",
        );
      const proposedPayload =
        kind === "assign_organization"
          ? {
              effectiveFrom: value(data, "effectiveFrom"),
              ...(optionalValue(data, "effectiveUntil")
                ? { effectiveUntil: optionalValue(data, "effectiveUntil") }
                : {}),
            }
          : {
              currencyCode: value(data, "currencyCode").toUpperCase(),
              paymentTermId: value(data, "paymentTermId"),
              defaultAccountingProfileId: value(
                data,
                "defaultAccountingProfileId",
              ),
              ...(optionalValue(data, "defaultDimensionSetId")
                ? {
                    defaultDimensionSetId: optionalValue(
                      data,
                      "defaultDimensionSetId",
                    ),
                  }
                : {}),
              ...(role === "supplier"
                ? {
                    preferredRemittanceBankLinkId: value(
                      data,
                      "preferredRemittanceBankLinkId",
                    ),
                  }
                : {
                    ...(optionalValue(data, "statementCycleCode")
                      ? {
                          statementCycleCode: optionalValue(
                            data,
                            "statementCycleCode",
                          ),
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
        title: result.replayed
          ? "Existing request opened"
          : "Configuration request created",
        detail: `${result.request.requestNo} must pass validation and independent approval.`,
      });
      navigation.push(
        `/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`,
      );
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }
  return (
    <BusinessPartnerPageFrame
      title="Configure Business Partner scope"
      description="Govern role assignment and company finance activation independently from the partner identity."
      actions={
        <a
          className="a-button a-button--secondary"
          href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`}
        >
          Cancel
        </a>
      }
    >
      <form className="bp-form" onSubmit={submit}>
        <Card className="bp-section">
          <div className="bp-grid">
            <Field label="Configuration" htmlFor="bp-scope-kind">
              <Select
                id="bp-scope-kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.currentTarget.value as typeof kind)
                }
              >
                <option value="assign_organization">
                  Assign operating organization
                </option>
                <option value="configure_company">
                  Configure company finance profile
                </option>
              </Select>
            </Field>
            <Field label="Role" htmlFor="bp-scope-role">
              <Select
                id="bp-scope-role"
                value={role}
                onChange={(event) =>
                  setRole(event.currentTarget.value as typeof role)
                }
              >
                <option value="supplier">Supplier</option>
                <option value="customer">Customer</option>
              </Select>
            </Field>
            <Field label="Company" htmlFor="bp-extension-company">
              <Select
                id="bp-extension-company"
                value={companyCodeId}
                onChange={(event) => {
                  const id = event.target.value;
                  setCompanyCodeId(id);
                  const choices = operating.organizations.filter((o) =>
                    o.companyAssignments.some((a) => a.companyCodeId === id),
                  );
                  setOrganizationId(choices.length === 1 ? choices[0]!.id : "");
                }}
              >
                <option value="">Select company</option>
                {work.companies.map((c) => (
                  <option key={c.companyCodeId} value={c.companyCodeId}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Operating organization"
              htmlFor="bp-extension-organization"
            >
              <Select
                id="bp-extension-organization"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
              >
                <option value="">Select organization</option>
                {operating.organizations
                  .filter(
                    (o) =>
                      !companyCodeId ||
                      o.companyAssignments.some(
                        (a) => a.companyCodeId === companyCodeId,
                      ),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
            {kind === "assign_organization" ? (
              <>
                <Field label="Effective from" htmlFor="bp-effective-from">
                  <Input
                    id="bp-effective-from"
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label="Effective until" htmlFor="bp-effective-until">
                  <Input
                    id="bp-effective-until"
                    name="effectiveUntil"
                    type="date"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Selected company" htmlFor="bp-selected-company">
                  <Input
                    id="bp-selected-company"
                    value={
                      work.companies.find(
                        (c) => c.companyCodeId === companyCodeId,
                      )?.displayName ?? "Select a company"
                    }
                    readOnly
                  />
                </Field>
                <Field label="Currency" htmlFor="bp-currency">
                  <Input
                    id="bp-currency"
                    name="currencyCode"
                    required
                    minLength={3}
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                  />
                </Field>
                <Field label="Payment term ID" htmlFor="bp-payment-term">
                  <Input
                    id="bp-payment-term"
                    name="paymentTermId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </Field>
                <Field
                  label="Accounting profile ID"
                  htmlFor="bp-accounting-profile"
                >
                  <Input
                    id="bp-accounting-profile"
                    name="defaultAccountingProfileId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </Field>
                <Field label="Dimension set ID" htmlFor="bp-dimension-set">
                  <Input
                    id="bp-dimension-set"
                    name="defaultDimensionSetId"
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </Field>
                {role === "supplier" ? (
                  <Field label="Remittance bank link ID" htmlFor="bp-bank-link">
                    <Input
                      id="bp-bank-link"
                      name="preferredRemittanceBankLinkId"
                      required
                      pattern="[0-9a-fA-F-]{36}"
                    />
                  </Field>
                ) : (
                  <Field label="Statement cycle" htmlFor="bp-statement-cycle">
                    <Input
                      id="bp-statement-cycle"
                      name="statementCycleCode"
                      pattern="[a-z][a-z0-9_.-]+"
                    />
                  </Field>
                )}
              </>
            )}
          </div>
        </Card>
        {error ? <ErrorNotice detail={error} /> : null}
        <div className="bp-form-actions">
          <Button
            type="submit"
            loading={busy}
            disabled={
              !organizationId ||
              (kind === "configure_company" && !companyCodeId)
            }
          >
            Create governed request
          </Button>
        </div>
      </form>
    </BusinessPartnerPageFrame>
  );
}

function usePartnerApi() {
  const http = useApiClient();
  return useMemo(() => createBusinessPartnerClient(http), [http]);
}
export function BusinessPartnerHome({
  children,
}: {
  readonly children: ReactNode;
}) {
  const permissions = usePermissions();
  return (
    <BusinessPartnerPageFrame
      title="Business Partners"
      description="Business partner master data and governed onboarding."
      actions={
        <div className="bp-actions">
          <a
            className="a-button a-button--secondary"
            href="/mdg/business-partner/requests"
          >
            Onboarding requests
          </a>
          {permissions.has("neon.relationship.entity_case.create") ? (
            <>
              <a
                className="a-button a-button--secondary"
                href="/mdg/business-partner/customer/new"
              >
                New customer
              </a>
              <a
                className="a-button a-button--primary"
                href="/mdg/business-partner/new"
              >
                New supplier
              </a>
            </>
          ) : null}
        </div>
      }
    >
      {children}
    </BusinessPartnerPageFrame>
  );
}
function OrganizationField({
  value,
  onChange,
  required = true,
  label = "Operating organization",
  placeholder = "Select an authorized procurement or sales organization",
  name,
  id = "bp-operating-organization",
  disabled = false,
  onDefault,
}: {
  onDefault?:(value:string)=>void;
  label?:string;placeholder?:string;name?:string;id?:string;disabled?:boolean;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const selection = useOrganizationSelection();
  useEffect(() => {
    if (!value && selection.selected) (onDefault??onChange)(selection.selected);
  }, [value, selection.selected, onChange,onDefault]);
  return (
    <Field label={label} htmlFor={id}>
      <Select
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">
          {placeholder}
        </option>
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
  const state = loading
    ? "loading"
    : error
      ? "error"
      : !selection.selected || !items.length
        ? "empty"
        : "ready";
  return (
    <div data-ui-state={state}>
      <BusinessPartnerPageFrame
        title="Business Partner onboarding"
        description="Create, validate, approve and materialize governed partner requests."
        actions={
          <div className="bp-actions">
            <a
              className="a-button a-button--secondary"
              href="/mdg/business-partner"
            >
              Partner master
            </a>
            <a
              className="a-button a-button--primary"
              href="/mdg/business-partner/new"
            >
              New request
            </a>
          </div>
        }
        toolbar={
          <Card className="bp-filter-bar">
            <OrganizationSelect
              selection={selection}
              value={selection.selected}
              onChange={selection.setSelected}
            />
            <Field label="Status" htmlFor="bp-status-filter">
              <Select
                id="bp-status-filter"
                value={status}
                onChange={(event) =>
                  setStatus(event.currentTarget.value as RequestStatus | "")
                }
              >
                <option value="">All statuses</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        }
      >
        {error ? <ErrorNotice detail={error} /> : null}
        {loading ? (
          <RequestSkeleton />
        ) : selection.selected ? (
          <RequestTable items={items} />
        ) : (
          <Empty
            title="Choose an operating organization"
            detail="Commercial requests are organization-scoped and contain supplier or customer data only."
          />
        )}
      </BusinessPartnerPageFrame>
    </div>
  );
}

const protectProfileValue = createOperation<{protectedValueToken:string;valueHash:string;maskedValue:string},{operatingOrganizationId:string;kind:"tax"|"certificate"|"bank";value:string;bankCountryCode?:string;accountIdType?:string}>({method:"POST",path:()=>"/api/neon/business-partner-intake/protected-values"});
function RequestHeaderIdentity({labels,request}:{labels:NonNullable<EntityIntakeSurfaceV1["formLabels"]>;request?:PartnerRequest}) {
  const [copyState,setCopyState]=useState<"idle"|"copied"|"failed">("idle");
  const copyLabel=copyState==="copied" ? labels.referenceCopied : labels.copyReference;
  return <><span>{request?.requestedRole==="customer" ? labels.customerRole : labels.supplierRole}</span>{request ? <><span className="a-intake-separator" aria-hidden="true">·</span><Badge>{request.status==="draft" ? labels.draftStatus : label(request.status)}</Badge><span className="a-intake-separator" aria-hidden="true">·</span><span className="a-intake-reference" title={request.requestNo}>{request.requestNo.length>20 ? `${request.requestNo.slice(0,8)}…${request.requestNo.slice(-4)}` : request.requestNo}</span><button className="a-intake-copy" type="button" aria-label={copyLabel} title={copyLabel} onClick={()=>{void navigator.clipboard.writeText(request.requestNo).then(()=>setCopyState("copied"),()=>setCopyState("failed"));}}><svg viewBox="0 0 24 24" aria-hidden="true">{copyState==="copied" ? <path d="m5 12 4 4L19 6"/> : <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>}</svg></button><span className="a-intake-progress__sr" role="status">{copyState==="copied" ? labels.referenceCopied : ""}</span>{copyState==="failed" ? <span role="alert">{labels.copyFailed}</span> : null}</> : null}</>;
}

function RequestDetailSurface({request,caseView,children,actions,commandBar,status}:{request:PartnerRequest;caseView:RequestView["case"];children:ReactNode;actions:ReactNode;commandBar?:ReactNode;status?:ReactNode}) {
  const http = useApiClient();
  const [labels, setLabels] = useState<EntityIntakeSurfaceV1["formLabels"]>();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    const controller = new AbortController();
    void http.request(entityApplicationDescriptorOperation, {params: {entityCode: "business_partner"}, signal: controller.signal})
      .then(value => { if (!controller.signal.aborted) setLabels(value.intakeSurfaces?.find(s => s.key === "intake_details")?.formLabels); }).catch(() => {});
    return () => controller.abort();
  }, [http]);
  useRecordBreadcrumb("Request details");
  const name = request.proposedPayload.name;
  const title = typeof name === "string" && name.trim() ? name : labels?.requestTitle ?? "Business partner request";
  const header = useMemo(() => ({
    title,
    actions,
    metadata: <Badge>{caseView.status === "draft" ? labels?.draftStatus ?? "Draft" : label(caseView.status)}</Badge>,
    supportingRow: <>
      <div className="bp-request-header__context">
        <span className="bp-request-header__reference">
          <span className="a-intake-reference" title={request.requestNo}>{request.requestNo.length > 20 ? `${request.requestNo.slice(0, 8)}…${request.requestNo.slice(-4)}` : request.requestNo}</span>
          <button className="a-intake-copy" type="button" aria-label={labels?.copyReference ?? "Copy request reference"} title={labels?.copyReference ?? "Copy request reference"} onClick={() => { void navigator.clipboard.writeText(request.requestNo).then(() => setCopyState("copied"), () => setCopyState("failed")); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{copyState === "copied" ? <path d="m5 12 4 4L19 6"/> : <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>}</svg>
          </button>
          <span className="a-intake-progress__sr" role="status">{copyState === "copied" ? labels?.referenceCopied ?? "Request reference copied" : ""}</span>
          {copyState === "failed" ? <span role="alert">{labels?.copyFailed ?? "Unable to copy request reference"}</span> : null}
        </span>
        <span>{requestKind(request)}</span>
        <span>Source: {label(request.source.kind)}</span>
      </div>
      <div className="bp-request-header__progress">

        {caseView.progress.blockers > 0 ? <Badge tone="warning">{caseView.progress.blockers} {caseView.progress.blockers === 1 ? "blocker" : "blockers"}</Badge> : null}
      </div>
    </>,
  }), [title, actions, labels, request, caseView, copyState]);
  const shared = useRegisterEntityTaskHeader(header);
  // Shared: an ancestor task header already owns the header row; stay a bare section so nothing duplicates it.
  // Not shared: this is the outermost owner, so render the real workspace to get the header row *and* a proper action-bar slot for the command bar.
  return shared ? (
    // Note: this moves the status notice one position earlier than before (now leads the body instead of
    // sitting between the summary and the tabs) since children can no longer be split from outside; still
    // the first thing shown, so the notice remains immediately visible.
    <PageSurface contentOnly title={title}>
      {status}
      {children}
      {commandBar}
    </PageSurface>
  ) : (
    <PageWorkspace header={{ level: "collection", ...header }} status={status} actions={commandBar}>
      {children}
    </PageWorkspace>
  );
}

const previewTaskEdits = createOperation<{ status: string; message?: string; editableNow?: boolean; result?: { permitted: boolean; effect: string; changedPaths: string[] } }, { expectedVersion: number; proposedPayload: Record<string, unknown>; extensions?: unknown; operatingOrganizationId?: string; companyCodeId?: string }>({
  method: "POST", path: ({ caseId }) => `/api/governance/process-tasks/cases/${encodeURIComponent(caseId)}/edit-preview`,
});

export function NewBusinessPartnerRequest({onDirty, onSaved, initialRequest}: {readonly onDirty?:()=>void;readonly onSaved?:()=>void;readonly initialRequest?:RequestView} = {}) {
  const intake = useEntityIntake();
  const [savedRequest, setSavedRequest] = useState(initialRequest?.request);
  const [attachmentProblems, setAttachmentProblems] = useState<readonly string[]>([]);
  const [savedNotice, setSavedNotice] = useState<string>();
  const [editNotice, setEditNotice] = useState<string>();
  const [retryRequired, setRetryRequired] = useState(false);
  const inFlight = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const pendingSave = useRef<{ submitRequest: boolean; execute: () => ReturnType<ReturnType<typeof createBusinessPartnerClient>["patch"]> } | undefined>(undefined);
  const identity = useSessionIdentity();
  const protectedProfileValues=useRef(new Map<string,{protectedValueToken:string;valueHash:string;maskedValue:string}>());
  const [intakeCommandKey, setIntakeCommandKey] = useState(() => crypto.randomUUID());
  const http = useApiClient(),
    api = usePartnerApi(),
    work = useNeonWorkContext(),
    toast = useToasts(),
    [organizationId, setOrganizationId] = useState(""),
    [publishedForm, setPublishedForm] = useState<PublishedRequestForm>(),
    [answers, setAnswers] = useState<Readonly<Record<string, unknown>>>({}),
    [surfaces, setSurfaces] = useState<readonly EntityIntakeSurfaceV1[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string>();
  const navigation = useGuardedNavigation(dirty || busy || attachmentProblems.length > 0 || retryRequired),
    companyCodeId = savedRequest?.companyCodeId ?? (
      work.selection.mode === "company"
        ? work.selection.companyCodeId
        : undefined);
  const loadPublishedForm = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([api.requestForm(controller.signal),http.request(entityApplicationDescriptorOperation,{params:{entityCode:"business_partner"},signal:controller.signal})])
      .then(([result,application]) => {
        if(controller.signal.aborted)return;
        const native=application.intakeSurfaces??[],details=native.find(s=>s.key==="intake_details");
        if(!details?.formLabels)throw Error("The published intake Details surface is unavailable.");
        if (initialRequest && (initialRequest.case.definition.contentHash !== result.definition.hash || initialRequest.case.definition.version !== result.definition.version))
          throw Error(details.formLabels.incompatibleDraft ?? "The saved draft definition is unavailable.");
        setSurfaces(native);
        setPublishedForm({...result,descriptor:requestFormFromSurface(details)});
        setAnswers({...dataSurfaceDefaults(details,native),...(initialRequest?restoreProfileAnswers(details,native,initialRequest.request.proposedPayload,initialRequest.request.operatingOrganizationId):{})});
        if(initialRequest?.request.operatingOrganizationId)setOrganizationId(initialRequest.request.operatingOrganizationId);
        setError(undefined);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api,http,initialRequest]);
  useEffect(loadPublishedForm, [loadPublishedForm]);
  const headerLabels = surfaces.find(s=>s.key==="intake_details")?.formLabels;
  const setPresentation = intake?.setPresentation;
  useRecordBreadcrumb(savedRequest?.requestNo ?? "New request", savedRequest ? `/mdg/business-partner/requests/${encodeURIComponent(savedRequest.id)}` : undefined);
  useEffect(() => {
    if (!headerLabels) return;
    setPresentation?.({
      title: savedRequest ? headerLabels.editTitle : undefined,
      description: savedRequest ? headerLabels.editDescription : undefined,
      exitLabel: savedRequest ? headerLabels.close : undefined,
      lockedSteps: savedRequest ? ["partner"] : undefined,
      compact: true,
      context: <RequestHeaderIdentity labels={headerLabels} request={savedRequest} />,
      saveState: dirty || retryRequired ? "unsaved" : "saved",
      saveStatus: busy ? headerLabels.savingDraft : retryRequired ? headerLabels.changesNotSaved : dirty ? headerLabels.unsavedChanges : savedRequest ? <time dateTime={savedRequest.updatedAt ?? savedRequest.createdAt} title={new Date(savedRequest.updatedAt ?? savedRequest.createdAt).toLocaleString(undefined,{timeZoneName:"short"})}>{headerLabels.savedAt} {new Date(savedRequest.updatedAt ?? savedRequest.createdAt).toLocaleDateString()===new Date().toLocaleDateString() ? new Date(savedRequest.updatedAt ?? savedRequest.createdAt).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}) : formatDate(savedRequest.updatedAt ?? savedRequest.createdAt)}</time> : headerLabels.notSaved,
    });
  }, [setPresentation, headerLabels, savedRequest, savedNotice, dirty, busy, retryRequired]);
  async function submit(event?: FormEvent<HTMLFormElement>, submitRequest = true, previewOnly = false) {
    event?.preventDefault();
    if (!publishedForm || inFlight.current || (previewOnly && pendingSave.current)) return;
    if (attachmentProblems.length) { setError(attachmentProblems.join(" ")); errorSummary.current?.focus(); return; }
    // An uncertain retry keeps both the original command and its completion intent.
    submitRequest = pendingSave.current?.submitRequest ?? submitRequest;
    inFlight.current = true;
    intake?.setBusy(true);
    setBusy(true);
    setError(undefined);
    const data = new FormData();
    try {
      const details=surfaces.find(s=>s.key==="intake_details")!;
      if (!pendingSave.current) {
      const values=dataSurfaceValues(details,surfaces,answers,submitRequest?"submit":"draft");
      for(const [key,value] of Object.entries(values)){
        if(typeof value==='string'||typeof value==='number')data.set(key,String(value));
        else if(value===true)data.set(key,'on');
      }
      const serialized = serializeRequestForm(publishedForm.descriptor, data, { includeEmpty: Boolean(savedRequest), existingPayload: savedRequest?.proposedPayload });
      const extensions = { ...await buildRelationshipExtensions(
        (values.addresses??[]) as readonly AddressDraft[],
        (values.contacts??[]) as readonly ContactDraft[],
      ), ...await buildProfileExtensions(details,values,async(kind,value,bank)=>{
        const cacheKey=JSON.stringify([organizationId,kind,value,bank]);
        const previous=protectedProfileValues.current.get(cacheKey);if(previous)return previous;
        const result=await http.request(protectProfileValue,{body:{operatingOrganizationId:organizationId,kind,value,...bank}});protectedProfileValues.current.set(cacheKey,result);return result;
      },surfaces,(savedRequest?.proposedPayload.relationshipProposals??{}) as Record<string,readonly Record<string,unknown>[]>) };
      if (previewOnly && savedRequest) {
        const preview = await http.request(previewTaskEdits, { params: { caseId: savedRequest.id },
          headers: { "Idempotency-Key": crypto.randomUUID() }, body: {
            expectedVersion: savedRequest.rowVersion, operatingOrganizationId: organizationId,
            ...(companyCodeId ? { companyCodeId } : {}),
            proposedPayload: { ...Object.fromEntries(Object.entries(savedRequest.proposedPayload).filter(([key]) => key !== "relationshipProposals")), ...serialized.proposedPayload }, extensions,
          } });
        setEditNotice(preview.status === "legacy" ? preview.message : !preview.editableNow
          ? "This request is locked. Return it for changes before editing."
          : !preview.result?.permitted ? "The published edit rules do not permit these changes."
          : preview.result.changedPaths.length ? "These changes are permitted. Save, then resubmit for full re-review."
          : "No changes detected.");
        return;
      }
      setEditNotice(undefined);
      pendingSave.current = {submitRequest, execute: savedRequest ? () => api.patch(savedRequest.id, {
        draftCapture:!submitRequest,
        expectedVersion:savedRequest.rowVersion,
        operatingOrganizationId:organizationId,
        ...(companyCodeId?{companyCodeId}:{}),
        proposedPayload:{...Object.fromEntries(Object.entries(savedRequest.proposedPayload).filter(([key])=>key!=="relationshipProposals")),...serialized.proposedPayload},extensions,
      },intakeCommandKey) : () => api.create({
        draftCapture:!submitRequest,
        operatingOrganizationId:
          organizationId || serialized.operatingOrganizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        expectedForm: publishedForm.definition,
        proposedPayload: serialized.proposedPayload,
        ...(extensions ? { extensions } : {}),
      }, intakeCommandKey)};
      }
      const result = await pendingSave.current!.execute();
      pendingSave.current = undefined;
      setRetryRequired(false);
      setSavedRequest(result.request);
      setIntakeCommandKey(crypto.randomUUID());
      setSavedNotice(`${details.formLabels?.draftSaved ?? "Draft saved"} · ${result.request.requestNo} · ${new Date(result.request.updatedAt ?? result.request.createdAt).toLocaleString()}`);
      intake?.markSaved();
      onSaved?.();
      setDirty(false);
      if (!submitRequest) {
        window.history.replaceState(window.history.state, "", `/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}/edit`);
        return;
      }
      const completion = intake && submitRequest ? await submitBusinessPartnerIntake(api, result.request) : undefined;
      toast.push({
        tone: completion && !completion.submitted ? "warning" : "success",
        title: completion?.submitted ? "Request submitted" : initialRequest ? "Draft saved" : ("replayed" in result && result.replayed) ? "Existing request opened" : "Request created",
        detail: completion?.detail ?? `${result.request.requestNo} is ready for validation.`,
      });
      setDirty(false);
      navigation.navigate(
        `/mdg/business-partner/requests/${encodeURIComponent(result.request.id)}`,
        true,
      );
    } catch (cause) {
      // Keep the exact command after an uncertain transport outcome; a retry must not become a second create.
      const uncertain = Boolean(pendingSave.current) && (!(cause instanceof ApiTransportError) || cause.status === 0 || cause.status >= 500);
      setRetryRequired(uncertain);
      if (!uncertain) pendingSave.current = undefined;
      setError(message(cause));
      requestAnimationFrame(() => errorSummary.current?.focus());
    } finally {
      inFlight.current = false;
      intake?.setBusy(false);
      setBusy(false);
    }
  }
  return (
    <RequestAttachmentScope onReadinessChange={setAttachmentProblems}><div
      data-ui-state={
        busy ? "mutation-pending" : error ? "mutation-failure" : "ready"
      }
    >
      <BusinessPartnerPageFrame contentOnly={Boolean(intake)}
        title={
          publishedForm?.descriptor.title ?? "New supplier onboarding request"
        }
        description={
          publishedForm?.descriptor.description ??
          "Loading the published request definition."
        }
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              navigation.navigate("/mdg/business-partner/requests")
            }
          >
            Cancel
          </Button>
        }
      >
        {loading ? (
          <RequestSkeleton />
        ) : publishedForm ? (
          <EntityIntakeForm detailsBackPlacement="custom" detailsStep="details" reviewStep="review" submissionError={error}
            className="bp-form"
            data-definition-release={publishedForm.definition.releaseId}
            onSubmit={submit}
            onSubmitCapture={(event)=>{try{dataSurfaceValues(surfaces.find(s=>s.key==="intake_details")!,surfaces,answers)}catch(cause){event.preventDefault();event.stopPropagation();setError(message(cause))}}}
          >
            <EntityDataSurface sectionNavigation={{label: surfaces.find(s=>s.key==="intake_details")!.title, mode: "create"}} surface={surfaces.find(s=>s.key==="intake_details")!} surfaces={surfaces} answers={answers} disabled={busy || retryRequired}
              referenceHistory={{ client: http, entityCode: "business_partner" }}
              referenceChoiceScope={identity.scope ? { plane: identity.scope.plane, tenantId: identity.scope.tenantId, principalId: identity.scope.principalId, contextKey: JSON.stringify(work.selection) } : undefined}
              onChange={(next)=>{const details=surfaces.find(s=>s.key==="intake_details")!; const hiddenMessage=hiddenProfileChangeMessage(details,answers,next,surfaces);if(hiddenMessage){setError(hiddenMessage);return;}setAnswers(next);setSavedNotice(undefined);setDirty(true);onDirty?.();setIntakeCommandKey(crypto.randomUUID());intake?.markDirty();if(intake?.state.completed.includes("details"))intake.invalidate("details");setError(undefined)}}
              handlers={{"business_partner.account_holder":({field,value,onChange,id,name,disabled})=><Field label={field.label} htmlFor={id}><Input id={id} name={name} value={String(value??"")} required={field.required} maxLength={field.maxLength} disabled={disabled} onChange={event=>onChange(event.currentTarget.value)}/><Button type="button" className="a-bank-holder-copy" variant="secondary" disabled={disabled||!answers.name} onClick={()=>onChange(String(answers.name??""))}>{field.placeholder}</Button></Field>,"business_partner.attachment":props=><RequestAttachmentField {...props}/>,"business_partner.reference":props=><PartnerReferenceField {...props}/>,"business_partner.organization":({field,value,onChange,id,name,disabled})=><OrganizationField id={id} name={name} label={field.label} placeholder={field.placeholder} disabled={disabled} required={field.required} value={String(value??"")} onDefault={value=>{setOrganizationId(value);setAnswers(current=>({...current,[field.valueKey]:value}))}} onChange={value=>{setOrganizationId(value);onChange(value)}}/>}}/>
            <SupplierProcessPreview caseId={savedRequest?.id} rowVersion={savedRequest?.rowVersion} unsaved={dirty} />
            <div ref={errorSummary} tabIndex={-1}>
              {error ? <ErrorNotice detail={error} /> : null}
              {retryRequired ? <p role="alert">{surfaces.find(s=>s.key==="intake_details")?.formLabels?.draftRetry}</p> : null}
            </div>
            {savedNotice ? <p role="status">{savedNotice}</p> : null}
            {editNotice ? <p role="status">{editNotice} Preview applies to the values checked; saving checks them again.</p> : null}
            {attachmentProblems.length ? <p role="status">{attachmentProblems.join(" ")}</p> : null}
            <div className="bp-form-actions bp-form-actions--details">
              <EntityIntakeBackButton detailsStep="details" className="bp-form-actions__back" />
              {savedRequest?.requestedRole === "supplier" && savedRequest.status === "returned" ? <Button type="button" variant="secondary" disabled={busy || retryRequired || !organizationId || attachmentProblems.length > 0} onClick={() => void submit(undefined, false, true)}>Preview edit rules</Button> : null}
              {savedRequest ? <Button type="button" variant="secondary" disabled={busy} onClick={()=>navigation.navigate(`/mdg/business-partner/requests/${encodeURIComponent(savedRequest.id)}`)}>{savedRequest.requestNo}</Button> : null}
              {surfaces.find(s=>s.key==="intake_details")?.formLabels?.saveDraft ? <EntityDraftSaveButton disabled={busy||!organizationId||attachmentProblems.length>0} onSave={()=>void submit(undefined,false)}>{busy ? surfaces.find(s=>s.key==="intake_details")!.formLabels!.savingDraft : retryRequired ? "Retry previous action" : surfaces.find(s=>s.key==="intake_details")!.formLabels!.saveDraft}</EntityDraftSaveButton>:null}
              <Button type="submit" loading={busy} disabled={!organizationId||retryRequired||attachmentProblems.length>0}>
                {intake ? surfaces.find(s=>s.key==="intake_details")!.formLabels?.continue : publishedForm.descriptor.submitLabel}
              </Button>
            </div>
          </EntityIntakeForm>
        ) : (
          <ErrorNotice
            detail={
              error ??
              "The published Supplier request definition is unavailable."
            }
            onRetry={loadPublishedForm}
          />
        )}
        <UnsavedChangesDialog navigation={navigation} />
      </BusinessPartnerPageFrame>
    </div></RequestAttachmentScope>
  );
}
export function BusinessPartnerRequestDetail({
  requestId,
  notificationPins,
}: {
  readonly requestId: string;
  readonly notificationPins?: {attemptId?:string;workItemId?:string;documentJobId?:string};
}) {
  const api = usePartnerApi(),
    [view, setView] = useState<RequestView>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [errorState, setErrorState] = useState<ReturnType<typeof failureUiState>>(),
    [busy, setBusy] = useState<string>(),
    [lastSuccess, setLastSuccess] = useState(false);
  const { value: activeTab, select: selectTab } = useDeepLinkedTabState({
    initial: "overview",
    normalize: requestTab,
    storageKey: `business-partner-request-tab:${requestId}`,
  });
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
  const actions = view ? governedCaseActions(view.case) : [];
  const run = useCommandRunner({
    setBusy, setError, reload, errorMessage: message, blocked: Boolean(busy || loading),
    onStart: () => { setLastSuccess(false); setErrorState(undefined); },
    onSuccess: () => setLastSuccess(true),
    onError: cause => setErrorState(failureUiState(cause, true)),
  });

  const resourceStatus: PageResourceStatus = loading && !view ? "loading" : error && !view ? "error" : !view ? "empty" : "ready";
  if (!view)
    return (
      <PageResourceBoundary
        status={resourceStatus}
        loading={<RequestDetailSkeleton />}
        error={
          <div data-ui-state={errorState ?? "error"}>
            <BusinessPartnerPageFrame title="Business Partner request">
              <ErrorNotice detail={error ?? ""} onRetry={reload} />
            </BusinessPartnerPageFrame>
          </div>
        }
        empty={
          <div data-ui-state="empty">
            <BusinessPartnerPageFrame title="Business Partner request">
              <Empty
                title="Case unavailable"
                detail="No governed case view was returned."
              />
            </BusinessPartnerPageFrame>
          </div>
        }
      >
        {null}
      </PageResourceBoundary>
    );
  const request = view.request,
    caseView = view.case,
    uiState = busy
      ? "mutation-pending"
      : (errorState ??
        (lastSuccess
          ? "mutation-success"
          : caseStatusUiState(caseView.status))),
    applyLabel =
      request.kind === "amend_partner"
        ? "Apply amendment"
        : request.kind === "configure_company"
          ? "Apply company configuration"
          : request.targetBusinessPartnerId
            ? "Apply role extension"
            : "Create Business Partner",
    awaitingMaterializer =
      request.status === "approved" && !actions.includes("apply"),
    decisionReady = Boolean(
      view.workflow &&
      ["open", "claimed", "in_progress"].includes(view.workflow.workItemStatus),
    );
  const statusNotice = error ? (
    <ErrorNotice
      detail={error}
      mfa={
        error.toLowerCase().includes("mfa") ||
        error.toLowerCase().includes("assurance")
      }
    />
  ) : undefined;
  const commandBar = (
    <Card className="bp-command-bar bp-request-command-bar">
      <div>
        <strong>{request.status === "pending_approval" ? `Awaiting ${view.workflow?.stages.filter(stage => stage.status === "active").map(stage => stage.name).join(" and ") || "reviewer"} approval` : request.status === "applied" ? "Completed" : "Next action"}</strong>
        {actions.includes("validate") ? <p>Validate the request to check for missing or inconsistent information.</p> : null}
        {awaitingMaterializer ? (
          <p>
            This request is approved and awaiting completion by an authorized user.
          </p>
        ) : null}
      </div>
      <div className="bp-actions">
        {actions.includes("edit") ? <a className="a-button a-button--secondary" href={`/mdg/business-partner/requests/${encodeURIComponent(request.id)}/edit`}>Edit request</a> : null}
        {actions.includes("validate") ? (
          <Button
            variant="secondary"
            loading={busy === "validate"}
            disabled={Boolean(busy) || loading}
            onClick={() =>
              void run("validate", () =>
                api.validate(caseView.id, caseView.rowVersion),
              )
            }
          >
            Validate
          </Button>
        ) : null}
        {actions.includes("submit") ? (
          <Button
            loading={busy === "submit"}
            disabled={Boolean(busy) || loading}
            onClick={() =>
              void run("submit", () =>
                api.submit(caseView.id, caseView.rowVersion),
              )
            }
          >
            Submit for approval
          </Button>
        ) : null}
        {decisionReady && actions.includes("return") ? (
          <DecisionButton
            label="Return"
            decision="return"
            view={view}
            busy={busy}
            run={run}
            api={api}
          />
        ) : null}
        {decisionReady && actions.includes("reject") ? (
          <DecisionButton
            label="Reject"
            decision="reject"
            view={view}
            busy={busy}
            run={run}
            api={api}
          />
        ) : null}
        {decisionReady && actions.includes("approve") ? (
          <DecisionButton
            label="Approve"
            decision="approve"
            view={view}
            busy={busy}
            run={run}
            api={api}
          />
        ) : null}
        {actions.includes("apply") ? (
          <Button
            loading={busy === "apply"}
            disabled={Boolean(busy) || loading}
            onClick={() =>
              void run("apply", () =>
                api.apply(caseView.id, caseView.rowVersion),
              )
            }
          >
            {applyLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
  return (
    <div data-ui-state={uiState}>
      <RequestDetailSurface request={request} caseView={caseView} commandBar={commandBar} status={statusNotice}
        actions={
          <div className="bp-actions">
            <a
              className="a-button a-button--secondary"
              href="/mdg/business-partner/requests"
            >
              All requests
            </a>
            {actions.includes("open_partner") &&
            request.materializedBusinessPartnerId ? (
              <a
                className="a-button a-button--primary"
                href={`/mdg/business-partner/${encodeURIComponent(request.materializedBusinessPartnerId)}`}
              >
                Open partner
              </a>
            ) : null}
          </div>
        }
      >
        <GovernedCaseSummary value={caseView} showSummary={false} />
        <PageNavigation
          kind="tabs"
          ariaLabel="Business Partner request"
          value={activeTab}
          onValueChange={selectTab}
          aside={<>
            <RequestLifecycle view={view} />
            {request.kind === "new_partner" && request.source.kind === "manual" && request.requestedRole === "supplier" ? <SupplierProcessCorrection request={request} onChanged={reload} notificationPins={notificationPins} /> : null}
          </>}
          items={[
            {
              value: "overview",
              label: "Overview",
              content: <>
                <RequestWorkspaceOverview view={view} onSelect={selectTab} />
                {request.kind === "new_partner" && request.requestedRole === "supplier" && ["draft", "returned"].includes(request.status) ? <SupplierProcessPreview caseId={request.id} rowVersion={request.rowVersion} /> : null}
              </>,
            },
            {
              value: "details",
              label: "Request details",
              content: <RequestWorkspaceDetails view={view} />,
            },
            {
              value: "review",
              label: "Review",
              content: <div className="bp-request-review">
                <ValidationPanel view={view} />
                <EvidencePanel request={request} />
                <WorkflowPanel view={view} />
                <Card className="bp-section"><h2>Outcome</h2><p>{request.status === "applied" ? "The approved changes have been applied." : request.status === "failed" ? "The request could not be completed. Review the failure details before retrying." : "No completed changes yet."}</p>{request.appliedAt ? <p>Completed {formatDate(request.appliedAt)}</p> : null}</Card>
                <details className="bp-request-technical"><summary>Technical details</summary><GovernedCaseContract value={caseView} /><MaterializationResultProof proof={view.materializationProof} /></details>
              </div>,
            },
            {
              value: "activity",
              label: "Activity",
              content: request.kind === "new_partner" && request.source.kind === "manual" && request.requestedRole === "supplier" ? <p>Read the <a href="#supplier-case-activity">recorded case activity</a> and submission history in the supplier journey.</p> : <RequestActivity view={view} />,
            },
          ]}
        />
      </RequestDetailSurface>
    </div>
  );
}

export function BusinessPartnerAggregateDetail({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
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
    Promise.all([
      api.aggregate(businessPartnerId, selection.selected, controller.signal),
      api.eligibility(
        businessPartnerId,
        selection.selected,
        "purchasing",
        new Date().toISOString().slice(0, 10),
        controller.signal,
        selection.company?.companyCodeId,
      ),
    ])
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
  }, [
    api,
    businessPartnerId,
    selection.selected,
    selection.company?.companyCodeId,
  ]);
  return (
    <BusinessPartnerPageFrame
      title={
        aggregate?.businessPartner.name?.trim() ||
        aggregate?.businessPartner.code ||
        "Business Partner"
      }
      description={
        aggregate
          ? `${aggregate.businessPartner.code} · ${label(aggregate.businessPartner.partnerCategory)}`
          : "Scoped partner aggregate"
      }
      actions={
        <div className="bp-actions">
          <a
            className="a-button a-button--secondary"
            href="/mdg/business-partner"
          >
            Back to partners
          </a>
          <a
            className="a-button a-button--secondary"
            href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/scope/new`}
          >
            Assign organization / configure company
          </a>
          <a
            className="a-button a-button--secondary"
            href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/customer`}
          >
            Customer credit &amp; lifecycle
          </a>
          <a
            className="a-button a-button--primary"
            href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/roles/new`}
          >
            Add supplier/customer role
          </a>
        </div>
      }
      toolbar={
        <Card className="bp-filter-bar">
          <OrganizationSelect
            selection={selection}
            value={selection.selected}
            onChange={selection.setSelected}
          />
        </Card>
      }
    >
      {error ? <ErrorNotice detail={error} /> : null}
      {loading ? (
        <RequestSkeleton />
      ) : aggregate && eligibility ? (
        <AggregateTabs aggregate={aggregate} eligibility={eligibility} />
      ) : selection.selected ? null : (
        <Empty
          title="Choose an operating organization"
          detail="Partner details are authorized and loaded within an organization scope."
        />
      )}
    </BusinessPartnerPageFrame>
  );
}

function MeshProfileDecisionEvidence({
  payload,
}: {
  payload: Readonly<Record<string, unknown>>;
}) {
  const preview = payload["meshChangePreview"],
    choices = payload["meshChangeDecisions"];
  if (
    !preview ||
    typeof preview !== "object" ||
    !choices ||
    typeof choices !== "object"
  )
    return null;
  const fields = (preview as Record<string, unknown>)["fields"];
  if (!Array.isArray(fields)) return null;
  return (
    <section>
      <h3>Retained profile field decisions</h3>
      <p>
        Resolution {String(payload["meshChangeResolutionId"])}. These choices
        are fixed for this case.
      </p>
      <table>
        <caption>Values reviewed for amendment</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Last accepted</th>
            <th scope="col">Incoming</th>
            <th scope="col">Current at proposal</th>
            <th scope="col">Decision</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((raw, index) => {
            const field = raw as Record<string, unknown>;
            return (
              <tr key={index}>
                <th scope="row">{String(field["path"])}</th>
                <td>{String(field["baseline"] ?? "—")}</td>
                <td>{String(field["incoming"] ?? "—")}</td>
                <td>{String(field["current"] ?? "—")}</td>
                <td>
                  {(choices as Record<string, unknown>)[
                    String(field["path"])
                  ] === "source"
                    ? "Use incoming"
                    : "Keep current"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ValidationPanel({ view }: { view: RequestView }) {
  return <ValidationEvidence view={view} />;
}
function WorkflowPanel({ view }: { view: RequestView }) {
  return (
    <div className="bp-card-grid">
      <Card className="bp-section">
        <h2>Onboarding cycle</h2>
        {view.onboardingCycle ? (
          <>
            <details className="bp-request-technical"><summary>Technical details</summary><Definition
              values={[
                [
                  "Template",
                  `${view.onboardingCycle.template.code} v${view.onboardingCycle.template.version}`,
                ],
                ["Cycle run", view.onboardingCycle.runId],
                ["Status", label(view.onboardingCycle.status)],
                ["Started", formatDate(view.onboardingCycle.startedAt)],
                ["Completed", formatDate(view.onboardingCycle.completedAt)],
              ]}
            /></details>
            <ol
              className="bp-workflow-timeline"
              aria-label="Onboarding cycle timeline"
            >
              {view.onboardingCycle.tasks.map((task, index) => (
                <li key={task.id} data-status={task.status}>
                  <div>
                    <strong>
                      {index + 1}. {task.name}
                    </strong>{" "}
                    <Badge
                      tone={
                        task.status === "completed"
                          ? "success"
                          : task.status === "blocked"
                            ? "danger"
                            : task.status === "ready"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {label(task.status)}
                    </Badge>
                  </div>
                  <p>
                    {label(task.completionMode)}
                    {task.completedAt
                      ? ` · ${formatDate(task.completedAt)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
            <p>
              {view.onboardingCycle.subjects.length} linked subject
              {view.onboardingCycle.subjects.length === 1 ? "" : "s"}; the case
              is the primary cycle subject.
            </p>
          </>
        ) : (
          <p>No onboarding tasks are recorded yet.</p>
        )}
      </Card>
      <Card className="bp-section">
        <h2>Approvals</h2>
        {view.workflow ? (
          <>
            <details className="bp-request-technical"><summary>Technical details</summary><Definition
              values={[
                [
                  "Definition",
                  `${view.workflow.definition.code} v${view.workflow.definition.version}`,
                ],
                ["Workflow request", view.workflow.requestId],
                ["Work item", view.workflow.workItemId],
                ["Task owner", view.workflow.ownerPrincipalId],
                ["Task status", label(view.workflow.workItemStatus)],
                ["Task version", view.workflow.workItemVersion],
                ["Submitter", view.request.submittedBy],
                ["Approver", view.request.approvedBy],
              ]}
            /></details>
            <ol className="bp-workflow-timeline" aria-label="Workflow timeline">
              {view.workflow.stages.map((stage) => (
                <li key={stage.id} data-status={stage.status}>
                  <div>
                    <strong>
                      {stage.stageNo}. {label(stage.name)}
                    </strong>{" "}
                    <Badge
                      tone={
                        stage.status === "completed"
                          ? "success"
                          : stage.status === "active"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {label(stage.outcome ?? stage.status)}
                    </Badge>
                  </div>
                  <p>
                    {label(stage.mode)} · {stage.quorum.required} of{" "}
                    {stage.quorum.eligibleCount} approvals required
                  </p>
                  {stage.dueAt ? (
                    <p>
                      Due {formatDate(stage.dueAt)}
                      {stage.escalateAt
                        ? ` · Escalates ${formatDate(stage.escalateAt)}`
                        : ""}
                    </p>
                  ) : null}
                  {stage.remindersAt.length ? (
                    <p>
                      Reminders: {stage.remindersAt.map(formatDate).join(", ")}
                    </p>
                  ) : null}
                  {stage.workItems.length ? (
                    <ul>
                      {stage.workItems.map((item) => (
                        <li key={item.id}>
                          <span>{item.ownerDisplayName ?? (item.ownerPrincipalId ? "Assigned reviewer" : "Unassigned")}</span> ·{" "}
                          <span>{label(item.decision ?? item.status)}</span>
                          {item.dueAt ? ` · due ${formatDate(item.dueAt)}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : stage.status === "pending" ? (
                    <p>
                      Work items are created when this stage becomes active.
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>This request has not entered approval.</p>
        )}
      </Card>
    </div>
  );
}
function EvidencePanel({ request }: { request: PartnerRequest }) {
  return (
    <div className="bp-card-grid">
      <DuplicateEvidence request={request} />
      <Card className="bp-section">
        <h2>Change impact</h2>
        <p>{Object.keys(request.changeImpact).length ? "Change impact information is available." : "No change impact has been recorded."}</p>{Object.keys(request.changeImpact).length ? <details className="bp-request-technical"><summary>View change impact details</summary><JsonSummary value={request.changeImpact} /></details> : null}
      </Card>
    </div>
  );
}
function AggregateTabs({
  aggregate,
  eligibility,
}: {
  aggregate: PartnerAggregate;
  eligibility: PartnerEligibility;
}) {
  const partner = aggregate.businessPartner,
    roleCount = aggregate.suppliers.length + aggregate.customers.length;
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="readiness">Readiness</TabsTrigger>
        <TabsTrigger value="roles">Roles ({roleCount})</TabsTrigger>
        <TabsTrigger value="organizations">
          Organizations ({aggregate.organizationAssignments.length})
        </TabsTrigger>
        <TabsTrigger value="onboarding">
          Onboarding ({aggregate.onboardingRequests.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="bp-card-grid">
          <Card className="bp-section">
            <h2>Identity</h2>
            <Definition
              values={[
                ["Code", partner.code],
                ["Registered name", partner.name],
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
            <Badge tone={eligibility.eligible ? "success" : "danger"}>
              {eligibility.eligible ? "Eligible" : "Not eligible"}
            </Badge>{" "}
            <Badge tone={eligibility.preferredSupplier ? "success" : "neutral"}>
              {eligibility.preferredSupplier
                ? "Preferred supplier"
                : "Standard supplier"}
            </Badge>
          </p>
          <Definition
            values={[
              ["Business date", eligibility.businessDate],
              ["Operation", label(eligibility.operationCode)],
              [
                "Effective preference",
                eligibility.effectivePreferenceIds.join(", ") || "None",
              ],
              ["Decision fingerprint", eligibility.decisionFingerprint],
            ]}
          />
          {eligibility.reasons.length ? (
            <ul className="bp-findings">
              {eligibility.reasons.map((reason) => (
                <li key={`${reason.code}:${reason.recordId ?? ""}`}>
                  <Badge
                    tone={reason.severity === "blocking" ? "danger" : "warning"}
                  >
                    {label(reason.severity)}
                  </Badge>
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
                {item.operatingOrganizationCode} ·{" "}
                {item.operatingOrganizationName}
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
  if (!aggregate.suppliers.length && !aggregate.customers.length)
    return (
      <Empty
        title="Nothing to show"
        detail="No Supplier or Customer role is visible in this scope."
      />
    );
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
            <a
              href={`/mdg/business-partner/${encodeURIComponent(aggregate.businessPartner.id)}/supplier`}
            >
              Open supplier controls
            </a>
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
            <a
              href={`/mdg/business-partner/${encodeURIComponent(aggregate.businessPartner.id)}/customer`}
            >
              Open customer controls
            </a>
          </p>
        </Card>
      ))}
    </div>
  );
}
function DecisionButton({
  label: caption,
  decision,
  view,
  busy,
  run,
  api,
}: {
  label: string;
  decision: "return" | "reject" | "approve";
  view: RequestView;
  busy?: string;
  run: (name: string, work: () => Promise<unknown>) => Promise<void>;
  api: ReturnType<typeof createBusinessPartnerClient>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={
          decision === "reject"
            ? "danger"
            : decision === "return"
              ? "secondary"
              : "primary"
        }
        loading={busy === decision}
        onClick={() => setOpen(true)}
      >
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
  if (!items.length)
    return (
      <Empty
        title="No onboarding requests"
        detail="Create a request to start a governed Business Partner lifecycle."
      />
    );
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
                <a
                  href={`/mdg/business-partner/requests/${encodeURIComponent(item.id)}`}
                >
                  {item.requestNo}
                </a>
              </td>
              <td>
                {String(
                  (typeof item.proposedPayload["name"] === "string"
                    ? item.proposedPayload["name"].trim()
                    : undefined) || item.targetBusinessPartnerId || "—",
                )}
              </td>
              <td>{label(item.requestedRole ?? "—")}</td>
              <td>
                <Badge tone={statusTone(item.status)}>
                  {label(item.status)}
                </Badge>
              </td>
              <td>{formatDate(item.updatedAt ?? item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function OrganizationSelect({
  selection,
  value,
  onChange,
}: {
  selection: ReturnType<typeof useOrganizationSelection>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Operating organization" htmlFor="bp-list-organization">
      <Select
        id="bp-list-organization"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
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
function Field({
  label: caption,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="bp-field">
      <Label htmlFor={htmlFor}>{caption}</Label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
function Definition({
  values,
}: {
  values: readonly (readonly [string, unknown])[];
}) {
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
  return Object.keys(value).length ? (
    <Definition values={Object.entries(value)} />
  ) : (
    <p>No evidence recorded.</p>
  );
}
function Cards<T>({
  items,
  empty,
  render,
}: {
  items: readonly T[];
  empty: string;
  render: (item: T) => ReactNode;
}) {
  return items.length ? (
    <div className="bp-card-grid">{items.map(render)}</div>
  ) : (
    <Empty title="Nothing to show" detail={empty} />
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="bp-empty">
      <h2>{title}</h2>
      <p>{detail}</p>
    </Card>
  );
}
function ErrorNotice({
  detail,
  mfa = false,
  onRetry,
}: {
  detail: string;
  mfa?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="bp-error" role="alert">
      <strong>Unable to complete the request</strong>
      <p>{detail}</p>
      {mfa ? (
        <form
          method="post"
          action={`/api/auth/step-up/start?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/mdg/business-partner/requests")}`}
        >
          <input
            type="hidden"
            name="csrfToken"
            value={readBrowserCsrfToken() ?? ""}
          />
          <Button type="submit">Verify with MFA</Button>
        </form>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
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
      <BusinessPartnerPageFrame title="Loading request">
        <RequestSkeleton />
      </BusinessPartnerPageFrame>
    </div>
  );
}
const statuses: readonly RequestStatus[] = [
  "draft",
  "validation_failed",
  "pending_approval",
  "returned",
  "approved",
  "rejected",
  "applying",
  "applied",
  "failed",
  "cancelled",
  "superseded",
];
function value(data: FormData, name: string): string {
  const result = data.get(name);
  if (typeof result !== "string" || !result.trim())
    throw new Error(`${label(name)} is required`);
  return result.trim();
}
function optionalValue(data: FormData, name: string): string | undefined {
  const result = data.get(name);
  return typeof result === "string" && result.trim()
    ? result.trim()
    : undefined;
}
function label(value: string): string { return businessLabel(value, "title"); }
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
  if ((cause instanceof ApiTransportError ? JSON.stringify(cause.problem ?? cause.message) : String(cause instanceof Error ? cause.message : cause)).includes("PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED")) return "This correction changes the onboarding profile. No new review work was created. Restore the previous requirement, or close this proposal and create a new request.";
  return businessPartnerErrorMessage(cause, "Unexpected Business Partner error");
}

export function BusinessPartnerRequestEdit({
  requestId,
}: {
  readonly requestId: string;
}) {
  const api = usePartnerApi(),
    toast = useToasts(),
    [view, setView] = useState<RequestView>(),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string>(),
    [errorState, setErrorState] = useState<ReturnType<typeof failureUiState>>();
  const navigation = useGuardedNavigation(dirty);
  const reload = useCallback(() => {
    const controller = new AbortController();
    setError(undefined);
    setErrorState(undefined);
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
  useEffect(reload, [reload]);
  const editResourceStatus: PageResourceStatus = error && !view ? "error" : !view ? "loading" : "ready";
  if (!view)
    return (
      <PageResourceBoundary
        status={editResourceStatus}
        loading={<RequestDetailSkeleton />}
        error={
          <div data-ui-state={errorState ?? "error"}>
            <BusinessPartnerPageFrame title="Edit Business Partner request">
              <ErrorNotice detail={error ?? ""} onRetry={reload} />
            </BusinessPartnerPageFrame>
          </div>
        }
        empty={null}
      >
        {null}
      </PageResourceBoundary>
    );
  const request = view.request,
    caseView = view.case,
    href = `/mdg/business-partner/requests/${encodeURIComponent(caseView.id)}`;
  if (!governedCaseActions(caseView).includes("edit"))
    return (
      <div data-ui-state="unauthorized">
        <BusinessPartnerPageFrame title={`Edit ${request.requestNo}`}>
          <ErrorNotice detail="This governed case is not editable for the current principal and version. Return to its review page for available actions." />
        </BusinessPartnerPageFrame>
      </div>
    );
  if(request.kind==="new_partner"&&request.source.kind==="manual"&&request.requestedRole==="supplier") return <BusinessPartnerRequestEntry initialRequest={view}/>;
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
          registrationCountryCode: value(
            data,
            "registrationCountryCode",
          ).toUpperCase(),
          legalForm: optionalValue(data, "legalForm"),
          websiteUrl: optionalValue(data, "websiteUrl"),
          description: optionalValue(data, "description"),
        },
      });
      toast.push({
        tone: "success",
        title: "Draft saved",
        detail:
          "Validation evidence was reset because governed fields changed.",
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
      <BusinessPartnerPageFrame
        title={`Edit ${request.requestNo}`}
        description="Saving changes invalidates prior validation evidence and preserves optimistic concurrency."
        actions={
          <Button variant="secondary" onClick={() => navigation.navigate(href)}>
            Cancel
          </Button>
        }
      >
        <form
          className="bp-form"
          onSubmit={save}
          onChangeCapture={() => setDirty(true)}
        >
          <GovernedCaseSummary value={caseView} />
          <Card className="bp-section">
            <div className="bp-grid">
              <Field label="Registered name" htmlFor="bp-edit-name">
                <Input
                  id="bp-edit-name"
                  name="name"
                  required
                  maxLength={320}
                  defaultValue={textValue(payload["name"])}
                />
              </Field>
              <Field label="Registration country" htmlFor="bp-edit-country">
                <Input
                  id="bp-edit-country"
                  name="registrationCountryCode"
                  required
                  minLength={2}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  defaultValue={textValue(
                    payload["registrationCountryCode"] ??
                      payload["registration_country_code"],
                  )}
                />
              </Field>
              <Field label="Legal form" htmlFor="bp-edit-legal-form">
                <Input
                  id="bp-edit-legal-form"
                  name="legalForm"
                  maxLength={80}
                  defaultValue={textValue(
                    payload["legalForm"] ?? payload["legal_form"],
                  )}
                />
              </Field>
              <Field label="Website" htmlFor="bp-edit-website">
                <Input
                  id="bp-edit-website"
                  name="websiteUrl"
                  type="url"
                  maxLength={2048}
                  defaultValue={textValue(
                    payload["websiteUrl"] ?? payload["website_url"],
                  )}
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="bp-edit-description">
              <textarea
                id="bp-edit-description"
                name="description"
                className="a-input bp-textarea"
                maxLength={2000}
                defaultValue={textValue(payload["description"])}
              />
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
      </BusinessPartnerPageFrame>
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
        <BusinessPartnerPageFrame
          title="New business partner request"
          description="Create authority is assigned per operating organization."
        >
          <ErrorNotice detail="You do not have permission to create Business Partner requests in the selected context." />
        </BusinessPartnerPageFrame>
      </div>
    );
  return <BusinessPartnerRequestEntry />;
}

export { BusinessPartnerTransactionSelector } from "./transaction-selector";

export { BankingWorkspace } from "./banking-workspace";
