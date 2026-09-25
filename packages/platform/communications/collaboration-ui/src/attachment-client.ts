import { runAttachmentUpload, validateUploadFile } from "./upload-lifecycle";
import type { ClipboardImageUploader } from "./clipboard-converter";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AttachmentApiClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly csrfToken?: () => string | undefined;
  /** Optional resource coordinate used by the governed attachment lifecycle. Supply both values or neither. */
  readonly entityType?: string;
  readonly entityId?: string;
  /** A principal-scoped comment draft. Required for a draft image upload. */
  readonly draftId?: string;
  /** Supplies a stable UUID in tests or when a caller persists its upload intent. */
  readonly createAttachmentId?: () => string;
}
export interface AttachmentProblem {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}
export interface AttachmentProcessingStatus {
  readonly attachmentId: string;
  readonly status: string;
  readonly extractionStatus: string | null;
  readonly fileName?: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
}
export interface AttachmentApiClient extends ClipboardImageUploader {
  upload(
    file: File,
    input: { readonly token: string; readonly signal?: AbortSignal },
  ): Promise<{ readonly attachmentId: string }>;
  status(
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<AttachmentProcessingStatus>;
  remove(attachmentId: string, signal?: AbortSignal): Promise<void>;
}

export class AttachmentApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: AttachmentProblem,
    readonly retryAfter?: string,
  ) {
    super(
      problem.detail ??
        problem.title ??
        `Attachment request failed (${status})`,
    );
    this.name = "AttachmentApiError";
  }
}

/** Concrete browser adapter for services/attachments staged upload lifecycle. */
export function createAttachmentApiClient(
  options: AttachmentApiClientOptions = {},
): AttachmentApiClient {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = (options.baseUrl ?? "/api/relay/attachments").replace(/\/$/, "");
  const coordinate = attachmentCoordinate(options);
  const idsByToken = new Map<string, string>();
  return {
    async upload(file, input) {
      const retry = idsByToken.has(input.token);
      const attachmentId = stableAttachmentId(idsByToken, input.token, options);
      const contentType = validateUploadFile(file, {});
      await runAttachmentUpload({
        file,
        contentType,
        retry,
        signal: input.signal,
        request,
        status: () =>
          json<AttachmentProcessingStatus>(
            request,
            `${base}/${encodeURIComponent(attachmentId)}/status`,
            {
              method: "GET",
              headers: headers(options, false),
              signal: input.signal,
            },
          ).catch((error) => {
            if (error instanceof AttachmentApiError && error.status === 404)
              return undefined;
            throw error;
          }),
        stage: async () => {
          const staged = await json<{
            attachmentId: string;
            uploadUrl: string;
          }>(request, `${base}/stage`, {
            method: "POST",
            headers: headers(options, true, attachmentId),
            body: JSON.stringify({
              attachmentId,
              fileName: file.name || "pasted-image",
              contentType,
              sizeBytes: file.size,
              ...coordinate,
              ...(options.draftId ? { draftId: options.draftId } : {}),
            }),
            signal: input.signal,
          });
          if (staged.attachmentId !== attachmentId || !staged.uploadUrl)
            throw new TypeError("Attachment stage response is invalid");
          return staged;
        },
        finalize: (signal) =>
          json(
            request,
            `${base}/${encodeURIComponent(attachmentId)}/finalize`,
            {
              method: "POST",
              headers: headers(options, true, attachmentId),
              body: JSON.stringify({ contentType }),
              signal,
            },
          ),
      });
      return { attachmentId };
    },
    status: (attachmentId, signal) => {
      if (!UUID.test(attachmentId))
        throw new TypeError("Attachment id is invalid");
      return json(
        request,
        `${base}/${encodeURIComponent(attachmentId)}/status`,
        { method: "GET", headers: headers(options, false), signal },
      );
    },
    async remove(attachmentId, signal) {
      if (!UUID.test(attachmentId))
        throw new TypeError("Attachment id is invalid");
      const response = await request(
        `${base}/${encodeURIComponent(attachmentId)}`,
        {
          method: "DELETE",
          headers: headers(options, false, `unlink:${attachmentId}`),
          signal,
        },
      );
      if (!response.ok) throw await apiError(response);
    },
  };
}

function stableAttachmentId(
  ids: Map<string, string>,
  token: string,
  options: AttachmentApiClientOptions,
): string {
  const existing = ids.get(token);
  if (existing) return existing;
  const created = options.createAttachmentId?.() ?? crypto.randomUUID();
  if (!UUID.test(created))
    throw new TypeError("Attachment id factory returned an invalid UUID");
  ids.set(token, created);
  return created;
}
async function json<T = unknown>(
  request: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await request(url, init);
  if (!response.ok) throw await apiError(response);
  if (response.status === 204) return undefined as T;
  if (!(response.headers.get("content-type") ?? "").includes("json"))
    throw new TypeError(
      "Attachment service returned an unexpected non-JSON response",
    );
  return response.json() as Promise<T>;
}
async function apiError(response: Response): Promise<AttachmentApiError> {
  const contentType = response.headers.get("content-type") ?? "";
  const problem = contentType.includes("json")
    ? ((await response.json().catch(() => ({}))) as AttachmentProblem)
    : { detail: await response.text().catch(() => "") };
  return new AttachmentApiError(
    response.status,
    problem,
    response.headers.get("retry-after") ?? undefined,
  );
}
function headers(
  options: AttachmentApiClientOptions,
  jsonBody: boolean,
  idempotencyKey?: string,
): HeadersInit {
  const csrf = options.csrfToken?.() ?? browserCsrf();
  return {
    ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}
function attachmentCoordinate(options: AttachmentApiClientOptions): {
  readonly entityType?: string;
  readonly entityId?: string;
} {
  if (!options.entityType && !options.entityId) return {};
  if (!options.entityType || !options.entityId)
    throw new TypeError(
      "Attachment entityType and entityId must be provided together",
    );
  return { entityType: options.entityType, entityId: options.entityId };
}
function browserCsrf(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  )?.content;
  if (meta) return meta;
  const cookies = new Map(
    document.cookie.split(";").map((part) => {
      const [name, ...value] = part.trim().split("=");
      return [name, value.join("=")] as const;
    }),
  );
  for (const name of ["__Host-athyper-csrf", "athyper-csrf", "XSRF-TOKEN"]) {
    const value = cookies.get(name);
    if (value) return decodeURIComponent(value);
  }
  return undefined;
}
