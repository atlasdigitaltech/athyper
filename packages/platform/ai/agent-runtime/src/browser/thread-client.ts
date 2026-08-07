import {
  AtlasThreadListResponseSchema,
  AtlasThreadMessageListResponseSchema,
  AtlasThreadResponseSchema,
  CreateAtlasThreadRequestSchema,
  ListAtlasThreadMessagesQuerySchema,
  ListAtlasThreadsQuerySchema,
  UpdateAtlasThreadRequestSchema,
  type AtlasThreadListResponse,
  type AtlasThreadMessageListResponse,
  type AtlasThreadResponse,
  type CreateAtlasThreadRequest,
  type ListAtlasThreadMessagesQuery,
  type ListAtlasThreadsQuery,
  type UpdateAtlasThreadRequest,
} from "../threads/thread-contracts";

export const DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT =
  "/api/relay/ai/agent/threads";

export class AtlasThreadRequestError extends Error {
  override readonly name = "AtlasThreadRequestError";

  constructor(readonly status: number) {
    super(`Atlas thread request failed (${status})`);
  }
}

interface AtlasThreadClientBaseOptions {
  endpoint?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface CreateAtlasThreadOptions
  extends AtlasThreadClientBaseOptions {
  request: CreateAtlasThreadRequest;
}

export interface ListAtlasThreadsOptions
  extends AtlasThreadClientBaseOptions {
  query?: ListAtlasThreadsQuery;
}

export interface GetAtlasThreadOptions
  extends AtlasThreadClientBaseOptions {
  threadId: string;
}

export interface UpdateAtlasThreadOptions
  extends GetAtlasThreadOptions {
  request: UpdateAtlasThreadRequest;
}

export interface DeleteAtlasThreadOptions
  extends GetAtlasThreadOptions {
  rowVersion: string;
}

export interface ListAtlasThreadMessagesOptions
  extends GetAtlasThreadOptions {
  query?: ListAtlasThreadMessagesQuery;
}

export async function createAtlasThread({
  request,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: CreateAtlasThreadOptions): Promise<AtlasThreadResponse> {
  const payload = CreateAtlasThreadRequestSchema.parse(request);
  return requestJson(
    endpoint,
    AtlasThreadResponseSchema,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    },
    fetchImpl,
  );
}

export async function listAtlasThreads({
  query,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: ListAtlasThreadsOptions = {}): Promise<AtlasThreadListResponse> {
  const parsedQuery = ListAtlasThreadsQuerySchema.parse(query ?? {});
  return requestJson(
    withQuery(endpoint, parsedQuery),
    AtlasThreadListResponseSchema,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
    fetchImpl,
  );
}

export async function getAtlasThread({
  threadId,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: GetAtlasThreadOptions): Promise<AtlasThreadResponse> {
  return requestJson(
    threadUrl(endpoint, threadId),
    AtlasThreadResponseSchema,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
    fetchImpl,
  );
}

export async function updateAtlasThread({
  threadId,
  request,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: UpdateAtlasThreadOptions): Promise<AtlasThreadResponse> {
  const payload = UpdateAtlasThreadRequestSchema.parse(request);
  return requestJson(
    threadUrl(endpoint, threadId),
    AtlasThreadResponseSchema,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    },
    fetchImpl,
  );
}

export async function deleteAtlasThread({
  threadId,
  rowVersion,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: DeleteAtlasThreadOptions): Promise<void> {
  if (!/^[1-9][0-9]{0,18}$/.test(rowVersion)) {
    throw new Error("Atlas thread row version is invalid");
  }
  const response = await fetchImpl(threadUrl(endpoint, threadId), {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "If-Match": `"${rowVersion}"`,
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw threadRequestError(response.status);
}

export async function listAtlasThreadMessages({
  threadId,
  query,
  endpoint = DEFAULT_ATLAS_THREAD_BROWSER_ENDPOINT,
  signal,
  fetchImpl = fetch,
}: ListAtlasThreadMessagesOptions): Promise<AtlasThreadMessageListResponse> {
  const parsedQuery = ListAtlasThreadMessagesQuerySchema.parse(query ?? {});
  const response = await requestJson(
    withQuery(`${threadUrl(endpoint, threadId)}/messages`, parsedQuery),
    AtlasThreadMessageListResponseSchema,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
    fetchImpl,
  );
  if (response.items.some((message) => message.thread_id !== threadId)) {
    throw new Error(
      "Atlas thread messages response crossed the requested thread boundary",
    );
  }
  return response;
}

async function requestJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw threadRequestError(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Atlas thread endpoint returned invalid JSON");
  }
  try {
    return schema.parse(body);
  } catch {
    throw new Error("Atlas thread endpoint returned an unsupported contract");
  }
}

function threadUrl(endpoint: string, threadId: string): string {
  const parsed = zThreadId(threadId);
  return `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(parsed)}`;
}

function zThreadId(threadId: string): string {
  const parsed = threadId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(parsed)
  ) {
    throw new Error("Atlas thread ID is invalid");
  }
  return parsed;
}

function withQuery(
  endpoint: string,
  query: Record<string, string | number | undefined>,
): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  return serialized ? `${endpoint}?${serialized}` : endpoint;
}

function jsonHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function threadRequestError(status: number): Error {
  return new AtlasThreadRequestError(status);
}
