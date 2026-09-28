import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { compileGraph } from "../deterministic.js";
import { prepareDocumentCollectionRelease } from "../document-collection-publication.js";

function fixture() {
  const graph = JSON.parse(readFileSync(new URL(
    "../../../../../../../governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json", import.meta.url), "utf8"));
  graph.surfaces[0].layoutConfig.collectionCompilation = {
    schemaVersion: 1, entityCode: "business_partner_request", planeKey: "neon",
    subjectEntityCode: "master.business_partner", permissionCode: "neon.relationship.entity_case.read",
    detailRouteTemplate: "/app/entity/business_partner_request/:recordId",
  };
  const artifact = { ...compileGraph(graph), signature: "persisted-signature",
    signatureAlgorithm: "Ed25519" as const, signingKeyId: "reviewed-key" };
  const row = { entity_code: "business_partner_request", release_kind: "publish",
    contract_json: graph, contract_hash: artifact.contractHash, contract_signature: artifact.signature,
    signature_algorithm: artifact.signatureAlgorithm, signing_key_id: artifact.signingKeyId };
  const query = vi.fn(async (_sql: string, _parameters: unknown[]) => ({ rows: [row] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({
    pool: { connect: async () => ({ query, release() {} }), async end() {} } as never,
  }) });
  return { db, query, row, artifact, input: { releaseId: "release", artifact, targetPlanes: ["neon"] } };
}
it("prepares only the exact persisted snapshot and passes new empty arrays to SQL", async () => {
  const f = fixture();
  try {
    expect(await prepareDocumentCollectionRelease(f.db, f.input)).toBe(true);
    expect(f.query).toHaveBeenCalledTimes(2);
    const [query, params] = f.query.mock.calls[1]!;
    expect(query).toContain("fn_prepare_document_collection_release");
    expect(params[0]).toBe("release");
    const descriptor = JSON.parse(String(params[1]));
    expect(descriptor).toEqual(f.artifact.descriptor);
    expect(descriptor.changeCaseBindings).toEqual([]);
    expect(f.query.mock.calls[0]![0]).toContain("c.approved_by<>c.submitted_by");
  } finally { await f.db.destroy(); }
});
it.each(["persistedHash", "artifactHash", "descriptorHash", "signature", "key", "algorithm", "binding"])(
  "rejects mismatched %s before database preparation", async mutation => {
    const f = fixture();
    if (mutation === "persistedHash") f.row.contract_hash = "0".repeat(64);
    if (mutation === "artifactHash") f.artifact.contractHash = "0".repeat(64);
    if (mutation === "descriptorHash") f.artifact.descriptorHash = "0".repeat(64);
    if (mutation === "signature") f.row.contract_signature = "";
    if (mutation === "key") f.row.signing_key_id = "other";
    if (mutation === "algorithm") Object.assign(f.row, { signature_algorithm: "none" });
    if (mutation === "binding") {
      f.row.contract_json.surfaces[0].layoutConfig.collectionCompilation.subjectEntityCode = "master.asset";
      f.row.contract_json.surfaces[0].layoutConfig.collectionRelationship.subject.value = "master.asset";
    }
    try {
      await expect(prepareDocumentCollectionRelease(f.db, f.input)).rejects.toThrow();
      expect(f.query).toHaveBeenCalledTimes(1);
    } finally { await f.db.destroy(); }
  },
);
