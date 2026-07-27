"use client";

import { useState } from "react";
import { Bot, FileText, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import type {
  AtlasFeedbackPayload,
  AtlasMessage,
} from "@athyper/atlas-agent-runtime";
import { StreamingCursor } from "./streaming-cursor";
import { ResultCard } from "../result-cards/result-card-registry";

type FeedbackVerdict = Extract<
  AtlasFeedbackPayload["verdict"],
  "correct" | "wrong"
>;

export function MessageBubble({
  message,
  feedbackEnabled = false,
  onFeedback,
}: {
  message: AtlasMessage;
  feedbackEnabled?: boolean;
  onFeedback?(
    messageId: string,
    runId: string,
    verdict: AtlasFeedbackPayload["verdict"],
  ): Promise<void>;
}) {
  const assistant = message.role === "assistant";
  const [feedback, setFeedback] = useState<FeedbackVerdict | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackFailed, setFeedbackFailed] = useState(false);
  const canSubmitFeedback = Boolean(
    assistant
    && feedbackEnabled
    && onFeedback
    && message.runId
    && message.status === "complete",
  );

  const submit = async (verdict: FeedbackVerdict) => {
    if (!canSubmitFeedback || !onFeedback || !message.runId || feedbackPending) return;
    setFeedbackPending(true);
    setFeedbackFailed(false);
    try {
      await onFeedback(message.id, message.runId, verdict);
      setFeedback(verdict);
    } catch {
      setFeedbackFailed(true);
    } finally {
      setFeedbackPending(false);
    }
  };

  return (
    <article
      className={`flex gap-3 ${assistant ? "" : "flex-row-reverse"}`}
      aria-label={`${assistant ? "Atlas" : "You"} message`}
    >
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
          assistant ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {assistant ? <Bot className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
      </span>
      <div className={`flex max-w-[85%] flex-col ${assistant ? "items-start" : "items-end"}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
            assistant
              ? "bg-muted/60 text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {message.content || (message.status === "streaming" ? "Thinking" : "")}
          {message.status === "streaming" ? <StreamingCursor /> : null}
        </div>
        {assistant && message.citations?.length ? (
          <div className="mt-2 flex w-full flex-col gap-1" aria-label="Answer citations">
            {message.citations.map((citation) => (
              <details key={citation.citationId} className="rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground">
                  <FileText className="size-3" aria-hidden />
                  <span className="truncate">{citation.title}</span>
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-foreground/80">{citation.excerpt}</p>
              </details>
            ))}
          </div>
        ) : null}
        {assistant && message.resultCards?.length ? (
          <div
            className="mt-2 flex w-full flex-col gap-2"
            aria-label="Atlas structured results"
          >
            {message.resultCards.map((card, index) => (
              <ResultCard
                key={`${card.kind}:${"version" in card ? String(card.version) : "legacy"}:${index}`}
                card={card}
              />
            ))}
          </div>
        ) : null}
        {canSubmitFeedback ? (
          <div className="mt-1 flex items-center gap-0.5" aria-label="Rate this Atlas response">
            <button
              type="button"
              disabled={feedbackPending || feedback !== null}
              onClick={() => { void submit("correct"); }}
              aria-label="Helpful response"
              aria-pressed={feedback === "correct"}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              <ThumbsUp className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              disabled={feedbackPending || feedback !== null}
              onClick={() => { void submit("wrong"); }}
              aria-label="Unhelpful response"
              aria-pressed={feedback === "wrong"}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              <ThumbsDown className="size-3.5" aria-hidden />
            </button>
            {feedback ? (
              <span className="ml-1 text-[11px] text-muted-foreground">
                Feedback received
              </span>
            ) : feedbackFailed ? (
              <span role="status" className="ml-1 text-[11px] text-destructive">
                Feedback could not be sent
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
