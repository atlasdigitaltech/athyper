// framework/runtime/src/adapters/telemetry/envelope.ts
/**
 * Re-export telemetry envelope functions from @athyper/core for backward compatibility.
 * New code should import directly from @athyper/core.
 */

export {
  createLogEnvelope,
  withException,
  type TraceContextProvider,
} from "@athyper/core";
