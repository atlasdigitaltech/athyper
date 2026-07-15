"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/bff-fetch";
import { markDocumentEditPerformance } from "@athyper/runtime-canvas/document-runtime";

export function EarlyDraftLauncher({ entity }: { entity: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Starting draft...");
  const [idempotencyKey] = useState(() => getOrCreateDraftKey(entity));

  useEffect(() => {
    let cancelled = false;

    async function initiate() {
      markDocumentEditPerformance("create-clicked");
      markDocumentEditPerformance("draft-initiated-started");
      try {
        const response = await csrfFetch(`/api/runtime/v1/entities/${encodeURIComponent(entity)}/draft/initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({}),
        });
        const result = await response.json().catch(() => null) as unknown;
        if (cancelled) return;
        if (!response.ok || !isRecord(result)) {
          setMessage("Could not start draft.");
          return;
        }
        const record = isRecord(result["record"]) ? result["record"] : undefined;
        const id = typeof record?.["id"] === "string" ? record["id"] : undefined;
        if (!id) {
          setMessage("Draft started, but no record id was returned.");
          return;
        }
        markDocumentEditPerformance("draft-initiated-completed");
        clearDraftKey(entity, idempotencyKey);
        // EARLY_DRAFT records must open through the edit route. The plain
        // record route intentionally renders the document in read-only mode.
        router.replace(`/app/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/edit`);
      } catch {
        if (!cancelled) setMessage("Could not start draft.");
      }
    }

    void initiate();
    return () => {
      cancelled = true;
    };
  }, [entity, idempotencyKey, router]);

  return (
    <main className="flex min-h-[40vh] items-center justify-center px-6">
      <div className="text-sm text-muted-foreground">{message}</div>
    </main>
  );
}

function draftStorageKey(entity: string): string {
  return `document-create:${entity}:idempotency-key`;
}

function getOrCreateDraftKey(entity: string): string {
  const storageKey = draftStorageKey(entity);
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function clearDraftKey(entity: string, expected: string): void {
  try {
    const storageKey = draftStorageKey(entity);
    if (window.sessionStorage.getItem(storageKey) === expected) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Navigation still succeeds when session storage is unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
