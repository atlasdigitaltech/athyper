import type { PlaneKey } from "../plane/plane-key.js";

/** Minimal context shared by requests, jobs, and scheduled work. */
export interface ExecutionContext {
  signal?: AbortSignal;
  requestId: string;
  correlationId?: string;
  planeKey?: PlaneKey;
  tenantId?: string;
  principalId?: string;
}
