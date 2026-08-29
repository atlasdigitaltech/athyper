"use client";

import {
  AtlasClientError,
  createAtlasAnswerClient,
  type AtlasActionAuditEntry,
  type AtlasAnswerClient,
  type AtlasGovernedAction,
  type AtlasRecordCitation,
  type AtlasAttachmentCitation,
  type AtlasExperienceAgent,
  type AtlasExperienceProjection,
} from "@athyper/platform-ai-agent-runtime";
export { createAtlasExperienceAdminClient } from "@athyper/platform-ai-agent-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
export type { AtlasActionAuditEntry, AtlasGovernedAction, AtlasRecordCitation, AtlasAttachmentCitation, AtlasExperienceAgent, AtlasExperienceProjection, AtlasExperienceDefinition, AtlasExperienceRelease } from "@athyper/platform-ai-agent-runtime";

export interface AtlasAnswerState {
  readonly status: "idle" | "answering" | "complete" | "unavailable" | "error";
  readonly text: string;
  readonly citations: readonly AtlasRecordCitation[];
  readonly attachmentCitations: readonly AtlasAttachmentCitation[];
  readonly actions: readonly AtlasGovernedAction[];
  readonly actionBusy?: string;
  readonly actionMessage?: string;
  readonly publicModelId?: string;
  readonly message?: string;
  readonly historyVisible: boolean;
  readonly historyStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  readonly history: readonly AtlasActionAuditEntry[];
  readonly historyMessage?: string;
  readonly experienceStatus: "loading" | "ready" | "default";
  readonly experience?: AtlasExperienceProjection;
}
export interface AtlasAnswerController extends AtlasAnswerState {
  ask(question: string, agentCode?: string, attachmentContext?: { readonly contextId: string; readonly attachmentIds: readonly string[] }): Promise<void>;
  cancel(): void;
  confirmAction(action: AtlasGovernedAction): Promise<void>;
  declineAction(action: AtlasGovernedAction): Promise<void>;
  loadHistory(): Promise<void>;
  hideHistory(): void;
}
export interface UseAtlasAnswerOptions { readonly client?: AtlasAnswerClient; }
const initialState: AtlasAnswerState = Object.freeze({ status: "idle", text: "", citations: Object.freeze([]), attachmentCitations:Object.freeze([]), actions: Object.freeze([]), historyVisible: false, historyStatus: "idle", history: Object.freeze([]), experienceStatus: "loading" });

export function useAtlasAnswer(options: UseAtlasAnswerOptions = {}): AtlasAnswerController {
  const client = useMemo(() => options.client ?? createAtlasAnswerClient(), [options.client]);
  const [state, setState] = useState<AtlasAnswerState>(initialState);
  const active = useRef<AbortController | undefined>(undefined);
  const experience = useRef<AtlasExperienceProjection | undefined>(undefined);
  const cancel = useCallback(() => { active.current?.abort(); active.current = undefined; setState((current)=>({ ...initialState, experienceStatus:current.experienceStatus, ...(current.experience?{experience:current.experience}:{}) })); }, []);
  useEffect(() => { const controller=new AbortController(); void client.experience(controller.signal).then((value)=>{experience.current=value??undefined;setState((current)=>({...current,experienceStatus:value?"ready":"default",...(value?{experience:value}:{})}));}).catch(()=>setState((current)=>({...current,experienceStatus:"default"}))); return()=>{controller.abort();active.current?.abort();}; }, [client]);

  const ask = useCallback(async (question: string, agentCode?: string, attachmentContext?: { readonly contextId:string; readonly attachmentIds:readonly string[] }) => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setState((current) => ({ ...current, status: "answering", text: "", citations: Object.freeze([]), attachmentCitations:Object.freeze([]), actions: Object.freeze([]), message: undefined, actionMessage: undefined }));
    try {
      const agent:AtlasExperienceAgent|undefined=experience.current?.agents.find((candidate)=>candidate.code===(agentCode??experience.current?.agents[0]?.code));
      const answer = await client.answer(question, { signal: controller.signal, ...(agent?{agent}:{}),...(attachmentContext?{attachmentContextId:attachmentContext.contextId,attachmentIds:attachmentContext.attachmentIds}:{}), onProgress(progress) {
        if (controller.signal.aborted) return;
        if (progress.kind === "started") setState((current) => ({ ...current, publicModelId: progress.publicModelId }));
        else if (progress.kind === "text") setState((current) => ({ ...current, text: current.text + progress.text }));
        else if (progress.kind === "citation") setState((current) => ({ ...current, citations: current.citations.some((item) => sameCitation(item, progress.citation)) ? current.citations : Object.freeze([...current.citations, progress.citation]) }));
        else if(progress.kind==="attachment-citation")setState((current)=>({...current,attachmentCitations:current.attachmentCitations.some((item)=>item.attachmentId===progress.citation.attachmentId)?current.attachmentCitations:Object.freeze([...current.attachmentCitations,progress.citation])}));
        else if (progress.kind === "action") setState((current) => ({ ...current, actions: current.actions.some((item) => item.proposalId === progress.action.proposalId) ? current.actions : Object.freeze([...current.actions, progress.action]) }));
      } });
      if (!controller.signal.aborted) setState((current) => ({ ...current, status: "complete", text: answer.text, citations: answer.citations, attachmentCitations:answer.attachmentCitations, actions: answer.actions, publicModelId: answer.publicModelId }));
    } catch (error) {
      if (controller.signal.aborted) return;
      const unavailable = isUnavailable(error);
      setState((current) => ({ ...current, status: unavailable ? "unavailable" : "error", text: "", citations: Object.freeze([]), actions: Object.freeze([]), message: unavailable ? "Grounded Atlas answers are not enabled in this environment yet. Navigation results remain available." : safeMessage(error) }));
    } finally { if (active.current === controller) active.current = undefined; }
  }, [client]);

  const transitionAction = useCallback(async (action: AtlasGovernedAction, kind: "confirm" | "decline") => {
    setState((current) => ({ ...current, actionBusy: action.proposalId, actionMessage: undefined, actions: updateAction(current.actions, action.proposalId, kind === "confirm" ? "executing" : "proposed") }));
    try {
      const result = kind === "confirm" ? await client.confirmAction(action) : await client.cancelAction(action, "declined_by_user");
      setState((current) => ({ ...current, actionBusy: undefined, actionMessage: result.outcome === "completed" ? "Action completed and audit evidence recorded." : "Action declined and recorded in the audit history.", actions: updateAction(current.actions, action.proposalId, result.outcome === "completed" ? "completed" : result.outcome) }));
    } catch (error) {
      setState((current) => ({ ...current, actionBusy: undefined, actionMessage: actionError(error), actions: updateAction(current.actions, action.proposalId, "failed") }));
    }
  }, [client]);

  const loadHistory = useCallback(async () => {
    setState((current) => ({ ...current, historyVisible: true, historyStatus: "loading", historyMessage: undefined }));
    try { const history = await client.actionHistory(); setState((current) => ({ ...current, historyStatus: "ready", history })); }
    catch (error) { const unavailable = isUnavailable(error); setState((current) => ({ ...current, historyStatus: unavailable ? "unavailable" : "error", history: Object.freeze([]), historyMessage: unavailable ? "Governed action history is not enabled in this environment." : "Action history could not be loaded." })); }
  }, [client]);

  return {
    ...state,
    ask,
    cancel,
    confirmAction: (action) => transitionAction(action, "confirm"),
    declineAction: (action) => transitionAction(action, "decline"),
    loadHistory,
    hideHistory: () => setState((current) => ({ ...current, historyVisible: false })),
  };
}

function updateAction(actions: readonly AtlasGovernedAction[], proposalId: string, status: AtlasGovernedAction["status"]): readonly AtlasGovernedAction[] { return Object.freeze(actions.map((action) => action.proposalId === proposalId ? Object.freeze({ ...action, status }) : action)); }
function sameCitation(left: AtlasRecordCitation, right: AtlasRecordCitation): boolean { return left.entityCode === right.entityCode && left.recordId === right.recordId && left.revision === right.revision; }
function statusOf(error: unknown): number | undefined { return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined; }
function isUnavailable(error: unknown): boolean { return error instanceof AtlasClientError && ["ATLAS_NOT_ADMITTED", "ATLAS_MODE_UNAVAILABLE"].includes(error.code) || [403, 404, 503].includes(statusOf(error) ?? 0); }
function safeMessage(error: unknown): string { if (error instanceof AtlasClientError) return error.message; return "Atlas could not answer this question. Try again or use the matching destinations below."; }
function actionError(error: unknown): string { const status = statusOf(error); if (status === 409) return "This proposal expired or changed. Ask Atlas to prepare a new preview."; if (status === 403) return "Your permission changed before execution. The action was not performed."; return "The action was not performed. Review the audit history or try again."; }
