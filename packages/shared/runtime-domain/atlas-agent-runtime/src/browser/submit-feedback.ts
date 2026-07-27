import {
  toAtlasFeedbackRequest,
  type AtlasFeedbackPayload,
} from "../telemetry/feedback-types";

export interface SubmitAtlasFeedbackOptions {
  payload: AtlasFeedbackPayload;
  endpoint?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function submitAtlasFeedback({
  payload,
  endpoint = "/api/relay/ai/feedback",
  signal,
  fetchImpl = fetch,
}: SubmitAtlasFeedbackOptions): Promise<void> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toAtlasFeedbackRequest(payload)),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Atlas feedback request failed (${response.status})`);
  }
}
