import type { SesEventApplyResult } from "@athyper/server-contract-notifications";
import { InvalidSesDeliveryEventError } from "./ses-delivery-events.js";

export type SesEventMessageDisposition =
  | { readonly outcome: "acknowledge" }
  | { readonly outcome: "retry"; readonly reasonCode: string }
  | { readonly outcome: "permanent_failure"; readonly reasonCode: string };

export interface SesDeliveryEventApplier {
  apply(input: unknown): Promise<SesEventApplyResult>;
}

/** Maps untrusted SQS JSON and platform outcomes onto explicit queue semantics. */
export function createSesEventMessageHandler(applier: SesDeliveryEventApplier) {
  return {
    async process(body: string): Promise<SesEventMessageDisposition> {
      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        return { outcome: "permanent_failure", reasonCode: "malformed_json" };
      }
      try {
        const result = await applier.apply(input);
        switch (result.outcome) {
          case "applied":
          case "duplicate":
          case "ignored":
            return { outcome: "acknowledge" };
          case "not_found":
            // Delivery persistence can race provider event publication.
            return { outcome: "retry", reasonCode: "delivery_not_found" };
          case "correlation_mismatch":
            return { outcome: "permanent_failure", reasonCode: "correlation_mismatch" };
        }
      } catch (error) {
        if (error instanceof InvalidSesDeliveryEventError) {
          return { outcome: "permanent_failure", reasonCode: "invalid_ses_event" };
        }
        throw error;
      }
    },
  };
}
