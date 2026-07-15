import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  getMetaEntityRuntimeDescriptor,
  getMetaEntityRuntimeDescriptorCacheState,
} from "@/lib/server/meta-entity-runtime";
import { writeDraftInitiationBootstrap } from "@/lib/server/draft-initiation-bootstrap-cache";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const startedAt = performance.now();
  const timings: Array<{ name: string; durationMs: number }> = [];
  const sessionStart = performance.now();
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to create drafts." },
      { status: 401 },
    );
  }
  timings.push({ name: "session", durationMs: performance.now() - sessionStart });

  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required to initiate a draft." },
      { status: 400 },
    );
  }

  const descriptorStart = performance.now();
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  timings.push({ name: "descriptor", durationMs: performance.now() - descriptorStart });
  if (!descriptor || descriptor.createMode !== "EARLY_DRAFT" || !descriptor.capabilities.canCreate) {
    return NextResponse.json(
      { error: "DRAFT_INITIATE_NOT_ALLOWED", message: "This entity does not allow provisional draft initiation." },
      { status: descriptor ? 403 : 404 },
    );
  }
  const descriptorCacheState = getMetaEntityRuntimeDescriptorCacheState(descriptor);

  const upstreamStart = performance.now();
  const response = await fetch(
    buildRuntimeUrl(`/api/runtime/v1/entities/${encodeURIComponent(entityCode)}/draft/initiate`),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(await readJson(request) ?? {}),
      cache: "no-store",
    },
  );
  timings.push({ name: "records_service", durationMs: performance.now() - upstreamStart });

  const result = await readJson(response);
  if (!response.ok) {
    return NextResponse.json(normalizeError(result, response.status, "DRAFT_INITIATE_FAILED"), { status: response.status });
  }
  if (isRecord(result) && isRecord(result["record"])) {
    writeDraftInitiationBootstrap({
      session,
      entityCode,
      record: result["record"] as RuntimeRecordRow,
    });
  }
  timings.push({ name: "serialize", durationMs: Math.max(0, performance.now() - startedAt - timings.reduce((sum, item) => sum + item.durationMs, 0)) });
  return NextResponse.json(result, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Draft-Initiate-Server-Ms": String(Math.round(performance.now() - startedAt)),
      "X-Draft-Initiate-Cache-State": descriptorCacheState,
      "Server-Timing": mergeServerTiming(response.headers.get("Server-Timing"), timings),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeServerTiming(
  upstream: string | null,
  timings: Array<{ name: string; durationMs: number }>,
): string {
  const local = timings.map((timing) => `${timing.name};dur=${Math.max(0, Math.round(timing.durationMs))}`);
  return [upstream, ...local].filter(Boolean).join(",");
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}

function normalizeError(value: unknown, status: number, fallback: string): { error: string; message: string } {
  const record = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    error: typeof record["error"] === "string" ? record["error"] : fallback,
    message: typeof record["message"] === "string" ? record["message"] : `Records service returned ${status}.`,
  };
}
