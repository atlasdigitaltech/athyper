/** Upload bytes to a server-issued storage capability, without forwarding BFF credentials. */
export async function uploadSignedObject(
  input: {
    readonly url: string;
    readonly body: Blob;
    readonly contentType: string;
    readonly signal?: AbortSignal;
  },
  transport: typeof fetch = globalThis.fetch,
): Promise<void> {
  const url = new URL(input.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new TypeError(
      "Storage upload requires an HTTPS capability URL (HTTP is allowed only on loopback).",
    );
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  const response = await transport(url.href, {
    method: "PUT",
    headers: { "content-type": input.contentType },
    body: input.body,
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok)
    throw new Error(`Evidence upload failed (${response.status}).`);
}
