import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ListLocationStateV1 } from "@athyper/contract-platform-entity-list";

/** Owns editable search input and its URL-query transition rules. */
export function useListQueryState(input: {
  readonly query: string | undefined;
  readonly minimumQueryLength: number;
  readonly behavior: "instant" | "submit";
  readonly onChange: (
    patch: Partial<ListLocationStateV1>,
    history?: "replace" | "push",
  ) => void;
  readonly onTooShort: () => void;
}) {
  const [query, setQuery] = useState(input.query ?? "");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQuery(input.query ?? ""), [input.query]);
  useEffect(() => {
    const normalized = query.trim();
    if (
      input.behavior !== "instant" ||
      normalized === (input.query ?? "") ||
      (normalized.length > 0 && normalized.length < input.minimumQueryLength)
    )
      return;
    const timer = window.setTimeout(
      () => input.onChange({ query: normalized || undefined }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [
    query,
    input.behavior,
    input.minimumQueryLength,
    input.onChange,
    input.query,
  ]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable=true]");
      if (
        (event.key === "/" && !editing) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized && normalized.length < input.minimumQueryLength)
      return input.onTooShort();
    input.onChange({ query: normalized || undefined }, "push");
  };
  return { query, setQuery, searchRef, submit } as const;
}
