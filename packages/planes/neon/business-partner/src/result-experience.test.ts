import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MaterializationProof } from "./client";
import { MaterializationResultProof } from "./result-experience";

const proof = {
  schema: "athyper.business-partner-materialization-proof/1",
  materializationId: "materialization-1", attemptNo: 1, status: "succeeded", resultCode: "BUSINESS_PARTNER_CREATED",
  sourceSnapshot: { snapshotId: "source-1", entityType: "business_partner_case", entityId: "case-1", version: 4, payloadHash: "a".repeat(64), capturedAt: "2026-09-04T00:00:00Z" },
  resultSnapshot: { snapshotId: "result-1", entityType: "business_partner", entityId: "partner-1", version: 1, payloadHash: "b".repeat(64), capturedAt: "2026-09-04T01:00:00Z" },
  materializer: { code: "neon.internal_business_partner", version: "1" }, applicationFingerprint: "c".repeat(64), completedAt: "2026-09-04T01:00:00Z", completedBy: "principal-1",
  result: { businessPartnerId: "partner-1", partnerRole: "supplier", roleId: "supplier-1", operatingOrganizationAssignmentId: "assignment-1" },
  lineage: [{ lineageId: "lineage-1", sourceSnapshotId: "source-1", targetSnapshotId: "result-1", role: "materialized_from", targetAuthorityType: "master.business_partner", targetAuthorityId: "partner-1", transformationCode: "neon.internal_business_partner", transformationVersion: "1", evidenceHash: "d".repeat(64), createdAt: "2026-09-04T01:00:00Z" }],
} as const satisfies MaterializationProof;

describe("Business Partner materialization proof", () => {
  it("renders stable result, snapshot, and lineage coordinates as read-only evidence", () => {
    const html = renderToStaticMarkup(createElement(MaterializationResultProof, { proof }));
    expect(html).toContain("Read-only materialization proof");
    expect(html).toContain("partner-1");
    expect(html).toContain("source-1");
    expect(html).toContain("result-1");
    expect(html).toContain("at most the 25 newest coordinate edges");
    expect(html).not.toContain("input");
    expect(html).not.toContain("SECRET");
  });
});
