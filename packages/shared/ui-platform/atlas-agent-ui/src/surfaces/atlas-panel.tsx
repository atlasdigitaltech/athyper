"use client";

import { Bot, Maximize2 } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { DrawerFormShell } from "@athyper/ui/surfaces/shells";
import { useAtlas } from "../provider/atlas-context";
import { MessageList } from "../conversation/message-list";
import { Composer } from "../composer/composer";
import { SuggestionStrip } from "../composer/suggestion-strip";
import { HistoryRail } from "../history/history-rail";
import { AtlasRateLimitNotice } from "../conversation/rate-limit-notice";

export function AtlasPanel() {
  const atlas = useAtlas();
  const running = atlas.state.phase === "running" || atlas.state.phase === "awaiting-tool";
  const visible = atlas.isOpen && atlas.surfaceMode === "panel";

  return (
    <DrawerFormShell
      open={visible}
      onOpenChange={(open) => { if (!open) atlas.close(); }}
      width="default"
      defaultWidth={atlas.threadHistory ? 760 : 480}
      contextBadge={(
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="size-5" aria-hidden />
        </span>
      )}
      title={atlas.profile.title}
      subtitle={atlas.profile.description}
      prevNext={(
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open Atlas fullscreen"
          onClick={() => atlas.setSurfaceMode("fullscreen")}
          className="size-8"
        >
          <Maximize2 className="size-4" aria-hidden />
        </Button>
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
    </DrawerFormShell>
  );
}
