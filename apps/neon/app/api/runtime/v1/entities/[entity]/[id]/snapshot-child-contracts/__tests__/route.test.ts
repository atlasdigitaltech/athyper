import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-records", () => ({
  getMetaEntityRecordDetail: vi.fn(),
  normalizeRouteRecordId: (id: string) => id,
}));
vi.mock("@/lib/server/meta-entity-process-state", () => ({
  getMetaEntityProcessRuntimeState: vi.fn(),
}));
vi.mock("@/lib/server/record-workspace-manifest", () => ({
  resolveEffectiveRecordWorkspaceManifestFromLoaded: vi.fn(),
}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/snapshot-child-contracts", () => ({
  loadSnapshotChildContracts: vi.fn(),
}));

import { GET } from "../route";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { resolveEffectiveRecordWorkspaceManifestFromLoaded } from "@/lib/server/record-workspace-manifest";
import { getNeonServerSession } from "@/lib/server/session";
import { loadSnapshotChildContracts } from "@/lib/server/snapshot-child-contracts";

const descriptor = {
  entityCode: "purchase_invoice",
  capabilities: { canRead: true },
};
const record = { id: "record-1", status: "draft" };
const routeParams = {
  params: Promise.resolve({ entity: "purchase_invoice", id: "record-1" }),
};

describe("GET snapshot child contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue({ userId: "user-1" } as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "ready" },
      record,
    } as never);
    vi.mocked(getMetaEntityProcessRuntimeState).mockResolvedValue(null);
  });

  it("does not resolve descriptors without an authenticated session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const response = await GET(new Request("http://localhost"), routeParams);
    expect(response.status).toBe(401);
    expect(loadSnapshotChildContracts).not.toHaveBeenCalled();
  });

  it("does not resolve descriptors when snapshots are absent from the effective manifest", async () => {
    vi.mocked(resolveEffectiveRecordWorkspaceManifestFromLoaded).mockReturnValue({
      manifest: { resources: [] },
    } as never);
    const response = await GET(new Request("http://localhost"), routeParams);
    expect(response.status).toBe(404);
    expect(loadSnapshotChildContracts).not.toHaveBeenCalled();
  });

  it("resolves descriptors on first authorized Versions intent", async () => {
    vi.mocked(resolveEffectiveRecordWorkspaceManifestFromLoaded).mockReturnValue({
      manifest: { resources: [{ key: "snapshots" }] },
    } as never);
    vi.mocked(loadSnapshotChildContracts).mockResolvedValue({
      lines: { entityCode: "purchase_invoice_line" },
    } as never);

    const response = await GET(new Request("http://localhost"), routeParams);
    expect(response.status).toBe(200);
    expect(loadSnapshotChildContracts).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { lines: { entityCode: "purchase_invoice_line" } },
    });
  });
});
