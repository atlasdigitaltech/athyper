"use client";

import { parseInstant } from "@athyper/platform-temporal";
import { useAtlasAnswer, type AtlasConversationMessage, type AtlasExperienceAgent, type AtlasGovernedAction } from "@athyper/platform-ai-agent-ui";
import { CloseIcon, HistoryIcon, LockIcon, Maximize2Icon, MessageSquareIcon, PanelRightIcon, SparklesIcon } from "@athyper/platform-icons";
import { Tooltip } from "@athyper/platform-ui";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AtlasPromptComposer, type AtlasPromptComposerHandle } from "./home";
import { AtlasOwnerAssessment, AtlasSafeProse, AtlasValidatedAnswer, atlasStarterQuestions } from "./atlas-answer";
import { useShellPersonalizationScope } from "./personalization-scope";

export interface AtlasWorkspaceProps {
  readonly mode:"dock"|"fullscreen";
  readonly planeName:string;
  readonly currentPath?:string;
  readonly pinned?:boolean;
  readonly onPinnedChange?:(pinned:boolean)=>void;
  readonly onClose?:()=>void;
}

export function AtlasWorkspace({mode,planeName,currentPath="/home",pinned=false,onPinnedChange,onClose}:AtlasWorkspaceProps){
  const atlas=useAtlasAnswer(),scope=useShellPersonalizationScope(),composer=useRef<AtlasPromptComposerHandle>(null);
  const historyPanel=useRef<HTMLElement>(null),historyTrigger=useRef<HTMLButtonElement>(null);
  const [draft,setDraft]=useState(""),[selectedAgent,setSelectedAgent]=useState<string>(),[historyOpen,setHistoryOpen]=useState(mode==="fullscreen"),[effectivePath,setEffectivePath]=useState(currentPath);
  useEffect(() => atlas.mountWorkspace?.(), [atlas.mountWorkspace]);
  useEffect(()=>{void atlas.loadThreads();},[]);// The shared controller owns refreshes after this initial load.
  useEffect(()=>{if(mode!=="fullscreen")return;const from=new URLSearchParams(window.location.search).get("from");if(from?.startsWith("/")&&!from.startsWith("//"))setEffectivePath(from);},[mode]);
  useEffect(()=>{const agents=atlas.experience?.agents??[];if(agents.length&&!agents.some((item)=>item.code===selectedAgent))setSelectedAgent(agents[0]!.code);},[atlas.experience,selectedAgent]);
  useEffect(()=>{const narrow=window.matchMedia("(max-width: 760px)");const update=()=>{if(narrow.matches)setHistoryOpen(false);};update();narrow.addEventListener("change",update);return()=>narrow.removeEventListener("change",update);},[]);
  useEffect(()=>{
    if(!historyOpen)return;
    const closeOutside=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(historyPanel.current?.contains(target)||historyTrigger.current?.contains(target))return;
      if(historyPanel.current?.contains(document.activeElement))historyTrigger.current?.focus();
      setHistoryOpen(false);
    };
    const closeEscape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape")return;
      event.preventDefault();
      event.stopPropagation();
      setHistoryOpen(false);
      historyTrigger.current?.focus();
    };
    document.addEventListener("pointerdown",closeOutside,true);
    document.addEventListener("keydown",closeEscape,true);
    return()=>{
      document.removeEventListener("pointerdown",closeOutside,true);
      document.removeEventListener("keydown",closeEscape,true);
    };
  },[historyOpen]);
  const agent=atlas.experience?.agents.find((item)=>item.code===(selectedAgent??atlas.experience?.agents[0]?.code));
  const contextLabel=atlas.businessContext ? `${atlas.businessContext.entityCode} · ${atlas.businessContext.kind === "record" ? `${atlas.businessContext.recordId} · ${atlas.businessContext.section??"Overview"}${atlas.businessContext.dirty?" · Saved data":""}${atlas.businessContext.asOf?` · As of ${atlas.businessContext.asOf}`:""}` : atlas.businessContext.analysisTarget === "selection" ? `${atlas.businessContext.selectedIds.length} selected` : atlas.businessContext.analysisTarget === "visible_page" ? "Visible page" : "All filtered results"}` : contextForPath(effectivePath);
  useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;composer.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  const submit=(value:string,attachments?:{readonly contextId:string;readonly attachmentIds:readonly string[]})=>{if(!value.trim())return;void atlas.ask(value,selectedAgent,attachments).then(()=>setDraft(""));};
  return <section onKeyDown={event=>{if(event.key==="Escape"&&onClose){event.preventDefault();onClose();}}} className={`athyper-atlas-workspace athyper-atlas-workspace--${mode}`} aria-label="Atlas AI workspace">
    <header className="athyper-atlas-workspace__header"><span className="athyper-atlas-workspace__mark"><SparklesIcon size={18}/></span><div><strong>Atlas AI</strong><small>{planeName} · {contextLabel}</small></div><nav aria-label="Atlas workspace controls">
      <button type="button" title="New conversation" aria-label="New Atlas conversation" onClick={()=>{atlas.newConversation();setDraft("");composer.current?.focus();}}>+</button>
      <button ref={historyTrigger} type="button" title="Conversation history" aria-label="Conversation history" aria-pressed={historyOpen} aria-expanded={historyOpen} onClick={()=>setHistoryOpen((value)=>!value)}><HistoryIcon size={16}/></button>
      {mode==="dock"?<><Tooltip label={pinned?"Unpin Atlas from the right side":"Pin Atlas to the right side"}><button type="button" aria-label={pinned?"Unpin Atlas from the right side":"Pin Atlas to the right side"} aria-pressed={pinned} onClick={()=>onPinnedChange?.(!pinned)}><PanelRightIcon size={17}/></button></Tooltip><Tooltip label="Open Atlas in full screen"><a href={`/atlas?from=${encodeURIComponent(currentPath)}`} onClick={event=>{event.preventDefault();window.location.assign(atlas.fullscreenHref(currentPath));}} aria-label="Open Atlas in full screen"><Maximize2Icon size={17}/></a></Tooltip></>:null}
      {onClose?<button type="button" title="Close Atlas" aria-label="Close Atlas" onClick={onClose}><CloseIcon size={16}/></button>:null}
      {mode==="fullscreen"?<a href="/home" title="Close full-screen Atlas" aria-label="Close full-screen Atlas"><CloseIcon size={16}/></a>:null}
    </nav></header>
    <div className="athyper-atlas-workspace__body" data-history={historyOpen}>
      {historyOpen?<ConversationHistory atlas={atlas} panelRef={historyPanel}/>:null}
      <div className="athyper-atlas-workspace__conversation">
        <div className="athyper-atlas-workspace__context"><LockIcon size={13}/><span>Working with <strong>{contextLabel}</strong></span><small>Permission-aware · {planeName}</small></div>
        {atlas.automaticBriefsAvailable && atlas.businessContext?.entityCode === "business_partner" ? <div aria-label="Brief controls"><label><input type="checkbox" checked={atlas.automaticBriefsEnabled} onChange={event => atlas.setAutomaticBriefsEnabled(event.target.checked)}/>Automatic briefs while Atlas is open</label><button type="button" disabled={atlas.status === "answering" || (atlas.businessContext.kind === "record" && (!!atlas.businessContext.asOf || !atlas.businessContext.savedRevision))} onClick={() => void atlas.refreshBrief()}>Refresh brief</button></div> : null}
        {atlas.historyContextUnbound?<p role="status">Viewing conversation history. New questions use the current page context.</p>:null}
        <div className="athyper-atlas-workspace__messages" role="log" aria-label="Atlas conversation" aria-live="polite" aria-relevant="additions text">{atlas.messages.length?atlas.messages.filter((message)=>message.role==="user"||message.role==="assistant"||message.role==="tool").map((message)=><ConversationBubble key={message.messageId} message={message}/>):<EmptyConversation agentName={agent?.name} questions={atlasStarterQuestions(atlas.businessContext)} onChoose={question=>composer.current?.setText(question)}/>}</div>
        {atlas.actions.length?<div className="athyper-atlas-workspace__actions"><strong>Action previews</strong>{atlas.actions.map((action)=><WorkspaceAction key={action.proposalId} action={action} busy={atlas.actionBusy===action.proposalId} onConfirm={()=>atlas.confirmAction(action)} onDecline={()=>atlas.declineAction(action)}/>)}</div>:null}
        {atlas.actionReceipts.length ? <div aria-label="Action receipts">{atlas.actionReceipts.map(receipt=><p key={receipt.action.proposalId}>{receipt.action.summary} · {receipt.action.affectedEntityId??(receipt.context?.kind==="record"?receipt.context.recordId:receipt.action.proposalId)} · {receipt.outcome}{receipt.commandId?` · ${receipt.commandId}`:""}</p>)}</div>:null}
        <AtlasPromptComposer ref={composer} draftKey={`${scope.storageKey}:atlas-workspace-prompt`} value={draft} onChange={setDraft} onSubmit={submit} onCancel={atlas.cancel} busy={atlas.status==="answering"} agents={atlas.experience?.agents} selectedAgent={selectedAgent} onAgentChange={setSelectedAgent}/>
      </div>
      {mode==="fullscreen"?<ContextInspector atlas={atlas} contextLabel={contextLabel} agent={agent}/>:null}
    </div>
  </section>;
}

function ConversationHistory({atlas,panelRef}:{readonly atlas:ReturnType<typeof useAtlasAnswer>;readonly panelRef:React.Ref<HTMLElement>}){return <aside ref={panelRef} className="athyper-atlas-workspace__history"><header><strong>Conversations</strong><small>Scoped to this tenant and plane</small></header>{atlas.threadsStatus==="loading"?<p>Loading conversations…</p>:atlas.threadsStatus==="error"?<p>Conversation history is unavailable.</p>:atlas.threads.length?<ol>{atlas.threads.map((thread)=><li key={thread.threadId}><button type="button" aria-current={atlas.threadId===thread.threadId?"true":undefined} onClick={()=>void atlas.selectThread(thread.threadId)}><MessageSquareIcon size={14}/><span><strong>{thread.title??"Untitled conversation"}</strong><small>{relativeDate(thread.updatedAt)}</small></span></button></li>)}</ol>:<p>No previous conversations.</p>}</aside>;}

function ConversationBubble({message}:{readonly message:AtlasConversationMessage}){return <article className="athyper-atlas-workspace__message" data-role={message.role} data-status={message.status}><header><strong>{message.role==="user"?"You":message.role==="tool"?"Authorized result":"Atlas AI"}</strong><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></header>{message.answer?.envelope&&message.status==="completed"?<AtlasValidatedAnswer answer={message.answer}/>:message.text||!message.results.length?message.role==="assistant"&&message.status==="completed"?<AtlasSafeProse text={message.text||"No text was returned."}/>:<p>{message.text|| (message.status==="pending"?"Working on it…":"No text was returned.")}</p>:null}{message.results.map((result,index)=><StructuredResult key={index} value={result}/>)}{message.status==="failed"||message.status==="cancelled"?<small>{message.status==="failed"?"This response did not complete.":"Response stopped."}</small>:null}</article>;}
function EmptyConversation({agentName,questions,onChoose}:{readonly agentName?:string;readonly questions:readonly string[];readonly onChoose:(question:string)=>void}){return <div className="athyper-atlas-workspace__empty"><span><SparklesIcon size={24}/></span><strong>What can we achieve together?</strong><p>{agentName?`${agentName} is ready with your authorized business context.`:"Ask Atlas to find answers, explain records, or prepare governed work."}</p><nav aria-label="Starter questions">{questions.map(question=><button key={question} type="button" onClick={()=>onChoose(question)}>{question}</button>)}</nav></div>;}

function WorkspaceAction({action,busy,onConfirm,onDecline}:{readonly action:AtlasGovernedAction;readonly busy:boolean;readonly onConfirm:()=>Promise<void>;readonly onDecline:()=>Promise<void>}){return <article className="athyper-atlas-workspace__action"><header><span><strong>{action.summary}</strong><small>{action.toolCode}</small></span><b data-risk={action.risk}>{action.risk}</b></header><p>Nothing runs until you confirm this proposal.</p><footer><button type="button" disabled={busy||action.status!=="proposed"} onClick={()=>void onDecline()}>Decline</button><button type="button" disabled={busy||action.status!=="proposed"} onClick={()=>void onConfirm()}>{busy?"Running…":"Review and confirm"}</button></footer></article>;}

function ContextInspector({atlas,contextLabel,agent}:{readonly atlas:ReturnType<typeof useAtlasAnswer>;readonly contextLabel:string;readonly agent?:AtlasExperienceAgent}){return <aside className="athyper-atlas-workspace__inspector"><section><header><strong>Context</strong><small>Visible to this conversation</small></header><dl><div><dt>Business context</dt><dd>{contextLabel}</dd></div><div><dt>Agent</dt><dd>{agent?.name??"Default Atlas agent"}</dd></div><div><dt>Data class</dt><dd>{agent?.dataClass??"Policy selected"}</dd></div></dl></section><section><header><strong>Sources</strong><small>Verified evidence returned by Atlas</small></header>{atlas.attachmentCitations.length||atlas.citations.length?<ol>{atlas.attachmentCitations.map((item)=><li key={item.attachmentId}><strong>{item.fileName}</strong><small>Verified attachment</small></li>)}{atlas.citations.map((item)=><li key={`${item.entityCode}-${item.recordId}-${item.revision}`}><strong>{item.entityCode}</strong><small>{item.recordId} · revision {item.revision}</small></li>)}</ol>:<p>Sources will appear with grounded answers.</p>}</section><section><header><strong>Configured tools</strong><small>Published through Studio</small></header>{agent?.toolCodes.length?<ul>{agent.toolCodes.map((tool)=><li key={tool}>{tool}</li>)}</ul>:<p>No tools are published for this agent.</p>}</section></aside>;}

function contextForPath(path:string):string{const clean=path.split("?")[0]??"/home";if(clean.startsWith("/mdg/business-partner"))return"MDG · Business Partner";if(clean.startsWith("/mdg"))return"Master Data Governance";if(clean.startsWith("/atlas"))return"Atlas workspace";return"Current page";}
function StructuredResult({value}:{readonly value:unknown}){if(value&&typeof value==="object"&&"insight" in value)return <AtlasOwnerAssessment value={value.insight}/>;if(Array.isArray(value)&&value.length&&value.every((item)=>item&&typeof item==="object"&&!Array.isArray(item))){const rows=value.slice(0,20)as readonly Record<string,unknown>[],columns=Array.from(new Set(rows.flatMap((row)=>Object.keys(row)))).slice(0,6);return <div className="athyper-atlas-workspace__result"><table><thead><tr>{columns.map((column)=><th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{columns.map((column)=><td key={column}>{displayValue(row[column])}</td>)}</tr>)}</tbody></table>{value.length>20?<small>Showing 20 of {value.length} rows</small>:null}</div>;}if(value&&typeof value==="object"){const entries=Object.entries(value as Record<string,unknown>).slice(0,20);return <dl className="athyper-atlas-workspace__result">{entries.map(([key,item])=><div key={key}><dt>{key}</dt><dd>{displayValue(item)}</dd></div>)}</dl>;}return <pre className="athyper-atlas-workspace__result">{displayValue(value)}</pre>;}
function displayValue(value:unknown):string{if(value===null||value===undefined)return"—";if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);try{return JSON.stringify(value);}catch{return"[Unsupported value]";}}
function timeLabel(value:string):string{try{return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return"";}}
function relativeDate(value:string):string{const elapsed=Date.now()-parseInstant(value),days=Math.floor(elapsed/86_400_000);return days<=0?"Today":days===1?"Yesterday":`${days} days ago`;}
