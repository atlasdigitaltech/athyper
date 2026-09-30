import type { ObjectStorage } from "@athyper/server-contract-object-storage";

/** Buffer only after enforcing the actual-byte limit, with cancellation covering open and read. */
export async function downloadForExtraction(
  storage: ObjectStorage,
  key: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (!storage.getStream)
    throw new Error("Document extraction requires streaming object storage");
  const opening = () =>
    storage.getStream!(key, { signal }).then((stream) => {
      if (signal.aborted) {
        dispose(stream);
        signal.throwIfAborted();
      }
      return stream;
    });
  const stream = await interrupted(opening, signal);
  const iterator = stream[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await interrupted(() => iterator.next(), signal);
      if (next.done) break;
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array))
        throw new Error("Object storage returned non-binary content");
      if (chunk.byteLength > maxBytes - total)
        throw new Error("Downloaded attachment exceeds extraction limit");
      if (chunk.byteLength) chunks.push(Buffer.from(chunk));
      total += chunk.byteLength;
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, total);
  } finally {
    dispose(stream, iterator);
  }
}

function dispose(
  stream: AsyncIterable<Uint8Array>,
  iterator?: AsyncIterator<Uint8Array>,
): void {
  try {
    (stream as { destroy?: () => void }).destroy?.();
  } catch {
    /* best-effort teardown */
  }
  try {
    const result = (iterator ?? stream[Symbol.asyncIterator]()).return?.();
    if (result) void Promise.resolve(result).catch(() => undefined);
  } catch {
    /* cleanup must not mask the scan or block cancellation */
  }
}

function interrupted<T>(
  start: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new Error("Extraction download cancelled"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    try {
      start().then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
