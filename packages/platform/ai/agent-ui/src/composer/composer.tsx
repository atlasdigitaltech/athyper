"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button, Textarea } from "@athyper/platform-ui";
import { ModelPicker } from "./model-picker";
import { useAtlas } from "../provider/atlas-context";

export function Composer({
  running,
  onSend,
  onCancel,
}: {
  running: boolean;
  onSend(query: string): Promise<void>;
  onCancel(): void;
}) {
  const atlas = useAtlas();
  const [query, setQuery] = useState("");
  const modeResolved = Boolean(
    atlas.catalog
    && atlas.currentModelId
    && atlas.catalog.models.some(
      (model) =>
        model.model_id === atlas.currentModelId
        && model.status === "available",
    ),
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || running || !modeResolved) return;
    setQuery("");
    void onSend(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="border-t bg-background p-3">
      <div className="flex flex-col gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Atlas…"
          aria-label="Message Atlas"
          rows={1}
          maxLength={12_000}
          className="min-h-10 flex-1 resize-none border-0 px-2 py-2 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <ModelPicker />
          {running ? (
            <Button type="button" size="icon" variant="outline" onClick={onCancel} aria-label="Stop Atlas response">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!query.trim() || !modeResolved}
              aria-label={modeResolved ? "Send to Atlas" : "Waiting for an Atlas mode"}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Atlas can make mistakes. Verify important financial information.
      </p>
    </form>
  );
}
