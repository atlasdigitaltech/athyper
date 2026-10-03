import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseTableEntityProduct, compileTableEntityProduct } from "./table-product.js";
const source = (file: string) => JSON.parse(readFileSync(resolveSourcePath(new URL(`../../../../../../../metadata/entities/principal/${file}.json`, import.meta.url)), "utf8"));
it("hydrates Principal labels and enum translations before compiling each plane", () => {
 const product = parseTableEntityProduct(source("definition"), source("localization"));
 for (const plane of ["neon", "mesh", "studio"] as const) {
  const {graph, artifact} = compileTableEntityProduct(product, plane);
  const labels = graph.surfaces?.find(surface => surface.surfaceKind === "list")?.layoutConfig?.localizedLabels as any;
  expect(labels.fields.name.values.ms).toBe("Nama");
  expect(labels.options.provisioning_source.jit.values.en).toBe("JIT");
  expect(labels.options.status.active.values.ar).toBe("نشط");
  expect(JSON.stringify(artifact.descriptor)).toContain('"Nama"');
 }
});
it("rejects incomplete sidecars rather than publishing untranslated references", () => {
 const translations=source("localization");delete translations.values['entity.principal.fields.name'];
 expect(()=>parseTableEntityProduct(source("definition"), translations)).toThrow("ENTITY_LOCALIZATION_LABEL_REQUIRED");
});
