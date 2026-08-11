import { describe, expectTypeOf, it } from "vitest";
import type { WorkflowRepository, WorkflowService, WorkItem } from "../index.js";

describe("workflow contract API", () => {
  it("keeps service and persistence boundaries implementation-neutral", () => {
    expectTypeOf<WorkflowService>().toHaveProperty("complete");
    expectTypeOf<WorkflowRepository<symbol>>().toHaveProperty("create");
    expectTypeOf<WorkItem["status"]>().toEqualTypeOf<"open" | "claimed" | "in_progress" | "blocked" | "completed" | "cancelled">();
  });
});
