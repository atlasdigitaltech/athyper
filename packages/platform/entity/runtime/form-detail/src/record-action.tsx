"use client";
import React, { useId } from "react";
import { parseEntityAccessDecision, type EntityAccessDecisionV1, type EntityRecordHeaderV1 } from "@athyper/contract-platform-entity-runtime";

export type RecordAction = EntityRecordHeaderV1["actions"][number];
export interface EntityActionHandlers {
  readonly selectContext?: (decision: EntityAccessDecisionV1) => void;
  readonly verify?: (decision: EntityAccessDecisionV1) => void;
  readonly prerequisites?: (decision: EntityAccessDecisionV1) => void;
  readonly retry?: () => void;
}
const messages = {
  context_required: "Select the required transaction context, then check access again.",
  verification_required: "Verify your identity to continue.",
  preflight_required: "Complete the required checks before continuing.",
  workflow_blocked: "Complete the workflow prerequisites before continuing.",
  denied: "This action is not available to you.",
  not_applicable: "This action does not apply to this record.",
  unavailable: "Access could not be checked. Retry or quote the diagnostic reference.",
};
/** Readiness never substitutes for authorization by the destination or command handler. */
export function EntityRecordAction({ action, handlers, readOnly = false }: {
  readonly action: RecordAction; readonly handlers?: EntityActionHandlers; readonly readOnly?: boolean;
}) {
  const id = useId();
  let decision: EntityAccessDecisionV1 | undefined;
  let invalid = false;
  if (action.decision !== undefined) {
    try {
      decision = parseEntityAccessDecision(action.decision);
      if (!action.operationKey || action.operationKey !== decision.operationKey) invalid = true;
    } catch { invalid = true; }
  }
  if (readOnly) return null;
  const state = invalid ? "unavailable" : decision?.state;
  const safeHref = action.href?.startsWith("/") && !action.href.startsWith("//") && !/[\\\u0000-\u0020]/.test(action.href) ? action.href : undefined;
  if ((!state || state === "allowed") && safeHref && !action.disabledReason) {
    return <a className={`a-button a-button--${action.placement === "primary" ? "primary" : "secondary"}`} href={safeHref} onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")} data-operation-key={action.operationKey ?? action.key}>{action.label}</a>;
  }
  const callback = invalid ? undefined : state === "context_required" ? handlers?.selectContext
    : state === "verification_required" ? handlers?.verify
    : state === "workflow_blocked" || state === "preflight_required" ? handlers?.prerequisites : undefined;
  const retry = state === "unavailable" ? handlers?.retry : undefined;
  const message = state && state !== "allowed" ? messages[state] : action.disabledReason ?? "Action destination is unavailable.";
  return <span className="a-record-header__disabled" data-operation-key={action.operationKey ?? action.key} data-decision-state={state}>
    <button type="button" className="a-button a-button--secondary" disabled={!callback && !retry} aria-describedby={id} onClick={() => { if (retry) retry(); else if (callback && decision) callback(decision); }}>{action.label}{callback ? state === "context_required" ? " · Select context" : state === "verification_required" ? " · Verify" : " · View prerequisites" : retry ? " · Retry" : ""}</button>
    <small id={id}>{message}{state === "unavailable" && decision && !invalid ? ` Reference: ${decision.decisionRef}` : ""}</small>
  </span>;
}
