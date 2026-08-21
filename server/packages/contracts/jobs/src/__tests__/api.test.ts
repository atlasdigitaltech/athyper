import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  JobEnvelope,
  JobDefinitionCatalog,
  JobExecutionLifecycle,
  JobHandler,
  JobPublisher,
  ScheduledJobDefinition,
} from "../index.js";

interface RenderPayload {
  readonly tenantId: string;
  readonly outputId: string;
}

describe("jobs contract API", () => {
  it("preserves name and payload types across a job envelope", () => {
    const job = {
      id: "job-1",
      name: "render-document",
      queue: "documents",
      data: { tenantId: "tenant-1", outputId: "output-1" },
      attempt: 1,
      maxAttempts: 3,
      enqueuedAt: "2026-08-09T00:00:00.000Z",
    } as const satisfies JobEnvelope<"render-document", RenderPayload>;

    expect(job.data.outputId).toBe("output-1");
    expectTypeOf<JobHandler<"render-document", RenderPayload>>().toHaveProperty("handle");
    expectTypeOf<JobPublisher>().toHaveProperty("enqueue");
    expectTypeOf<JobDefinitionCatalog>().toHaveProperty("get");
    expectTypeOf<JobExecutionLifecycle>().toHaveProperty("failed");
    expectTypeOf<ScheduledJobDefinition>().toHaveProperty("pattern");
  });
});
