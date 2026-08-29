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
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
export type { AtlasActionAuditEntry, AtlasGovernedAction, AtlasRecordCitation, AtlasAttachmentCitation, AtlasExperienceAgent, AtlasExperienceProjection, AtlasExperienceDefinition, AtlasExperienceRelease,AtlasThreadSummary,AtlasConversationMessage } from "@athyper/platform-ai-agent-runtime";

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
  readonly threadId?:string;
  readonly threadsStatus:"idle"|"loading"|"ready"|"error";
  readonly threads:readonly import("@athyper/platform-ai-agent-runtime").AtlasThreadSummary[];
  readonly messages:readonly import("@athyper/platform-ai-agent-runtime").AtlasConversationMessage[];
}
export interface AtlasAnswerController extends AtlasAnswerState {
  ask(question: string, agentCode?: string, attachmentContext?: { readonly contextId: string; readonly attachmentIds: readonly string[] }): Promise<void>;
  cancel(): void;
  confirmAction(action: AtlasGovernedAction): Promise<void>;
  declineAction(action: AtlasGovernedAction): Promise<void>;
  loadHistory(): Promise<void>;
  hideHistory(): void;
  loadThreads():Promise<void>;
  selectThread(threadId:string):Promise<void>;
  newConversation():void;
  archiveCurrent():Promise<void>;
}
export interface UseAtlasAnswerOptions { readonly client?: AtlasAnswerClient; }
const initialState: AtlasAnswerState = Object.freeze({ status: "idle", text: "", citations: Object.freeze([]), attachmentCitations:Object.freeze([]), actions: Object.freeze([]), historyVisible: false, historyStatus: "idle", history: Object.freeze([]), experienceStatus: "loading",threadsStatus:"idle",threads:Object.freeze([]),messages:Object.freeze([]) });

const AtlasAnswerContext=createContext<AtlasAnswerController|undefined>(undefined);
export function AtlasAnswerProvider({children,options}:{readonly children:ReactNode;readonly options?:UseAtlasAnswerOptions}){const value=useAtlasAnswerState(options);return createElement(AtlasAnswerContext.Provider,{value},children);}
export function useAtlasAnswer():AtlasAnswerController{const value=useContext(AtlasAnswerContext);if(!value)throw new Error("useAtlasAnswer requires AtlasAnswerProvider");return value;}

function useAtlasAnswerState(options: UseAtlasAnswerOptions = {}): AtlasAnswerController {
  const client = useMemo(() => options.client ?? createAtlasAnswerClient(), [options.client]);
  const [state, setState] = useState<AtlasAnswerState>(initialState);
  const active = useRef<AbortController | undefined>(undefined);
  const experience = useRef<AtlasExperienceProjection | undefined>(undefined);
  const threadId=useRef<string|undefined>(undefined);
  const cancel = useCallback(() => { active.current?.abort(); active.current = undefined; setState((current)=>({...current,status:"idle",message:undefined,messages:updatePendingMessage(current.messages,"cancelled")})); }, []);
  useEffect(() => { const controller=new AbortController(); void client.experience(controller.signal).then((value)=>{experience.current=value??undefined;setState((current)=>({...current,experienceStatus:value?"ready":"default",...(value?{experience:value}:{})}));}).catch(()=>setState((current)=>({...current,experienceStatus:"default"}))); return()=>{controller.abort();active.current?.abort();}; }, [client]);

  const ask = useCallback(async (question: string, agentCode?: string, attachmentContext?: { readonly contextId:string; readonly attachmentIds:readonly string[] }) => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const now=new Date().toISOString(),userMessage=localMessage("user",question,now),assistantMessage=localMessage("assistant","",now,"pending");
    setState((current) => ({ ...current, status: "answering", text: "", citations: Object.freeze([]), attachmentCitations:Object.freeze([]), actions: Object.freeze([]), message: undefined, actionMessage: undefined,messages:Object.freeze([...current.messages,userMessage,assistantMessage]) }));
    try {
      const agent:AtlasExperienceAgent|undefined=experience.current?.agents.find((candidate)=>candidate.code===(agentCode??experience.current?.agents[0]?.code));
      const answer = await client.answer(question, { signal: controller.signal,...(threadId.current?{threadId:threadId.current}:{}), ...(agent?{agent}:{}),...(attachmentContext?{attachmentContextId:attachmentContext.contextId,attachmentIds:attachmentContext.attachmentIds}:{}), onProgress(progress) {
        if (controller.signal.aborted) return;
        if (progress.kind === "started") setState((current) => ({ ...current, publicModelId: progress.publicModelId }));
        else if (progress.kind === "text") setState((current) => ({ ...current, text: current.text + progress.text,messages:appendPendingText(current.messages,progress.text) }));
        else if (progress.kind === "citation") setState((current) => ({ ...current, citations: current.citations.some((item) => sameCitation(item, progress.citation)) ? current.citations : Object.freeze([...current.citations, progress.citation]) }));
        else if(progress.kind==="attachment-citation")setState((current)=>({...current,attachmentCitations:current.attachmentCitations.some((item)=>item.attachmentId===progress.citation.attachmentId)?current.attachmentCitations:Object.freeze([...current.attachmentCitations,progress.citation])}));
        else if (progress.kind === "action") setState((current) => ({ ...current, actions: current.actions.some((item) => item.proposalId === progress.action.proposalId) ? current.actions : Object.freeze([...current.actions, progress.action]) }));
      } });
      if (!controller.signal.aborted){threadId.current=answer.threadId;setState((current) => ({ ...current,threadId:answer.threadId, status: "complete", text: answer.text, citations: answer.citations, attachmentCitations:answer.attachmentCitations, actions: answer.actions, publicModelId: answer.publicModelId,messages:completePendingMessage(current.messages,answer.text) }));void client.threads("active").then((page)=>setState((current)=>({...current,threadsStatus:"ready",threads:page.items}))).catch(()=>undefined);}
    } catch (error) {
      if (controller.signal.aborted) return;
      const unavailable = isUnavailable(error);
      const message=unavailable ? "Grounded Atlas answers are not enabled in this environment yet. Navigation results remain available." : safeMessage(error);setState((current) => ({ ...current, status: unavailable ? "unavailable" : "error", text: "", citations: Object.freeze([]), actions: Object.freeze([]), message,messages:completePendingMessage(current.messages,message,"failed") }));
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

  const loadThreads=useCallback(async()=>{setState((current)=>({...current,threadsStatus:"loading"}));try{const page=await client.threads("active");setState((current)=>({...current,threadsStatus:"ready",threads:page.items}));}catch{setState((current)=>({...current,threadsStatus:"error"}));}},[client]);
  const selectThread=useCallback(async(nextThreadId:string)=>{active.current?.abort();setState((current)=>({...current,threadsStatus:"loading",status:"idle",message:undefined}));try{const page=await client.messages(nextThreadId);threadId.current=nextThreadId;setState((current)=>({...current,threadId:nextThreadId,threadsStatus:"ready",messages:page.items,text:"",citations:Object.freeze([]),attachmentCitations:Object.freeze([]),actions:Object.freeze([])}));}catch{setState((current)=>({...current,threadsStatus:"error"}));}},[client]);
  const newConversation=useCallback(()=>{active.current?.abort();threadId.current=undefined;setState((current)=>({...current,threadId:undefined,status:"idle",text:"",message:undefined,citations:Object.freeze([]),attachmentCitations:Object.freeze([]),actions:Object.freeze([]),messages:Object.freeze([])}));},[]);
  const archiveCurrent=useCallback(async()=>{const current=state.threads.find((item)=>item.threadId===threadId.current);if(!current)return;await client.archiveThread(current);newConversation();await loadThreads();},[client,loadThreads,newConversation,state.threads]);

  return {
    ...state,
    ask,
    cancel,
    confirmAction: (action) => transitionAction(action, "confirm"),
    declineAction: (action) => transitionAction(action, "decline"),
    loadHistory,
    hideHistory: () => setState((current) => ({ ...current, historyVisible: false })),
    loadThreads,selectThread,newConversation,archiveCurrent,
  };
}

function localMessage(role:"user"|"assistant",text:string,createdAt:string,status:"pending"|"completed"="completed"):import("@athyper/platform-ai-agent-runtime").AtlasConversationMessage{return Object.freeze({messageId:`local-${role}-${globalThis.crypto?.randomUUID?.()??Math.random()}`,threadId:"local",sequence:0,role,status,text,results:Object.freeze([]),runId:null,createdAt,terminalAt:null});}
function appendPendingText(messages:readonly import("@athyper/platform-ai-agent-runtime").AtlasConversationMessage[],text:string){return Object.freeze(messages.map((message,index)=>index===messages.length-1&&message.role==="assistant"&&message.status==="pending"?Object.freeze({...message,text:message.text+text}):message));}
function completePendingMessage(messages:readonly import("@athyper/platform-ai-agent-runtime").AtlasConversationMessage[],text:string,status:"completed"|"failed"="completed"){return Object.freeze(messages.map((message,index)=>index===messages.length-1&&message.role==="assistant"&&message.status==="pending"?Object.freeze({...message,text:text||message.text,status,terminalAt:new Date().toISOString()}):message));}
function updatePendingMessage(messages:readonly import("@athyper/platform-ai-agent-runtime").AtlasConversationMessage[],status:"cancelled"){return Object.freeze(messages.map((message)=>message.role==="assistant"&&message.status==="pending"?Object.freeze({...message,status,terminalAt:new Date().toISOString()}):message));}

function updateAction(actions: readonly AtlasGovernedAction[], proposalId: string, status: AtlasGovernedAction["status"]): readonly AtlasGovernedAction[] { return Object.freeze(actions.map((action) => action.proposalId === proposalId ? Object.freeze({ ...action, status }) : action)); }
function sameCitation(left: AtlasRecordCitation, right: AtlasRecordCitation): boolean { return left.entityCode === right.entityCode && left.recordId === right.recordId && left.revision === right.revision; }
function statusOf(error: unknown): number | undefined { return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined; }
function isUnavailable(error: unknown): boolean { return error instanceof AtlasClientError && ["ATLAS_NOT_ADMITTED", "ATLAS_MODE_UNAVAILABLE"].includes(error.code) || [403, 404, 503].includes(statusOf(error) ?? 0); }
function safeMessage(error: unknown): string { if (error instanceof AtlasClientError) return error.message; return "Atlas could not answer this question. Try again or use the matching destinations below."; }
function actionError(error: unknown): string { const status = statusOf(error); if (status === 409) return "This proposal expired or changed. Ask Atlas to prepare a new preview."; if (status === 403) return "Your permission changed before execution. The action was not performed."; return "The action was not performed. Review the audit history or try again."; }
