"use client";
import { useEffect, useRef } from "react";
import { Button } from "@athyper/platform-ui";

/** Progressive collection loading; failed pages require an explicit retry. */
export function CollectionContinuation({ cursor, loading = false, failed = false, automatic = true, label = "Load more", onLoadMore }: {
  readonly cursor: string;
  readonly loading?: boolean;
  readonly failed?: boolean;
  readonly automatic?: boolean;
  readonly label?: string;
  readonly onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const attempted = useRef<string | undefined>(undefined);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !automatic || loading || failed || typeof IntersectionObserver === "undefined") return;
    // Use the actual collection scroll pane, when present, rather than the window.
    let root: HTMLElement | null = node.parentElement;
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || attempted.current === cursor) return;
      attempted.current = cursor;
      onLoadMore();
    }, { root, rootMargin: "160px 0px", threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loading, failed, automatic, onLoadMore]);
  return <div ref={sentinel} className="a-collection-continuation" aria-busy={loading}>
    <p role="status" aria-live="polite">{failed
      ? "Could not load more records. Your loaded records are still available."
      : loading ? "Loading more records…" : automatic ? "More records load as you scroll." : "More records are available."}</p>
    <Button type="button" variant="secondary" disabled={loading} onClick={() => {
      attempted.current = cursor;
      onLoadMore();
    }}>{loading ? "Loading…" : failed ? "Try again" : label}</Button>
  </div>;
}
