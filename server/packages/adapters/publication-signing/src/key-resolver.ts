import type { SecretStore } from "@athyper/server-contract-secrets";

export interface PublicationKeyConfiguration {
  readonly keyId: string;
  readonly privateKeyReference?: string;
  readonly publicKeyReferences: readonly string[];
}

interface CachedValue { readonly bytes: Uint8Array; readonly expiresAtMs: number }

export class CachedPublicationKeyResolver {
  readonly #configuration: ReadonlyMap<string, PublicationKeyConfiguration>;
  readonly #cache = new Map<string, CachedValue>();

  constructor(
    private readonly secrets: SecretStore,
    configuration: readonly PublicationKeyConfiguration[],
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError("Signing key cache TTL must be positive");
    this.#configuration = new Map(configuration.map((entry) => [entry.keyId, entry]));
    if (this.#configuration.size !== configuration.length) throw new TypeError("Signing key IDs must be unique");
  }

  async signingKey(keyId: string): Promise<Uint8Array> {
    const config = this.#requireConfiguration(keyId);
    if (!config.privateKeyReference) throw new Error(`Signing key is unavailable: ${keyId}`);
    return this.#resolve(config.privateKeyReference);
  }

  async verificationKeys(keyId: string): Promise<readonly Uint8Array[]> {
    const references = this.#requireConfiguration(keyId).publicKeyReferences;
    if (references.length === 0) throw new Error(`Verification key is unavailable: ${keyId}`);
    return Promise.all(references.map((reference) => this.#resolve(reference)));
  }

  clear(): void { this.#cache.clear(); }

  async health(keyId: string, requireSigningKey: boolean): Promise<{ readonly healthy: boolean; readonly message?: string }> {
    try {
      await this.verificationKeys(keyId);
      if (requireSigningKey) await this.signingKey(keyId);
      return { healthy: true };
    } catch {
      return { healthy: false, message: "Publication key resolution failed" };
    }
  }

  #requireConfiguration(keyId: string): PublicationKeyConfiguration {
    const config = this.#configuration.get(keyId);
    if (!config) throw new Error(`Unknown publication key ID: ${keyId}`);
    return config;
  }

  async #resolve(reference: string): Promise<Uint8Array> {
    const cached = this.#cache.get(reference);
    if (cached && cached.expiresAtMs > this.now()) return cached.bytes.slice();
    const resolved = await this.secrets.resolve(reference);
    const configuredExpiry = resolved.expiresAt ? Date.parse(resolved.expiresAt) : Number.POSITIVE_INFINITY;
    const expiresAtMs = Math.min(this.now() + this.ttlMs, Number.isFinite(configuredExpiry) ? configuredExpiry : Number.POSITIVE_INFINITY);
    this.#cache.set(reference, { bytes: resolved.bytes.slice(), expiresAtMs });
    return resolved.bytes.slice();
  }
}
