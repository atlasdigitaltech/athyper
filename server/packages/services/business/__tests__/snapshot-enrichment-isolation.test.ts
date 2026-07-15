/**
 * Snapshot enrichment isolation — Phase 5 contract lock.
 *
 * The runtime reference-label enricher (svc-records/enrich-reference-labels.ts)
 * attaches presentation-only `${name}_label` / `${name}_code` companion keys
 * to API list/detail responses. Business reads — snapshot capture, GL posting,
 * AP matching, audit replay — MUST remain raw. Promoting display labels into
 * `lifecycle_snapshot`, `journal_entry_line`, or the AP audit log would
 * permanently encode a presentation concern into accounting state.
 *
 * This is a static-analysis check, not a behavioural one. It fails fast when
 * a future change inadvertently couples business code to the enricher.
 *
 * If you NEED labelled rows in a business surface (e.g. a presentation-facing
 * report), add a sibling `...ForDisplay` resolver that composes the enricher
 * on top, and update this test to exempt it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SVC_BUSINESS_ROOT = join(__dirname, "..");
const SVC_RECORDS_ROOT  = join(SVC_BUSINESS_ROOT, "..", "records");

const FORBIDDEN_IMPORT_TOKENS = [
  "enrich-reference-labels",
  "enrichWithReferenceLabels",
  "enrichSingleReferenceLabels",
];

interface FileCheck {
  label: string;
  path:  string;
}

const SNAPSHOT_CRITICAL_FILES: FileCheck[] = [
  {
    label: "child-current-rows.service.ts (raw business read API)",
    path:  join(SVC_BUSINESS_ROOT, "p2p", "child-current-rows.service.ts"),
  },
  {
    label: "snapshot-capture.service.ts (writes lifecycle_snapshot)",
    path:  join(SVC_BUSINESS_ROOT, "lifecycle", "snapshot-capture.service.ts"),
  },
];

function readSource(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Phase 5 contract: expected file at ${path} but couldn't read it (${err instanceof Error ? err.message : String(err)})`);
  }
}

describe("Phase 5 contract — business reads stay raw", () => {
  for (const file of SNAPSHOT_CRITICAL_FILES) {
    it(`does not reference the runtime enricher: ${file.label}`, () => {
      const source = readSource(file.path);
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(source).not.toContain(token);
      }
    });
  }

  it("svc-records/index.ts does not re-export the enricher into the public surface", () => {
    // Reachability bound: the enricher must remain an internal helper of
    // svc-records. Re-exporting it from index.ts would expose it to every
    // workspace dep on @athyper/svc-records (svc-business + svc-finance +
    // svc-workflow), which is exactly the boundary this contract protects.
    const indexSource = readSource(join(SVC_RECORDS_ROOT, "index.ts"));
    for (const token of FORBIDDEN_IMPORT_TOKENS) {
      expect(indexSource).not.toContain(token);
    }
  });
});
