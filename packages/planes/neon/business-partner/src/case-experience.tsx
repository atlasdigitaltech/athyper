"use client";

import type {
  GovernedCaseStatusV1,
  GovernedCaseViewV1,
} from "@athyper/contract-platform-entity-runtime";
import { ApiTransportError } from "@athyper/platform-api-client";
import { useApplicationNavigation } from "@athyper/platform-shell-app-foundation";
import { ConfirmDialog } from "@athyper/platform-surface-kit";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  Input,
  Label,
} from "@athyper/platform-ui";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestAction } from "./workflow";

const actionMap: Readonly<Record<string, RequestAction>> = Object.freeze({
  edit: "edit",
  validate: "validate",
  submit: "submit",
  return: "return",
  reject: "reject",
  approve: "approve",
  materialize: "apply",
  open_partner: "open_partner",
});

export type CaseUiState =
  | "ready"
  | "loading"
  | "empty"
  | "partial"
  | "error"
  | "unauthorized"
  | "unavailable"
  | "stale"
  | "mutation-pending"
  | "mutation-success"
  | "mutation-conflict"
  | "mutation-failure";

export const CASE_UI_STATES = Object.freeze([
  "ready",
  "loading",
  "empty",
  "partial",
  "error",
  "unauthorized",
  "unavailable",
  "stale",
  "mutation-pending",
  "mutation-success",
  "mutation-conflict",
  "mutation-failure",
] as const satisfies readonly CaseUiState[]);

export function governedCaseActions(
  value: GovernedCaseViewV1,
): readonly RequestAction[] {
  return Object.freeze(
    value.allowedActions.flatMap((action) =>
      actionMap[action.id] ? [actionMap[action.id]!] : [],
    ),
  );
}

export function caseStatusUiState(status: GovernedCaseStatusV1): CaseUiState {
  if (status === "conflicted") return "stale";
  if (["validation_failed", "returned", "rejected", "failed"].includes(status))
    return "partial";
  return "ready";
}

export function failureUiState(cause: unknown, mutation = false): CaseUiState {
  if (cause instanceof ApiTransportError) {
    if (
      cause.status === 401 ||
      cause.status === 403 ||
      cause.kind === "authorization"
    )
      return "unauthorized";
    if (
      cause.status === 409 ||
      cause.status === 412 ||
      cause.kind === "conflict"
    )
      return mutation ? "mutation-conflict" : "stale";
    if (
      cause.status >= 500 ||
      cause.kind === "dependency" ||
      cause.kind === "network" ||
      cause.kind === "timeout"
    )
      return "unavailable";
  }
  return mutation ? "mutation-failure" : "error";
}

export function caseStatusMessage(status: GovernedCaseStatusV1):
  | Readonly<{
      title: string;
      detail: string;
      tone: "neutral" | "warning" | "danger";
    }>
  | undefined {
  switch (status) {
    case "validation_failed":
      return {
        title: "Validation needs attention",
        detail:
          "Resolve the blocking findings, save the draft, and validate again.",
        tone: "warning",
      };
    case "returned":
      return {
        title: "Returned for changes",
        detail:
          "Review the decision reason and update the governed fields before resubmitting.",
        tone: "warning",
      };
    case "rejected":
      return {
        title: "Request rejected",
        detail:
          "This decision is retained as read-only evidence. Start a new request if the business need remains.",
        tone: "danger",
      };
    case "failed":
      return {
        title: "Materialization failed",
        detail:
          "No partial master-data result is assumed. Retry only when the failure has been reviewed.",
        tone: "danger",
      };
    case "cancelled":
      return {
        title: "Request cancelled",
        detail:
          "The case is closed and remains available as historical evidence.",
        tone: "neutral",
      };
    case "superseded":
      return {
        title: "Request superseded",
        detail: "A newer governed case now owns this change.",
        tone: "neutral",
      };
    case "conflicted":
      return {
        title: "Case version is stale",
        detail:
          "Refresh and compare the latest version before attempting another command.",
        tone: "warning",
      };
    default:
      return undefined;
  }
}

export function GovernedCaseSummary({
  value,
}: {
  readonly value: GovernedCaseViewV1;
}) {
  const notice = caseStatusMessage(value.status);
  return (
    <>
      <div className="bp-summary" aria-label="Governed case summary">
        <Badge tone={caseTone(value.status)}>{title(value.status)}</Badge>
        <span>Version {value.rowVersion}</span>
        <span>
          {value.progress.completed} of {value.progress.required} sections
          complete
        </span>
        <span>{value.progress.blockers} blockers</span>
      </div>
      {notice ? (
        <div
          className={`bp-state bp-state--${notice.tone}`}
          role={notice.tone === "danger" ? "alert" : "status"}
        >
          <strong>{notice.title}</strong>
          <p>{notice.detail}</p>
        </div>
      ) : null}
    </>
  );
}

export function GovernedCaseContract({
  value,
}: {
  readonly value: GovernedCaseViewV1;
}) {
  return (
    <div className="bp-card-grid">
      <Card className="bp-section">
        <h2>Governed definition</h2>
        <dl className="bp-definition">
          <div>
            <dt>Release</dt>
            <dd>{value.definition.id}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{value.definition.version}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd>{value.definition.contentHash}</dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd>{value.ownership.requesterId}</dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd>{value.ownership.assigneeId ?? "—"}</dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>{value.ownership.queue ?? "—"}</dd>
          </div>
        </dl>
      </Card>
      <Card className="bp-section">
        <h2>Case progress</h2>
        <ol className="bp-case-sections">
          {value.sections.map((section) => (
            <li key={section.id} data-state={section.state}>
              <span>{section.label}</span>
              <Badge
                tone={
                  section.errors
                    ? "danger"
                    : section.state === "complete"
                      ? "success"
                      : "neutral"
                }
              >
                {title(section.state)}
              </Badge>
              {section.errors ? <small>{section.errors} errors</small> : null}
            </li>
          ))}
        </ol>
      </Card>
      <Card className="bp-section">
        <h2>Evidence summary</h2>
        <dl className="bp-definition">
          <div>
            <dt>Active</dt>
            <dd>{value.evidenceSummary.active}</dd>
          </div>
          <div>
            <dt>Scanning</dt>
            <dd>{value.evidenceSummary.scanning}</dd>
          </div>
          <div>
            <dt>Quarantined</dt>
            <dd>{value.evidenceSummary.quarantined}</dd>
          </div>
          <div>
            <dt>Missing</dt>
            <dd>{value.evidenceSummary.missing}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

export function DecisionDialog({
  decision,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  readonly decision: "return" | "reject" | "approve";
  readonly open: boolean;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reason: string) => Promise<void>;
}) {
  const reason = useRef<HTMLInputElement>(null),
    [validation, setValidation] = useState<string>();
  const caption = title(decision);
  useEffect(() => {
    if (!open) {
      if (reason.current) reason.current.value = "";
      setValidation(undefined);
    }
  }, [open]);
  async function confirm() {
    const normalized = reason.current?.value.trim() ?? "";
    if (!normalized) {
      setValidation(`${caption} reason is required`);
      return;
    }
    setValidation(undefined);
    await onConfirm(normalized);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent
        title={`${caption} request`}
        description="The server re-checks task ownership, maker/checker authority, and the pinned case version."
      >
        <div className="bp-decision-form">
          <Label htmlFor={`bp-${decision}-reason`}>Reason</Label>
          <Input
            ref={reason}
            id={`bp-${decision}-reason`}
            maxLength={1000}
            aria-invalid={Boolean(validation)}
            aria-describedby={validation ? `bp-${decision}-error` : undefined}
          />
          {validation ? (
            <p
              id={`bp-${decision}-error`}
              className="bp-field-error"
              role="alert"
            >
              {validation}
            </p>
          ) : null}
        </div>
        <div className="bp-dialog-actions">
          <DialogClose className="a-button a-button--secondary" disabled={busy}>
            Cancel
          </DialogClose>
          <Button
            variant={decision === "reject" ? "danger" : "primary"}
            loading={busy}
            onClick={() => void confirm()}
          >
            Confirm {decision === "approve" ? "approval" : decision}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useGuardedNavigation(dirty: boolean) {
  const navigation = useApplicationNavigation();
  const [pendingHref, setPendingHref] = useState<string>();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const navigate = useCallback(
    (href: string, force = false) => {
      if (dirty && !force) {
        setPendingHref(href);
        return;
      }
      navigation.push(href);
    },
    [dirty, navigation],
  );
  const confirm = useCallback(() => {
    if (pendingHref) navigation.push(pendingHref);
    setPendingHref(undefined);
  }, [navigation, pendingHref]);
  return Object.freeze({
    navigate,
    pendingHref,
    cancel: () => setPendingHref(undefined),
    confirm,
  });
}

export function UnsavedChangesDialog({
  navigation,
}: {
  readonly navigation: ReturnType<typeof useGuardedNavigation>;
}) {
  return (
    <ConfirmDialog
      open={Boolean(navigation.pendingHref)}
      title="Discard unsaved changes?"
      description="Your changes have not been saved and will be lost."
      confirmLabel="Discard changes"
      destructive
      onConfirm={navigation.confirm}
      onOpenChange={(open) => {
        if (!open) navigation.cancel();
      }}
    />
  );
}

function caseTone(
  status: GovernedCaseStatusV1,
): "neutral" | "success" | "warning" | "danger" {
  if (["approved", "applied", "materialized"].includes(status))
    return "success";
  if (
    [
      "validation_failed",
      "pending_approval",
      "in_review",
      "returned",
      "conflicted",
    ].includes(status)
  )
    return "warning";
  if (["rejected", "failed", "cancelled"].includes(status)) return "danger";
  return "neutral";
}

function title(value: string): string {
  return value
    .replaceAll(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
