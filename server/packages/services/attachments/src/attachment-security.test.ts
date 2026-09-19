import type { MalwareScanResult } from "@athyper/server-contract-malware-scanning";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createAttachmentLifecycle,
  type AttachmentRecord,
} from "./attachment-lifecycle.js";

const identity = {
  planeKey: "neon" as const,
  tenantId: "11111111-1111-4111-8111-111111111111",
  attachmentId: "22222222-2222-4222-8222-222222222222",
  principalId: "33333333-3333-4333-8333-333333333333",
};
const intent = {
  ...identity,
  fileName: "invoice.pdf",
  contentType: "application/pdf",
  sizeBytes: 4,
};
function fixture(overrides: Partial<AttachmentRecord> = {}) {
  let record: AttachmentRecord | null = {
    id: identity.attachmentId,
    status: "uploading",
    storageKey: "quarantine/source",
    fileName: intent.fileName,
    contentType: intent.contentType,
    sizeBytes: 4,
    isCurrent: false,
    isActive: true,
    hasLegalHold: false,
    expiresAt: "2026-09-06T00:01:00Z",
    ...overrides,
  };
  const objects = new Map<string, Uint8Array>([
    ["quarantine/source", new TextEncoder().encode("safe")],
  ]);
  const repository = {
    load: vi.fn(async () => record),
    createStaged: vi.fn(async () => record!),
    finalizeClean: vi.fn(
      async (
        _id: unknown,
        input: {
          storageKey: string;
          sha256: string;
          sizeBytes: number;
          contentType: string;
        },
      ) =>
        (record = {
          ...record!,
          ...input,
          status: "active",
          expiresAt: undefined,
        }),
    ),
    quarantine: vi.fn(async () => {
      record = { ...record!, status: "quarantined", isActive: false };
    }),
    deactivate: vi.fn(async () => {
      record = { ...record!, status: "deleted", isActive: false };
    }),
    expire: vi.fn(async () => undefined),
    markPurged: vi.fn(async () => undefined),
  };
  const storage = {
    get: async (key: string) => objects.get(key)!,
    getStream: async (key: string) =>
      (async function* () {
        yield objects.get(key)!;
      })(),
    put: async () => undefined,
    copy: vi.fn(async (source: string, destination: string) => {
      objects.set(destination, objects.get(source)!.slice());
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    exists: async () => true,
    createUploadUrl: vi.fn(async () => "https://upload.test"),
    createDownloadUrl: vi.fn(async () => "https://download.test"),
  };
  const scanner = {
    scan: vi.fn(
      async ({
        content,
      }: {
        content: AsyncIterable<Uint8Array>;
      }): Promise<MalwareScanResult> => {
        for await (const _chunk of content) {
          /* consume */
        }
        return {
          status: "clean" as const,
          scanner: "test",
          scannedAt: "2026-09-06T00:00:00Z",
          durationMs: 1,
        };
      },
    ),
  };
  const quota = {
    reserve: vi.fn(async () => "created" as const),
    commit: vi.fn(async () => undefined),
    release: vi.fn(async () => false),
    expire: async () => [],
  };
  const append = vi.fn(async () => undefined);
  const lifecycle = createAttachmentLifecycle({
    transactions: { run: async (_plane, _actor, work) => work({}) },
    repository,
    storage,
    scanner,
    quota,
    quotaPolicies: {
      resolve: async () => ({
        kind: "attachment.storage",
        limitBytes: 1000,
        limitItems: 10,
        reservationTtlSeconds: 60,
        retryAfterSeconds: 60,
      }),
    },
    outbox: { append },
    now: () => new Date("2026-09-06T00:00:00Z"),
  });
  return {
    lifecycle,
    repository,
    storage,
    scanner,
    quota,
    append,
    objects,
    setRecord: (value: AttachmentRecord | null) => {
      record = value;
    },
    getRecord: () => record!,
  };
}

describe("attachment lifecycle security regressions", () => {
  it.each(["active", "deleted", "quarantined", "expired"] as const)(
    "does not issue an upload URL for %s records",
    async (status) => {
      const f = fixture({ status });
      await expect(f.lifecycle.stage(intent)).rejects.toThrow(
        "not awaiting upload",
      );
      expect(f.storage.createUploadUrl).not.toHaveBeenCalled();
    },
  );
  it("rejects expired stages and finalizations", async () => {
    const f = fixture({ expiresAt: "2026-09-05T00:00:00Z" });
    await expect(f.lifecycle.stage(intent)).rejects.toThrow("expired");
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("expired");
    expect(f.storage.copy).not.toHaveBeenCalled();
  });
  it("rejects changed retry metadata and limits upload URLs to reservation lifetime", async () => {
    const f = fixture();
    await expect(
      f.lifecycle.stage({ ...intent, sizeBytes: 5 }),
    ).rejects.toThrow("parameters");
    await expect(
      f.lifecycle.stage({
        ...intent,
        entityType: "atlas.prompt",
        entityId: "other",
      }),
    ).rejects.toThrow("parameters");
    await expect(f.lifecycle.stage(intent)).resolves.toMatchObject({
      expiresAt: "2026-09-06T00:01:00.000Z",
    });
    expect(f.storage.createUploadUrl).toHaveBeenCalledWith(
      "quarantine/source",
      60,
    );
  });
  it("rejects deletion of an absent or unowned attachment before mutation or quota release", async () => {
    const f = fixture();
    f.setRecord(null);
    await expect(f.lifecycle.deactivate(identity)).rejects.toThrow("not found");
    expect(f.repository.deactivate).not.toHaveBeenCalled();
    expect(f.quota.release).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });
  it.each(["", "too large"])(
    "rejects actual size mismatch (%s)",
    async (bytes) => {
      const f = fixture();
      f.objects.set("quarantine/source", new TextEncoder().encode(bytes));
      await expect(
        f.lifecycle.finalize(identity, intent.contentType),
      ).rejects.toThrow(/size/);
      expect(f.quota.commit).not.toHaveBeenCalled();
      expect([...f.objects.keys()]).toEqual(["quarantine/source"]);
    },
  );
  it("rejects content type changes before scanning", async () => {
    const f = fixture();
    await expect(f.lifecycle.finalize(identity, "text/html")).rejects.toThrow(
      "Content type",
    );
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });
  it("promotes exactly the scanned snapshot despite overwrite of the upload key", async () => {
    const f = fixture();
    const scan = f.scanner.scan.getMockImplementation()!;
    f.scanner.scan.mockImplementation(async (input) => {
      f.objects.set("quarantine/source", new TextEncoder().encode("evil"));
      return scan(input);
    });
    const result = await f.lifecycle.finalize(identity, intent.contentType);
    expect(new TextDecoder().decode(f.objects.get(result.storageKey))).toBe(
      "safe",
    );
    expect(result.sha256).toBe(
      createHash("sha256").update("safe").digest("hex"),
    );
    expect(f.scanner.scan).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "invoice.pdf" }),
    );
  });
  it("does not reactivate an attachment deleted while scanning", async () => {
    const f = fixture();
    const scan = f.scanner.scan.getMockImplementation()!;
    f.scanner.scan.mockImplementation(async (input) => {
      const result = await scan(input);
      await f.lifecycle.deactivate(identity);
      return result;
    });
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("not awaiting upload");
    expect(f.quota.commit).not.toHaveBeenCalled();
    expect([...f.objects.keys()]).toEqual(["quarantine/source"]);
  });
  it("keeps a concurrent finalizer's object and does not commit twice", async () => {
    const f = fixture();
    const scan = f.scanner.scan.getMockImplementation()!;
    f.scanner.scan.mockImplementation(async (input) => {
      const result = await scan(input);
      f.objects.set("attachments/winner", new TextEncoder().encode("safe"));
      f.setRecord({
        ...f.getRecord(),
        status: "active",
        storageKey: "attachments/winner",
        sha256: "a".repeat(64),
      });
      return result;
    });
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).resolves.toMatchObject({ storageKey: "attachments/winner" });
    expect(f.objects.has("attachments/winner")).toBe(true);
    expect(f.quota.commit).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });
  it("quarantines malware even when detection does not consume the full stream", async () => {
    const f = fixture();
    f.scanner.scan.mockResolvedValue({
      status: "infected",
      threatNames: ["test"],
      scanner: "test",
      scannedAt: "2026-09-06T00:00:00Z",
      durationMs: 1,
    });
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("quarantined");
    expect(f.repository.quarantine).toHaveBeenCalledOnce();
    expect(f.quota.release).toHaveBeenCalledOnce();
    expect(f.quota.commit).not.toHaveBeenCalled();
    expect([...f.objects.keys()]).toEqual(["quarantine/source"]);
  });
  it("fails closed when scanning fails and keeps the upload retryable", async () => {
    const f = fixture();
    f.scanner.scan.mockRejectedValue(new Error("scanner offline"));
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("scanner offline");
    expect(f.quota.commit).not.toHaveBeenCalled();
    expect(f.getRecord().status).toBe("uploading");
    expect([...f.objects.keys()]).toEqual(["quarantine/source"]);
  });
  it("rejects a clean verdict without complete stream consumption", async () => {
    const f = fixture();
    f.scanner.scan.mockResolvedValue({
      status: "clean",
      scanner: "test",
      scannedAt: "2026-09-06T00:00:00Z",
      durationMs: 1,
    });
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("complete object stream");
    expect(f.quota.commit).not.toHaveBeenCalled();
  });
  it("returns a conflict when upload bytes have not arrived", async () => {
    const f = fixture();
    f.storage.exists = async () => false;
    await expect(
      f.lifecycle.finalize(identity, intent.contentType),
    ).rejects.toThrow("upload is not available");
    expect(f.storage.copy).not.toHaveBeenCalled();
  });
  it("caps download URLs to the attachment expiration", async () => {
    const f = fixture({
      status: "active",
      sha256: "a".repeat(64),
      expiresAt: "2026-09-06T00:00:10Z",
    });
    await expect(
      f.lifecycle.createAuthorizedDownload(identity, 300),
    ).resolves.toMatchObject({ expiresAt: "2026-09-06T00:00:10.000Z" });
    expect(f.storage.createDownloadUrl).toHaveBeenCalledWith(
      "quarantine/source",
      10,
    );
  });
});
