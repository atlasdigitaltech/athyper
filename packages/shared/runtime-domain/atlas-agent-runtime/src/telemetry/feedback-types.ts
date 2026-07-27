export interface AtlasFeedbackPayload {
  agent_run_id: string;
  message_id: string;
  verdict: "correct" | "wrong" | "partial" | "missing";
  reason_code?: string;
  reason_detail?: string;
}

/**
 * Existing `/api/ai/feedback` wire contract. Atlas identifiers are retained
 * in `detail` while the run UUID is also used as the route's target UUID.
 */
export interface AtlasFeedbackRequest {
  feedback_type: "atlas_agent";
  target_id: string;
  verdict: AtlasFeedbackPayload["verdict"];
  reason_code?: string;
  reason_detail?: string;
  detail: {
    agent_run_id: string;
    message_id: string;
  };
}

export function toAtlasFeedbackRequest(
  payload: AtlasFeedbackPayload,
): AtlasFeedbackRequest {
  return {
    feedback_type: "atlas_agent",
    target_id: payload.agent_run_id,
    verdict: payload.verdict,
    ...(payload.reason_code ? { reason_code: payload.reason_code } : {}),
    ...(payload.reason_detail ? { reason_detail: payload.reason_detail } : {}),
    detail: {
      agent_run_id: payload.agent_run_id,
      message_id: payload.message_id,
    },
  };
}
