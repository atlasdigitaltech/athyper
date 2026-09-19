"use client";
import { businessLabel } from "./360/display-values";
import { useEffect, useState } from "react";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button, Card, Input } from "@athyper/platform-ui";
import { SupplierProcessReadiness } from "./supplier-process-readiness";
import { SupplierProcessDocuments } from "./supplier-process-documents";
import type { PartnerRequest } from "./client";
import { TaskInformation, type TaskInformationExchange } from "./task-information";
type Execution = {
  workflow_request_id: string;
  cycle_task_id: string;
  workflow_stage_id: string;
  stage_status: string;
  stage_code: string;
  work_item_id: string;
  work_item_version: number;
  work_item_status: string;
  assignee_principal_id: string;
  action: "accept_review" | "approve";
  quorum: { kind: string; value?: number };
  allowedActions: string[];
  taskKind?: "review" | "approval";
  outcomeScope?: "task" | "case_final_decision";
  informationEnabled?: boolean;
  waitingForInformation?: boolean;
  escalationMode?: "notify" | "consult" | "reassign" | null;
};
type ProcessView = {
  information?: TaskInformationExchange[];
  escalations?: { id: string; attempt_id: string; previous_work_item_id: string; supervisor_id: string; mode: string; reason: string; created_at: string }[];
  coordinate: { attemptId: string; attemptNumber: number; cycleRunId: string; scope: {operatingOrganizationId:string;companyCodeId:string|null} };
  selection: {
    requestedRequirement: string;
    candidateProfile: { code: string };
    effectiveProfile: { code: string };
    winningRuleId: string;
    reason: string | null;
    minimumControls: unknown[];
    policy: unknown;
    manifest: {
      tasks: {
        taskTemplateId: string;
        predecessorTaskTemplateId: string | null;
        outcomeScope: string;
        executionKind?: "preparation" | "document" | "review" | "approval";
      }[];
    };
  };
  reviewReady: boolean;
  tasks: {
    id: string;
    task_template_id: string;
    code: string;
    name: string;
    status: string;
    owner_principal_id: string | null;
    completion_evidence: unknown;
  }[];
  activity: {
    id: string;
    result_code: string;
    recorded_at: string;
    result_evidence: unknown;
  }[];
  communications: {
    id: string;
    channel: string;
    status: string;
    created_at: string;
    event_code: string;
    pin: { attemptId: string; milestone: string };
  }[];
  principalId: string;
  caseStatus: string;
  canCancel: boolean;
  executions: Execution[];
  historicalReviews: {
    attempt_id: string;
    stage_code: string;
    stage_status: string;
    work_item_id: string;
    work_item_status: string;
    outcome: unknown;
  }[];
  history: { attempt_id: string; attempt_number: number }[];
  closure?: { result_code: string; result_evidence: { reason?: string } };
};
const viewOperation = createOperation<ProcessView>({
  method: "GET",
  path: ({ caseId }) =>
    `/api/governance/process-tasks/cases/${encodePathSegment(caseId)}/view`,
});
const commandOperation = createOperation<unknown, Record<string, unknown>>({
  method: "POST",
  path: ({ caseId, action }) =>
    `/api/governance/process-tasks/cases/${encodePathSegment(caseId)}/${encodePathSegment(action)}`,
  idempotency: "required",
});
export function SupplierProcessCorrection({
  request,
  onChanged,
  notificationPins = {},
}: {
  request: PartnerRequest;
  onChanged: () => Promise<void>;
  notificationPins?: {
    attemptId?: string;
    workItemId?: string;
    documentJobId?: string;
  };
}) {
  const http = useApiClient(),
    [view, setView] = useState<ProcessView>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setView(undefined);
    setError(undefined);
    void http
      .request(viewOperation, {
        params: { caseId: request.id },
        signal: controller.signal,
      })
      .then(value => { if (!controller.signal.aborted) setView(value); })
      .catch((cause) => {
        if (
          !controller.signal.aborted &&
          !String(cause?.message).includes("PROCESS_ATTEMPT_NOT_FOUND")
        )
          setError(
            "The supplier journey could not be loaded. Refresh to try again.",
          );
      });
    return () => controller.abort();
  }, [http, request.id, request.rowVersion]);
  if (!view) return error ? <p role="alert">{error}</p> : null;
  const current = view.executions.find(
    (i) =>
      (i.allowedActions?.length > 0 || i.informationEnabled || i.escalationMode) &&
      i.stage_status === "active" &&
      ["open", "claimed"].includes(i.work_item_status) &&
      i.assignee_principal_id === view.principalId,
  );
  const staleLink = Boolean(
    (notificationPins.attemptId &&
      notificationPins.attemptId !== view.coordinate.attemptId) ||
    (notificationPins.workItemId &&
      notificationPins.workItemId !== current?.work_item_id &&
      !view.information?.some(exchange => exchange.work_item_id === notificationPins.workItemId &&
        exchange.attempt_id === view.coordinate.attemptId && exchange.respondent_id === view.principalId &&
        exchange.state === "open") &&
      !view.escalations?.some(e => e.mode === "notify" && e.supervisor_id === view.principalId && e.attempt_id === view.coordinate.attemptId && e.previous_work_item_id === notificationPins.workItemId)),
  );
  if (staleLink)
    return (
      <Card className="bp-section">
        <h2>This notice is no longer actionable</h2>
        <p>
          The linked submission or review has changed. Open the current request
          to review its latest status.
        </p>
        <a
          href={`/mdg/business-partner/requests/${encodeURIComponent(request.id)}`}
        >
          Open current request
        </a>
        {notificationPins.documentJobId ? (
          <SupplierProcessDocuments
            caseId={request.id}
            rowVersion={request.rowVersion}
            pinnedJobId={notificationPins.documentJobId}
            pinnedAttemptId={notificationPins.attemptId}
            onlyPinned
          />
        ) : null}
      </Card>
    );
  async function command(
    action: "return" | "reject" | "cancel" | "approve" | "accept_review",
  ) {
    if (!view) return;
    setBusy(true);
    setError(undefined);
    const idempotencyKey = crypto.randomUUID();
    const body =
      action === "cancel"
        ? {
            attemptId: view.coordinate.attemptId,
            expectedVersion: request.rowVersion,
            reason,
            idempotencyKey,
          }
        : {
            attemptId: view.coordinate.attemptId,
            cycleTaskId: current?.cycle_task_id,
            workflowRequestId: current?.workflow_request_id,
            workflowStageId: current?.workflow_stage_id,
            workItemId: current?.work_item_id,
            expectedWorkItemVersion: Number(current?.work_item_version),
            action,
            reason,
            idempotencyKey,
          };
    try {
      await http.request(commandOperation, {
        params: {
          caseId: request.id,
          action: action === "cancel" ? "cancel" : "decide",
        },
        body,
        idempotencyKey,
      });
      await onChanged();
      setView(
        await http.request(viewOperation, { params: { caseId: request.id } }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The command could not be completed. Refresh the request and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function informationCommand(itemId: string, action: "request" | "respond" | "resolve" | "escalate", text?: string) {
    if (!view) return;
    const item = view.executions.find(i => i.work_item_id === itemId);
    if (!item) return;
    setBusy(true); setError(undefined);
    const idempotencyKey = crypto.randomUUID();
    try {
      await http.request(commandOperation, { params: { caseId: request.id, action: "information" }, idempotencyKey,
        body: { attemptId: view.coordinate.attemptId, workItemId: itemId, expectedWorkItemVersion: Number(item.work_item_version),
          action, ...(text !== undefined ? { text } : {}), idempotencyKey } });
      setView(await http.request(viewOperation, { params: { caseId: request.id } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Information request could not be saved."); }
    finally { setBusy(false); }
  }
  async function escalate() {
    if (!view || !current?.escalationMode) return;
    setBusy(true); setError(undefined);
    const idempotencyKey = crypto.randomUUID();
    try {
      await http.request(commandOperation, { params: { caseId: request.id, action: "escalate" }, idempotencyKey,
        body: { attemptId: view.coordinate.attemptId, workItemId: current.work_item_id,
          expectedWorkItemVersion: Number(current.work_item_version), reason, idempotencyKey } });
      setView(await http.request(viewOperation, { params: { caseId: request.id } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Escalation could not be completed."); }
    finally { setBusy(false); }
  }
  return (
    <Card className="bp-section bp-journey">
      <header className="bp-journey-header">
        <div><p className="bp-eyebrow">Request progress</p><h2>Supplier onboarding journey</h2>
        <p>Track reviews, documents and the next action for this request.</p></div>
        <Button variant="secondary" disabled={busy} onClick={() => void onChanged()}>Refresh journey</Button>
      </header>
      <dl className="bp-journey-summary">
        <div><dt>Case status</dt><dd><span className="bp-status" data-status={view.caseStatus}>{businessLabel(view.caseStatus)}</span></dd></div>
        <div><dt>Submission</dt><dd>Attempt {view.coordinate.attemptNumber}</dd></div>
        <div><dt>Requested requirement</dt><dd>{businessLabel(view.selection.requestedRequirement)}</dd></div>
        <div><dt>Selected profile</dt><dd>{businessLabel(view.selection.effectiveProfile.code)}</dd></div>
      </dl>
      {view.selection.reason ? <p className="bp-journey-note">{view.selection.reason}</p> : null}
      <p className="bp-context-note">Approval, materialization, activation and closure are tracked separately.</p>
      <nav className="bp-journey-nav" aria-label="Jump to journey section">
        <a href="#supplier-task-progress">Tasks</a><a href="#supplier-review-actions">Reviews and corrections</a>
        <a href="#supplier-submission-history">Submission history</a><a href="#supplier-case-activity">Activity</a>
      </nav>
      {!view.reviewReady &&
      ["submitted", "in_review"].includes(view.caseStatus) ? (
        <p role="status">
          Reviews are waiting for the submitted review pack. The document
          service owns preparation; required document failures must be resolved
          before voting.
        </p>
      ) : null}
      <ol id="supplier-task-progress" className="bp-task-cards" aria-label="Onboarding tasks">
        {view.tasks.map((task) => {
          const binding = view.selection.manifest.tasks.find(
            (b) => b.taskTemplateId === task.task_template_id,
          );
          const predecessor = view.tasks.find(
            (t) => t.task_template_id === binding?.predecessorTaskTemplateId,
          );
          return (
            <li key={task.id} data-status={task.status}>
              <div className="bp-task-heading"><h3>{task.name}</h3><span className="bp-status" data-status={task.status}>{businessLabel(task.status)}</span></div>
              {predecessor ? (
                <p>
                  Depends on {predecessor.name} ({predecessor.status})
                </p>
              ) : null}
              <p className="bp-task-responsibility">{binding?.outcomeScope === "case_final_decision" ? "Final approval · Authorizes the case decision"
                : binding?.executionKind === "review" ? "Review · Acceptance completes this review only"
                : binding?.executionKind === "approval" ? "Approval · Authorizes this step only"
                : binding?.executionKind === "document" ? "Document gate · Requires a ready document"
                : "Preparation · Verified from submission evidence"}</p>
              <ul>
                {view.executions
                  .filter((i) => i.cycle_task_id === task.id)
                  .map((i) => (
                    <li key={`${i.workflow_stage_id}-${i.work_item_id}`}>
                      {businessLabel(i.stage_code.toLowerCase(), "title")} · {businessLabel(i.stage_status)} · Required votes:{" "}
                      {businessLabel(i.quorum.kind)}
                      {i.quorum.value !== undefined
                        ? ` (${i.quorum.value})`
                        : ""}{" "}
                      · {businessLabel(i.work_item_status) ?? "Not assigned"}
                      {i.assignee_principal_id === view.principalId
                        ? " · Assigned to you"
                        : ""}
                    </li>
                  ))}
              </ul>
              <details>
                <summary>Task evidence</summary>
                <pre>
                  {JSON.stringify(
                    {
                      taskId: task.id,
                      ownerPrincipalId: task.owner_principal_id,
                      evidence: task.completion_evidence,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          );
        })}
      </ol>
      <SupplierProcessReadiness
        runId={view.coordinate.cycleRunId}
        onChanged={onChanged}
      />
      <SupplierProcessDocuments
        caseId={request.id}
        rowVersion={request.rowVersion}
        pinnedJobId={notificationPins.documentJobId}
      />
      {request.materializedBusinessPartnerId ? (
        <p>
          <a
            href={`/mdg/business-partner/${encodeURIComponent(request.materializedBusinessPartnerId)}/supplier?operatingOrganizationId=${encodeURIComponent(view.coordinate.scope.operatingOrganizationId)}${view.coordinate.scope.companyCodeId ? `&companyCodeId=${encodeURIComponent(view.coordinate.scope.companyCodeId)}` : ""}`}
          >
            Open supplier readiness and company setup
          </a>
        </p>
      ) : null}
      <details>
        <summary>Profile selection evidence</summary>
        <pre>{JSON.stringify(view.selection, null, 2)}</pre>
      </details>
      {current?.informationEnabled || view.information?.length ? <TaskInformation
        exchanges={view.information ?? []} principalId={view.principalId} attemptId={view.coordinate.attemptId}
        {...(current?.informationEnabled ? { requestItemId: current.work_item_id } : {})}
        busy={busy} onCommand={informationCommand} /> : null}
      <section id="supplier-review-actions" className="bp-decision-panel" aria-labelledby="supplier-review-heading">
      <h3 id="supplier-review-heading">Reviews and corrections</h3>
      <p>
        Submission attempt {view.coordinate.attemptNumber} ·{" "}
        {view.history.length} retained submission
        {view.history.length === 1 ? "" : "s"}
      </p>
      {view.closure ? (
        <p>
          {view.caseStatus === "draft"
            ? "Returned for changes: "
            : "Recorded outcome: "}
          {view.closure.result_evidence.reason}
        </p>
      ) : null}
      {view.caseStatus === "draft" ? (
        <p>
          Every review restarts after correction. A correction must use the same
          onboarding profile. To change the profile, close this proposal and
          create a new request.{" "}
          <a
            href={`/mdg/business-partner/requests/${encodeURIComponent(request.id)}/edit`}
          >
            Edit returned request
          </a>
        </p>
      ) : null}
      {current ? <p>{current.outcomeScope === "case_final_decision" ? "Your final approval"
        : current.action === "approve" ? "Your approval step" : "Your review"}: {current.stage_code}</p> : null}
      {current || view.canCancel ? (
        <label>
          Reason for return, rejection, escalation or closure
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
          />
        </label>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="bp-actions">
        {current ? (
          <>
            {current.allowedActions.includes(current.action) ? <Button
              disabled={busy}
              onClick={() => void command(current.action)}
            >
              {current.action === "approve"
                ? "Approve assigned step"
                : "Accept review"}
            </Button> : null}
            {current.allowedActions.includes("return") ? <Button
              variant="secondary"
              disabled={busy || !reason.trim()}
              onClick={() => void command("return")}
            >
              Return for changes
            </Button> : null}
            {current.allowedActions.includes("reject") ? <Button
              variant="secondary"
              disabled={busy || !reason.trim()}
              onClick={() => void command("reject")}
            >
              Reject proposal
            </Button> : null}
            {current.escalationMode ? <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => void escalate()}>
              {current.escalationMode === "reassign" ? "Transfer review to supervisor" : current.escalationMode === "consult" ? "Ask supervisor for advice" : "Notify supervisor"}
            </Button> : null}
          </>
        ) : null}
        {view.canCancel ? (
          <Button
            variant="secondary"
            disabled={busy || !reason.trim()}
            onClick={() => void command("cancel")}
          >
            Close proposal
          </Button>
        ) : null}
        {["cancelled", "rejected"].includes(view.caseStatus) ? (
          <a href="/mdg/business-partner/requests/new">Create a new request</a>
        ) : null}
      </div>
      </section>
      {view.escalations?.length ? <details><summary>Supervisor escalation history</summary>
        <ul>{view.escalations.map(e => <li key={e.id}>{e.mode === "reassign" ? "Review transferred" : e.mode === "consult" ? "Supervisor advice requested" : "Supervisor notification requested"} · {e.reason}</li>)}</ul>
      </details> : null}
      <section className="bp-journey-panel">
        <h3>Your communications</h3>
        <p>
          Notices sent to you for this request. A delivery failure does not change the decision.
        </p>
        {view.communications.length ? (
          <ul>
            {view.communications.map((n) => (
              <li key={n.id}>
                {businessLabel(n.pin.milestone)} · {n.channel === "in_app" ? "Inbox" : businessLabel(n.channel)} · {businessLabel(n.status)}
                <details>
                  <summary>Delivery evidence</summary>
                  <pre>{JSON.stringify(n, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p>No notices recorded for you on this request.</p>
        )}
      </section>
      <section id="supplier-case-activity" className="bp-journey-panel">
        <h3>Recorded case activity</h3>
        <ol>
          {view.activity.map((e) => (
            <li key={e.id}>
              {businessLabel(e.result_code)} ·{" "}
              <time dateTime={e.recorded_at}>
                {new Date(e.recorded_at).toLocaleString()}
              </time>
              <details>
                <summary>Command evidence</summary>
                <pre>{JSON.stringify(e, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      </section>
      <details id="supplier-submission-history" className="bp-submission-history" open>
        <summary>Submission history</summary>
        <ol>
          {view.history.map((a) => (
            <li key={a.attempt_id} className="bp-attempt-card">
              Attempt {a.attempt_number}
              {a.attempt_id === view.coordinate.attemptId
                ? " (current)"
                : " (historical, read only)"}
              <ul>
                {view.historicalReviews
                  .filter((i) => i.attempt_id === a.attempt_id)
                  .map((i) => (
                    <li key={`${i.work_item_id}-${i.stage_code}`}>
                      {businessLabel(i.stage_code.toLowerCase(), "title")} · {businessLabel(i.stage_status)} · {businessLabel(i.work_item_status)}
                      <details>
                        <summary>Retained review evidence</summary>
                        <pre>{JSON.stringify(i, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
