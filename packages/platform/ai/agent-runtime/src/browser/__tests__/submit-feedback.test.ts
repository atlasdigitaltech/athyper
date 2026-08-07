import { describe, expect, it, vi } from "vitest";
import { submitAtlasFeedback } from "../submit-feedback";

describe("submitAtlasFeedback", () => {
  it("posts run-targeted Atlas Agent feedback through the relay", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

    await submitAtlasFeedback({
      fetchImpl,
      payload: {
        agent_run_id: "00000000-0000-4000-8000-000000000001",
        message_id: "00000000-0000-4000-8000-000000000002",
        verdict: "wrong",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/relay/ai/feedback",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      feedback_type: "atlas_agent",
      target_id: "00000000-0000-4000-8000-000000000001",
      verdict: "wrong",
      detail: {
        agent_run_id: "00000000-0000-4000-8000-000000000001",
        message_id: "00000000-0000-4000-8000-000000000002",
      },
    });
  });

  it("rejects a non-success response without exposing its body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      "provider diagnostic",
      { status: 403 },
    ));

    await expect(submitAtlasFeedback({
      fetchImpl,
      payload: {
        agent_run_id: "00000000-0000-4000-8000-000000000001",
        message_id: "00000000-0000-4000-8000-000000000002",
        verdict: "correct",
      },
    })).rejects.toThrow("Atlas feedback request failed (403)");
  });
});
