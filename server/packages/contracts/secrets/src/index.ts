/** Secret bytes are an adapter-only capability and must never cross a route, log, job, or persistence boundary. */
export interface OpaqueSecretValue {
  readonly bytes: Uint8Array;
  readonly version: string;
  readonly expiresAt?: string;
}

export interface SecretStore {
  resolve(reference: string): Promise<OpaqueSecretValue>;
  /** Persist verification/signing material and return only its opaque reference. */
  put?(reference: string, value: Uint8Array): Promise<{ readonly reference: string; readonly version: string }>;
  health?(): Promise<{ readonly healthy: boolean; readonly message?: string }>;
  close?(): Promise<void> | void;
}
