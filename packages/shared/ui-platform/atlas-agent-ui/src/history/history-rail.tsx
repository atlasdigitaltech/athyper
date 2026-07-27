"use client";

import type { ReactNode } from "react";
import {
  Archive,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AtlasThread } from "@athyper/atlas-agent-runtime";
import { useAtlas } from "../provider/atlas-context";

export function HistoryRail() {
  const atlas = useAtlas();
  const history = atlas.threadHistory;
  if (!history) return null;

  const running =
    atlas.state.phase === "running"
    || atlas.state.phase === "awaiting-tool";
  const active = history.threads.filter((thread) => thread.status === "active");
  const archived = history.threads.filter(
    (thread) => thread.status === "archived",
  );

  return (
    <aside
      aria-label="Conversation history"
      className="flex h-full w-56 shrink-0 flex-col border-r bg-muted/20"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </h2>
          <p className="text-[11px] text-muted-foreground">Saved conversations</p>
        </div>
        <button
          type="button"
          aria-label="Refresh conversation history"
          title="Refresh history"
          disabled={history.loading || history.mutatingThreadId !== null}
          onClick={() => { void history.refresh(); }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`size-3.5 ${history.loading ? "animate-spin" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {history.loading && history.threads.length > 0 ? (
          <span role="status" className="sr-only">
            Refreshing saved conversations…
          </span>
        ) : null}
        {history.loading && history.threads.length === 0 ? (
          <div
            role="status"
            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Loading saved conversations…
          </div>
        ) : null}

        {history.error ? (
          <div role="alert" className="m-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
            <p className="text-xs text-destructive">{history.error}</p>
            <button
              type="button"
              onClick={() => { void history.refresh(); }}
              className="mt-1.5 text-xs font-medium text-foreground underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!history.loading && !history.error && history.threads.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <MessageSquareText
              className="mx-auto mb-2 size-5 text-muted-foreground"
              aria-hidden
            />
            <p className="text-xs font-medium">No saved conversations</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              New conversations appear here after their first saved message.
            </p>
          </div>
        ) : null}

        {active.length > 0 ? (
          <ThreadGroup
            label="Recent"
            threads={active}
            running={running}
            history={history}
          />
        ) : null}
        {archived.length > 0 ? (
          <ThreadGroup
            label="Archived"
            threads={archived}
            running={running}
            history={history}
          />
        ) : null}
      </div>

      <p
        className="border-t px-3 py-2 text-[10px] leading-4 text-muted-foreground"
        data-testid="atlas-retention-notice"
      >
        {history.retentionNotice}
      </p>
    </aside>
  );
}

function ThreadGroup({
  label,
  threads,
  running,
  history,
}: {
  label: string;
  threads: AtlasThread[];
  running: boolean;
  history: NonNullable<ReturnType<typeof useAtlas>["threadHistory"]>;
}) {
  return (
    <section className="mb-3" aria-label={`${label} conversations`}>
      <h3 className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <ul className="space-y-1">
        {threads.map((thread) => {
          const busy = history.mutatingThreadId === thread.thread_id;
          const selected = history.activeThreadId === thread.thread_id;
          return (
            <li
              key={thread.thread_id}
              className={`group rounded-lg border ${
                selected
                  ? "border-primary/40 bg-primary/5"
                  : "border-transparent hover:border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-1 p-1">
                {thread.status === "active" ? (
                  <button
                    type="button"
                    aria-label={`Resume ${thread.title}`}
                    aria-current={selected ? "page" : undefined}
                    disabled={running || busy}
                    onClick={() => { void history.resume(thread.thread_id); }}
                    className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left disabled:opacity-50"
                  >
                    <ThreadLabel thread={thread} />
                  </button>
                ) : (
                  <div className="min-w-0 flex-1 px-1.5 py-1 opacity-75">
                    <ThreadLabel thread={thread} />
                  </div>
                )}
                <div className="flex shrink-0 items-center pt-0.5">
                  {history.archiveEnabled ? (
                    thread.status === "active" ? (
                      <ThreadAction
                        label={`Archive ${thread.title}`}
                        disabled={running || busy}
                        onClick={() => { void history.archive(thread.thread_id); }}
                      >
                        <Archive className="size-3.5" aria-hidden />
                      </ThreadAction>
                    ) : null
                  ) : null}
                  {history.deleteEnabled ? (
                    <ThreadAction
                      label={thread.retention.legal_hold
                        ? `Delete unavailable for ${thread.title} while under legal hold`
                        : `Delete ${thread.title}`}
                      disabled={running || busy || thread.retention.legal_hold}
                      destructive
                      onClick={() => {
                        const confirmed = typeof window === "undefined"
                          ? false
                          : window.confirm(
                            `Delete “${thread.title}”?\n\n${history.retentionNotice}`,
                          );
                        if (confirmed) void history.delete(thread.thread_id);
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </ThreadAction>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ThreadLabel({ thread }: { thread: AtlasThread }) {
  return (
    <>
      <span className="block truncate text-xs font-medium">{thread.title}</span>
      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
        {formatThreadDate(thread.updated_at)}
        {" · "}
        {thread.message_count} {thread.message_count === "1" ? "message" : "messages"}
      </span>
    </>
  );
}

function ThreadAction({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1 opacity-70 hover:opacity-100 disabled:opacity-30 ${
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
