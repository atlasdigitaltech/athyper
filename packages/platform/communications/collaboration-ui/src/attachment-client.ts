import type { ClipboardImageUploader } from "./clipboard-converter";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AttachmentApiClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly csrfToken?: () => string | undefined;
  /** Optional resource coordinate used by the governed attachment lifecycle. Supply both values or neither. */
  readonly entityType?: string;
  readonly entityId?: string;
}
export interface AttachmentProblem { readonly type?: string; readonly title?: string; readonly status?: number; readonly detail?: string; readonly code?: string; }
export interface AttachmentProcessingStatus { readonly attachmentId: string; readonly status: string; readonly extractionStatus: string | null; readonly fileName?: string; readonly contentType?: string; readonly sizeBytes?: number; }
export interface AttachmentApiClient extends ClipboardImageUploader {
  upload(file: File, input: { readonly token: string; readonly signal?: AbortSignal }): Promise<{ readonly attachmentId: string }>;
  status(attachmentId: string, signal?: AbortSignal): Promise<AttachmentProcessingStatus>;
  remove(attachmentId: string, signal?: AbortSignal): Promise<void>;
}

export class AttachmentApiError extends Error {
  constructor(readonly status: number, readonly problem: AttachmentProblem, readonly retryAfter?: string) { super(problem.detail ?? problem.title ?? `Attachment request failed (${status})`); this.name = "AttachmentApiError"; }
}

/** Concrete browser adapter for services/attachments staged upload lifecycle. */
export function createAttachmentApiClient(options: AttachmentApiClientOptions = {}): AttachmentApiClient {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis); const base = (options.baseUrl ?? "/api/relay/attachments").replace(/\/$/, "");
  const coordinate = attachmentCoordinate(options);
  return {
    async upload(file, input) {
      const attachmentId = crypto.randomUUID();
      const staged = await json<{ attachmentId: string; uploadUrl: string }>(request, `${base}/stage`, {
        method: "POST", headers: headers(options, true), body: JSON.stringify({ attachmentId, fileName: file.name || "pasted-image", contentType: file.type || "application/octet-stream", sizeBytes: file.size, ...coordinate }), signal: input.signal,
      });
      if (!UUID.test(staged.attachmentId) || !staged.uploadUrl) throw new TypeError("Attachment stage response is invalid");
      const uploaded = await request(staged.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file, signal: input.signal });
      if (!uploaded.ok) throw await apiError(uploaded);
      await json(request, `${base}/${encodeURIComponent(staged.attachmentId)}/finalize`, { method: "POST", headers: headers(options, true), body: JSON.stringify({ contentType: file.type || "application/octet-stream" }), signal: input.signal });
      return { attachmentId: staged.attachmentId };
    },
    status: (attachmentId, signal) => {
      if (!UUID.test(attachmentId)) throw new TypeError("Attachment id is invalid");
      return json(request, `${base}/${encodeURIComponent(attachmentId)}/status`, { method: "GET", headers: headers(options, false), signal });
    },
    async remove(attachmentId, signal) {
      if (!UUID.test(attachmentId)) throw new TypeError("Attachment id is invalid");
      const response = await request(`${base}/${encodeURIComponent(attachmentId)}`, { method: "DELETE", headers: headers(options, false), signal });
      if (!response.ok) throw await apiError(response);
    },
  };
}

async function json<T = unknown>(request: typeof globalThis.fetch, url: string, init: RequestInit): Promise<T> { const response = await request(url, init); if (!response.ok) throw await apiError(response); return response.status === 204 ? undefined as T : response.json() as Promise<T>; }
async function apiError(response: Response): Promise<AttachmentApiError> { const contentType = response.headers.get("content-type") ?? ""; const problem = contentType.includes("json") ? await response.json().catch(() => ({})) as AttachmentProblem : { detail: await response.text().catch(() => "") }; return new AttachmentApiError(response.status, problem, response.headers.get("retry-after") ?? undefined); }
function headers(options: AttachmentApiClientOptions, jsonBody: boolean): HeadersInit { const csrf = options.csrfToken?.() ?? browserCsrf(); return { ...(jsonBody ? { "Content-Type": "application/json" } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) }; }
function attachmentCoordinate(options: AttachmentApiClientOptions): { readonly entityType?: string; readonly entityId?: string } { if (!options.entityType && !options.entityId) return {}; if (!options.entityType || !options.entityId) throw new TypeError("Attachment entityType and entityId must be provided together"); return { entityType: options.entityType, entityId: options.entityId }; }
function browserCsrf(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
  if (meta) return meta;
  const cookies = new Map(document.cookie.split(";").map((part) => {
    const [name, ...value] = part.trim().split("=");
    return [name, value.join("=")] as const;
  }));
  for (const name of ["__Host-athyper-csrf", "athyper-csrf", "XSRF-TOKEN"]) {
    const value = cookies.get(name);
    if (value) return decodeURIComponent(value);
  }
  return undefined;
}
