/** Refuse partial JSON and oversized diagnostic bodies; never await potentially stuck cancellation. */
export async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes)
      throw new Error(`Meilisearch response exceeds ${maxBytes} bytes`);
    for (;;) {
      const { done, value } = await read();
      if (done) break;
      if (value.byteLength > maxBytes - total)
        throw new Error(`Meilisearch response exceeds ${maxBytes} bytes`);
      if (value.byteLength) chunks.push(Buffer.from(value));
      total += value.byteLength;
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    cancel();
    reader.releaseLock();
  }

  function read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => {
        cleanup();
        cancel();
        reject(signal.reason ?? new Error("Meilisearch response cancelled"));
      };
      const cleanup = () => signal.removeEventListener("abort", abort);
      signal.addEventListener("abort", abort, { once: true });
      reader.read().then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }
}
