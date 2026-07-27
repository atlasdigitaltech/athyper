export interface BusinessLifecycleSyncParams {
  db: unknown;
  tenantId: string;
  entityName: string;
  entityId: string;
  status: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export type BusinessLifecycleSyncHook = (params: BusinessLifecycleSyncParams) => Promise<void>;

export async function syncBusinessLifecycle(
  hook: BusinessLifecycleSyncHook | undefined,
  params: BusinessLifecycleSyncParams,
): Promise<void> {
  if (!hook) return;
  await hook(params);
}
