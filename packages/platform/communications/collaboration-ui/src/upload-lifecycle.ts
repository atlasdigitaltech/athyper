/** Browser upload policy shared by comment, record, version and request uploads. */
export function validateUploadFile(
  file: File,
  policy: { allowedContentTypes?: readonly string[]; maxFileBytes?: number },
): string {
  const contentType = file.type || "application/octet-stream";
  if (file.size < 1) throw new Error(`“${file.name}” is empty.`);
  if (policy.maxFileBytes !== undefined && file.size > policy.maxFileBytes)
    throw new Error(
      `“${file.name}” exceeds the maximum file size (${policy.maxFileBytes} bytes).`,
    );
  if (
    policy.allowedContentTypes &&
    !policy.allowedContentTypes.includes(contentType)
  )
    throw new Error(
      `“${file.name}” cannot be uploaded because its file type is unsupported. Allowed types: ${policy.allowedContentTypes.join(", ")}.`,
    );
  return contentType;
}

/** Validates a server-issued storage capability URL in every attachment path. */
export function attachmentCapabilityUrl(
  value: string,
  options: { readonly isolatedFromOrigin?: string } = {},
): URL {
  const target = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    target.hostname,
  );
  if (
    (target.protocol !== "https:" &&
      !(target.protocol === "http:" && loopback)) ||
    target.username ||
    target.password ||
    target.hash ||
    (options.isolatedFromOrigin && target.origin === options.isolatedFromOrigin)
  )
    throw new TypeError(
      options.isolatedFromOrigin
        ? "Preview requires an isolated HTTPS capability URL"
        : "Storage access requires an HTTPS capability URL",
    );
  return target;
}

export async function putAttachmentBytes(
  url: string,
  file: Blob,
  contentType: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<void> {
  const target = attachmentCapabilityUrl(url);
  const response = await request(target.href, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status}).`);
}

/** Resolve uncertain finalization before repeating any operation that writes bytes. */
export async function runAttachmentUpload(input: {
  file: File;
  contentType: string;
  retry?: boolean;
  signal?: AbortSignal;
  stage: () => Promise<{ attachmentId: string; uploadUrl: string }>;
  status: () => Promise<{ status: string } | undefined>;
  finalize: (signal: AbortSignal) => Promise<unknown>;
  request?: typeof fetch;
  onFinalizing?: () => void;
}): Promise<void> {
  input.signal?.throwIfAborted();
  if (input.retry && (await input.status())?.status === "active") return;
  const staged = await input.stage();
  await putAttachmentBytes(
    staged.uploadUrl,
    input.file,
    input.contentType,
    input.signal,
    input.request,
  );
  input.onFinalizing?.();
  const finalize = () =>
    input.finalize(
      input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    );
  try {
    await finalize();
  } catch (error) {
    input.signal?.throwIfAborted();
    const status =
      error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : undefined;
    if (status !== undefined && status < 500) throw error;
    // A failed status probe is an unknown outcome, not permission to restage.
    const outcome = await input.status();
    if (outcome?.status === "active") return;
    await finalize();
  }
}
