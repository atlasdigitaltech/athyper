"use client";

import { useEffect, useRef } from "react";
import type {
  AtlasFeedbackPayload,
  AtlasMessage,
} from "@athyper/platform-ai-agent-runtime";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  messages,
  emptyState,
  error,
  feedbackEnabled = false,
  onFeedback,
}: {
  messages: readonly AtlasMessage[];
  emptyState: string;
  error: string | null;
  feedbackEnabled?: boolean;
  onFeedback?(
    messageId: string,
    runId: string,
    verdict: AtlasFeedbackPayload["verdict"],
  ): Promise<void>;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{emptyState}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          feedbackEnabled={feedbackEnabled}
          onFeedback={onFeedback}
        />
      ))}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
