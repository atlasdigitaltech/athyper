import type {
  CompiledEntityArtifactV2,
  PublicationCanonicalizer,
} from "@athyper/server-contract-publication";

type Artifact = CompiledEntityArtifactV2;
export interface SuccessorSnapshot {
  readonly publicationKey: string;
  readonly sourceReleaseId: string;
  readonly sourceReleaseNo: number;
  readonly artifactHash: string;
  readonly tenantId: string | null;
  readonly entityCode: string;
  readonly plane: string;
  readonly artifacts: readonly Artifact[];
}
export interface SuccessorArtifactConflict {
  readonly artifactKey: string;
  readonly baseline: Artifact | null;
  readonly tenant: Artifact | null;
  readonly proposedProduct: Artifact | null;
}

/** Conservative three-way draft construction, not publication or authority.
 * Artifacts are atomic: changes in both authorities conflict unless their
 * content is equal. No guessed JSON-path merge or inherited human approval.
 * Callers must re-read exact heads, compile, qualify and obtain separate human
 * reviews before creating/activating a governed successor. */
export function reconcileTenantSuccessor(input: {
  baseline: SuccessorSnapshot;
  tenant: SuccessorSnapshot;
  proposedProduct: readonly Artifact[];
  canonicalizer: PublicationCanonicalizer;
}) {
  const { baseline, tenant, proposedProduct } = structuredClone({
    baseline: input.baseline,
    tenant: input.tenant,
    proposedProduct: input.proposedProduct,
  });
  // Canonicalization is a trusted executable dependency, not cloned input.
  const hash = (value: unknown) =>
    input.canonicalizer.sha256(input.canonicalizer.canonicalBytes(value));
  if (
    !Number.isSafeInteger(baseline.sourceReleaseNo) ||
    baseline.sourceReleaseNo < 1 ||
    !Number.isSafeInteger(tenant.sourceReleaseNo) ||
    tenant.sourceReleaseNo < 1 ||
    baseline.tenantId !== null ||
    !tenant.tenantId ||
    baseline.publicationKey === tenant.publicationKey ||
    !baseline.sourceReleaseId ||
    !tenant.sourceReleaseId ||
    !baseline.artifactHash ||
    !tenant.artifactHash ||
    baseline.entityCode !== tenant.entityCode ||
    baseline.plane !== tenant.plane
  )
    throw Error("TENANT_SUCCESSOR_AUTHORITY_MISMATCH");
  const index = (artifacts: readonly Artifact[]) => {
    const map = new Map<string, Artifact>();
    for (const artifact of artifacts) {
      if (
        artifact.plane !== baseline.plane ||
        map.has(artifact.artifactKey) ||
        artifact.content.artifactKey !== artifact.artifactKey ||
        artifact.content.entityCode !== artifact.entityCode ||
        artifact.content.artifactType !== artifact.artifactType ||
        artifact.content.plane !== artifact.plane
      )
        throw Error("TENANT_SUCCESSOR_ARTIFACT_IDENTITY_INVALID");
      map.set(artifact.artifactKey, artifact);
    }
    return map;
  };
  const content = (artifact: Artifact | undefined) => {
    if (!artifact) return null;
    const { artifactHash: _hash, ...value } = artifact.content;
    return value;
  };
  const same = (a: Artifact | undefined, b: Artifact | undefined) =>
    hash(content(a)) === hash(content(b));
  const old = index(baseline.artifacts),
    local = index(tenant.artifacts),
    next = index(proposedProduct);
  const conflicts: SuccessorArtifactConflict[] = [];
  const changes: { artifactKey: string; disposition: string }[] = [];
  const artifacts: {
    ref: string;
    content: Readonly<Record<string, unknown>>;
  }[] = [];
  for (const key of [
    ...new Set([...old.keys(), ...local.keys(), ...next.keys()]),
  ].sort()) {
    const base = old.get(key),
      extension = local.get(key),
      product = next.get(key);
    let selected: Artifact | undefined, disposition: string;
    if (same(extension, base)) {
      selected = product;
      disposition = "product_successor";
    } else if (same(product, base)) {
      selected = extension;
      disposition = "tenant_delta_retained";
    } else if (same(extension, product)) {
      selected = product;
      disposition = "converged_content";
    } else {
      conflicts.push({
        artifactKey: key,
        baseline: base ?? null,
        tenant: extension ?? null,
        proposedProduct: product ?? null,
      });
      changes.push({ artifactKey: key, disposition: "authority_conflict" });
      continue;
    }
    changes.push({ artifactKey: key, disposition });
    if (selected)
      artifacts.push({ ref: `${key}.json`, content: content(selected)! });
  }
  const pin = (source: SuccessorSnapshot) => ({
    publicationKey: source.publicationKey,
    sourceReleaseId: source.sourceReleaseId,
    sourceReleaseNo: source.sourceReleaseNo,
    artifactHash: source.artifactHash,
    tenantId: source.tenantId,
    entityCode: source.entityCode,
    plane: source.plane,
  });
  return {
    schema: "athyper.tenant-successor-reconciliation/1" as const,
    baseline: pin(baseline),
    tenant: pin(tenant),
    proposedProductContentHash: hash(
      [...next]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, artifact]) => content(artifact)),
    ),
    changes,
    conflicts,
    // Partial output must not be mistaken for a successor that dropped conflicts.
    authoringArtifacts: conflicts.length ? null : artifacts,
    nonConflictingArtifacts: artifacts,
    publicationReady: false as const,
  };
}
