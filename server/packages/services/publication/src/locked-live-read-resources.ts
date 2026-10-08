import { sql, type Transaction } from "kysely";
import {
  PublicationContractError,
  type EntityLiveReadResource,
  type PublicationCanonicalizer,
  type PublicationVerifier,
} from "@athyper/server-contract-publication";
import {
  validateEntityResourcePinV1,
  type EntityResourcePinV1,
} from "@athyper/server-contract-metadata";
import { verifyLocalLiveReadResource } from "./live-read-resource-verification.js";

/** Coordinates resolved by installed host composition, never a request DTO. */
export interface LocalLiveReadResourceBinding {
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly artifactHash: string;
  readonly pin: EntityResourcePinV1;
}
interface InstalledRow {
  publication_key: string;
  source_release_id: string;
  source_release_no: number | string;
  artifact_hash: string;
  row_version: number | string;
  payload_hash: string;
  payload_json: unknown;
  signed_document: unknown;
}

/** Read exact active resources under shared row locks in the caller's transaction.
 * The callback must include the protected record read. This is the publication
 * portion of the evidence adapter, not caller authorization, provider qualification
 * or discovery of current security. Superseded pins deliberately fail here; a
 * historical installation needs a separately qualified reader.
 * No privileges are granted by this adapter. Missing routine EXECUTE privileges
 * fail rather than retrying through a privileged connection. */
export async function withLockedLocalLiveReadResources<Result>(
  options: {
    transaction: Transaction<Record<string, never>>;
    tenantId: string;
    plane: "studio" | "neon" | "mesh";
    runtimeVersion: string;
    bindings: readonly LocalLiveReadResourceBinding[];
    maximumResources: number;
    maximumBytes: number;
    verifier: PublicationVerifier;
    canonical: PublicationCanonicalizer;
  },
  work: (resources: {
    readonly generation: string;
    read(pin: EntityResourcePinV1): EntityLiveReadResource;
  }) => Promise<Result>,
): Promise<Result> {
  const fail = (): never => {
    throw new PublicationContractError(
      "RUNTIME_INCOMPATIBLE",
      "Exact local live-read resources are not installed",
    );
  };
  const bindings = structuredClone(options.bindings);
  if (
    !options.transaction.isTransaction ||
    !Number.isSafeInteger(options.maximumResources) ||
    options.maximumResources < 1 ||
    options.maximumResources > 64 ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1 ||
    options.maximumBytes > 4194304 ||
    !bindings.length ||
    bindings.length > options.maximumResources ||
    new Set(bindings.map((b) => b.publicationKey)).size !== bindings.length
  )
    fail();
  const hash = (v: unknown) =>
    options.canonical.sha256(options.canonical.canonicalBytes(v));
  for (const binding of bindings) {
    validateEntityResourcePinV1(binding.pin);
    if (
      !/^[a-z][a-z0-9_.:-]{1,190}$/.test(binding.publicationKey) ||
      !/^[a-f0-9]{64}$/.test(binding.artifactHash) ||
      !/^[a-f0-9-]{36}$/.test(binding.releaseId)
    )
      fail();
  }
  if (new Set(bindings.map((b) => hash(b.pin))).size !== bindings.length)
    fail();
  // One deterministic lock order. Joining on head coordinates rejects a stale or
  // contradictory local projection. Missing rows cannot produce partial evidence.
  const rows = (
    await sql<InstalledRow>`
    SELECT * FROM runtime_meta.fn_locked_live_read_resources(
      ${bindings.map((b) => b.publicationKey)}::text[],${options.tenantId}::uuid,
      ${options.plane},${options.maximumBytes})
  `.execute(options.transaction)
  ).rows;
  if (rows.length !== bindings.length) fail();
  let bytes = 0;
  const resources = new Map<string, EntityLiveReadResource>();
  for (const row of rows) {
    const binding = bindings.find(
      (b) => b.publicationKey === row.publication_key,
    );
    const releaseNo = Number(row.source_release_no),
      version = Number(row.row_version);
    if (
      !binding ||
      row.source_release_id !== binding.releaseId ||
      row.artifact_hash !== binding.artifactHash ||
      !Number.isSafeInteger(releaseNo) ||
      releaseNo < 1 ||
      !Number.isSafeInteger(version) ||
      version < 1
    )
      return fail();
    bytes += options.canonical.canonicalBytes(row.signed_document).byteLength;
    bytes += options.canonical.canonicalBytes(row.payload_json).byteLength;
    if (bytes > options.maximumBytes) fail();
    const resource = await verifyLocalLiveReadResource({
      ...options,
      pin: binding.pin,
      installation: {
        publicationKey: row.publication_key,
        releaseId: row.source_release_id,
        releaseNo,
        artifactHash: row.artifact_hash,
        payloadHash: row.payload_hash,
        payload: row.payload_json,
        signedDocument: row.signed_document,
      },
    });
    resources.set(hash(binding.pin), resource);
  }
  let open = true;
  try {
    return await work({
      generation: hash(
        rows.map((r) => ({
          key: r.publication_key,
          releaseId: r.source_release_id,
          artifactHash: r.artifact_hash,
          version: String(r.row_version),
        })),
      ),
      read(pin) {
        validateEntityResourcePinV1(pin);
        const value = resources.get(hash(pin));
        if (!open || !value) return fail();
        return structuredClone(value);
      },
    });
  } finally {
    open = false;
  }
}
