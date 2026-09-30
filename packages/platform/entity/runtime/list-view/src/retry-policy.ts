/** Transient failures retry the same page; invalid authority must reload its descriptor. */
export function retryRequiresDescriptor(error?: {readonly kind: string; readonly status: number}): boolean {
  return error?.kind === "parse" || [401,403,409].includes(error?.status ?? 0);
}
