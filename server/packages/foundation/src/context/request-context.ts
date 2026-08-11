import { randomUUID } from "node:crypto";
import { createContextStore } from "./context-store.js";
import type { ExecutionContext } from "./execution-context.js";

export type RequestContext = ExecutionContext;

const requestStore = createContextStore<RequestContext>();

export function tryGetRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}

export function getRequestContext(): RequestContext {
  const context = tryGetRequestContext();
  if (!context) {
    throw new Error(
      "getRequestContext() called outside an execution scope; use runWithRequestContext()",
    );
  }
  return context;
}

export function runWithRequestContext<T>(
  context: RequestContext,
  work: () => T,
): T {
  return requestStore.run(context, work);
}

export function runWithJobContext<T>(
  context: Partial<RequestContext>,
  work: () => T | Promise<T>,
): Promise<T> {
  const jobContext: RequestContext = {
    ...context,
    requestId: context.requestId ?? randomUUID(),
  };
  return requestStore.run(jobContext, () => Promise.resolve(work()));
}
