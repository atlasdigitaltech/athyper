import { describe, expect, it } from "vitest";
import {
  buildRecordWorkspaceObservabilitySnapshot,
  classifyRecordWorkspaceRequest,
  type RecordWorkspaceObservedRequest,
} from "./record-workspace-observability";

describe("record workspace observability", () => {
  it("classifies comment enrichment without exposing comment identifiers", () => {
    const result = classifyRecordWorkspaceRequest({
      url: "https://neon.athyper.local/api/collab/comments/019f7440-70d0-7596-bb59-1104493511a6/attachments",
      entityCode: "journal_entry",
      recordIds: ["record-1"],
    });

    expect(result).toMatchObject({
      resource: "comments",
      familyKey: "comments.item.attachments",
    });
    expect(result?.requestKey).not.toContain("019f7440");
    expect(result?.instanceKey).toHaveLength(8);
  });

  it("reports exact duplicates separately from N+1 request families", () => {
    const requests: RecordWorkspaceObservedRequest[] = [
      request("comments.item.attachments.aaaa", "comments.item.attachments", "aaaa", 10),
      request("comments.item.attachments.bbbb", "comments.item.attachments", "bbbb", 12),
      request("comments.item.reactions.aaaa", "comments.item.reactions", "aaaa", 6),
      request("comments.item.reactions.aaaa", "comments.item.reactions", "aaaa", 8),
    ];

    const snapshot = buildRecordWorkspaceObservabilitySnapshot({
      entityCode: "journal_entry",
      renderer: "document",
      recordId: "record-1",
      observedAtMs: 100,
      requests,
    });

    expect(snapshot.duplicates).toEqual([
      expect.objectContaining({ requestKey: "comments.item.reactions.aaaa", calls: 2 }),
    ]);
    expect(snapshot.nPlusOne).toEqual([
      expect.objectContaining({
        familyKey: "comments.item.attachments",
        calls: 2,
        distinctInstances: 2,
      }),
    ]);
    expect(snapshot.totals).toMatchObject({ calls: 4, duplicateCalls: 1, nPlusOneCalls: 2 });
  });

  it("does not attribute another record's comments to the active workspace", () => {
    const result = classifyRecordWorkspaceRequest({
      url: "https://neon.athyper.local/api/collab/comments?entity_id=record-2",
      entityCode: "journal_entry",
      recordIds: ["record-1"],
    });

    expect(result).toBeNull();
  });

  it("keeps legitimate lifecycle and snapshot resources distinct", () => {
    const lifecycle = classifyRecordWorkspaceRequest({
      url: "https://neon.athyper.local/api/runtime/v1/entities/journal_entry/record-1/versions",
      entityCode: "journal_entry",
      recordIds: ["record-1"],
    });
    const snapshots = classifyRecordWorkspaceRequest({
      url: "https://neon.athyper.local/api/runtime/v1/entities/journal_entry/record-1/snapshots",
      entityCode: "journal_entry",
      recordIds: ["record-1"],
    });

    expect(lifecycle?.resource).toBe("lifecycle");
    expect(snapshots?.resource).toBe("versions");
  });
});

function request(
  requestKey: string,
  familyKey: string,
  instanceKey: string,
  durationMs: number,
): RecordWorkspaceObservedRequest {
  return {
    resource: "comments",
    surface: "comments",
    requestKey,
    familyKey,
    instanceKey,
    startedAtMs: 1,
    durationMs,
    transferBytes: 100,
    encodedBodyBytes: 80,
    decodedBodyBytes: 120,
    initiatorType: "fetch",
  };
}
