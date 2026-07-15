import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");

// Phase 0 ratchet (2026-07-14). Lower these ceilings as entity-specific logic
// moves into registered handlers. Never raise them to accommodate new logic.
const DIRECT_LITERAL_BRANCH_CEILING = 27;
const ARRAY_MEMBERSHIP_BRANCH_CEILING = 1;

describe("generic records kernel entity-specific branch budget", () => {
  it("does not add direct entityCode-to-literal conditions", () => {
    const matches = source.match(/\bentityCode\s*(?:===|!==|==|!=)\s*["'][^"']+["']/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(DIRECT_LITERAL_BRANCH_CEILING);
  });

  it("does not add entityCode array-membership branch sites", () => {
    const matches = source.match(/\[[\s\S]*?\]\.includes\(entityCode\)/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(ARRAY_MEMBERSHIP_BRANCH_CEILING);
  });
});

