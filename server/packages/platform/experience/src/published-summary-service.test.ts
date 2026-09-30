import { describe, expect, it, vi } from "vitest";
import { createPublishedSummaryService } from "./published-summary-service.js";
import { readCompiledRuntimeContract } from "@athyper/server-platform-metadata";
vi.mock("@athyper/server-platform-metadata", () => ({
  readCompiledRuntimeContract: vi.fn(),
}));

function fixture() {
  const context = {
    tenantId: "tenant",
    principalId: "actor",
    planeKey: "neon",
  } as any;
  const input = { context, entityCode: "example", recordId: "record" };
  const release = {
    coordinate: { ...context, entityCode: "example" },
    artifactIndex: new Map([["example/runtime", {}]]),
    release: { releaseId: "signed", releaseHash: "hash" },
  } as any;
  const cards = ["allowed", "denied", "missing"].map((key) => ({
    key,
    label: key,
    provider: key,
    rendererKey: "platform.fields.v1",
  }));
  const descriptor = {
    releaseId: "publication",
    storage: { idField: "id" },
    recordPresentation: {
      titleField: "name",
      contextFields: [],
      summaryView: { schemaVersion: 1, cards },
    },
  };
  vi.mocked(readCompiledRuntimeContract).mockResolvedValue(descriptor as any);
  const allowed = {
    authorize: vi.fn(async () => true),
    read: vi.fn(async () => ({ value: "authorized" })),
  };
  const denied = { authorize: vi.fn(async () => false), read: vi.fn() };
  const readHeader = vi.fn(async () => ({
    revision: "revision",
    values: { id: "record", name: "Example", secret: "never project" },
  }));
  const service = createPublishedSummaryService({
    reader: {
      resolve: vi.fn(async () => release),
      core: vi.fn(async () => ({ entityCode: "example" })),
    } as any,
    headers: { readHeader },
    providers: {
      get: (key) =>
        key === "allowed" ? allowed : key === "denied" ? denied : undefined,
    },
  });
  return { input, release, descriptor, allowed, denied, readHeader, service };
}
describe("signed runtime summary providers", () => {
  it("only describes authorized registered cards, without eagerly loading them", async () => {
    const f = fixture();
    expect(
      await f.service.describe({ ...f.input, releaseId: "publication" }),
    ).toMatchObject({ cards: [{ key: "allowed" }] });
    expect(f.allowed.read).not.toHaveBeenCalled();
    expect(f.denied.read).not.toHaveBeenCalled();
  });
  it("rechecks authorization and preserves the pinned response coordinate", async () => {
    const f = fixture();
    expect(await f.service.read(f.input, f.release)).toMatchObject({
      releaseId: "signed",
      releaseHash: "hash",
      revision: "revision",
      cards: [{ key: "allowed", state: "ready" }],
    });
    f.allowed.authorize.mockResolvedValue(false);
    expect(await f.service.read(f.input, f.release)).toBeNull();
    expect(f.allowed.read).toHaveBeenCalledOnce();
  });
  it("rejects cross-tenant pinned releases before reading records", async () => {
    const f = fixture();
    f.release.coordinate.tenantId = "other";
    await expect(f.service.read(f.input, f.release)).rejects.toThrow(
      "SCOPE_MISMATCH",
    );
    expect(f.readHeader).not.toHaveBeenCalled();
  });
  it("omits summaries when parent admission fails or descriptor release changes", async () => {
    const f = fixture();
    expect(
      await f.service.describe({ ...f.input, releaseId: "stale" }),
    ).toBeUndefined();
    f.readHeader.mockResolvedValue(null as any);
    expect(await f.service.read(f.input, f.release)).toBeNull();
    expect(f.allowed.read).not.toHaveBeenCalled();
  });
  it("isolates provider failures without leaking exceptions", async () => {
    const f = fixture();
    f.allowed.read.mockRejectedValue(Error("secret failure"));
    expect(await f.service.read(f.input, f.release)).toMatchObject({
      cards: [{ key: "allowed", state: "unavailable" }],
    });
  });
  it("only runs the generic identity provider when explicitly declared and projects no extra values", async () => {
    const f = fixture();
    f.descriptor.recordPresentation.summaryView.cards = [
      {
        key: "identity",
        label: "Identity",
        provider: "platform.record.identity.v1",
        rendererKey: "platform.fields.v1",
      },
    ];
    const result = await f.service.read(f.input, f.release);
    expect(result?.cards[0]).toMatchObject({
      state: "ready",
      data: { value: { name: "Example" } },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
