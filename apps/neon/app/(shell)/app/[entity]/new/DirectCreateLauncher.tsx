"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/bff-fetch";
import { markDocumentEditPerformance } from "@athyper/runtime-canvas/document-runtime";
import { invalidateRuntimeListEntity } from "@athyper/runtime-shared/client";

/** DIRECT_CREATE intentionally has no form-before-create stage. */
export function DirectCreateLauncher({ entity, editAfterCreate }: { entity: string; editAfterCreate: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("Creating record...");
  const [idempotencyKey] = useState(() => stableCreateKey(entity));

  useEffect(() => {
    let cancelled = false;
    markDocumentEditPerformance("create-clicked");
    void csrfFetch(`/api/runtime/v1/entities/${encodeURIComponent(entity)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ data: {} }),
    }).then(async (response) => {
      const body = await response.json().catch(() => null) as unknown;
      if (cancelled) return;
      const record = isRecord(body) && isRecord(body["record"]) ? body["record"] : undefined;
      const id = typeof record?.["id"] === "string" ? record["id"] : undefined;
      if (!response.ok || !id) {
        setMessage(isRecord(body) && typeof body["message"] === "string" ? body["message"] : "Could not create record.");
        return;
      }
      clearCreateKey(entity, idempotencyKey);
      invalidateRuntimeListEntity(entity, "create");
      router.replace(`/app/${encodeURIComponent(entity)}/${encodeURIComponent(id)}${editAfterCreate ? "/edit" : ""}`);
    }).catch(() => { if (!cancelled) setMessage("Could not create record."); });
    return () => { cancelled = true; };
  }, [editAfterCreate, entity, idempotencyKey, router]);

  return <main className="flex min-h-[40vh] items-center justify-center px-6"><div className="text-sm text-muted-foreground">{message}</div></main>;
}

function storageKey(entity: string): string { return `entity-direct-create:${entity}:idempotency-key`; }
function stableCreateKey(entity: string): string {
  try {
    const key = storageKey(entity);
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch { return crypto.randomUUID(); }
}
function clearCreateKey(entity: string, expected: string): void {
  try { if (sessionStorage.getItem(storageKey(entity)) === expected) sessionStorage.removeItem(storageKey(entity)); } catch { /* navigation still succeeds */ }
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
