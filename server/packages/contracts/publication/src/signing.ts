export interface PublicationArtifactStore {
  putImmutable(input: {
    readonly key: string;
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly sha256: string;
    readonly metadata: Readonly<Record<string, string>>;
  }): Promise<void>;
  get(input: { readonly uri: string; readonly expectedSha256: string }): Promise<Uint8Array>;
}

export interface PublicationSigner {
  sign(input: { readonly keyId: string; readonly algorithm: string; readonly bytes: Uint8Array }): Promise<{ readonly signature: string }>;
}

export interface PublicationVerifier {
  verify(input: { readonly keyId: string; readonly algorithm: string; readonly bytes: Uint8Array; readonly signature: string }): Promise<boolean>;
}

export interface PublicationCanonicalizer {
  canonicalBytes(value: unknown): Uint8Array;
  sha256(bytes: Uint8Array): string;
}
