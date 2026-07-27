"use client";

import { Bot, Minimize2, Plus } from "lucide-react";
import { Button } from "@athyper/ui";
import { OverlayShell } from "@athyper/ui/surfaces/shells";
import { useAtlas } from "../provider/atlas-context";
import { MessageList } from "../conversation/message-list";
import { Composer } from "../composer/composer";
import { SuggestionStrip } from "../composer/suggestion-strip";
import { HistoryRail } from "../history/history-rail";
import { AtlasRateLimitNotice } from "../conversation/rate-limit-notice";

/**
 * Fullscreen Atlas surface. The platform OverlayShell owns focus trapping,
 * Escape handling, portal/z-index behavior, and surface-stack registration.
 * History remains hidden unless server-authoritative persistence is explicitly
 * enabled by the provider capability/profile.
 */
export function AtlasFullscreen() {
  const atlas = useAtlas();
  const running = atlas.state.phase === "running" || atlas.state.phase === "awaiting-tool";
  const active = atlas.isOpen && atlas.surfaceMode === "fullscreen";
  const hasMessages = atlas.state.messages.length > 0;

  const startNewConversation = () => {
    if (hasMessages) {
      const confirmed = typeof window !== "undefined"
        ? window.confirm("Start a new conversation? Current messages will be cleared.")
        : true;
      if (!confirmed) return;
    }
    atlas.newConversation();
  };

  return (
    <OverlayShell
      open={active}
      onOpenChange={(open) => { if (!open) atlas.close(); }}
      ariaLabel={atlas.profile.title}
      bindingBar={(
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{atlas.profile.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {atlas.profile.description}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasMessages ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startNewConversation}
                className="gap-1.5"
              >
                <Plus className="size-4" aria-hidden />
                New conversation
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Collapse Atlas to side panel"
              onClick={() => atlas.setSurfaceMode("panel")}
              className="size-8"
            >
              <Minimize2 className="size-4" />
            </Button>
          </div>
        </div>
      )}
    >
      <div className="flex h-full min-h-0 bg-background">
        <HistoryRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList
            messages={atlas.state.messages}
            emptyState={atlas.profile.emptyState}
            error={atlas.state.error}
            feedbackEnabled={atlas.feedbackEnabled}
            onFeedback={atlas.submitFeedback}
          />
          {atlas.state.messages.length === 0 ? (
            <SuggestionStrip
              suggestions={atlas.profile.suggestions}
              onSelect={atlas.openWithQuery}
            />
          ) : null}
          <AtlasRateLimitNotice notice={atlas.rateLimitNotice} />
          <Composer running={running} onSend={atlas.send} onCancel={atlas.cancel} />
        </div>
      </div>
    </OverlayShell>
  );
}
