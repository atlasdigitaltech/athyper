"use client";

export function SuggestionStrip({
  suggestions,
  onSelect,
}: {
  suggestions: readonly string[];
  onSelect(query: string): void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t px-4 py-3">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
