"use client";
import { useEffect, useRef, useState } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import { attachmentBrowse } from "./collaboration-operations";
import { fileFilterBody } from "./file-filter-body";

/** Owns cancellation, page identity, and errors independently of file dialogs. */
export function useAttachmentBrowse(
  client: HttpClient,
  entityType: string,
  entityId: string,
  allowed: boolean,
  name: string,
  folder: string,
  category: string,
  revision: unknown,
) {
  const [items, setItems] =
    useState<readonly Readonly<Record<string, unknown>>[]>();
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const active = allowed && Boolean(name.trim() || folder || category);
  async function load(after?: string) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const epoch = generation.current;
    const current = () =>
      !controller.signal.aborted && epoch === generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.request(attachmentBrowse, {
        signal: controller.signal,
        body: {
          entityType,
          entityId,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...fileFilterBody(folder, category),
          ...(after ? { after } : {}),
        },
      });
      if (!current()) return;
      setItems((previous) => [
        ...new Map(
          [...(after ? (previous ?? []) : []), ...result.items].map((item) => [
            String(item.id),
            item,
          ]),
        ).values(),
      ]);
      setCursor(result.nextCursor);
    } catch {
      if (current()) setError("Files could not be loaded. Try again.");
    } finally {
      if (current()) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = undefined;
    setItems(undefined);
    setCursor(undefined);
    setError(undefined);
    setBusy(active);
    const timer = active ? setTimeout(() => void load(), 180) : undefined;
    return () => {
      generation.current++;
      pending.current?.abort();
      clearTimeout(timer);
    };
  }, [client, entityType, entityId, active, name, folder, category, revision]);
  return {
    items,
    cursor,
    busy,
    error,
    retry: () => void load(),
    loadMore: () => {
      if (cursor && !pending.current) void load(cursor);
    },
  };
}
