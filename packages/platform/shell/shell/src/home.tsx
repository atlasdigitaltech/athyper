"use client";

import { useAtlasSurface } from "./atlas-surface";
import { parseInstant } from "@athyper/platform-temporal";
import {
  useAtlasAnswer,
  type AtlasGovernedAction,
  type AtlasRecordCitation,
} from "@athyper/platform-ai-agent-ui";
import {
  AttachmentApiError,
  createAttachmentApiClient,
  convertClipboard,
  serializeForClipboard,
  type AttachmentProcessingStatus,
  type RichTextDocument,
} from "@athyper/platform-communications-collaboration-ui";
import {
  AtlasBrandIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Building2Icon,
  ChevronRightIcon,
  FileTextIcon,
  HistoryIcon,
  LibraryBigIcon,
  Maximize2Icon,
  PanelRightIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TrashIcon,
} from "@athyper/platform-icons";
import { useAccessSnapshot } from "@athyper/platform-shell-runtime";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tooltip,
} from "@athyper/platform-ui";
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
  readonly suggestions: readonly string[];
  readonly searchItems: readonly PlatformHomeSearchItem[];
  readonly quickActions: readonly PlatformHomeAction[];
  readonly workspaces: readonly PlatformHomeWorkspace[];
  readonly citationRoutes?: Readonly<Record<string, string>>;
}

const MAX_RESULTS = 8;

interface ShellHomeIdentity {
  readonly displayName: string;
  readonly timeZone: string;
}
const ShellHomeIdentityContext = React.createContext<ShellHomeIdentity>({
  displayName: "there",
  timeZone: "UTC",
});
export function ShellHomeIdentityProvider({
  displayName,
  timeZone,
  children,
}: ShellHomeIdentity & { readonly children: React.ReactNode }) {
  return (
    <ShellHomeIdentityContext.Provider value={{ displayName, timeZone }}>
      {children}
    </ShellHomeIdentityContext.Provider>
  );
}

function dayPeriodGreeting(date: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date),
  );
  return hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 18
      ? "Good afternoon"
      : "Good evening";
}

export function PlatformHome({
  suggestions,
  searchItems,
  quickActions,
  workspaces,
  citationRoutes = {},
}: PlatformHomeProps) {
  const [query, setQuery] = useState("");
  const [personalization, setPersonalization] = useState<HomePersonalization>(
    DEFAULT_HOME_PERSONALIZATION,
  );
  const [personalizing, setPersonalizing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const composer = useRef<AtlasPromptComposerHandle>(null);
  const access = useAccessSnapshot();
  const scope = useShellPersonalizationScope();
  const atlas = useAtlasAnswer();
  const surface = useAtlasSurface();
  const sidebarOpen = surface?.sidebarOpen ?? false;
  const wasSidebarOpen = useRef(sidebarOpen);
  useEffect(() => {
    if (wasSidebarOpen.current && !sidebarOpen)
      requestAnimationFrame(() => composer.current?.focus());
    wasSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);
  const identity = React.useContext(ShellHomeIdentityContext);
  const preferredName =
    identity.displayName.trim().split(/\s+/u)[0] || identity.displayName;
  const [greeting, setGreeting] = useState(() =>
    dayPeriodGreeting(new Date(), identity.timeZone),
  );
  const normalized = query.trim().toLocaleLowerCase();
  const configuredSources = atlas.experience?.searchSources;
  const allowedSearchItems = useMemo(
    () =>
      searchItems.filter(
        (item) =>
          isHomeItemAllowed(item, access) &&
          (!configuredSources ||
            configuredSources.some(
              (source) =>
                (source.kind === "navigation" || source.kind === "record") &&
                (!source.routePrefix ||
                  item.href.startsWith(source.routePrefix)),
            )),
      ),
    [searchItems, access, configuredSources],
  );
  const allowedActions = useMemo(
    () => quickActions.filter((item) => isHomeItemAllowed(item, access)),
    [quickActions, access],
  );
  const allowedWorkspaces = useMemo(
    () => workspaces.filter((item) => isHomeItemAllowed(item, access)),
    [workspaces, access],
  );
  const results = useMemo(
    () =>
      normalized
        ? allowedSearchItems
            .map((item) => ({ item, score: searchScore(item, normalized) }))
            .filter(({ score }) => score > 0)
            .sort(
              (a, b) =>
                b.score - a.score || a.item.title.localeCompare(b.item.title),
            )
            .slice(0, MAX_RESULTS)
            .map(({ item }) => item)
        : [],
    [normalized, allowedSearchItems],
  );
  const recommendations = useMemo(
    () =>
      recommendHomeItems(
        allowedSearchItems.filter((item) => item.category !== "Workspace"),
        access,
        personalization,
      ),
    [allowedSearchItems, access, personalization],
  );
  const configuredPrompts = atlas.experience?.prompts;
  const allowedSuggestions = useMemo(
    () =>
      configuredPrompts?.length
        ? configuredPrompts.map((item) => item.prompt)
        : suggestions,
    [configuredPrompts, suggestions],
  );
  const recent = useMemo(
    () =>
      Object.entries(personalization.interactions)
        .flatMap(([href, interaction]) => {
          const item = allowedSearchItems.find(
            (candidate) => candidate.href === href,
          );
          return item ? [{ item, interaction }] : [];
        })
        .sort(
          (left, right) =>
            parseInstant(right.interaction.lastVisitedAt) -
            parseInstant(left.interaction.lastVisitedAt),
        )
        .slice(0, 4)
        .map(({ item }) => item),
    [personalization.interactions, allowedSearchItems],
  );

  useEffect(() => {
    try {
      setPersonalization(
        parseHomePersonalization(
          JSON.parse(window.localStorage.getItem(scope.storageKey) ?? "{}"),
        ),
      );
    } catch {
      window.localStorage.removeItem(scope.storageKey);
      setPersonalization(DEFAULT_HOME_PERSONALIZATION);
    }
    const focus = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        composer.current?.focus();
      }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, [scope.storageKey]);
  useEffect(() => {
    const agents = atlas.experience?.agents ?? [];
    if (agents.length && !agents.some((item) => item.code === selectedAgent))
      setSelectedAgent(agents[0]!.code);
  }, [atlas.experience, selectedAgent]);
  useEffect(() => {
    const update = () =>
      setGreeting(dayPeriodGreeting(new Date(), identity.timeZone));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [identity.timeZone]);

  const commit = (next: HomePersonalization) => {
    setPersonalization(next);
    try {
      window.localStorage.setItem(scope.storageKey, JSON.stringify(next));
    } catch {
      /* Personalization must not interrupt work. */
    }
  };
  const visitHref = (href: string) =>
    commit(rememberHomeInteraction(personalization, href));
  const visit = (item: PlatformHomeSearchItem) => visitHref(item.href);
  const homeDraftKey = `${scope.storageKey}:atlas-draft:v2:${atlas.threadId ?? "new"}`;
  const submit = (
    question: string,
    attachmentContext?: {
      readonly contextId: string;
      readonly attachmentIds: readonly string[];
    },
  ) => {
    if (question.trim())
      void atlas
        .ask(question, selectedAgent, attachmentContext)
        .then((completed) => {
          if (completed) {
            clearAtlasDraft(homeDraftKey);
          }
        });
  };
  const historicalAnswer =
    atlas.status === "idle"
      ? [...atlas.messages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" && message.status === "completed",
          )
      : undefined;
  const widgetVisible = (widget: HomeWidgetId) =>
    !personalization.hiddenWidgets.includes(widget);
  const publishedWidgetOrder = atlas.experience?.widgets.map(
    (item) => item.kind,
  );
  const userReorderedWidgets =
    personalization.widgetOrder.join("|") !==
    DEFAULT_HOME_PERSONALIZATION.widgetOrder.join("|");
  const configuredWidgetOrder = publishedWidgetOrder
    ? userReorderedWidgets
      ? personalization.widgetOrder.filter((widget) =>
          publishedWidgetOrder.includes(widget),
        )
      : publishedWidgetOrder
    : personalization.widgetOrder;
  const configuredWidgetTitle = (widget: HomeWidgetId) =>
    atlas.experience?.widgets.find((item) => item.kind === widget)?.title;

  return (
    <section className="athyper-home" aria-labelledby="athyper-home-title">
      <header className="athyper-home__hero" data-atlas-active={sidebarOpen}>
        <div className="athyper-home__welcome">
          <div className="athyper-home__heading-group">
            <p className="athyper-home__greeting">
              {greeting}, {preferredName}.
            </p>
            <h1 id="athyper-home-title">What can we achieve together?</h1>
          </div>
          <nav
            className="athyper-home__atlas-actions"
            aria-label="Atlas workspace options"
          >
            <Tooltip label="Pin Atlas to the right side">
              <button
                type="button"
                aria-label="Pin Atlas to the right side"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("athyper:atlas-open", {
                      detail: { pinned: true },
                    }),
                  )
                }
              >
                <PanelRightIcon size={19} />
              </button>
            </Tooltip>
            <Tooltip label="Open Atlas in full screen">
              <a
                href="/atlas?from=%2Fhome"
                onClick={(event) => {
                  event.preventDefault();
                  if (surface) surface.fullscreen();
                  else window.location.assign(atlas.fullscreenHref("/home"));
                }}
                aria-label="Open Atlas in full screen"
              >
                <Maximize2Icon size={19} />
              </a>
            </Tooltip>
          </nav>
        </div>
        {sidebarOpen ? (
          <div className="athyper-home__atlas-active" role="status">
            <span>Atlas is open in the side panel</span>
            <button type="button" onClick={() => surface?.close()}>
              Return to dashboard
            </button>
          </div>
        ) : (
          <>
            <AtlasPromptComposer
              ref={composer}
              draftKey={homeDraftKey}
              value={query}
              onChange={setQuery}
              onSubmit={submit}
              onCancel={atlas.cancel}
              busy={atlas.status === "answering"}
              agents={atlas.experience?.agents}
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
              prompts={
                configuredPrompts?.length
                  ? configuredPrompts
                  : suggestions.map((prompt) => ({ label: prompt, prompt }))
              }
            />
            <div
              className="athyper-home__suggestions"
              aria-label="Suggested searches"
            >
              {allowedSuggestions.map((suggestion) => {
                const configured = configuredPrompts?.find(
                  (item) => item.prompt === suggestion,
                );
                return (
                  <button
                    key={configured?.code ?? suggestion}
                    type="button"
                    onClick={() => {
                      composer.current?.setText(suggestion);
                      if (configured) setSelectedAgent(configured.agentCode);
                    }}
                  >
                    {configured?.label ?? suggestion}
                  </button>
                );
              })}
            </div>
            {atlas.status !== "idle" ? (
              <AtlasAnswerSurface
                atlas={atlas}
                citationRoutes={citationRoutes}
              />
            ) : historicalAnswer ? (
              <AtlasAnswerSurface
                atlas={{
                  ...atlas,
                  status: "complete",
                  text: historicalAnswer.text,
                  citations: historicalAnswer.answer?.citations ?? [],
                  attachmentCitations:
                    historicalAnswer.answer?.attachmentCitations ?? [],
                }}
                citationRoutes={citationRoutes}
              />
            ) : null}
            {normalized ? (
              <section
                className="athyper-home__results"
                aria-live="polite"
                aria-label="Atlas search results"
              >
                <header>
                  <strong>
                    {results.length
                      ? `${results.length} authorized destinations`
                      : "No authorized matching destination"}
                  </strong>
                  <small>Results reflect your current permissions</small>
                </header>
                {results.length ? (
                  <ul>
                    {results.map((item) => (
                      <li key={`${item.category}-${item.href}`}>
                        <a href={item.href} onClick={() => visit(item)}>
                          <span>
                            <small>{item.category}</small>
                            <strong>{item.title}</strong>
                            <em>{item.description}</em>
                          </span>
                          <ChevronRightIcon size={18} />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Try another business partner, workflow, profile,
                    publication, or workspace term.
                  </p>
                )}
              </section>
            ) : null}
          </>
        )}
      </header>

      <div className="athyper-home__dashboard-heading">
        <div>
          <p>Your Dashboard</p>
          <h2>Recommended for your access</h2>
        </div>
        <button
          type="button"
          aria-expanded={personalizing}
          aria-controls="home-personalization"
          onClick={() => setPersonalizing((value) => !value)}
        >
          <SlidersHorizontalIcon size={17} />
          Personalize
        </button>
      </div>
      {personalizing ? (
        <PersonalizationPanel
          personalization={personalization}
          onChange={commit}
        />
      ) : null}

      <div className="athyper-home__dashboard">
        {configuredWidgetOrder.map((widget) =>
          widgetVisible(widget) ? (
            <React.Fragment key={widget}>
              {widget === "recommendations" ? (
                <RecommendationsWidget
                  title={configuredWidgetTitle(widget)}
                  recommendations={recommendations}
                  onVisit={visit}
                />
              ) : widget === "workspaces" ? (
                <WorkspacesWidget
                  title={configuredWidgetTitle(widget)}
                  workspaces={allowedWorkspaces}
                  onVisit={visitHref}
                />
              ) : widget === "quick-actions" ? (
                <QuickActionsWidget
                  title={configuredWidgetTitle(widget)}
                  actions={allowedActions}
                  onVisit={visitHref}
                />
              ) : (
                <RecentWidget
                  title={configuredWidgetTitle(widget)}
                  recent={recent}
                  onVisit={visit}
                />
              )}
            </React.Fragment>
          ) : null,
        )}
        {!configuredWidgetOrder.some(widgetVisible) ? (
          <section className="athyper-home__panel athyper-home__dashboard-empty">
            <strong>Your dashboard widgets are hidden.</strong>
            <button type="button" onClick={() => setPersonalizing(true)}>
              Choose visible widgets
            </button>
          </section>
        ) : null}
      </div>
    </section>
  );
}

// Scoped in-memory attachment state survives presentation changes, including uploads in progress.
const composerDrafts = new Map<
  string,
  {
    contextId?: string;
    attachments: readonly AtlasPromptAttachment[];
    agent?: string;
    html?: string;
  }
>();
function composerDraft(key: string) {
  let draft = composerDrafts.get(key);
  if (!draft) {
    draft = { attachments: [] };
    composerDrafts.set(key, draft);
  }
  return draft;
}
export function clearAtlasDraft(key: string) {
  const draft = composerDraft(key);
  draft.attachments = [];
  draft.contextId = undefined;
  draft.html = "";
  try {
    localStorage.removeItem(key);
  } catch {}
  window.dispatchEvent(
    new CustomEvent("athyper:atlas-draft-cleared", { detail: key }),
  );
}

export interface AtlasPromptComposerHandle {
  focus(): void;
  setText(value: string): void;
  clear(): void;
}
export interface AtlasPromptComposerProps {
  readonly draftKey: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (
    value: string,
    attachmentContext?: {
      readonly contextId: string;
      readonly attachmentIds: readonly string[];
    },
  ) => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
  readonly agents?: readonly { readonly code: string; readonly name: string }[];
  readonly selectedAgent?: string;
  readonly onAgentChange: (value: string) => void;
  readonly prompts?: readonly {
    readonly label: string;
    readonly prompt: string;
    readonly agentCode?: string;
  }[];
}

export const AtlasPromptComposer = React.forwardRef<
  AtlasPromptComposerHandle,
  AtlasPromptComposerProps
>(function AtlasPromptComposer(props, forwardedRef) {
  const libraryPrompts = props.prompts?.filter(
    (item) => item.label.trim() && item.prompt.trim(),
  );
  const effectivePrompts = libraryPrompts?.length
    ? libraryPrompts
    : [
        {
          label: "Explore this page",
          prompt: "What can you help me with on this page?",
        },
        {
          label: "Explain available information",
          prompt: "What information is available in the current context?",
        },
      ];
  const editor = useRef<HTMLDivElement>(null);
  const editorId = React.useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const draftState = React.useMemo(
    () => composerDraft(props.draftKey),
    [props.draftKey],
  );
  const attachmentContextId = React.useMemo(
    () => ({
      get current() {
        return draftState.contextId;
      },
      set current(value: string | undefined) {
        draftState.contextId = value;
      },
    }),
    [draftState],
  );
  const [dragging, setDragging] = useState(false);
  const [formatMessage, setFormatMessage] = useState<string>();
  const [, refreshAttachments] = useState(0);
  const attachments = draftState.attachments;
  const setAttachments = React.useCallback(
    (
      next:
        | readonly AtlasPromptAttachment[]
        | ((
            current: readonly AtlasPromptAttachment[],
          ) => readonly AtlasPromptAttachment[]),
    ) => {
      draftState.attachments =
        typeof next === "function" ? next(draftState.attachments) : next;
      window.dispatchEvent(
        new CustomEvent("athyper:atlas-draft-attachments", {
          detail: props.draftKey,
        }),
      );
    },
    [draftState, props.draftKey],
  );
  useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent).detail === props.draftKey)
        refreshAttachments((value) => value + 1);
    };
    window.addEventListener("athyper:atlas-draft-attachments", update);
    return () =>
      window.removeEventListener("athyper:atlas-draft-attachments", update);
  }, [props.draftKey]);
  const valueRef = useRef(props.value);
  valueRef.current = props.value;

  const setDocument = React.useCallback(
    (document: RichTextDocument, focus = false) => {
      const serialized = serializeForClipboard(document);
      const text = (serialized["text/plain"] ?? "").trimEnd();
      if (editor.current)
        editor.current.innerHTML = serialized["text/html"] ?? "";
      props.onChange(text);
      draftState.html = serialized["text/html"] ?? "";
      try {
        window.localStorage.setItem(
          props.draftKey,
          serialized["text/html"] ?? "",
        );
      } catch {
        /* Draft persistence is best effort. */
      }
      if (focus) requestAnimationFrame(() => editor.current?.focus());
    },
    [props.draftKey, props.onChange],
  );

  const setText = React.useCallback(
    (value: string, focus = true) => {
      const conversion = convertClipboard({
        getData: (type) => (type === "text/plain" ? value : ""),
      });
      if (conversion) setDocument(conversion.document, focus);
    },
    [setDocument],
  );

  const clear = React.useCallback(() => {
    if (editor.current) editor.current.innerHTML = "";
    draftState.html = "";
    props.onChange("");
    setAttachments([]);
    attachmentContextId.current = undefined;
    setFormatMessage(undefined);
    if (fileInput.current) fileInput.current.value = "";
    try {
      window.localStorage.removeItem(props.draftKey);
    } catch {
      /* Draft storage is optional. */
    }
  }, [props.draftKey, props.onChange]);
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent).detail === props.draftKey) clear();
    };
    window.addEventListener("athyper:atlas-draft-cleared", reset);
    return () =>
      window.removeEventListener("athyper:atlas-draft-cleared", reset);
  }, [props.draftKey, clear]);
  React.useImperativeHandle(
    forwardedRef,
    () => ({ focus: () => editor.current?.focus(), setText, clear }),
    [setText, clear],
  );

  useEffect(() => {
    // Restore only when changing drafts, never when a successful send clears value.
    if (editor.current) editor.current.innerHTML = "";
    props.onChange("");
    setFormatMessage(undefined);
    if (draftState.agent) props.onAgentChange(draftState.agent);
    if (fileInput.current) fileInput.current.value = "";
    try {
      const raw =
        draftState.html ?? window.localStorage.getItem(props.draftKey);
      if (!raw) return;
      const conversion = convertClipboard({
        getData: (type) => (type === "text/html" ? raw : ""),
      });
      if (conversion) setDocument(conversion.document);
    } catch {
      /* Unavailable or invalid draft storage must not prevent composing. */
    }
  }, [props.draftKey]);

  const synchronize = React.useCallback(() => {
    if (!editor.current) return;
    const html = editor.current.innerHTML,
      text = editor.current.innerText;
    const conversion = convertClipboard({
      getData: (type) =>
        type === "text/html" ? html : type === "text/plain" ? text : "",
    });
    if (!conversion) {
      draftState.html = "";
      props.onChange("");
      try {
        window.localStorage.removeItem(props.draftKey);
      } catch {
        /* best effort */
      }
      return;
    }
    const serialized = serializeForClipboard(conversion.document);
    const plain = (serialized["text/plain"] ?? "").trimEnd();
    props.onChange(plain);
    draftState.html = serialized["text/html"] ?? "";
    try {
      window.localStorage.setItem(
        props.draftKey,
        serialized["text/html"] ?? "",
      );
    } catch {
      /* best effort */
    }
  }, [props.draftKey, props.onChange]);

  const addFiles = React.useCallback(
    async (files: FileList | readonly File[]) => {
      const selected = Array.from(files);
      if (!selected.length) return;
      const remaining = Math.max(0, 5 - attachments.length);
      if (!remaining) {
        setFormatMessage("You can add up to 5 files.");
        return;
      }
      const candidates = selected.slice(0, remaining),
        accepted = candidates.filter(
          (file) =>
            file.size > 0 &&
            file.size <= 25 * 1024 * 1024 &&
            supportedAtlasFile(file),
        );
      if (!accepted.length) {
        setFormatMessage(
          candidates.some((file) => file.size > 25 * 1024 * 1024)
            ? "This file exceeds the 25 MB limit."
            : "Choose a supported file up to 25 MB.",
        );
        return;
      }
      setFormatMessage(
        accepted.length < candidates.length
          ? "Some files couldn’t be added. Check their type and size."
          : undefined,
      );
      attachmentContextId.current ??= globalThis.crypto.randomUUID();
      const client = createAttachmentApiClient({
        entityType: "atlas.prompt",
        entityId: attachmentContextId.current,
      });
      const queued = accepted.map<AtlasPromptAttachment>((file) => ({
        localId: globalThis.crypto.randomUUID(),
        fileName: file.name || "attachment",
        sizeBytes: file.size,
        status: "uploading",
      }));
      setAttachments((current) => [...current, ...queued]);
      await Promise.all(
        accepted.map(async (file, index) => {
          const item = queued[index]!;
          try {
            const uploaded = await client.upload(file, { token: item.localId });
            setAttachments((current) =>
              replaceAttachment(current, item.localId, {
                attachmentId: uploaded.attachmentId,
                status: "processing",
              }),
            );
            const status = await waitForAttachment(
              client,
              uploaded.attachmentId,
            );
            setAttachments((current) =>
              replaceAttachment(current, item.localId, {
                attachmentId: uploaded.attachmentId,
                status:
                  status.extractionStatus === "extracted" ? "ready" : "error",
                ...(status.extractionStatus === "extracted"
                  ? {}
                  : {
                      message:
                        "We couldn’t prepare this file. Remove it and try again.",
                    }),
              }),
            );
          } catch (error) {
            setAttachments((current) =>
              replaceAttachment(current, item.localId, {
                status: "error",
                message: attachmentMessage(error),
              }),
            );
          }
        }),
      );
      if (selected.length > remaining)
        setFormatMessage("You can add up to 5 files.");
    },
    [attachments.length, attachmentContextId, setAttachments],
  );

  const removeAttachment = React.useCallback(
    async (item: AtlasPromptAttachment) => {
      setAttachments((current) =>
        current.filter((candidate) => candidate.localId !== item.localId),
      );
      if (!item.attachmentId) return;
      try {
        const contextId = attachmentContextId.current;
        if (contextId)
          await createAttachmentApiClient({
            entityType: "atlas.prompt",
            entityId: contextId,
          }).remove(item.attachmentId);
      } catch {
        setFormatMessage(
          "The file was removed from this prompt. Server cleanup will follow the attachment retention policy.",
        );
      }
    },
    [attachmentContextId, setAttachments],
  );

  const paste = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      let conversion;
      try {
        conversion = convertClipboard({
          files: [],
          getData: (type) => event.clipboardData.getData(type),
        });
      } catch {
        event.preventDefault();
        setFormatMessage("This formatted content could not be pasted safely.");
        return;
      }
      if (!conversion) return;
      event.preventDefault();
      const html =
        serializeForClipboard(conversion.document)["text/html"] ?? "";
      insertComposerHtml(editor.current, html);
      synchronize();
      if (event.clipboardData.files.length)
        void addFiles(event.clipboardData.files);
      setFormatMessage(undefined);
    },
    [addFiles, synchronize],
  );

  const selectAgent = (agent: string) => {
    draftState.agent = agent;
    props.onAgentChange(agent);
  };
  const tooLong = props.value.length > 4_096;
  const attachmentBusy = attachments.some(
      (item) => item.status === "uploading" || item.status === "processing",
    ),
    attachmentError = attachments.some((item) => item.status === "error");
  const submit = () => {
    const question = props.value.trim();
    if (!question || tooLong || props.busy || attachmentBusy || attachmentError)
      return;
    const ready = attachments.flatMap((item) =>
      item.status === "ready" && item.attachmentId ? [item.attachmentId] : [],
    );
    props.onSubmit(
      question,
      ready.length && attachmentContextId.current
        ? { contextId: attachmentContextId.current, attachmentIds: ready }
        : undefined,
    );
  };

  return (
    <section
      className="athyper-home__composer"
      data-dragging={dragging}
      aria-label="Atlas AI prompt composer"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length)
          void addFiles(event.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className="athyper-home__composer-drop" aria-hidden="true">
          <strong>Drop files here</strong>
          <small>Files are checked and prepared securely.</small>
        </div>
      ) : null}
      <header>
        <span>
          <SearchIcon size={22} />
        </span>
        <strong>Ask Atlas</strong>
        <Menu>
          <Tooltip label="Prompt library">
            <MenuTrigger
              className="athyper-home__composer-library"
              aria-label="Prompt library"
              title="Prompt library"
            >
              <LibraryBigIcon size={17} />
            </MenuTrigger>
          </Tooltip>
          <MenuContent
            portal
            className="athyper-home__prompt-library"
            aria-label="Prompt library"
          >
            {effectivePrompts.map((item) => (
              <MenuItem
                key={`${item.agentCode ?? "default"}:${item.prompt}`}
                onClick={() => {
                  setText(item.prompt);
                  if (item.agentCode) selectAgent(item.agentCode);
                }}
              >
                <LibraryBigIcon size={16} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.prompt}</small>
                </span>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </header>
      <div
        ref={editor}
        id={editorId}
        className="athyper-home__composer-editor"
        role="textbox"
        aria-label="Ask Atlas to search, create, or take action"
        aria-multiline="true"
        aria-invalid={tooLong || undefined}
        contentEditable={!props.busy}
        suppressContentEditableWarning
        data-placeholder="Ask Atlas to search, create, or take action…"
        onInput={synchronize}
        onPaste={paste}
      />
      {attachments.length ? (
        <ul
          className="athyper-home__composer-attachments"
          aria-label="Atlas supporting files"
        >
          {attachments.map((item) => (
            <li key={item.localId} data-status={item.status}>
              <span>
                <strong>{item.fileName}</strong>
                <small>
                  {formatBytes(item.sizeBytes)} · {attachmentStatusLabel(item)}
                </small>
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.fileName}`}
                disabled={props.busy}
                onClick={() => void removeAttachment(item)}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {formatMessage || tooLong ? (
        <p
          className="athyper-home__composer-message"
          role={tooLong ? "alert" : "status"}
        >
          {tooLong
            ? `Prompt is ${props.value.length - 4_096} characters over the 4,096 character limit.`
            : formatMessage}
        </p>
      ) : null}
      <footer>
        <div>
          <input
            ref={fileInput}
            className="athyper-home__composer-file-input"
            aria-label="Attach files to Atlas"
            tabIndex={-1}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/markdown,text/csv"
            onChange={(event) => {
              if (event.currentTarget.files)
                void addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <Menu>
            <MenuTrigger
              className="athyper-home__composer-add"
              disabled={props.busy}
              aria-label="Add context"
              title="Add context"
            >
              <PlusIcon size={16} />
              <span>Add context</span>
            </MenuTrigger>
            <MenuContent
              portal
              className="athyper-home__composer-add-menu"
              aria-label="Add context"
            >
              <MenuItem
                className="athyper-home__composer-add-item"
                disabled={attachments.length >= 5}
                onClick={() => fileInput.current?.click()}
              >
                <FileTextIcon size={17} />
                <span>
                  <strong>Files from device</strong>
                  <small>
                    {attachments.length >= 5
                      ? "You can add up to 5 files."
                      : "PDF, Office, text, or CSV · up to 25 MB"}
                  </small>
                </span>
              </MenuItem>
              <MenuItem className="athyper-home__composer-add-item" disabled>
                <Building2Icon size={17} />
                <span>
                  <strong>Business record…</strong>
                  <small>Coming soon</small>
                </span>
              </MenuItem>
            </MenuContent>
          </Menu>
          {props.agents?.length ? (
            <select
              aria-label="Atlas agent"
              value={props.selectedAgent}
              onChange={(event) => selectAgent(event.currentTarget.value)}
            >
              {props.agents.map((agent) => (
                <option key={agent.code} value={agent.code}>
                  {agent.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div>
          {props.value.length >= 3_600 ? (
            <small>{props.value.length.toLocaleString()} / 4,096</small>
          ) : null}
          <button
            type="button"
            className="athyper-home__composer-submit"
            aria-label={props.busy ? "Stop generating" : "Send message"}
            title={props.busy ? "Stop generating" : "Send message"}
            disabled={
              !props.busy &&
              (!props.value.trim() ||
                tooLong ||
                attachmentBusy ||
                attachmentError)
            }
            onClick={props.busy ? props.onCancel : submit}
          >
            {props.busy ? (
              <span
                className="athyper-home__composer-stop-icon"
                aria-hidden="true"
              />
            ) : (
              <ArrowUpIcon size={18} />
            )}
          </button>
        </div>
      </footer>
    </section>
  );
});

interface AtlasPromptAttachment {
  readonly localId: string;
  readonly attachmentId?: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly status: "uploading" | "processing" | "ready" | "error";
  readonly message?: string;
}
function replaceAttachment(
  items: readonly AtlasPromptAttachment[],
  localId: string,
  patch: Partial<AtlasPromptAttachment>,
): readonly AtlasPromptAttachment[] {
  return items.map((item) =>
    item.localId === localId ? { ...item, ...patch } : item,
  );
}
async function waitForAttachment(
  client: ReturnType<typeof createAttachmentApiClient>,
  attachmentId: string,
): Promise<AttachmentProcessingStatus> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await client.status(attachmentId);
    if (
      status.extractionStatus === "extracted" ||
      status.extractionStatus === "failed" ||
      status.extractionStatus === "skipped"
    )
      return status;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("This file is taking longer than expected.");
}
function attachmentMessage(error: unknown): string {
  if (error instanceof AttachmentApiError) {
    if (error.status === 413) return "This file exceeds the 25 MB limit.";
    if (error.status === 429)
      return "Attachment storage is full. Remove a file or contact your administrator.";
    if (error.status === 403)
      return "You don’t have permission to use this file.";
  }
  if (
    error instanceof Error &&
    error.message === "This file is taking longer than expected."
  )
    return error.message;
  return "We couldn’t prepare this file. Remove it and try again.";
}
function attachmentStatusLabel(item: AtlasPromptAttachment): string {
  return item.status === "uploading"
    ? "Uploading and virus scanning…"
    : item.status === "processing"
      ? "Preparing governed content…"
      : item.status === "ready"
        ? "Ready to use"
        : (item.message ??
          "We couldn’t prepare this file. Remove it and try again.");
}
function formatBytes(value: number): string {
  return value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
const ATLAS_FILE_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);
function supportedAtlasFile(file: File): boolean {
  const extension = file.name.toLocaleLowerCase().split(".").pop();
  return Boolean(extension && ATLAS_FILE_EXTENSIONS.has(extension));
}

function insertComposerHtml(editor: HTMLDivElement | null, html: string): void {
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
    editor.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function PersonalizationPanel({
  personalization,
  onChange,
}: {
  readonly personalization: HomePersonalization;
  readonly onChange: (next: HomePersonalization) => void;
}) {
  return (
    <section
      id="home-personalization"
      className="athyper-home__personalization"
      aria-labelledby="home-personalization-title"
    >
      <header>
        <div>
          <strong id="home-personalization-title">Personalize dashboard</strong>
          <small>
            Visibility and order are saved for this account, tenant, and plane.
          </small>
        </div>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_HOME_PERSONALIZATION)}
        >
          Reset
        </button>
      </header>
      <ol>
        {personalization.widgetOrder.map((widget, index) => {
          const visible = !personalization.hiddenWidgets.includes(widget);
          return (
            <li key={widget}>
              <label>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) =>
                    onChange(
                      updateHomeWidgetVisibility(
                        personalization,
                        widget,
                        event.currentTarget.checked,
                      ),
                    )
                  }
                />
                <span>
                  <strong>{widgetLabel(widget)}</strong>
                  <small>{widgetDescription(widget)}</small>
                </span>
              </label>
              <span>
                <button
                  type="button"
                  aria-label={`Move ${widgetLabel(widget)} up`}
                  disabled={index === 0}
                  onClick={() =>
                    onChange(moveHomeWidget(personalization, widget, -1))
                  }
                >
                  <ArrowUpIcon size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${widgetLabel(widget)} down`}
                  disabled={index === personalization.widgetOrder.length - 1}
                  onClick={() =>
                    onChange(moveHomeWidget(personalization, widget, 1))
                  }
                >
                  <ArrowDownIcon size={15} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RecommendationsWidget({
  title,
  recommendations,
  onVisit,
}: {
  readonly title?: string;
  readonly recommendations: ReturnType<
    typeof recommendHomeItems<PlatformHomeSearchItem>
  >;
  readonly onVisit: (item: PlatformHomeSearchItem) => void;
}) {
  return (
    <section
      className="athyper-home__panel athyper-home__recommendations"
      aria-labelledby="home-recommendations"
    >
      <div className="athyper-home__panel-title">
        <span aria-hidden="true">
          <SparklesIcon size={18} />
        </span>
        <div>
          <p>Permission-aware</p>
          <h2 id="home-recommendations">{title ?? "Recommended for you"}</h2>
        </div>
      </div>
      {recommendations.length ? (
        <ul>
          {recommendations.map(({ item, reason }) => (
            <li key={item.href}>
              <a href={item.href} onClick={() => onVisit(item)}>
                <span>
                  <small>{reason}</small>
                  <strong>{item.title}</strong>
                  <em>{item.description}</em>
                </span>
                <ChevronRightIcon size={17} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="athyper-home__empty-recent">
          Recommendations will appear when an authorized module becomes
          available.
        </p>
      )}
    </section>
  );
}

function WorkspacesWidget({
  title,
  workspaces,
  onVisit,
}: {
  readonly title?: string;
  readonly workspaces: readonly PlatformHomeWorkspace[];
  readonly onVisit: (href: string) => void;
}) {
  return (
    <section
      className="athyper-home__panel athyper-home__workspaces"
      aria-labelledby="home-workspaces"
    >
      <div className="athyper-home__panel-title">
        <div>
          <p>Available to you</p>
          <h2 id="home-workspaces">{title ?? "Workspaces"}</h2>
        </div>
      </div>
      {workspaces.map((workspace) => (
        <a
          key={workspace.href}
          href={workspace.href}
          className="athyper-home__workspace-card"
          onClick={() => onVisit(workspace.href)}
        >
          <span>
            <small>{workspace.status ?? "Available workspace"}</small>
            <strong>{workspace.name}</strong>
            <em>{workspace.description}</em>
            <span>{workspace.modules.join(" · ")}</span>
          </span>
          <ChevronRightIcon size={20} />
        </a>
      ))}
    </section>
  );
}

function QuickActionsWidget({
  title,
  actions,
  onVisit,
}: {
  readonly title?: string;
  readonly actions: readonly PlatformHomeAction[];
  readonly onVisit: (href: string) => void;
}) {
  return (
    <section className="athyper-home__panel" aria-labelledby="home-actions">
      <div className="athyper-home__panel-title">
        <div>
          <p>Permitted actions</p>
          <h2 id="home-actions">{title ?? "Quick actions"}</h2>
        </div>
      </div>
      {actions.length ? (
        <ul className="athyper-home__action-list">
          {actions.map((action) => (
            <li key={action.href}>
              <a href={action.href} onClick={() => onVisit(action.href)}>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </span>
                <ChevronRightIcon size={17} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="athyper-home__empty-recent">
          No quick actions are available for your current permissions.
        </p>
      )}
    </section>
  );
}

function RecentWidget({
  title,
  recent,
  onVisit,
}: {
  readonly title?: string;
  readonly recent: readonly PlatformHomeSearchItem[];
  readonly onVisit: (item: PlatformHomeSearchItem) => void;
}) {
  return (
    <section
      className="athyper-home__panel athyper-home__recent"
      aria-labelledby="home-recent"
    >
      <div className="athyper-home__panel-title">
        <span aria-hidden="true">
          <HistoryIcon size={18} />
        </span>
        <div>
          <p>Continue working</p>
          <h2 id="home-recent">{title ?? "Recently opened from Atlas"}</h2>
        </div>
      </div>
      {recent.length ? (
        <ul>
          {recent.map((item) => (
            <li key={item.href}>
              <a href={item.href} onClick={() => onVisit(item)}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.category}</small>
                </span>
                <ChevronRightIcon size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="athyper-home__empty-recent">
          Authorized destinations you open from Atlas will appear here.
        </p>
      )}
    </section>
  );
}

export function AtlasAnswerSurface({
  atlas,
  citationRoutes,
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
  readonly citationRoutes: Readonly<Record<string, string>>;
}) {
  const active = atlas.status === "answering";
  return (
    <section
      className="athyper-home__answer"
      aria-live="polite"
      aria-busy={active}
      aria-labelledby="atlas-answer-title"
    >
      <header>
        <span aria-hidden="true">
          <AtlasBrandIcon size={20} />
        </span>
        <div>
          <strong id="atlas-answer-title">Atlas answer</strong>
          <small>
            {atlas.publicModelId
              ? `${atlas.publicModelId} · permission-aware`
              : "Permission-aware grounded assistance"}
          </small>
        </div>
      </header>
      {atlas.status === "unavailable" || atlas.status === "error" ? (
        <p className="athyper-home__answer-message">{atlas.message}</p>
      ) : (
        <>
          <div className="athyper-home__answer-text">
            {atlas.text ||
              (atlas.actions.length
                ? "Atlas prepared a governed action for your review."
                : "Finding authorized sources and preparing an answer…")}
          </div>
          {atlas.actions.length ? (
            <div className="athyper-home__actions-preview">
              <strong>Governed action previews</strong>
              <p>
                Nothing runs until you review the exact proposal and confirm it.
              </p>
              {atlas.actions.map((action) => (
                <GovernedActionPreview
                  key={action.proposalId}
                  action={action}
                  busy={atlas.actionBusy === action.proposalId}
                  onConfirm={() => atlas.confirmAction(action)}
                  onDecline={() => atlas.declineAction(action)}
                />
              ))}
              {atlas.actionMessage ? (
                <p role="status" className="athyper-home__action-message">
                  {atlas.actionMessage}
                </p>
              ) : null}
            </div>
          ) : null}
          {atlas.status === "complete" ? (
            <div className="athyper-home__citations">
              <strong>Sources</strong>
              {atlas.attachmentCitations.length || atlas.citations.length ? (
                <ol>
                  {atlas.attachmentCitations.map((citation, index) => (
                    <li key={citation.attachmentId}>
                      <span>
                        {index + 1}. {citation.fileName} · verified attachment
                      </span>
                    </li>
                  ))}
                  {atlas.citations.map((citation, index) => (
                    <li
                      key={`${citation.entityCode}-${citation.recordId}-${citation.revision}`}
                    >
                      {citationLink(
                        citation,
                        citationRoutes,
                        index + atlas.attachmentCitations.length,
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  No source citation was returned. Verify the answer and action
                  preview before continuing.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function GovernedActionPreview({
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
  const [reviewed, setReviewed] = useState(false),
    terminal = [
      "completed",
      "cancelled",
      "denied",
      "failed",
      "expired",
    ].includes(action.status);
  return (
    <article className="athyper-home__action-preview" data-risk={action.risk}>
      <header>
        <span>
          <small>
            {action.access} · {action.risk} risk
          </small>
          <strong>{action.summary}</strong>
        </span>
        <b data-status={action.status}>{action.status}</b>
      </header>
      <dl>
        {action.affectedEntityType ? (
          <div>
            <dt>Entity</dt>
            <dd>
              {action.affectedEntityType}
              {action.affectedEntityId ? ` · ${action.affectedEntityId}` : ""}
            </dd>
          </div>
        ) : null}
        {action.expectedRowVersion !== undefined ? (
          <div>
            <dt>Expected version</dt>
            <dd>{action.expectedRowVersion}</dd>
          </div>
        ) : null}
        {action.expiresAt ? (
          <div>
            <dt>Confirmation expires</dt>
            <dd>{formatAuditTime(action.expiresAt)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="athyper-home__action-fields">
        <strong>Proposed values</strong>
        <dl>
          {Object.entries(action.arguments).map(([key, value]) => (
            <div key={key}>
              <dt>{humanize(key)}</dt>
              <dd>{safeArgument(key, value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {!terminal ? (
        <>
          <label className="athyper-home__action-confirm">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(event) => setReviewed(event.currentTarget.checked)}
            />
            <span>
              I reviewed this preview and authorize this exact action.
            </span>
          </label>
          <footer>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDecline()}
            >
              Decline
            </button>
            <button
              type="button"
              disabled={!reviewed || busy}
              onClick={() => void onConfirm()}
            >
              {busy ? "Processing…" : "Confirm and run"}
            </button>
          </footer>
        </>
      ) : null}
    </article>
  );
}

function citationLink(
  citation: AtlasRecordCitation,
  routes: Readonly<Record<string, string>>,
  index: number,
): React.ReactNode {
  const label = `${index + 1}. ${citation.entityCode.replace(/_/g, " ")} · ${citation.recordId} · revision ${citation.revision}`;
  const template = routes[citation.entityCode];
  if (!template?.startsWith("/")) return <span>{label}</span>;
  const href = template
    .replace("{recordId}", encodeURIComponent(citation.recordId))
    .replace("{entityCode}", encodeURIComponent(citation.entityCode));
  return (
    <a href={href}>
      {label}
      <ChevronRightIcon size={14} />
    </a>
  );
}

function searchScore(item: PlatformHomeSearchItem, query: string): number {
  const terms = query.split(/\s+/).filter(Boolean),
    title = item.title.toLocaleLowerCase(),
    category = item.category.toLocaleLowerCase();
  const haystack = `${title} ${category} ${item.description.toLocaleLowerCase()} ${(item.keywords ?? []).join(" ").toLocaleLowerCase()}`;
  if (title === query) return 100;
  if (title.includes(query)) return 60;
  return terms.reduce(
    (score, term) =>
      score +
      (title.includes(term)
        ? 12
        : category.includes(term)
          ? 8
          : haystack.includes(term)
            ? 4
            : 0),
    0,
  );
}

function widgetLabel(widget: HomeWidgetId): string {
  return widget === "quick-actions"
    ? "Quick actions"
    : widget[0]!.toUpperCase() + widget.slice(1);
}
function widgetDescription(widget: HomeWidgetId): string {
  return widget === "recommendations"
    ? "Role- and activity-based destinations"
    : widget === "workspaces"
      ? "Authorized workspace entry points"
      : widget === "quick-actions"
        ? "Actions allowed by your permissions"
        : "Your recently opened destinations";
}
function safeArgument(key: string, value: unknown): string {
  if (/(secret|password|token|api.?key|credential)/i.test(key))
    return "••••••••";
  if (value === null) return "None";
  if (["string", "number", "boolean"].includes(typeof value))
    return String(value).slice(0, 240);
  if (Array.isArray(value))
    return `${value.length} selected item${value.length === 1 ? "" : "s"}`;
  return "Structured value";
}
function humanize(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function formatAuditTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}
