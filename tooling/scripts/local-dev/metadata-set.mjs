import { createHash } from "node:crypto";

const kinds = new Set([
  "runtime",
  "entity",
  "permission",
  "policy",
  "lifecycle",
  "numbering",
  "handler",
  "resolver",
  "preflight",
  "storage",
  "definition",
  "case_contract",
  "capability",
  "provider",
]);
const planes = new Set(["studio", "neon", "mesh"]);
export function metadataHash(value) {
  function canonical(item) {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonical(item[key])]),
      );
    return item;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function metadataKey(reference) {
  if (
    !reference ||
    Object.keys(reference).some(
      (key) => !["kind", "key", "plane", "revision"].includes(key),
    ) ||
    !kinds.has(reference.kind) ||
    typeof reference.key !== "string" ||
    !reference.key.length ||
    reference.key.length > 256 ||
    /[\x00-\x1f]/.test(reference.key) ||
    (reference.plane !== undefined && !planes.has(reference.plane)) ||
    (reference.revision !== undefined &&
      (!Number.isSafeInteger(reference.revision) || reference.revision < 1))
  )
    throw Error("Invalid metadata dependency coordinate");
  return JSON.stringify([
    reference.kind,
    reference.plane ?? null,
    reference.key,
    reference.revision ?? null,
  ]);
}
const contentOf = (item) => ({
  reference: item.reference,
  payload: item.payload,
  requires: item.requires,
});

/** Traversal finishes only after every transitive reference has been captured.
 * Cyclic entity relations are valid; conflicting identities and dangling edges
 * are not. The resolver supplies source metadata, never sessions or approvals. */
export async function collectMetadataSet({
  tenantId,
  roots,
  resolve,
  limit = 1000,
}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw Error("Invalid metadata dependency limit");
  if (!Array.isArray(roots) || !roots.length || roots.length > limit)
    throw Error("Invalid metadata roots");
  roots = structuredClone(roots);
  const items = new Map();
  const queue = [...roots];
  while (queue.length) {
    const reference = queue.shift(),
      key = metadataKey(reference);
    if (items.has(key)) continue;
    if (items.size >= limit)
      throw Error("Metadata dependency set exceeds limit");
    const resolved = await resolve(reference);
    if (!resolved) throw Error(`Missing metadata dependency: ${key}`);
    if (metadataKey(resolved.reference) !== key)
      throw Error(`Metadata resolver returned a different coordinate: ${key}`);
    if (resolved.tenantId !== null && resolved.tenantId !== tenantId)
      throw Error(`Cross-tenant metadata dependency: ${key}`);
    if (!Array.isArray(resolved.requires))
      throw Error(`Dependency references required: ${key}`);
    const requires = [
      ...new Map(resolved.requires.map((r) => [metadataKey(r), r])).values(),
    ].sort((a, b) => metadataKey(a).localeCompare(metadataKey(b)));
    const item = {
      reference: structuredClone(reference),
      payload: structuredClone(resolved.payload),
      requires,
    };
    const record = { ...item, sha256: metadataHash(contentOf(item)) };
    items.set(key, record);
    queue.push(...requires);
  }
  const document = {
    schema: "athyper.metadata-dependency-set/1",
    tenantId,
    roots: [...roots].sort((a, b) =>
      metadataKey(a).localeCompare(metadataKey(b)),
    ),
    items: [...items.values()].sort((a, b) =>
      metadataKey(a.reference).localeCompare(metadataKey(b.reference)),
    ),
  };
  verifyMetadataSet(document);
  return document;
}

/** Integrity/closure verification is deliberately not release qualification. */
export function verifyMetadataSet(document) {
  if (
    document?.schema !== "athyper.metadata-dependency-set/1" ||
    !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(document.tenantId ?? "") ||
    !Array.isArray(document.roots) ||
    !document.roots.length ||
    !Array.isArray(document.items) ||
    !document.items.length ||
    document.items.length > 10000
  )
    throw Error("Invalid metadata dependency set");
  const items = new Map();
  for (const item of document.items) {
    const key = metadataKey(item.reference);
    if (items.has(key)) throw Error(`Duplicate metadata dependency: ${key}`);
    if (
      !item.payload ||
      typeof item.payload !== "object" ||
      Array.isArray(item.payload) ||
      !Array.isArray(item.requires) ||
      item.sha256 !== metadataHash(contentOf(item))
    )
      throw Error(`Metadata dependency content mismatch: ${key}`);
    const references = item.requires.map(metadataKey);
    if (new Set(references).size !== references.length)
      throw Error(`Duplicate dependency edge: ${key}`);
    items.set(key, item);
  }
  const seen = new Set(),
    pending = document.roots.map(metadataKey);
  if (new Set(pending).size !== pending.length)
    throw Error("Duplicate metadata root");
  while (pending.length) {
    const key = pending.shift();
    if (seen.has(key)) continue;
    const item = items.get(key);
    if (!item) throw Error(`Missing metadata dependency: ${key}`);
    seen.add(key);
    pending.push(...item.requires.map(metadataKey));
  }
  if (seen.size !== items.size) throw Error("Unreachable metadata dependency");
  return document;
}

/** A BP candidate must carry the descriptor, independently owned child, case
 * contract and onboarding definition. A single form bundle cannot qualify BP. */
export function assertBusinessPartnerMetadataSet(document, tenantId, bundle) {
  verifyMetadataSet(document);
  if (document.tenantId !== tenantId)
    throw Error("Candidate metadata tenant mismatch");
  const roots = document.roots.map(metadataKey);
  for (const reference of [
    { kind: "entity", key: "business_partner", plane: "neon" },
    { kind: "entity", key: "business_partner_request", plane: "neon" },
    { kind: "case_contract", key: "master.business_partner", plane: "neon" },
    { kind: "definition", key: "business_partner.onboarding", plane: "neon" },
  ])
    if (!roots.includes(metadataKey(reference)))
      throw Error(
        `Required BP metadata root missing: ${metadataKey(reference)}`,
      );
  const definition = document.items.find(
    (item) =>
      metadataKey(item.reference) ===
      metadataKey({
        kind: "definition",
        key: "business_partner.onboarding",
        plane: "neon",
      }),
  );
  if (metadataHash(definition.payload) !== metadataHash(bundle))
    throw Error("Candidate onboarding metadata mismatch");
  return document;
}
