import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { actor } from "./partner-classification-session.mjs";
import { id } from "../../fixtures/business-partner-core/seed-identity.mjs";
if (!process.argv.includes("--run"))
  throw Error("Use --run for CATL DEV demo declarations");
const client = await actor("catl.admin"),
  bp = id("cirrusatlantic", "partner");
const path = `neon/business-partners/${bp}/commodity-classifications`;
const expect = async (p, body, status = 200) => {
  const r = await client.call(p, body);
  assert.equal(r.status, status, JSON.stringify(r));
  return r.body;
};
try {
  const codes = JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-Atc",
        "SELECT json_agg(json_build_object('id',id,'code',code)) FROM shared.commodity_code WHERE domain_code='unspsc' AND code IN ('41101502','41101503') AND is_active",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(codes.length, 2);
  for (const code of codes) {
    const command = {
      commodityCodeId: code.id,
      effectiveFrom: "2026-09-23",
      sourceSystem: "catl_direct_demo",
      sourceReference: `aster-unspsc-${code.code}`,
      notes:
        "Synthetic direct UNSPSC declaration. No commercial qualification or company usage implied.",
      idempotencyKey: `catl-direct-unspsc-demo-${code.code}-v1`,
    };
    const result = await expect(path + "/declare", command);
    assert.equal(result.classification.commodity_category_id, null);
    assert.equal((await expect(path + "/declare", command)).replayed, true);
    await expect(
      path + "/declare",
      {
        ...command,
        commodityCategoryId: id("cirrusatlantic", "direct-lab-category"),
      },
      400,
    );
  }
  const read = await expect(path);
  const direct = read.items.filter(
    (x) => x.sourceSystem === "catl_direct_demo",
  );
  assert.equal(direct.length, 2);
  assert.equal(
    direct.find((x) => x.commodityCode === "41101502").mappingStatus,
    "mapped",
  );
  assert.equal(
    direct.find((x) => x.commodityCode === "41101503").mappingStatus,
    "not_mapped",
  );
  assert.ok(
    direct.every(
      (x) =>
        x.classificationBasis === "direct_unspsc" &&
        x.levelNo === 4 &&
        x.categoryId === null,
    ),
  );
  await expect(
    `neon/business-partners/${id("athyper", "partner")}/commodity-classifications`,
    undefined,
    404,
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        businessPartnerId: bp,
        declarations: direct.map((x) => ({
          id: x.id,
          code: x.commodityCode,
          level: x.levelNo,
          mappingStatus: x.mappingStatus,
          categoryMappings: x.categoryMappings,
        })),
        commercialApproval: false,
      },
      null,
      2,
    ),
  );
} finally {
  await client.dispose();
}
