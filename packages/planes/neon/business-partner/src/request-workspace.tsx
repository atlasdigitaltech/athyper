"use client";
import { useEffect, useState } from "react";
import { Badge, Card, Button, Input } from "@athyper/platform-ui";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { entityApplicationDescriptorOperation } from "@athyper/platform-api-client";
import { EntityDataSurface } from "@athyper/platform-entity-form-detail";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
import { restoreProfileAnswers } from "./request-relationships";
import { RequestAttachmentField } from "./request-attachment-field";
import { PartnerReferenceField } from "./partner-reference-field";
import type { PartnerRequest, RequestView } from "./client";

const display = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const date = (value?: string) => value ? new Date(value).toLocaleString() : "Not yet";
export function requestKind(request: PartnerRequest) {
  return request.kind === "amend_partner" ? "Partner amendment" : request.kind === "configure_company" ? "Company setup request" : request.targetBusinessPartnerId ? `${display(request.requestedRole ?? "partner")} role extension` : `New ${request.requestedRole ?? "partner"} request`;
}
export function requestTab(tab: string) {
  if (["overview", "details", "review", "activity"].includes(tab)) return tab;
  return ["case", "validation", "workflow", "evidence", "result"].includes(tab) ? "review" : "overview";
}
export function RequestLifecycle({view}: {view: RequestView}) {
  return <details className="bp-request-lifecycle" open><summary>Request progress · {view.request.status === "applied" ? "Completed" : display(view.request.status)}<span>View stages</span></summary>
    <ol className="bp-request-stages" aria-label="Request stages">{view.case.sections.map(section => <li key={section.id}><strong>{section.label.toLowerCase() === "materialization" ? "Completion" : section.label}</strong><Badge>{display(section.state)}</Badge>{section.errors ? <span>{section.errors} issues</span> : null}</li>)}</ol>
    {view.workflow?.stages.filter(stage => stage.status === "active").map(stage => <p key={stage.id}>Awaiting {stage.name}{stage.dueAt ? ` · Due ${date(stage.dueAt)}` : ""}</p>)}
    {view.case.ownership.queue ? <p>Assigned queue: {view.case.ownership.queue}</p> : null}
  </details>;
}
export function RequestWorkspaceOverview({view, onSelect}: {view: RequestView; onSelect: (tab: string) => void}) {
  const request = view.request, payload = request.proposedPayload;
  const outcome = request.validationSummary.outcome;
  return <div className="bp-card-grid">
    <Card className="bp-section"><h2>Request summary</h2><p>{requestKind(request)}</p><dl className="bp-definition">
      <div><dt>Registered name</dt><dd>{String(payload.name ?? "Not provided")}</dd></div>
      <div><dt>Country</dt><dd>{String(payload.registrationCountryCode ?? payload.registration_country_code ?? "Not provided")}</dd></div>
      <div><dt>Category</dt><dd>{display(String(payload.partnerCategory ?? payload.partner_category ?? "not provided"))}</dd></div>
      <div><dt>Created</dt><dd>{date(request.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{date(request.updatedAt ?? request.createdAt)}</dd></div>
    </dl><p><Button variant="secondary" onClick={() => onSelect("details")}>View request details</Button></p></Card>
    <Card className="bp-section"><h2>{request.status === "applied" ? "Request completed" : "Readiness and next step"}</h2>
      <p>{request.status === "applied" ? "The approved changes have been applied." : request.status === "pending_approval" ? "Waiting for approval. Review the assigned stages and decisions." : request.status === "approved" ? "Approved and awaiting completion." : request.status === "returned" ? "Review the feedback, update the request, and validate again." : ["rejected", "cancelled", "superseded"].includes(request.status) ? `This request is ${request.status}.` : "Review the proposed information and validate it before submitting for approval."}</p>
      <p>Validation: {outcome ? display(String(outcome)) : "Not checked"}</p>
      {view.case.progress.blockers > 0 ? <p role="status">{view.case.progress.blockers} blockers need attention.</p> : null}
      <Button variant="secondary" onClick={() => onSelect("review")}>View review and outcome</Button>
    </Card>
  </div>;
}
export function RequestWorkspaceDetails({view}: {view: RequestView}) {
  const http = useApiClient();
  const [surfaces, setSurfaces] = useState<readonly EntityIntakeSurfaceV1[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void http.request(entityApplicationDescriptorOperation, {params: {entityCode: "business_partner"}, signal: controller.signal}).then(application => {
      if (!controller.signal.aborted) setSurfaces(application.intakeSurfaces ?? []);
    }).catch(() => { if (!controller.signal.aborted) setError("Request details could not be loaded. Please try again."); });
    return () => controller.abort();
  }, [http]);
  const surface = surfaces?.find(item => item.key === "intake_details");
  if (error) return <p role="alert">{error}</p>;
  if (!surfaces) return <p role="status">Loading request details…</p>;
  if (!surface) return <p>The request layout is unavailable.</p>;
  const answers = restoreProfileAnswers(surface, surfaces, view.request.proposedPayload, view.request.operatingOrganizationId);
  return <div className="bp-request-details"><p>Proposed request information · Read only</p>{view.request.kind === "amend_partner" ? <p>This view shows proposed values. A baseline for field-by-field comparison is not available.</p> : null}
    <EntityDataSurface surface={surface} surfaces={surfaces} answers={answers} disabled onChange={() => {}} handlers={{"business_partner.account_holder": ({field, value, id, name}) => <label htmlFor={id}>{field.label}<Input id={id} name={name} disabled value={String(value ?? "")}/></label>, "business_partner.organization": ({field, value, id, name}) => <label htmlFor={id}>{field.label}<Input id={id} name={name} disabled value={String(value ?? "")}/></label>, "business_partner.attachment": props => <RequestAttachmentField {...props}/>, "business_partner.reference": props => <PartnerReferenceField {...props}/>}}/>
  </div>;
}
export function RequestActivity({view}: {view: RequestView}) {
  const [filter, setFilter] = useState("all");
  const request = view.request;
  const events = [
    {title: "Request created", at: request.createdAt},
    {title: "Latest request update", at: request.updatedAt},
    {title: "Submitted for approval", at: request.submittedAt},
    {title: "Request approved", at: request.approvedAt},
    {title: "Request completed", at: request.appliedAt},
    ...(view.workflow?.stages.flatMap(stage => stage.workItems.filter(item => item.decidedAt).map(item => ({title: `${stage.name}: ${display(item.decision ?? item.status)}`, at: item.decidedAt}))) ?? []),
  ].filter(event => event.at).sort((a,b) => Date.parse(b.at!) - Date.parse(a.at!));
  return <Card className="bp-section"><h2>Activity</h2><div className="bp-actions" aria-label="Activity filters">{["all", "history", "comments", "versions"].map(item => <Button key={item} variant="secondary" aria-pressed={filter === item} onClick={() => setFilter(item)}>{display(item)}</Button>)}</div>
    {["all", "history"].includes(filter) ? <><p>Recorded request milestones. A complete audit feed is not available in this view.</p><ol className="bp-workflow-timeline">{events.map((event,index) => <li key={`${event.title}-${index}`}><strong>{event.title}</strong><p><time dateTime={event.at}>{date(event.at)}</time></p></li>)}</ol></> : null}
    {["all", "comments"].includes(filter) ? <section><h3>Comments</h3><p>Comments are not available for this request yet.</p></section> : null}
    {["all", "versions"].includes(filter) ? <section><h3>Versions</h3><p>Current request revision: {view.case.rowVersion}</p><p>Historical request snapshots and version comparison are not available in this view.</p>{view.materializationProof ? <ul>{[view.materializationProof.sourceSnapshot, view.materializationProof.resultSnapshot].map(snapshot => <li key={snapshot.snapshotId}>{display(snapshot.entityType)} · Version {snapshot.version} · {date(snapshot.capturedAt)}</li>)}</ul> : null}</section> : null}
  </Card>;
}
