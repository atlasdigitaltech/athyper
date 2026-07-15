import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to save drafts." },
      { status: 401 },
    );
  }

  const { entity, id } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const response = await fetch(
    buildRuntimeUrl(`/api/runtime/v1/entities/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}/draft/promote`),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(await readJson(request) ?? {}),
      cache: "no-store",
    },
  );
  const result = await readJson(response);
  if (!response.ok) {
    return NextResponse.json(normalizeError(result, response.status, "DRAFT_PROMOTION_FAILED"), { status: response.status });
  }
  return NextResponse.json(result, { status: response.status });
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
