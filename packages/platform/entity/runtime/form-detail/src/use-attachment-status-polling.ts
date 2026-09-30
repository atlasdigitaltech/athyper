"use client";
import { useEffect, useRef, useState } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import { attachmentStatus } from "./collaboration-operations";

/** Poll uploader-visible pending rows; terminal status invalidates record data. */
export function useAttachmentStatusPolling(
  client: HttpClient,
  items: readonly Readonly<Record<string, unknown>>[],
  onChanged: () => void,
) {
  const [status, setStatus] = useState<Readonly<Record<string, string>>>({});
  const pendingKey = JSON.stringify(
    items
      .filter((item) =>
        ["pending", "uploading", "uploaded", "processing"].includes(
          String(item.processingStatus),
        ),
      )
      .map((item) => String(item.id))
      .sort(),
  );
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;
  useEffect(() => {
    const pending = new Set<string>(JSON.parse(pendingKey));
    const failures = new Map<string, number>();
    if (!pending.size) return;
    const controller = new AbortController();
    let delay = 2000,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let changed = false;
      await Promise.all(
        [...pending].map(async (id) => {
          try {
            const value = await client.request(attachmentStatus(id), {
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setStatus((current) => ({
              ...current,
              [id]: `${value.status}${value.extractionStatus ? `; extraction ${value.extractionStatus}` : ""}`,
            }));
            if (
              !["pending", "uploading", "uploaded", "processing"].includes(
                value.status,
              )
            ) {
              pending.delete(id);
              changed = true;
            }
          } catch {
            if (controller.signal.aborted) return;
            const attempts = (failures.get(id) ?? 0) + 1;
            failures.set(id, attempts);
            if (attempts >= 5) {
              pending.delete(id);
              setStatus((current) => ({
                ...current,
                [id]: "Status is temporarily unavailable",
              }));
            }
          }
        }),
      );
      if (controller.signal.aborted) return;
      if (changed) changedRef.current();
      if (pending.size) {
        timer = setTimeout(() => void poll(), delay);
        delay = Math.min(delay * 2, 10000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, pendingKey]);
  useEffect(() => {
    // Polling is advisory. Once the section supplies a terminal row (or no
    // row), stop preferring the stale polled status over server truth.
    setStatus((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, value] of Object.entries(current)) {
        const item = items.find((candidate) => String(candidate.id) === id);
        if (
          item &&
          ["pending", "uploading", "uploaded", "processing"].includes(
            String(item.processingStatus),
          )
        )
          next[id] = value;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [items]);
  return status;
}
