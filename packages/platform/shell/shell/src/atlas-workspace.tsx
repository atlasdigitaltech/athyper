"use client";
import { AtlasActionHistory } from "./atlas-action-history";
import { useAtlasSurface } from "./atlas-surface";

import { AtlasContextInspector } from "./atlas-context-inspector";
import { parseInstant } from "@athyper/platform-temporal";
import {
  useAtlasAnswer,
  type AtlasResponseFeedbackV1,
  type AtlasVocabularyCorrection,
  type AtlasConversationMessage,
  type AtlasExperienceAgent,
  type AtlasGovernedAction,
} from "@athyper/platform-ai-agent-ui";
import {
  CloseIcon,
  HistoryIcon,
  LockIcon,
  Maximize2Icon,
  Minimize2Icon,
  MessageSquareIcon,
  PanelRightIcon,
  AtlasBrandIcon,
} from "@athyper/platform-icons";
import { Tooltip } from "@athyper/platform-ui";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearAtlasDraft,
  AtlasPromptComposer,
  type AtlasPromptComposerHandle,
} from "./home";
import {
  AtlasOwnerAssessment,
  AtlasSafeProse,
  AtlasValidatedAnswer,
  atlasStarterQuestions,
} from "./atlas-answer";
import { useShellPersonalizationScope } from "./personalization-scope";

export interface AtlasWorkspaceProps {
  readonly breadcrumbs?: readonly {
    readonly label: string;
    readonly href?: string;
  }[];
  readonly mode: "dock" | "fullscreen";
  readonly planeName: string;
  readonly currentPath?: string;
  readonly pinned?: boolean;
  readonly onPinnedChange?: (pinned: boolean) => void;
  readonly onClose?: () => void;
}

export function AtlasWorkspace({
  breadcrumbs,
  mode,
  planeName,
  currentPath = "/home",
  pinned = false,
  onPinnedChange,
  onClose,
}: AtlasWorkspaceProps) {
  const surface = useAtlasSurface();
  useEffect(() => {
    setHistoryOpen(mode === "fullscreen");
    requestAnimationFrame(() => composer.current?.focus());
  }, [mode]);
  const atlas = useAtlasAnswer(),
    scope = useShellPersonalizationScope(),
    composer = useRef<AtlasPromptComposerHandle>(null);
  const historyPanel = useRef<HTMLElement>(null),
    historyTrigger = useRef<HTMLButtonElement>(null),
    conversationHeading = useRef<HTMLElement>(null);
  const [pendingThread, setPendingThread] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const inspectorId = React.useId();
  const [restoredCrumbs, setRestoredCrumbs] = useState<{
    entity: string;
    record: string;
    crumbs: readonly { label: string; href?: string }[];
  }>();
  useEffect(() => {
    if (!pendingThread) return;
    if (atlas.threadsStatus === "error") {
      setPendingThread(undefined);
      return;
    }
    if (atlas.threadsStatus === "ready" && atlas.threadId === pendingThread) {
      setPendingThread(undefined);
      if (
        mode !== "fullscreen" ||
        window.matchMedia("(max-width: 760px)").matches
      ) {
        setHistoryOpen(false);
        conversationHeading.current?.focus({ preventScroll: true });
      }
    }
  }, [pendingThread, atlas.threadsStatus, atlas.threadId, mode]);
  const [draft, setDraft] = useState(""),
    [selectedAgent, setSelectedAgent] = useState<string>(),
    [historyOpen, setHistoryOpen] = useState(mode === "fullscreen"),
    [effectivePath, setEffectivePath] = useState(currentPath);
  useEffect(() => atlas.mountWorkspace?.(), [atlas.mountWorkspace]);
  useEffect(() => {
    void atlas.loadThreads();
  }, []); // The shared controller owns refreshes after this initial load.
  useEffect(() => {
    if (mode !== "fullscreen") return;
    const from = new URLSearchParams(window.location.search).get("from");
    if (from?.startsWith("/") && !from.startsWith("//")) setEffectivePath(from);
  }, [mode]);
  useEffect(() => {
    const agents = atlas.experience?.agents ?? [];
    if (agents.length && !agents.some((item) => item.code === selectedAgent))
      setSelectedAgent(agents[0]!.code);
  }, [atlas.experience, selectedAgent]);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 760px)");
    const update = () => {
      if (narrow.matches) setHistoryOpen(false);
    };
    update();
    narrow.addEventListener("change", update);
    return () => narrow.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!historyOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        mode === "fullscreen" &&
        !window.matchMedia("(max-width: 760px)").matches
      )
        return;
      const target = event.target as Node;
      if (
        historyPanel.current?.contains(target) ||
        historyTrigger.current?.contains(target)
      )
        return;
      if (historyPanel.current?.contains(document.activeElement))
        historyTrigger.current?.focus();
      setHistoryOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setHistoryOpen(false);
      historyTrigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeEscape, true);
    };
  }, [historyOpen, mode]);
  const agent = atlas.experience?.agents.find(
    (item) =>
      item.code === (selectedAgent ?? atlas.experience?.agents[0]?.code),
  );
  const entityLabel = atlas.businessContext
    ? readableContextLabel(atlas.businessContext.entityCode)
    : "Workspace assistant";
  const sectionLabel =
    atlas.businessContext?.kind === "record"
      ? readableContextLabel(atlas.businessContext.section ?? "overview")
      : undefined;
  const presentationKey = `${scope.storageKey}:atlas-record-presentation`;
  const pageEntity = atlas.businessContext?.entityCode,
    pageRecord =
      atlas.businessContext?.kind === "record"
        ? atlas.businessContext.recordId
        : undefined;
  useEffect(() => {
    setRestoredCrumbs(undefined);
    if (!pageRecord || !pageEntity) return;
    try {
      if (mode === "dock" && breadcrumbs?.length) {
        sessionStorage.setItem(
          presentationKey,
          JSON.stringify({
            entity: pageEntity,
            record: pageRecord,
            crumbs: breadcrumbs.slice(-2),
            expiresAt: Date.now() + 300000,
          }),
        );
        return;
      }
      const saved = JSON.parse(
        sessionStorage.getItem(presentationKey) ?? "null",
      );
      if (
        saved?.entity === pageEntity &&
        saved.record === pageRecord &&
        saved.expiresAt > Date.now() &&
        Array.isArray(saved.crumbs) &&
        saved.crumbs.length <= 2 &&
        saved.crumbs.every(
          (c: { label?: unknown; href?: unknown }) =>
            typeof c.label === "string" &&
            c.label.length <= 512 &&
            (c.href === undefined ||
              (typeof c.href === "string" &&
                c.href.startsWith("/") &&
                !c.href.startsWith("//") &&
                !c.href.includes("\\"))),
        )
      )
        setRestoredCrumbs({
          entity: pageEntity,
          record: pageRecord,
          crumbs: saved.crumbs,
        });
    } catch {
      /* Display labels are optional; never affect record authorization. */
    }
  }, [mode, presentationKey, pageEntity, pageRecord, breadcrumbs]);
  const contextCrumbs =
    breadcrumbs?.slice(-2) ??
    (restoredCrumbs &&
    restoredCrumbs.entity === pageEntity &&
    restoredCrumbs.record === pageRecord
      ? restoredCrumbs.crumbs
      : []);
  const contextLabel =
    atlas.businessContext?.kind === "record"
      ? `${contextCrumbs.at(-1)?.label ?? entityLabel} · ${sectionLabel}${atlas.businessContext.dirty ? " · Saved data" : ""}${atlas.businessContext.asOf ? ` · As of ${atlas.businessContext.asOf}` : ""}`
      : atlas.businessContext?.kind === "manage"
        ? `${entityLabel} · ${atlas.businessContext.analysisTarget === "selection" ? `${atlas.businessContext.selectedIds.length} selected` : atlas.businessContext.analysisTarget === "visible_page" ? "Visible page" : "All filtered results"}`
        : "No record selected";
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    composer.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const draftKey = `${scope.storageKey}:atlas-draft:v2:${atlas.threadId ?? "new"}`;
  const submit = (
    value: string,
    attachments?: {
      readonly contextId: string;
      readonly attachmentIds: readonly string[];
    },
  ) => {
    if (!value.trim()) return;
    void atlas.ask(value, selectedAgent, attachments).then((completed) => {
      if (completed) {
        clearAtlasDraft(draftKey);
      }
    });
  };
  return (
    <section
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          onClose();
        }
      }}
      className={`athyper-atlas-workspace athyper-atlas-workspace--${mode}`}
      aria-label="Atlas AI workspace"
    >
      <header className="athyper-atlas-workspace__header">
        <span className="athyper-atlas-workspace__mark">
          <AtlasBrandIcon size={20} />
        </span>
        <div>
          <strong ref={conversationHeading} tabIndex={-1}>
            Atlas AI
          </strong>
          <small>
            {planeName} · {entityLabel}
          </small>
        </div>
        <nav aria-label="Atlas workspace controls">
          <Tooltip label="New conversation">
            <button
              type="button"
              aria-label="New Atlas conversation"
              onClick={() => {
                composer.current?.clear();
                try {
                  localStorage.removeItem(
                    `${scope.storageKey}:atlas-draft:v2:new`,
                  );
                } catch {}
                setPendingThread(undefined);
                atlas.newConversation();
                setDraft("");
                composer.current?.focus();
              }}
            >
              +
            </button>
          </Tooltip>
          <Tooltip label="Conversation history">
            <button
              ref={historyTrigger}
              type="button"
              aria-label="Conversation history"
              aria-pressed={historyOpen}
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <HistoryIcon size={16} />
            </button>
          </Tooltip>
          {mode === "fullscreen" ? (
            <Tooltip
              label={
                inspectorOpen ? "Hide context panel" : "Show context panel"
              }
            >
              <button
                type="button"
                className="athyper-atlas-workspace__context-toggle"
                aria-label={
                  inspectorOpen ? "Hide context panel" : "Show context panel"
                }
                aria-expanded={inspectorOpen}
                aria-controls={inspectorId}
                onClick={() => setInspectorOpen((open) => !open)}
              >
                <PanelRightIcon size={17} />
              </button>
            </Tooltip>
          ) : null}
          {mode === "dock" ? (
            <>
              <Tooltip
                label={
                  pinned
                    ? "Unpin Atlas from the right side"
                    : "Pin Atlas to the right side"
                }
              >
                <button
                  type="button"
                  aria-label={
                    pinned
                      ? "Unpin Atlas from the right side"
                      : "Pin Atlas to the right side"
                  }
                  aria-pressed={pinned}
                  onClick={() => onPinnedChange?.(!pinned)}
                >
                  <PanelRightIcon size={17} />
                </button>
              </Tooltip>
              <Tooltip label="Open Atlas in full screen">
                <a
                  href={`/atlas?from=${encodeURIComponent(currentPath)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    if (surface) surface.fullscreen();
                    else
                      window.location.assign(atlas.fullscreenHref(currentPath));
                  }}
                  aria-label="Open Atlas in full screen"
                >
                  <Maximize2Icon size={17} />
                </a>
              </Tooltip>
            </>
          ) : null}
          {mode === "fullscreen" && surface && onClose ? (
            <Tooltip label="Return to side panel">
              <button
                type="button"
                aria-label="Return to side panel"
                onClick={surface.minimize}
              >
                <Minimize2Icon size={17} />
              </button>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Tooltip label="Close Atlas">
              <button type="button" aria-label="Close Atlas" onClick={onClose}>
                <CloseIcon size={16} />
              </button>
            </Tooltip>
          ) : null}
          {mode === "fullscreen" && !onClose ? (
            <Tooltip label="Close full-screen Atlas">
              <a href="/home" aria-label="Close full-screen Atlas">
                <CloseIcon size={16} />
              </a>
            </Tooltip>
          ) : null}
        </nav>
      </header>
      <div
        className="athyper-atlas-workspace__body"
        data-history={historyOpen}
        data-inspector={inspectorOpen}
      >
        {historyOpen ? (
          <ConversationHistory
            fullView={mode === "fullscreen"}
            atlas={atlas}
            panelRef={historyPanel}
            pendingThread={pendingThread}
            onSelect={(id) => {
              setPendingThread(id);
              void atlas.selectThread(id);
            }}
          />
        ) : null}
        <div className="athyper-atlas-workspace__conversation">
          <div className="athyper-atlas-workspace__context">
            <LockIcon size={13} />
            <nav
              className="athyper-atlas-workspace__breadcrumb"
              aria-label="Atlas record context"
            >
              <ol>
                {contextCrumbs.length ? (
                  <>
                    {contextCrumbs.map((crumb, index) => (
                      <li key={`${crumb.href ?? ""}-${index}`}>
                        {crumb.href?.startsWith("/") &&
                        !crumb.href.startsWith("//") ? (
                          <a href={crumb.href}>{crumb.label}</a>
                        ) : (
                          <span>{crumb.label}</span>
                        )}
                      </li>
                    ))}
                    {sectionLabel ? (
                      <li aria-current="location">{sectionLabel}</li>
                    ) : null}
                  </>
                ) : (
                  <li aria-current="location">{contextLabel}</li>
                )}
              </ol>
              {atlas.businessContext?.kind === "record" &&
              (atlas.businessContext.dirty || atlas.businessContext.asOf) ? (
                <small>
                  {atlas.businessContext.dirty
                    ? "Saved data"
                    : `As of ${atlas.businessContext.asOf}`}
                </small>
              ) : null}
            </nav>
            <small>Permission-aware · {planeName}</small>
          </div>
          {atlas.automaticBriefsAvailable &&
          atlas.businessContext?.entityCode === "business_partner" ? (
            <div aria-label="Brief controls">
              <label>
                <input
                  type="checkbox"
                  checked={atlas.automaticBriefsEnabled}
                  onChange={(event) =>
                    atlas.setAutomaticBriefsEnabled(event.target.checked)
                  }
                />
                Automatic briefs while Atlas is open
              </label>
              <button
                type="button"
                disabled={
                  atlas.status === "answering" ||
                  (atlas.businessContext.kind === "record" &&
                    (!!atlas.businessContext.asOf ||
                      !atlas.businessContext.savedRevision))
                }
                onClick={() => void atlas.refreshBrief()}
              >
                Refresh brief
              </button>
            </div>
          ) : null}
          {atlas.historyContextUnbound ? (
            <p
              className="athyper-atlas-workspace__history-notice"
              role="status"
            >
              Previous conversation · New questions use{" "}
              <strong>{sectionLabel ?? entityLabel}</strong>
            </p>
          ) : null}
          <div
            className="athyper-atlas-workspace__messages"
            role="log"
            aria-label="Atlas conversation"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {atlas.messages.length ? (
              atlas.messages
                .filter(
                  (message) =>
                    message.role === "user" ||
                    message.role === "assistant" ||
                    message.role === "tool",
                )
                .map((message) => (
                  <ConversationBubble
                    recordLabel={
                      atlas.businessContext?.kind === "record" &&
                      contextCrumbs.at(-1)?.label
                        ? {
                            entityCode: atlas.businessContext.entityCode,
                            recordId: atlas.businessContext.recordId,
                            label: contextCrumbs.at(-1)!.label,
                          }
                        : undefined
                    }
                    key={message.messageId}
                    message={message}
                    onFeedback={atlas.submitFeedback}
                    onCorrection={atlas.proposeVocabulary}
                  />
                ))
            ) : (
              <EmptyConversation
                agentName={agent?.name}
                questions={atlasStarterQuestions(atlas.businessContext)}
                onChoose={(question) => composer.current?.setText(question)}
              />
            )}
          </div>
          {atlas.actions.length ? (
            <div className="athyper-atlas-workspace__actions">
              <strong>Action previews</strong>
              {atlas.actions.map((action) => (
                <WorkspaceAction
                  key={action.proposalId}
                  action={action}
                  busy={atlas.actionBusy === action.proposalId}
                  onConfirm={() => atlas.confirmAction(action)}
                  onDecline={() => atlas.declineAction(action)}
                />
              ))}
            </div>
          ) : null}
          {atlas.actionReceipts.length ? (
            <div aria-label="Action receipts">
              {atlas.actionReceipts.map((receipt) => (
                <p key={receipt.action.proposalId}>
                  {receipt.action.summary} ·{" "}
                  {receipt.action.affectedEntityId ??
                    (receipt.context?.kind === "record"
                      ? receipt.context.recordId
                      : receipt.action.proposalId)}{" "}
                  · {receipt.outcome}
                  {receipt.commandId ? ` · ${receipt.commandId}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          <AtlasPromptComposer
            prompts={
              atlas.experience?.prompts?.length
                ? atlas.experience.prompts
                : atlasStarterQuestions(atlas.businessContext).map(
                    (prompt) => ({ label: prompt, prompt }),
                  )
            }
            ref={composer}
            draftKey={draftKey}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onCancel={atlas.cancel}
            busy={atlas.status === "answering"}
            agents={atlas.experience?.agents}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
          />
        </div>
        {mode === "fullscreen" && inspectorOpen ? (
          <AtlasContextInspector
            key={atlas.threadId ?? "new"}
            id={inspectorId}
            atlas={atlas}
            entityLabel={entityLabel}
            sectionLabel={sectionLabel}
            recordLabel={contextCrumbs.at(-1)?.label}
            recordHref={
              pageRecord
                ? (contextCrumbs.at(-1)?.href ?? effectivePath)
                : undefined
            }
            agent={agent}
          />
        ) : null}
      </div>
    </section>
  );
}

function ConversationHistory({
  atlas,
  fullView,
  panelRef,
  pendingThread,
  onSelect,
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
  readonly fullView: boolean;
  readonly panelRef: React.Ref<HTMLElement>;
  readonly pendingThread?: string;
  readonly onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<"conversations" | "actions">("conversations");
  const activeTab = fullView ? tab : "conversations";
  const id = React.useId();
  const choose = (next: "conversations" | "actions") => {
    setTab(next);
    if (next === "actions") void atlas.loadHistory();
  };
  return (
    <aside ref={panelRef} className="athyper-atlas-workspace__history">
      {fullView ? (
        <div
          className="athyper-atlas-history-tabs"
          role="tablist"
          aria-label="Atlas history"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "conversations"
                : event.key === "End"
                  ? "actions"
                  : activeTab === "actions"
                    ? "conversations"
                    : "actions";
            choose(next);
            document.getElementById(`${id}-${next}`)?.focus();
          }}
        >
          {(["conversations", "actions"] as const).map((value) => (
            <button
              key={value}
              id={`${id}-${value}`}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              aria-controls={`${id}-panel-${value}`}
              tabIndex={activeTab === value ? 0 : -1}
              onClick={() => choose(value)}
            >
              {value === "conversations" ? "Conversations" : "Atlas actions"}
            </button>
          ))}
        </div>
      ) : null}
      {!fullView ? (
        <header>
          <strong>Conversations</strong>
        </header>
      ) : null}
      <div
        id={`${id}-panel-${activeTab}`}
        role={fullView ? "tabpanel" : undefined}
        aria-labelledby={fullView ? `${id}-${activeTab}` : undefined}
      >
        {activeTab === "actions" ? (
          <AtlasActionHistory atlas={atlas} />
        ) : (
          <>
            {atlas.threadsStatus === "loading" ? (
              <p role="status">
                {pendingThread
                  ? "Opening conversation…"
                  : "Loading conversations…"}
              </p>
            ) : atlas.threadsStatus === "error" ? (
              <p role="alert">
                Conversation could not be loaded. Select it again to retry.
              </p>
            ) : null}
            {atlas.threads.length ? (
              <ol>
                {atlas.threads.map((thread) => (
                  <li key={thread.threadId}>
                    <button
                      type="button"
                      disabled={!!pendingThread}
                      aria-current={
                        (pendingThread ?? atlas.threadId) === thread.threadId
                          ? "true"
                          : undefined
                      }
                      onClick={() => onSelect(thread.threadId)}
                    >
                      <MessageSquareIcon size={14} />
                      <span>
                        <strong>
                          {thread.title ?? "Untitled conversation"}
                        </strong>
                        <small>
                          {pendingThread === thread.threadId
                            ? "Opening…"
                            : relativeDate(thread.updatedAt)}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : atlas.threadsStatus === "ready" ? (
              <p>No previous conversations.</p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function ConversationBubble({
  message,
  onFeedback,
  onCorrection,
  recordLabel,
}: {
  readonly recordLabel?: {
    readonly entityCode: string;
    readonly recordId: string;
    readonly label: string;
  };
  readonly message: AtlasConversationMessage;
  readonly onFeedback?: (value: AtlasResponseFeedbackV1) => Promise<void>;
  readonly onCorrection?: (value: AtlasVocabularyCorrection) => Promise<void>;
}) {
  return (
    <article
      className="athyper-atlas-workspace__message"
      data-role={message.role}
      data-status={message.status}
    >
      <header>
        <strong>
          {message.role === "user"
            ? "You"
            : message.role === "tool"
              ? "Authorized result"
              : "Atlas AI"}
        </strong>
        <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
      </header>
      {message.answer?.intent?.kind === "clarify" ? (
        <p role="status">Clarification needed</p>
      ) : message.answer?.intent?.kind === "denied" ? (
        <p role="status">Unavailable in the current context</p>
      ) : null}
      {message.answer?.envelope && message.status === "completed" ? (
        <AtlasValidatedAnswer
          answer={message.answer}
          recordLabel={recordLabel}
        />
      ) : message.text || !message.results.length ? (
        message.role === "assistant" && message.status === "completed" ? (
          <AtlasSafeProse text={message.text || "No text was returned."} />
        ) : (
          <p>
            {message.text ||
              (message.status === "pending"
                ? "Working on it…"
                : "No text was returned.")}
          </p>
        )
      ) : null}
      {message.results.map((result, index) => (
        <StructuredResult key={index} value={result} />
      ))}
      {onFeedback &&
      message.role === "assistant" &&
      message.status === "completed" &&
      message.runId &&
      !message.messageId.startsWith("local-") ? (
        <ResponseFeedback
          message={message}
          submit={onFeedback}
          propose={onCorrection}
        />
      ) : null}
      {message.status === "failed" || message.status === "cancelled" ? (
        <small>
          {message.status === "failed"
            ? "This response did not complete."
            : "Response stopped."}
        </small>
      ) : null}
    </article>
  );
}
function EmptyConversation({
  agentName,
  questions,
  onChoose,
}: {
  readonly agentName?: string;
  readonly questions: readonly string[];
  readonly onChoose: (question: string) => void;
}) {
  return (
    <div className="athyper-atlas-workspace__empty">
      <span>
        <AtlasBrandIcon size={32} />
      </span>
      <strong>What can we achieve together?</strong>
      <p>
        {agentName
          ? `${agentName} is ready with your authorized business context.`
          : "Ask Atlas to find answers, explain records, or prepare governed work."}
      </p>
      <nav aria-label="Starter questions">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onChoose(question)}
          >
            {question}
          </button>
        ))}
      </nav>
    </div>
  );
}

function WorkspaceAction({
  action,
  busy,
  onConfirm,
  onDecline,
}: {
  readonly action: AtlasGovernedAction;
  readonly busy: boolean;
  readonly onConfirm: () => Promise<void>;
  readonly onDecline: () => Promise<void>;
}) {
  return (
    <article className="athyper-atlas-workspace__action">
      <header>
        <span>
          <strong>{action.summary}</strong>
          <small>{action.toolCode}</small>
        </span>
        <b data-risk={action.risk}>{action.risk}</b>
      </header>
      <p>Nothing runs until you confirm this proposal.</p>
      <footer>
        <button
          type="button"
          disabled={busy || action.status !== "proposed"}
          onClick={() => void onDecline()}
        >
          Decline
        </button>
        <button
          type="button"
          disabled={busy || action.status !== "proposed"}
          onClick={() => void onConfirm()}
        >
          {busy ? "Running…" : "Review and confirm"}
        </button>
      </footer>
    </article>
  );
}

function contextForPath(path: string): string {
  const clean = path.split("?")[0] ?? "/home";
  if (clean.startsWith("/mdg/business-partner"))
    return "MDG · Business Partner";
  if (clean.startsWith("/mdg")) return "Master Data Governance";
  if (clean.startsWith("/atlas")) return "Atlas workspace";
  return "Current page";
}
function StructuredResult({ value }: { readonly value: unknown }) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "items" in value &&
    "section" in value &&
    "status" in value &&
    "hasMore" in value
  )
    return null;
  if (value && typeof value === "object" && "insight" in value)
    return <AtlasOwnerAssessment value={value.insight} />;
  if (
    Array.isArray(value) &&
    value.length &&
    value.every(
      (item) => item && typeof item === "object" && !Array.isArray(item),
    )
  ) {
    const rows = value.slice(0, 20) as readonly Record<string, unknown>[],
      columns = Array.from(
        new Set(rows.flatMap((row) => Object.keys(row))),
      ).slice(0, 6);
    return (
      <div className="athyper-atlas-workspace__result">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{displayValue(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {value.length > 20 ? (
          <small>Showing 20 of {value.length} rows</small>
        ) : null}
      </div>
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      20,
    );
    return (
      <dl className="athyper-atlas-workspace__result">
        {entries.map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{displayValue(item)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre className="athyper-atlas-workspace__result">{displayValue(value)}</pre>
  );
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unsupported value]";
  }
}
function timeLabel(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}
function relativeDate(value: string): string {
  const elapsed = Date.now() - parseInstant(value),
    days = Math.floor(elapsed / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function ResponseFeedback({
  message,
  submit,
  propose,
}: {
  message: AtlasConversationMessage;
  submit: (value: AtlasResponseFeedbackV1) => Promise<void>;
  propose?: (value: AtlasVocabularyCorrection) => Promise<void>;
}) {
  const [category, setCategory] =
    useState<AtlasResponseFeedbackV1["category"]>("intent");
  const [verdict, setVerdict] =
    useState<AtlasResponseFeedbackV1["verdict"]>("wrong");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const receipt = useRef<{ key: string; id: string } | undefined>(undefined);
  const send = async () => {
    const key = `${category}:${verdict}`;
    if (receipt.current?.key !== key)
      receipt.current = { key, id: crypto.randomUUID() };
    setStatus("saving");
    try {
      await submit({
        schemaVersion: 1,
        feedbackId: receipt.current.id,
        runId: message.runId!,
        messageId: message.messageId,
        category,
        verdict,
      });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };
  return (
    <details className="athyper-atlas-feedback">
      <summary>Response feedback</summary>
      <fieldset disabled={status === "saving" || status === "saved"}>
        <label>
          Feedback about{" "}
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as AtlasResponseFeedbackV1["category"])
            }
          >
            {[
              ["vocabulary", "Wording"],
              ["intent", "What I meant"],
              ["missing_context", "Missing work context"],
              ["unsupported_capability", "Unavailable capability"],
              ["owner_failure", "Read or service failure"],
              ["evidence", "Evidence"],
              ["presentation", "Presentation"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assessment{" "}
          <select
            value={verdict}
            onChange={(e) =>
              setVerdict(e.target.value as AtlasResponseFeedbackV1["verdict"])
            }
          >
            {["correct", "wrong", "partial", "missing"].map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void send()}>
          Send feedback
        </button>
      </fieldset>
      <p role="status">
        {status === "saved"
          ? "Feedback recorded for review."
          : status === "error"
            ? "Feedback could not be recorded. Try again."
            : status === "saving"
              ? "Saving feedback…"
              : "Feedback is reviewed before vocabulary changes."}
      </p>
      {status === "saved" &&
      propose &&
      (category === "intent" || category === "vocabulary") &&
      verdict !== "correct" ? (
        <VocabularyCorrection
          feedbackId={receipt.current!.id}
          propose={propose}
        />
      ) : null}
    </details>
  );
}

function VocabularyCorrection({
  feedbackId,
  propose,
}: {
  feedbackId: string;
  propose: (value: AtlasVocabularyCorrection) => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const receipt = useRef<{ phrase: string; id: string } | undefined>(undefined);
  const send = async () => {
    if (receipt.current?.phrase !== phrase)
      receipt.current = { phrase, id: crypto.randomUUID() };
    setStatus("saving");
    try {
      await propose({
        schemaVersion: 1,
        candidateId: receipt.current.id,
        feedbackId,
        locale: "en",
        phrase,
        capabilityId: "entity_read_record",
      });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };
  return (
    <section aria-label="Suggest vocabulary">
      <p>
        Teach a short English term for the record summary, such as “company
        snapshot”. Studio reviewers will receive the term and its intended
        meaning.
      </p>
      <fieldset disabled={status === "saving" || status === "saved"}>
        <label>
          Term for record summary{" "}
          <input
            maxLength={80}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!phrase.trim()}
          onClick={() => void send()}
        >
          Share term with Studio
        </button>
      </fieldset>
      <p role="status">
        {status === "saved"
          ? "Correction sent for review. It takes effect after publication."
          : status === "error"
            ? "Correction could not be sent. Retry, or ask again on the current record if its definition changed."
            : status === "saving"
              ? "Sending correction…"
              : "Use a general term, without names or confidential record values."}
      </p>
    </section>
  );
}

function readableContextLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
