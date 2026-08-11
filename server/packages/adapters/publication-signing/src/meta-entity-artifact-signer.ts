import type { ArtifactSigner, CompiledMetaEntityArtifact } from "@athyper/server-contract-meta-entity-authoring";
import type { PublicationSigner } from "@athyper/server-contract-publication";
import { canonicalBytes } from "./canonical-json.js";
export class MetaEntityArtifactSigner implements ArtifactSigner {
  constructor(private readonly signer: PublicationSigner, private readonly keyId: string) { if (!keyId.trim()) throw new TypeError("Meta Entity signing key id is required"); }
  async sign(artifact: CompiledMetaEntityArtifact) { const value=await this.signer.sign({keyId:this.keyId,algorithm:"Ed25519",bytes:canonicalBytes(artifact)});return{signatureAlgorithm:"Ed25519",signingKeyId:this.keyId,signature:value.signature}; }
}
