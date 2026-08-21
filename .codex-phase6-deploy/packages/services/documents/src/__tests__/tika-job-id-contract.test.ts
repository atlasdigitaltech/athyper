import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const attachmentRoutes = readFileSync(
  resolve(process.cwd(), "packages/services/documents/routes/attachments.route.ts"),
  "utf8",
);
const tikaWorker = readFileSync(
  resolve(process.cwd(), "packages/services/jobs/workers/tika-extract.worker.ts"),
  "utf8",
);

describe("Tika BullMQ job ID contract", () => {
  it("does not use BullMQ's reserved colon separator in custom Tika job IDs", () => {
    expect(attachmentRoutes).not.toMatch(/jobId:\s*`tika:/);
    expect(tikaWorker).not.toMatch(/jobId:\s*`tika:/);
  });

  it("keeps stable upload and sweep deduplication IDs aligned", () => {
    expect(attachmentRoutes).toContain("jobId:       `tika-${attachmentId}`");
    expect(tikaWorker).toContain("jobId:       `tika-${r.id}`");
  });

  it("casts nullable hashes used in scan metadata", () => {
    expect(tikaWorker).toContain("${sql.val(effectiveVersionNo)}::integer");
    expect(tikaWorker).toContain("${effectiveSha256 ?? null}::text");
  });
});
