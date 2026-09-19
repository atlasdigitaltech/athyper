import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import { downloadForExtraction } from "../bounded-download.js";

function storage(
  getStream: NonNullable<ObjectStorage["getStream"]>,
): ObjectStorage {
  return {
    getStream,
    get: vi.fn(async () => {
      throw new Error("Unbounded read must not run");
    }),
    put: async () => {},
    delete: async () => {},
    exists: async () => true,
    createDownloadUrl: async () => "",
    createUploadUrl: async () => "",
    copy: async () => {},
  };
}

describe("bounded extraction download", () => {
  it("accepts the exact limit across binary chunks and propagates the signal", async () => {
    const signal = new AbortController().signal;
    const getStream = vi.fn(async () =>
      Readable.from([Buffer.from([0, 255]), Buffer.from([1, 2])]),
    );
    expect(
      await downloadForExtraction(storage(getStream), "object", 4, signal),
    ).toEqual(Buffer.from([0, 255, 1, 2]));
    expect(getStream).toHaveBeenCalledWith("object", { signal });
  });
  it("stops at the first oversized chunk and cleans up", async () => {
    let reads = 0;
    let closed = false;
    async function* source() {
      try {
        reads++;
        yield Buffer.alloc(3);
        reads++;
        yield Buffer.alloc(2);
        reads++;
        yield Buffer.alloc(999);
      } finally {
        closed = true;
      }
    }
    await expect(
      downloadForExtraction(
        storage(async () => source()),
        "object",
        4,
        new AbortController().signal,
      ),
    ).rejects.toThrow("exceeds extraction limit");
    expect(reads).toBe(2);
    expect(closed).toBe(true);
  });
  it("cancels a stalled iterator without waiting for hanging cleanup", async () => {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const cleanup = vi.fn(
      () => new Promise<IteratorResult<Uint8Array>>(() => {}),
    );
    const source = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          started();
          return new Promise<IteratorResult<Uint8Array>>(() => {});
        },
        return: cleanup,
      }),
    };
    const controller = new AbortController();
    const pending = downloadForExtraction(
      storage(async () => source),
      "object",
      4,
      controller.signal,
    );
    await reading;
    controller.abort(new Error("job cancelled"));
    await expect(pending).rejects.toThrow("job cancelled");
    expect(cleanup).toHaveBeenCalled();
  });
  it("settles cancellation during opening and disposes a late stream", async () => {
    let ready!: (stream: AsyncIterable<Uint8Array>) => void;
    const getStream = vi.fn(
      () =>
        new Promise<AsyncIterable<Uint8Array>>((resolve) => {
          ready = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = downloadForExtraction(
      storage(getStream),
      "object",
      4,
      controller.signal,
    );
    controller.abort(new Error("cancelled opening"));
    await expect(pending).rejects.toThrow("cancelled opening");
    const source = Readable.from([Buffer.alloc(1)]);
    ready(source);
    await vi.waitFor(() => expect(source.destroyed).toBe(true));
  });
  it("does not open storage for pre-cancelled work", async () => {
    const getStream = vi.fn(async () => Readable.from([]));
    await expect(
      downloadForExtraction(
        storage(getStream),
        "object",
        4,
        AbortSignal.abort(new Error("cancelled")),
      ),
    ).rejects.toThrow("cancelled");
    expect(getStream).not.toHaveBeenCalled();
  });
  it("requires streaming support", async () => {
    const backing = storage(async () => Readable.from([]));
    delete backing.getStream;
    await expect(
      downloadForExtraction(backing, "object", 4, new AbortController().signal),
    ).rejects.toThrow("requires streaming");
  });
});
