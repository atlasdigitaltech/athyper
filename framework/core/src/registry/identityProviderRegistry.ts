/**
 * Identity Provider (IdP) registry for multi-realm IAM
 */

export type IdentityProviderConfig = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;

  // JWKS endpoint (auto-discovered if not provided)
  jwksUri?: string;

  // Token validation
  audience?: string;

  // Metadata
  metadata?: Record<string, unknown>;
};

export interface IdentityProviderRegistry {
  get(realmKey: string): Promise<IdentityProviderConfig | undefined>;
  list(): Promise<Array<{ realmKey: string; config: IdentityProviderConfig }>>;
}

/**
 * In-memory implementation (reads from RuntimeConfig)
 */
export class InMemoryIdentityProviderRegistry implements IdentityProviderRegistry {
  private providers = new Map<string, IdentityProviderConfig>();

  constructor(providers: Map<string, IdentityProviderConfig>) {
    this.providers = providers;
  }

  async get(realmKey: string): Promise<IdentityProviderConfig | undefined> {
    return this.providers.get(realmKey);
  }

  async list(): Promise<Array<{ realmKey: string; config: IdentityProviderConfig }>> {
    return Array.from(this.providers.entries()).map(([realmKey, config]) => ({
      realmKey,
      config,
    }));
  }
}
