import { NextResponse } from "next/server";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { resolveRuntimeFieldOptions } from "@/lib/server/runtime-field-options";
import { buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const MAX_QUERY_LENGTH = 200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; field: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load options." },
      { status: 401 },
    );
  }
  const { entity, field: fieldName } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "FIELD_NOT_FOUND", message: "This field is not registered for runtime option resolution." },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "QUERY_TOO_LONG", message: `Option query is limited to ${MAX_QUERY_LENGTH} characters.` },
      { status: 400 },
    );
  }
  return resolveRuntimeFieldOptions({
    descriptor,
    fieldName,
    query,
    currentValue: url.searchParams.get("value") ?? "",
    context: readContext(url.searchParams),
    runtimeHeaders: buildRuntimeHeaders(session),
    signal: request.signal,
  });
}

function readContext(searchParams: URLSearchParams): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith("context.")) continue;
    const contextKey = key.slice("context.".length);
    if (/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(contextKey) && value.trim()) {
      context[contextKey] = value.trim();
    }
  }
  return context;
}
