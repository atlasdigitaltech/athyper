import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("Contract M3 atomic publication wiring", () => {
  const application = source("../contract-application/contract-application.service.ts");
  const repository = source("../contract-application/postgres-contract-application.repository.ts");
  const compiler = source("../entity-compiler.service.ts");
  const publishedRuntime = source("../published-runtime-descriptor.ts");
  const route = source("../../routes/studio-contract-v21.route.ts");
  const legacyRoute = source("../../routes/studio-version.route.ts");
  const tableDdl = source("../../../../../db/ddl/control/01zzn_meta_entity_contract_m3.sql");
  const constraintDdl = source("../../../../../db/ddl/control/03zzn_meta_entity_contract_m3.sql");

  it("locks publication authority and persists all evidence before EFFECTIVE", () => {
    expect(repository).toContain("FOR UPDATE OF ev, state");
    expect(repository).toContain("snapshot.entity_plane_compiled");
    expect(repository).toContain("readiness_status='READY'");
    expect(repository).toContain("control.entity_contract_transition");
    expect(repository).toContain("event.descriptor_invalidation_outbox");
    expect(repository).toContain("pg_notify('desc_invalidate'");

    const compile = application.indexOf("await transaction.compileVersion(request.versionId)");
    const publish = application.indexOf("await transaction.publish({", compile);
    expect(compile).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(compile);
  });

  it("exposes the owner, workflow, diff and export API surface", () => {
    for (const fragment of [
      'contract-v2.1/:owner',
      'contract-v2.1/validate',
      'contract-v2.1/submit',
      'contract-v2.1/approve',
      'contract-v2.1/reject',
      'contract-v2.1/rollback',
      'contract-v2.1/diff',
      'contract-v2.1/export',
    ]) {
      expect(route).toContain(fragment);
    }
    expect(route).toContain("permissions");
    expect(route).toContain("workflow");
    expect(legacyRoute).toContain("Contract v2.1 approval must use the atomic");
  });

  it("defines immutable plane artifacts, readiness hashes and transition evidence", () => {
    expect(tableDdl).toContain("CREATE TABLE IF NOT EXISTS control.entity_contract_transition");
    expect(tableDdl).toContain("CREATE TABLE IF NOT EXISTS snapshot.entity_plane_compiled");
    expect(tableDdl).toContain("admin_compiled_hash");
    expect(tableDdl).toContain("neon_compiled_hash");
    expect(tableDdl).toContain("mesh_compiled_hash");
    expect(constraintDdl).toContain("rollback_published");
    expect(constraintDdl).toContain("epc_plane_chk");
  });

  it("prevents projector replacement of an effective version", () => {
    expect(repository).toContain("IMMUTABLE_VERSION_PROJECTION");
    expect(repository).toContain("status IN ('DRAFT','IN_REVIEW') AS mutable");
  });

  it("keeps the monitored legacy fallback narrow during publication rollout", () => {
    expect(compiler).toContain('plane !== "neon" || !isLegacyPublishedDescriptorFallback(error)');
    expect(compiler).toContain('error.code === "PUBLISHED_VERSION_REQUIRED"');
    expect(compiler).toContain('error.code === "PUBLISHED_DESCRIPTOR_NOT_READY"');
    expect(compiler).toContain("published_runtime_descriptor_legacy_fallback");
    expect(compiler).toContain("published_execution_descriptor_legacy_fallback");
    expect(publishedRuntime).toContain('"PUBLISHED_DESCRIPTOR_INVALID"');
  });
});
