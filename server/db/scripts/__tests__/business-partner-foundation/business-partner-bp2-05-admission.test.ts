import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");

test("BP2-05 materialization admits canonical classifications and completed certificate evidence only", async () => {
  const source = await readFile(
    resolve(root, "ddl/planes/neon/master/07_functions.sql"),
    "utf8",
  );
  assert.match(source, /active category owned by this tenant/);
  assert.match(source, /commodityCodeId.*crosswalkId/);
  assert.match(source, /Industry classification requires an active code in the selected domain/);
  assert.match(source, /Industry crosswalks are reference evidence/);
  assert.match(source, /Certification evidence must be a completed attachment linked/);
  assert.match(source, /attachment\.is_active AND attachment\.is_virus_scanned/);
  assert.match(source, /series\.current_attachment_id=attachment\.id/);
});

test("BP2-05 DDL retains tenant category ownership, domain-qualified industry identity, and type/custom certification XOR", async () => {
  const [tables, constraints] = await Promise.all([
    readFile(resolve(root, "ddl/planes/neon/master/03_tables.sql"), "utf8"),
    readFile(resolve(root, "ddl/planes/neon/master/05_constraints.sql"), "utf8"),
  ]);
  assert.match(tables, /CREATE TABLE master\.business_partner_commodity_capability/);
  assert.match(constraints, /business_partner_commodity_capability_category_fk/);
  assert.match(constraints, /FOREIGN KEY \(industry_domain_code, industry_code_id\)/);
  assert.match(constraints, /certification_type_xor_custom_chk/);
});

test("BP2-04 materialization normalizes alias tags and preserves directional self-link denial", async () => {
  const source = await readFile(
    resolve(root, "ddl/planes/neon/master/07_functions.sql"),
    "utf8",
  );
  assert.match(source, /Alias language must be a base language or language-region locale/);
  assert.match(source, /lower\(split_part\(alias_language,'-',1\)\)/);
  assert.match(source, /A Business Partner cannot relate to itself/);
  assert.match(source, /source_business_partner_id,target_business_partner_id/);
});

test("BP2-04 materialization admits only active identifier and tax references", async () => {
  const source = await readFile(
    resolve(root, "ddl/planes/neon/master/07_functions.sql"),
    "utf8",
  );
  assert.match(source, /Identifier issuing country must be an active supported country/);
  assert.match(source, /Tax registration jurisdiction must be an active supported jurisdiction and subdivision/);
  assert.match(source, /Tax registration type must be an active type owned by this tenant/);
  assert.match(source, /subdivision\.code=jurisdiction\.state_region_code/);
});

test("BP2-02/03 materialization preserves address references and contact-person channel ownership", async () => {
  const source = await readFile(
    resolve(root, "ddl/planes/neon/master/07_functions.sql"),
    "utf8",
  );
  assert.match(source, /Address subdivision must be active and belong to the selected country/);
  assert.match(source, /Directory region entry requires a subdivision code/);
  assert.match(source, /Manual region entry cannot assert a subdivision code/);
  assert.match(source, /Address timezone must be an active supported timezone/);
  assert.match(source, /contact_owner_type_id,contact_id/);
  assert.match(source, /Contact person owner type is unavailable/);
});
