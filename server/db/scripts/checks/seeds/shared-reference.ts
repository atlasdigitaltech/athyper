import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const db = resolve(import.meta.dirname, "../../..");
const referenceDir = resolve(db, "ddl/common/shared/reference-data");
const legacyDir = resolve(db, "seed/platform/001_global_reference");
const entrypointPath = resolve(db, "ddl/common/shared/12_reference_seed.sql");
const validatorPath = resolve(db, "ddl/common/shared/07_functions.sql");

const expectedFiles = [
  "001_country.sql", "002_state_region.sql", "003_currency.sql", "004_language.sql",
  "005_locale.sql", "006_timezone.sql", "007_uom.sql",
  "008a_commodity_code_unspsc.sql", "008b_commodity_code_hs.sql",
  "008c_commodity_crosswalk.sql", "008d_commodity_code_keywords.sql",
  "009b_industry_code_isic_groups_classes.sql", "009c_industry_code_naics_subsectors.sql",
  "009d_industry_crosswalk.sql", "009e_industry_code_keywords.sql",
];

const actualFiles = readdirSync(referenceDir).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(actualFiles, expectedFiles, "the complete 15-file reference pack must be moved");
assert.ok(!existsSync(legacyDir) || readdirSync(legacyDir).filter((name) => name.endsWith(".sql")).length === 0,
  "legacy global-reference directory must contain no SQL payloads");

const entrypoint = readFileSync(entrypointPath, "utf8");
let priorInclude = -1;
for (const file of expectedFiles) {
  const marker = `\\ir reference-data/${file}`;
  const index = entrypoint.indexOf(marker);
  assert.ok(index > priorInclude, `${file} must be included once in dependency order`);
  priorInclude = index;
}
assert.ok(entrypoint.indexOf("SELECT shared.validate_reference_seed();") > priorInclude,
  "the final semantic validation must execute after every payload");
assert.match(entrypoint, /SET app\.reference_seed_mode = 'on'/);
assert.match(entrypoint, /RESET app\.reference_seed_mode/);
assert.match(entrypoint, /current_setting\('app\.database_plane', true\)/);

const provenance = JSON.parse(readFileSync(resolve(referenceDir, "provenance.v1.json"), "utf8")) as {
  extractionDate: string;
  datasets: Array<{ files: string[]; standard: string; edition: string; publisher: string }>;
};
assert.match(provenance.extractionDate, /^\d{4}-\d{2}-\d{2}$/);
const documented = new Set(provenance.datasets.flatMap((dataset) => {
  assert.ok(dataset.standard && dataset.edition && dataset.publisher, "provenance fields must be non-empty");
  return dataset.files;
}));
assert.deepEqual([...documented].sort(), expectedFiles, "every payload needs publisher, edition, and extraction provenance");

for (const plane of ["studio", "neon", "mesh"]) {
  const manifest = readFileSync(resolve(db, `ddl/planes/${plane}/_manifest.txt`), "utf8");
  assert.match(manifest, /^common\/shared\/12_reference_seed\.sql$/m,
    `${plane} must execute the common layer-12 reference entrypoint`);
}

const validator = readFileSync(validatorPath, "utf8");
for (const invariant of [
  "ISO country code completeness or uniqueness",
  "ISO currency code completeness or uniqueness",
  "ISO language code normalization or uniqueness",
  "state-to-country relationship or ISO 3166-2 prefix mismatch",
  "UOM dimension or conversion family invalid",
  "commodity hierarchy depth invalid",
  "industry hierarchy depth invalid",
  "commodity crosswalk endpoint missing or inactive",
  "industry crosswalk endpoint missing or inactive",
  "commodity keyword normalization invalid",
  "industry keyword normalization invalid",
]) assert.ok(validator.includes(invariant), `missing validator: ${invariant}`);

const largePayloads = ["008a_commodity_code_unspsc.sql", "008b_commodity_code_hs.sql", "008c_commodity_crosswalk.sql"];
for (const file of largePayloads) {
  const sql = readFileSync(resolve(referenceDir, file), "utf8");
  assert.ok((sql.match(/\bON CONFLICT\b/gi) ?? []).length > 1, `${file} must retain batched convergent loading`);
}

console.log("Wave 2 shared-reference contract verified: 15 payloads, 3 plane manifests, provenance and semantic guards.");
