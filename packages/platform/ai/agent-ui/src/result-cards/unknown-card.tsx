"use client";

export function UnknownCard() {
  return (
    <div
      role="note"
      className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      This Atlas result uses a newer card format. The text response remains
      available.
    </div>
  );
}
