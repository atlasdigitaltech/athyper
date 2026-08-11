export interface StoredSession {
  readonly id: string; readonly principalId: string; readonly tenantId: string;
  readonly providerSessionId?: string; readonly expiresAt: number; readonly value: string;
}
export interface SessionStoreBackend {
  createAtomic(session: StoredSession): Promise<void>; read(id: string): Promise<StoredSession | undefined>;
  deleteAtomic(id: string): Promise<void>; deleteByPrincipalAtomic(principalId: string): Promise<number>;
  deleteByProviderSessionAtomic(providerSessionId: string): Promise<number>;
  consumeOnce(key: string): Promise<string | undefined>; ping(): Promise<void>;
}
export class SessionStoreUnavailableError extends Error {
  constructor(options?: ErrorOptions) { super("Authenticated session storage is unavailable", options); this.name = "SessionStoreUnavailableError"; }
}
export function createFailClosedSessionStore(backend: SessionStoreBackend) {
  const call = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { await backend.ping(); return await operation(); }
    catch (cause) { throw new SessionStoreUnavailableError({ cause }); }
  };
  return {
    create: (session: StoredSession) => call(() => backend.createAtomic(session)), read: (id: string) => call(() => backend.read(id)),
    revoke: (id: string) => call(() => backend.deleteAtomic(id)), revokePrincipal: (id: string) => call(() => backend.deleteByPrincipalAtomic(id)),
    backChannelLogout: (id: string) => call(() => backend.deleteByProviderSessionAtomic(id)), consumeElevation: (id: string) => call(() => backend.consumeOnce(`elevation:${id}`)),
  };
}
