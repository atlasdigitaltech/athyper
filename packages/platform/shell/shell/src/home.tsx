"use client";

import { useAtlasAnswer, type AtlasActionAuditEntry, type AtlasGovernedAction, type AtlasRecordCitation } from "@athyper/platform-ai-agent-ui";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, HistoryIcon, SearchIcon, SlidersHorizontalIcon, SparklesIcon } from "@athyper/platform-icons";
import { useAccessSnapshot } from "@athyper/platform-shell-runtime";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HOME_PERSONALIZATION,
  isHomeItemAllowed,
  moveHomeWidget,
  parseHomePersonalization,
  recommendHomeItems,
  rememberHomeInteraction,
  updateHomeWidgetVisibility,
  type HomeAccessRequirement,
  type HomePersonalization,
  type HomeWidgetId,
} from "./home-personalization";
import { useShellPersonalizationScope } from "./personalization-scope";

export interface PlatformHomeSearchItem {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly category: string;
  readonly keywords?: readonly string[];
  readonly access?: HomeAccessRequirement;
}

export interface PlatformHomeAction {
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly access?: HomeAccessRequirement;
}

export interface PlatformHomeWorkspace {
  readonly name: string;
  readonly description: string;
  readonly href: string;
  readonly status?: string;
  readonly modules: readonly string[];
  readonly access?: HomeAccessRequirement;
}

export interface PlatformHomeProps {
  readonly plane: "Neon" | "Mesh" | "Studio";
  readonly purpose: string;
  readonly suggestions: readonly string[];
  readonly searchItems: readonly PlatformHomeSearchItem[];
  readonly quickActions: readonly PlatformHomeAction[];
  readonly workspaces: readonly PlatformHomeWorkspace[];
  readonly citationRoutes?: Readonly<Record<string, string>>;
}

const MAX_RESULTS = 8;

export function PlatformHome({ plane, purpose, suggestions, searchItems, quickActions, workspaces, citationRoutes = {} }: PlatformHomeProps) {
  const [query, setQuery] = useState("");
  const [personalization, setPersonalization] = useState<HomePersonalization>(DEFAULT_HOME_PERSONALIZATION);
  const [personalizing, setPersonalizing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const access = useAccessSnapshot();
  const scope = useShellPersonalizationScope();
  const atlas = useAtlasAnswer();
  const normalized = query.trim().toLocaleLowerCase();
  const configuredSources = atlas.experience?.searchSources;
  const allowedSearchItems = useMemo(() => searchItems.filter((item) => isHomeItemAllowed(item, access) && (!configuredSources || configuredSources.some((source) => (source.kind === "navigation" || source.kind === "record") && (!source.routePrefix || item.href.startsWith(source.routePrefix))))), [searchItems, access, configuredSources]);
  const allowedActions = useMemo(() => quickActions.filter((item) => isHomeItemAllowed(item, access)), [quickActions, access]);
  const allowedWorkspaces = useMemo(() => workspaces.filter((item) => isHomeItemAllowed(item, access)), [workspaces, access]);
  const results = useMemo(() => normalized ? allowedSearchItems
    .map((item) => ({ item, score: searchScore(item, normalized) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item) : [], [normalized, allowedSearchItems]);
  const recommendations = useMemo(() => recommendHomeItems(allowedSearchItems.filter((item) => item.category !== "Workspace"), access, personalization), [allowedSearchItems, access, personalization]);
  const configuredPrompts = atlas.experience?.prompts;
  const allowedSuggestions = useMemo(() => configuredPrompts?.length ? configuredPrompts.map((item) => item.prompt) : suggestions.filter((suggestion) => allowedSearchItems.some((item) => searchScore(item, suggestion.toLocaleLowerCase()) > 0)), [configuredPrompts, suggestions, allowedSearchItems]);
  const recent = useMemo(() => Object.entries(personalization.interactions)
    .flatMap(([href, interaction]) => { const item = allowedSearchItems.find((candidate) => candidate.href === href); return item ? [{ item, interaction }] : []; })
    .sort((left, right) => Date.parse(right.interaction.lastVisitedAt) - Date.parse(left.interaction.lastVisitedAt))
    .slice(0, 4)
    .map(({ item }) => item), [personalization.interactions, allowedSearchItems]);

  useEffect(() => {
    try { setPersonalization(parseHomePersonalization(JSON.parse(window.localStorage.getItem(scope.storageKey) ?? "{}"))); }
    catch { window.localStorage.removeItem(scope.storageKey); setPersonalization(DEFAULT_HOME_PERSONALIZATION); }
    const focus = (event: KeyboardEvent) => {
      if ((event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k")) && !isTypingTarget(event.target)) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, [scope.storageKey]);
  useEffect(() => { const agents=atlas.experience?.agents??[]; if(agents.length&&!agents.some((item)=>item.code===selectedAgent))setSelectedAgent(agents[0]!.code); }, [atlas.experience,selectedAgent]);

  const commit = (next: HomePersonalization) => {
    setPersonalization(next);
    try { window.localStorage.setItem(scope.storageKey, JSON.stringify(next)); } catch { /* Personalization must not interrupt work. */ }
  };
  const visitHref = (href: string) => commit(rememberHomeInteraction(personalization, href));
  const visit = (item: PlatformHomeSearchItem) => visitHref(item.href);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (normalized) void atlas.ask(query, selectedAgent); };
  const widgetVisible = (widget: HomeWidgetId) => !personalization.hiddenWidgets.includes(widget);
  const publishedWidgetOrder = atlas.experience?.widgets.map((item)=>item.kind);
  const userReorderedWidgets = personalization.widgetOrder.join("|") !== DEFAULT_HOME_PERSONALIZATION.widgetOrder.join("|");
  const configuredWidgetOrder = publishedWidgetOrder ? (userReorderedWidgets ? personalization.widgetOrder.filter((widget)=>publishedWidgetOrder.includes(widget)) : publishedWidgetOrder) : personalization.widgetOrder;
  const configuredWidgetTitle = (widget:HomeWidgetId) => atlas.experience?.widgets.find((item)=>item.kind===widget)?.title;

  return <section className="athyper-home" aria-labelledby="athyper-home-title">
    <header className="athyper-home__hero">
      <div className="athyper-home__welcome"><span aria-hidden="true"><SparklesIcon size={22}/></span><div><h1 id="athyper-home-title">What would you like to find or accomplish?</h1><p>{purpose}</p></div></div>
      <form className="athyper-home__search" role="search" onSubmit={submit}>
        <SearchIcon size={22}/><label htmlFor="atlas-home-search">Ask Atlas</label><input ref={input} id="atlas-home-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={`Ask about ${plane}, or find a workspace and action…`} autoComplete="off"/>{atlas.experience?.agents.length?<select aria-label="Atlas agent" value={selectedAgent} onChange={(event)=>setSelectedAgent(event.currentTarget.value)}>{atlas.experience.agents.map((agent)=><option key={agent.code} value={agent.code}>{agent.name}</option>)}</select>:null}<kbd>⌘ K</kbd><button type="submit" disabled={!normalized || atlas.status === "answering"}><SparklesIcon size={16}/>{atlas.status === "answering" ? "Thinking…" : "Ask"}</button>
      </form>
      <div className="athyper-home__suggestions" aria-label="Suggested searches">{allowedSuggestions.map((suggestion) => {const configured=configuredPrompts?.find((item)=>item.prompt===suggestion);return <button key={configured?.code??suggestion} type="button" onClick={() => { setQuery(suggestion); if(configured)setSelectedAgent(configured.agentCode); input.current?.focus(); }}>{configured?.label??suggestion}</button>;})}<button className="athyper-home__history-button" type="button" onClick={() => void atlas.loadHistory()}><HistoryIcon size={14}/>Action history</button></div>
      {atlas.status !== "idle" ? <AtlasAnswerSurface atlas={atlas} citationRoutes={citationRoutes}/> : null}
      {atlas.historyVisible ? <AtlasHistorySurface atlas={atlas}/> : null}
      {normalized ? <section className="athyper-home__results" aria-live="polite" aria-label="Atlas search results"><header><strong>{results.length ? `${results.length} authorized destinations` : "No authorized matching destination"}</strong><small>Results reflect your current permissions</small></header>{results.length ? <ul>{results.map((item) => <li key={`${item.category}-${item.href}`}><a href={item.href} onClick={() => visit(item)}><span><small>{item.category}</small><strong>{item.title}</strong><em>{item.description}</em></span><ChevronRightIcon size={18}/></a></li>)}</ul> : <p>Try another business partner, workflow, profile, publication, or workspace term.</p>}</section> : null}
    </header>

    <div className="athyper-home__dashboard-heading"><div><p>Your dashboard</p><h2>Recommended and personalized for your access</h2></div><button type="button" aria-expanded={personalizing} aria-controls="home-personalization" onClick={() => setPersonalizing((value) => !value)}><SlidersHorizontalIcon size={17}/>Personalize</button></div>
    {personalizing ? <PersonalizationPanel personalization={personalization} onChange={commit}/> : null}

    <div className="athyper-home__dashboard">
      {configuredWidgetOrder.map((widget) => widgetVisible(widget) ? <React.Fragment key={widget}>{widget === "recommendations" ? <RecommendationsWidget title={configuredWidgetTitle(widget)} recommendations={recommendations} onVisit={visit}/> : widget === "workspaces" ? <WorkspacesWidget title={configuredWidgetTitle(widget)} workspaces={allowedWorkspaces} onVisit={visitHref}/> : widget === "quick-actions" ? <QuickActionsWidget title={configuredWidgetTitle(widget)} actions={allowedActions} onVisit={visitHref}/> : <RecentWidget title={configuredWidgetTitle(widget)} recent={recent} onVisit={visit}/>}</React.Fragment> : null)}
      {!configuredWidgetOrder.some(widgetVisible) ? <section className="athyper-home__panel athyper-home__dashboard-empty"><strong>Your dashboard widgets are hidden.</strong><button type="button" onClick={() => setPersonalizing(true)}>Choose visible widgets</button></section> : null}
    </div>
  </section>;
}

function PersonalizationPanel({ personalization, onChange }: { readonly personalization: HomePersonalization; readonly onChange: (next: HomePersonalization) => void }) {
  return <section id="home-personalization" className="athyper-home__personalization" aria-labelledby="home-personalization-title"><header><div><strong id="home-personalization-title">Personalize dashboard</strong><small>Visibility and order are saved for this account, tenant, and plane.</small></div><button type="button" onClick={() => onChange(DEFAULT_HOME_PERSONALIZATION)}>Reset</button></header><ol>{personalization.widgetOrder.map((widget, index) => { const visible = !personalization.hiddenWidgets.includes(widget); return <li key={widget}><label><input type="checkbox" checked={visible} onChange={(event) => onChange(updateHomeWidgetVisibility(personalization, widget, event.currentTarget.checked))}/><span><strong>{widgetLabel(widget)}</strong><small>{widgetDescription(widget)}</small></span></label><span><button type="button" aria-label={`Move ${widgetLabel(widget)} up`} disabled={index === 0} onClick={() => onChange(moveHomeWidget(personalization, widget, -1))}><ArrowUpIcon size={15}/></button><button type="button" aria-label={`Move ${widgetLabel(widget)} down`} disabled={index === personalization.widgetOrder.length - 1} onClick={() => onChange(moveHomeWidget(personalization, widget, 1))}><ArrowDownIcon size={15}/></button></span></li>; })}</ol></section>;
}

function RecommendationsWidget({ title, recommendations, onVisit }: { readonly title?:string; readonly recommendations: ReturnType<typeof recommendHomeItems<PlatformHomeSearchItem>>; readonly onVisit: (item: PlatformHomeSearchItem) => void }) {
  return <section className="athyper-home__panel athyper-home__recommendations" aria-labelledby="home-recommendations"><div className="athyper-home__panel-title"><span aria-hidden="true"><SparklesIcon size={18}/></span><div><p>Permission-aware</p><h2 id="home-recommendations">{title ?? "Recommended for you"}</h2></div></div>{recommendations.length ? <ul>{recommendations.map(({ item, reason }) => <li key={item.href}><a href={item.href} onClick={() => onVisit(item)}><span><small>{reason}</small><strong>{item.title}</strong><em>{item.description}</em></span><ChevronRightIcon size={17}/></a></li>)}</ul> : <p className="athyper-home__empty-recent">Recommendations will appear when an authorized module becomes available.</p>}</section>;
}

function WorkspacesWidget({ title, workspaces, onVisit }: { readonly title?:string; readonly workspaces: readonly PlatformHomeWorkspace[]; readonly onVisit: (href: string) => void }) {
  return <section className="athyper-home__panel athyper-home__workspaces" aria-labelledby="home-workspaces"><div className="athyper-home__panel-title"><div><p>Available to you</p><h2 id="home-workspaces">{title ?? "Workspaces"}</h2></div></div>{workspaces.map((workspace) => <a key={workspace.href} href={workspace.href} className="athyper-home__workspace-card" onClick={() => onVisit(workspace.href)}><span><small>{workspace.status ?? "Available workspace"}</small><strong>{workspace.name}</strong><em>{workspace.description}</em><span>{workspace.modules.join(" · ")}</span></span><ChevronRightIcon size={20}/></a>)}</section>;
}

function QuickActionsWidget({ title, actions, onVisit }: { readonly title?:string; readonly actions: readonly PlatformHomeAction[]; readonly onVisit: (href: string) => void }) {
  return <section className="athyper-home__panel" aria-labelledby="home-actions"><div className="athyper-home__panel-title"><div><p>Permitted actions</p><h2 id="home-actions">{title ?? "Quick actions"}</h2></div></div>{actions.length ? <ul className="athyper-home__action-list">{actions.map((action) => <li key={action.href}><a href={action.href} onClick={() => onVisit(action.href)}><span><strong>{action.label}</strong><small>{action.description}</small></span><ChevronRightIcon size={17}/></a></li>)}</ul> : <p className="athyper-home__empty-recent">No quick actions are available for your current permissions.</p>}</section>;
}

function RecentWidget({ title, recent, onVisit }: { readonly title?:string; readonly recent: readonly PlatformHomeSearchItem[]; readonly onVisit: (item: PlatformHomeSearchItem) => void }) {
  return <section className="athyper-home__panel athyper-home__recent" aria-labelledby="home-recent"><div className="athyper-home__panel-title"><span aria-hidden="true"><HistoryIcon size={18}/></span><div><p>Continue working</p><h2 id="home-recent">{title ?? "Recently opened from Atlas"}</h2></div></div>{recent.length ? <ul>{recent.map((item) => <li key={item.href}><a href={item.href} onClick={() => onVisit(item)}><span><strong>{item.title}</strong><small>{item.category}</small></span><ChevronRightIcon size={16}/></a></li>)}</ul> : <p className="athyper-home__empty-recent">Authorized destinations you open from Atlas will appear here.</p>}</section>;
}

function AtlasAnswerSurface({ atlas, citationRoutes }: { readonly atlas: ReturnType<typeof useAtlasAnswer>; readonly citationRoutes: Readonly<Record<string, string>> }) {
  const active = atlas.status === "answering";
  return <section className="athyper-home__answer" aria-live="polite" aria-busy={active} aria-labelledby="atlas-answer-title"><header><span aria-hidden="true"><SparklesIcon size={17}/></span><div><strong id="atlas-answer-title">Atlas answer</strong><small>{atlas.publicModelId ? `${atlas.publicModelId} · permission-aware` : "Permission-aware grounded assistance"}</small></div>{active ? <button type="button" onClick={atlas.cancel}>Cancel</button> : null}</header>
    {atlas.status === "unavailable" || atlas.status === "error" ? <p className="athyper-home__answer-message">{atlas.message}</p> : <><div className="athyper-home__answer-text">{atlas.text || (atlas.actions.length ? "Atlas prepared a governed action for your review." : "Finding authorized sources and preparing an answer…")}</div>{atlas.actions.length ? <div className="athyper-home__actions-preview"><strong>Governed action previews</strong><p>Nothing runs until you review the exact proposal and confirm it.</p>{atlas.actions.map((action) => <GovernedActionPreview key={action.proposalId} action={action} busy={atlas.actionBusy === action.proposalId} onConfirm={() => atlas.confirmAction(action)} onDecline={() => atlas.declineAction(action)}/>) }{atlas.actionMessage ? <p role="status" className="athyper-home__action-message">{atlas.actionMessage}</p> : null}</div> : null}{atlas.status === "complete" ? <div className="athyper-home__citations"><strong>Sources</strong>{atlas.citations.length ? <ol>{atlas.citations.map((citation, index) => <li key={`${citation.entityCode}-${citation.recordId}-${citation.revision}`}>{citationLink(citation, citationRoutes, index)}</li>)}</ol> : <p>No record citation was returned. Verify the answer and action preview before continuing.</p>}</div> : null}</>}
  </section>;
}

function GovernedActionPreview({ action, busy, onConfirm, onDecline }: { readonly action: AtlasGovernedAction; readonly busy: boolean; readonly onConfirm: () => Promise<void>; readonly onDecline: () => Promise<void> }) {
  const [reviewed, setReviewed] = useState(false), terminal = ["completed", "cancelled", "denied", "failed", "expired"].includes(action.status);
  return <article className="athyper-home__action-preview" data-risk={action.risk}><header><span><small>{action.access} · {action.risk} risk</small><strong>{action.summary}</strong></span><b data-status={action.status}>{action.status}</b></header><dl>{action.affectedEntityType ? <div><dt>Entity</dt><dd>{action.affectedEntityType}{action.affectedEntityId ? ` · ${action.affectedEntityId}` : ""}</dd></div> : null}{action.expectedRowVersion !== undefined ? <div><dt>Expected version</dt><dd>{action.expectedRowVersion}</dd></div> : null}{action.expiresAt ? <div><dt>Confirmation expires</dt><dd>{formatAuditTime(action.expiresAt)}</dd></div> : null}</dl><div className="athyper-home__action-fields"><strong>Proposed values</strong><dl>{Object.entries(action.arguments).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{safeArgument(key, value)}</dd></div>)}</dl></div>{!terminal ? <><label className="athyper-home__action-confirm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.currentTarget.checked)}/><span>I reviewed this preview and authorize this exact action.</span></label><footer><button type="button" disabled={busy} onClick={() => void onDecline()}>Decline</button><button type="button" disabled={!reviewed || busy} onClick={() => void onConfirm()}>{busy ? "Processing…" : "Confirm and run"}</button></footer></> : null}</article>;
}

function AtlasHistorySurface({ atlas }: { readonly atlas: ReturnType<typeof useAtlasAnswer> }) {
  return <section className="athyper-home__action-history" aria-live="polite" aria-labelledby="atlas-action-history-title"><header><div><strong id="atlas-action-history-title">Governed action history</strong><small>Content-free audit evidence for your Atlas actions in this tenant and plane</small></div><button type="button" onClick={atlas.hideHistory}>Close</button></header>{atlas.historyStatus === "loading" ? <p>Loading audit history…</p> : atlas.historyStatus === "unavailable" || atlas.historyStatus === "error" ? <p>{atlas.historyMessage}</p> : atlas.history.length ? <ol>{atlas.history.map((entry) => <AuditEntry key={entry.proposalId} entry={entry}/>)}</ol> : <p>No governed Atlas actions have been recorded for this account.</p>}</section>;
}

function AuditEntry({ entry }: { readonly entry: AtlasActionAuditEntry }) {
  return <li><header><span><small>{formatAuditTime(entry.createdAt)} · {entry.risk} risk</small><strong>{entry.summary}</strong></span><b data-status={entry.status}>{entry.status}</b></header><dl><div><dt>Tool</dt><dd>{entry.toolCode}@{entry.toolVersion}</dd></div><div><dt>Policy</dt><dd>{entry.policyRevision}</dd></div>{entry.affectedEntityType ? <div><dt>Entity</dt><dd>{entry.affectedEntityType}{entry.affectedEntityId ? ` · ${entry.affectedEntityId}` : ""}</dd></div> : null}{entry.businessTransactionId ? <div><dt>Transaction</dt><dd>{entry.businessTransactionType ?? "command"} · {entry.businessTransactionId}</dd></div> : null}{entry.durationMs !== undefined ? <div><dt>Duration</dt><dd>{entry.durationMs} ms</dd></div> : null}{entry.terminalErrorClass ? <div><dt>Outcome evidence</dt><dd>{entry.terminalErrorClass}</dd></div> : null}</dl></li>;
}

function citationLink(citation: AtlasRecordCitation, routes: Readonly<Record<string, string>>, index: number): React.ReactNode {
  const label = `${index + 1}. ${citation.entityCode.replace(/_/g, " ")} · ${citation.recordId} · revision ${citation.revision}`;
  const template = routes[citation.entityCode]; if (!template?.startsWith("/")) return <span>{label}</span>;
  const href = template.replace("{recordId}", encodeURIComponent(citation.recordId)).replace("{entityCode}", encodeURIComponent(citation.entityCode));
  return <a href={href}>{label}<ChevronRightIcon size={14}/></a>;
}

function searchScore(item: PlatformHomeSearchItem, query: string): number {
  const terms = query.split(/\s+/).filter(Boolean), title = item.title.toLocaleLowerCase(), category = item.category.toLocaleLowerCase();
  const haystack = `${title} ${category} ${item.description.toLocaleLowerCase()} ${(item.keywords ?? []).join(" ").toLocaleLowerCase()}`;
  if (title === query) return 100;
  if (title.includes(query)) return 60;
  return terms.reduce((score, term) => score + (title.includes(term) ? 12 : category.includes(term) ? 8 : haystack.includes(term) ? 4 : 0), 0);
}

function widgetLabel(widget: HomeWidgetId): string { return widget === "quick-actions" ? "Quick actions" : widget[0]!.toUpperCase() + widget.slice(1); }
function widgetDescription(widget: HomeWidgetId): string { return widget === "recommendations" ? "Role- and activity-based destinations" : widget === "workspaces" ? "Authorized workspace entry points" : widget === "quick-actions" ? "Actions allowed by your permissions" : "Your recently opened destinations"; }
function safeArgument(key: string, value: unknown): string { if (/(secret|password|token|api.?key|credential)/i.test(key)) return "••••••••"; if (value === null) return "None"; if (["string", "number", "boolean"].includes(typeof value)) return String(value).slice(0, 240); if (Array.isArray(value)) return `${value.length} selected item${value.length === 1 ? "" : "s"}`; return "Structured value"; }
function humanize(value: string): string { return value.replace(/[-_.]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatAuditTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
function isTypingTarget(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"); }
