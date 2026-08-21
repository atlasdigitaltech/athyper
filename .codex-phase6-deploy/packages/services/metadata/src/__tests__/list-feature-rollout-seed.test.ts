import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const seedPath = fileURLToPath(new URL(
  "../../../../../db/seed/platform/003_control/040_control_entity_contract.sql",
  import.meta.url,
));

function entitySeedRow(entityCode: string): string {
  const source = readFileSync(seedPath, "utf8");
  const row = source.split(/\r?\n/).find((line) => line.includes(`'${entityCode}'`));
  expect(row, `Missing canonical seed row for ${entityCode}`).toBeDefined();
  return row!;
}

describe("runtime list feature rollout seed", () => {
  it.each(["journal_entry", "purchase_invoice"])(
    "declares %s list policy in the original reset seed row",
    (entityCode) => {
      const row = entitySeedRow(entityCode);

      expect(row).toContain('"list_renderer":"table"');
      expect(row).toContain('"view_modes":["table","compact","spreadsheet"]');
      expect(row).toContain('"list_features"');
      expect(row).toContain('"saved_views":true');
      expect(row).toContain('"multi_sort":true');
      expect(row).toContain('"max_sort_levels":3');
      expect(row).toContain('"max_page_size":200');
    },
  );
});
