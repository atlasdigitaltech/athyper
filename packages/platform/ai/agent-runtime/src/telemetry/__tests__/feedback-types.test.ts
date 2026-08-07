import { describe, expect, it } from "vitest";
import { toAtlasFeedbackRequest } from "../../index";

describe("Atlas feedback wire mapping", () => {
  it("targets the run and retains the message identity", () => {
    expect(toAtlasFeedbackRequest({
      agent_run_id: "00000000-0000-4000-8000-000000000001",
      message_id: "00000000-0000-4000-8000-000000000002",
      verdict: "correct",
    })).toEqual({
      feedback_type: "atlas_agent",
      target_id: "00000000-0000-4000-8000-000000000001",
      verdict: "correct",
      detail: {
        agent_run_id: "00000000-0000-4000-8000-000000000001",
        message_id: "00000000-0000-4000-8000-000000000002",
      },
    });
  });
});
