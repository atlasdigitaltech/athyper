// BFF route tests — GET /api/runtime/v1/entities/[entity]/[id]/process-state
// Thin handler: descriptor + capability + record-detail gates, then a single helper call.
import { describe, it, expect, beforeEach, vi } from "vitest";

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
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

import { GET } from "../route";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = { userId: "user-1" };

function descriptor(overrides: Partial<{ canRead: boolean }> = {}) {
  return {
    entityCode: "purchase_invoice",
    capabilities: { canRead: true, canCreate: true, canEdit: true, canDelete: true, isReadOnly: false, ...overrides },
  };
}

function params(entity = "purchase_invoice", id = "rec-1") {
  return { params: Promise.resolve({ entity, id }) };
}

describe("GET /api/runtime/v1/entities/[entity]/[id]/process-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("returns 401 before descriptor lookup when the session is missing", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 404 when descriptor is not registered", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("ENTITY_NOT_FOUND");
  });

  it("returns 403 when descriptor disallows read", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor({ canRead: false }) as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("READ_NOT_ALLOWED");
  });

  it("returns 404 when the record is not visible in the active scope", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor() as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValueOnce({
      state: { status: "unavailable", message: "out of scope" },
      record: null,
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("RECORD_NOT_FOUND");
  });

  it("returns the process state envelope on success", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor() as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValueOnce({
      state: { status: "available" },
      record: { id: "rec-1", status: "draft" },
    } as never);
    vi.mocked(getMetaEntityProcessRuntimeState).mockResolvedValueOnce({
      stage: "draft",
      transitions: ["submit", "cancel"],
    } as never);

    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processState).toMatchObject({ stage: "draft", transitions: ["submit", "cancel"] });
  });
});
