"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { useAtlas } from "../provider/atlas-context";

export function AskAtlasInput({
  placeholder = "Ask Atlas…",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const atlas = useAtlas();
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setQuery("");
    atlas.openWithQuery(trimmed);
  };

  return (
    <form onSubmit={submit} role="search" className={className}>
      <label className="sr-only" htmlFor="ask-atlas-input">Ask Atlas</label>
      <input
        id="ask-atlas-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
      <button type="submit" disabled={!query.trim()} aria-label="Ask Atlas">
        <Send className="size-4" />
      </button>
    </form>
  );
}
