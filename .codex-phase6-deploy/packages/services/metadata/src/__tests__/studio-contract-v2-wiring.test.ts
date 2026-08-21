import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractRoutePath = fileURLToPath(new URL(
  "../../routes/studio-contract-v2.route.ts",
  import.meta.url,
));
const versionRoutePath = fileURLToPath(new URL(
  "../../routes/studio-version.route.ts",
  import.meta.url,
));
const compilerPath = fileURLToPath(new URL(
  "../entity-compiler.service.ts",
  import.meta.url,
));

describe("Meta Entity Studio Contract v2 persistence wiring", () => {
  const contractSource = readFileSync(contractRoutePath, "utf8");
  const versionSource = readFileSync(versionRoutePath, "utf8");
  const compilerSource = readFileSync(compilerPath, "utf8");

  it("stages the canonical document in dedicated version storage and publishes inside approval", () => {
    expect(contractSource).toContain("contract_document = ${json(parsed.data)}::jsonb");
    expect(contractSource).toContain("contract_schema_version = '2.0'");
    expect(contractSource).toContain("lock_version = lock_version + 1");
    expect(contractSource).toContain("validation_status = 'VALID'");
    expect(contractSource).toContain("publishStagedContractV2");
    expect(contractSource).toContain("UPDATE control.entity_numbering_config");
    expect(contractSource).toContain("INSERT INTO control.lifecycle_state");
    expect(contractSource).toContain("INSERT INTO control.lifecycle_transition");
    expect(versionSource).toContain("await publishStagedContractV2(trx as AnyDb, id, ctx.pId)");
  });

  it("round-trips and replaces version-scoped collection owners", () => {
    expect(contractSource).toContain("FROM control.entity_flow");
    expect(contractSource).toContain("INSERT INTO control.entity_flow");
    expect(contractSource).toContain("DELETE FROM control.entity_field_surface");
    expect(contractSource).toContain("DELETE FROM control.entity_surface");
    expect(contractSource).toContain("DELETE FROM control.entity_operation");
    expect(contractSource).toContain("DELETE FROM control.entity_relation");
    expect(contractSource).toContain("DELETE FROM control.entity_field");
  });

  it("accepts the read envelope without polluting the strict authored graph", () => {
    expect(contractSource).toContain("const { version_status: _versionStatus, ...authoredBody } = body");
    expect(contractSource).toContain("MetaEntityContractV2Schema.safeParse(authoredBody)");
    expect(contractSource).toContain("parsed.data.version_contract.contract_hash = contractHash(parsed.data)");
    expect(contractSource).toContain("version_hash = ${c.contract_hash}");
  });

  it("rejects cross-scope identities before any owner row can be changed", () => {
    expect(contractSource).toContain("VERSION_CONTRACT_ID_MISMATCH");
    expect(contractSource).toContain("NUMBERING_ENTITY_MISMATCH");
    expect(contractSource).toContain("PLATFORM_SCOPE_REQUIRED");
    expect(contractSource).toContain("CONTRACT_ID_OWNERSHIP_MISMATCH");
    expect(contractSource).toContain("MODULE_NOT_FOUND");
  });

  it("publishes the exact authored graph through the runtime compiler", () => {
    expect(compilerSource).toContain("coerceRecord(versionRow.contract_document)");
    expect(compilerSource).toContain('coerceRecord(versionRow.behaviors)?.["studio_contract_v2"]');
    expect(compilerSource).toContain("const contractV2 = authoredContractV2 ?? buildMetaEntityContractV2");
  });
});
