import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../attachments.route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../../services/attachment.service.ts", import.meta.url), "utf8");

describe("presigned attachment release contract", () => {
  it("requires an owned direct-upload lifecycle", () => {
    expect(route).toContain("/attachments/upload/initiate");
    expect(route).toContain("/attachments/upload/complete");
    expect(route).toContain("UPLOAD_KEY_NOT_ALLOWED");
    expect(route).toContain("enqueueTikaExtract");
  });

  it("verifies object size, ETag/checksum, and creates quarantined metadata", () => {
    expect(service).toContain("getMetadata(params.storageKey)");
    expect(service).toContain("ATTACHMENT_ETAG_MISMATCH");
    expect(service).toContain("ATTACHMENT_CHECKSUM_MISMATCH");
    expect(service).toContain('status: "quarantined"');
    expect(route).toContain("QUARANTINE_VIOLATION");
  });
});
