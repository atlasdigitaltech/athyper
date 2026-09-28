import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import { compileGraph } from "../deterministic.js";
import { prepareSystemReferenceRelease } from "../publication/prepare-release.js";

function fixture() {
  const base = buildSharedReferenceGraph({ entityCode: "sample_reference", title: "Samples", storageObject: "sample_reference", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }], columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
  }, "studio");
  const graph = { ...base, surfaces: base.surfaces?.map(s => s.surfaceKind !== "list" ? s : { ...s, layoutConfig: { ...s.layoutConfig,
    systemReferenceProduct: { schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"] },
  } }) };
  const artifact = { ...compileGraph(graph), signatureAlgorithm: "Ed25519", signingKeyId: "test-key", signature: "test-stored-signature" };
  const row = { contract_json: graph, revision_id: "revision", entity_id: "entity", entity_code: "sample_reference", change_set_id: "change-set", release_no: 1,
    release_hash: "b".repeat(64), contract_hash: "c".repeat(64), target_planes: ["studio", "neon", "mesh"],
    contract_signature: artifact.signature, signature_algorithm: artifact.signatureAlgorithm, signing_key_id: artifact.signingKeyId,
    published_by: "publisher", approved_by: "reviewer", authority_tenant_id: "authority-tenant" };
  let sourceAvailable = true;
  const query = vi.fn(async (text: string, _parameters?: unknown[]) => ({ rows: text.startsWith("SELECT s.contract_json") && sourceAvailable ? [row] : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const input = { releaseId: "release", artifact, targetPlanes: ["studio", "neon", "mesh"] };
  return { row, input, query, db, unavailable: () => { sourceAvailable = false; } };
}
it("links one approved global source to three immutable target snapshots without runtime writes", async () => {
  const f = fixture();
  try {
    await expect(f.db.transaction().execute(tx => prepareSystemReferenceRelease(tx, f.input))).resolves.toBe(true);
    const inserts = f.query.mock.calls.filter(([text]) => text.startsWith("SELECT publication.fn_store_system_entity_artifact"));
    expect(inserts).toHaveLength(3);
    for (const [index, [text, params]] of inserts.entries()) {
      expect(text).not.toContain("INSERT INTO");
      expect(params?.[1]).toBe(["studio", "neon", "mesh"][index]);
      const descriptor = JSON.parse(String(params?.[2]));
      expect(descriptor.runtimeProfiles[0].storagePlane).toBe(params?.[1]);
      expect(descriptor.entity.entityCode).toBe("sample_reference");
    }
    const read = f.query.mock.calls.find(([text]) => text.startsWith("SELECT s.contract_json"))![0];
    expect(read).toContain("IS NOT DISTINCT FROM r.tenant_id");
    expect(read).toContain("c.approved_by<>c.submitted_by");
    expect(read).toContain("r.published_by=master.current_principal_id_soft()");
    expect(f.query.mock.calls.some(([text]) => text.includes("runtime_meta"))).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("commit");
  } finally { await f.db.destroy(); }
});
it.each(["source", "signature", "targets", "descriptor"])("rejects mismatched %s before persisting compilation sources", async kind => {
  const f = fixture();
  if (kind === "source") f.unavailable();
  if (kind === "signature") f.row.contract_signature = "different";
  if (kind === "targets") f.input.targetPlanes = ["studio"];
  if (kind === "descriptor") f.input.artifact.descriptorHash = "d".repeat(64);
  try {
    await expect(f.db.transaction().execute(tx => prepareSystemReferenceRelease(tx, f.input))).rejects.toThrow(/SYSTEM_REFERENCE_/);
    expect(f.query.mock.calls.some(([text]) => text.startsWith("INSERT"))).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("rollback");
  } finally { await f.db.destroy(); }
});
it("requires the enclosing release transaction", async () => {
  const f = fixture();
  try {
    await expect(prepareSystemReferenceRelease(f.db, f.input)).rejects.toThrow("TRANSACTION_REQUIRED");
    expect(f.query).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
