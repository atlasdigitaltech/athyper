"use client";

import {
  ApiError,
  createMetadataClient,
  createPlatformClient,
  createRecordsClient,
} from "@athyper/api-client";
import { setClients } from "@athyper/query";
import { createPlaneBffClient, csrfFetch } from "@athyper/runtime-shared/client";
import { configureSurfaceEventTransport } from "@athyper/runtime-shared/observability";
import "@/lib/bootstrap-document-runtime";
import { PLANE_KEY } from "@/lib/plane";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let configured = false;
const bffClient = createPlaneBffClient(PLANE_KEY);

export function configureNeonRuntime(): void {
  if (configured) return;

  setClients(
    createMetadataClient(relayFetch),
    createRecordsClient(relayFetch),
    undefined,
    createPlatformClient(relayFetch),
  );
  configureSurfaceEventTransport(csrfFetch);
  configured = true;
}

async function relayFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/relay${path}`, withCsrfForMutation(options));
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    throw new ApiError(
      response.status,
      typeof body["error"] === "string" ? body["error"] : "UNKNOWN",
      typeof body["message"] === "string"
        ? body["message"]
        : response.statusText,
    );
  }
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? (JSON.parse(text) as T)
    : (text as T);
}

function withCsrfForMutation(options: RequestInit): RequestInit {
  const method = (options.method ?? "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return options;

  const headers = new Headers(options.headers);
  if (!headers.has("X-CSRF-Token")) {
    const token = bffClient.getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return { ...options, headers };
}
