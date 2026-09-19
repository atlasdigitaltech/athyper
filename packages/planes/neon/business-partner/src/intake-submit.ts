import type { createBusinessPartnerClient, PartnerRequest } from "./client";
/** Once a case exists, failures always return that case for correction instead of recreating it. */
export async function submitBusinessPartnerIntake(
  api: ReturnType<typeof createBusinessPartnerClient>,
  request: PartnerRequest,
) {
  try {
    const checked = await api.validate(request.id, request.rowVersion);
    if (!checked.validation.valid)
      return {
        submitted: false,
        detail:
          "Request saved. Resolve its validation findings before submitting.",
      };
    await api.submit(request.id, checked.case.rowVersion);
    return { submitted: true, detail: "Request submitted for approval." };
  } catch (cause) {
    return {
      submitted: false,
      detail: `Request saved, but submission did not complete. Open it to retry. ${cause instanceof Error ? cause.message : ""}`,
    };
  }
}
