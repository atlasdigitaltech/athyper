import type { ProtectedValueRequest } from "../protected-value";
import type {
  EntityRecordOperationContext,
  RecordRevealHandler,
} from "./record-contracts";
/** Browser registration is an allowlist, never an authorization grant. The server authorizes every call. */
export function createRecordRevealRequest(
  context: EntityRecordOperationContext,
  handlers: Readonly<Record<string, RecordRevealHandler>> = {},
): ProtectedValueRequest {
  return async (operation, id, purpose, signal) => {
    if (context.resourceContext?.asOf)
      throw new Error("Historical reveal is unavailable");
    if (
      !Object.hasOwn(handlers, operation) ||
      typeof handlers[operation] !== "function"
    )
      throw new Error("Unregistered reveal operation");
    return handlers[operation]!(context, id, purpose, signal);
  };
}
