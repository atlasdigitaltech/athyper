import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/record-workspace-manifest", () => ({
  isRecordWorkspaceDiagnosticsAdministrator: vi.fn(),
  loadEffectiveRecordWorkspaceManifest: vi.fn(),
}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

import { GET } from "../route";
import {
  isRecordWorkspaceDiagnosticsAdministrator,
  loadEffectiveRecordWorkspaceManifest,
} from "@/lib/server/record-workspace-manifest";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = { userId: "admin-1" };

describe("GET workspace manifest diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(isRecordWorkspaceDiagnosticsAdministrator).mockReturnValue(true);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(isRecordWorkspaceDiagnosticsAdministrator).not.toHaveBeenCalled();
    expect(loadEffectiveRecordWorkspaceManifest).not.toHaveBeenCalled();
  });

  it("returns 403 before loading metadata for a non-administrator", async () => {
    vi.mocked(isRecordWorkspaceDiagnosticsAdministrator).mockReturnValueOnce(false);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("ADMIN_REQUIRED");
    expect(loadEffectiveRecordWorkspaceManifest).not.toHaveBeenCalled();
  });

  it("returns the effective manifest and exclusion diagnostics to an administrator", async () => {
    vi.mocked(loadEffectiveRecordWorkspaceManifest).mockResolvedValueOnce({
      ok: true,
      descriptor: {
        entityCode: "journal_entry",
        renderer: "document",
        capabilities: { hasWorkflow: true },
        recordWorkspace: { schemaVersion: "record-workspace/v1" },
      },
      resolution: {
        manifest: {
          schemaVersion: "record-workspace-manifest/v1",
          entityCode: "journal_entry",
          recordId: "record-1",
        },
        diagnostics: {
          invalidPermissionCodes: [],
          surfaceDecisions: [],
          resourceDecisions: [],
        },
      },
    } as never);

    const response = await GET(new Request("http://localhost"), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadEffectiveRecordWorkspaceManifest).toHaveBeenCalledWith("journal_entry", "record-1", SESSION);
    expect(body).toMatchObject({
      ok: true,
      entityCode: "journal_entry",
      renderer: "document",
      manifest: { schemaVersion: "record-workspace-manifest/v1" },
      diagnostics: { invalidPermissionCodes: [] },
    });
  });
});

function params() {
  return { params: Promise.resolve({ entity: "journal_entry", id: "record-1" }) };
}
