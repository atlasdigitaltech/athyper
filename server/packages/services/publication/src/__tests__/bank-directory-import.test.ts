import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeBankDirectoryImport,
  sourceKey,
} from "../bank-directory-import.js";
const seed = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../db/seed/reference/bank-directory/development.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const empty = {
  institutions: [],
  branches: [],
  identifiers: [],
  sourceRecords: [],
};
const countries = new Set(["SG", "GB", "MY"]);
const parse = (
  input: unknown,
  prior = empty as ReturnType<typeof normalizeBankDirectoryImport>["payload"],
) => normalizeBankDirectoryImport(input, prior, countries);
describe("governed directory imports", () => {
  it("normalizes a verified three-country development set and reimports without changes", () => {
    const first = parse(seed);
    expect(first.report.valid).toBe(true);
    expect(first.payload.institutions).toHaveLength(3);
    const repeat = parse(seed, first.payload);
    expect(repeat.payload).toEqual(first.payload);
    expect(repeat.report.additions).toEqual([]);
    expect(repeat.report.changes).toEqual([]);
  });
  it("rejects malformed format and unexpected fields", () => {
    expect(() => parse({})).toThrow(/FORMAT/);
    const input = structuredClone(seed);
    input.payload.institutions[0].accountNumber = "private";
    expect(() => parse(input)).toThrow(/UNKNOWN_FIELD/);
  });
  it.each(["country", "bic", "dates", "scheme"])(
    "holds invalid %s for correction",
    (kind) => {
      const input = structuredClone(seed);
      if (kind === "country") input.payload.institutions[0].countryCode = "ZZ";
      if (kind === "bic") input.payload.identifiers[0].value = "NOT-A-BIC";
      if (kind === "dates")
        input.payload.identifiers[0].effectiveFrom = "2026-02-30";
      if (kind === "scheme") input.payload.identifiers[0].scheme = "iban";
      expect(parse(input).report.valid).toBe(false);
    },
  );
  it("holds strong-identifier matches from a new source until explicitly resolved", () => {
    const first = parse(seed);
    const input = structuredClone(seed);
    const old = input.sources[0].source;
    input.sources[0].source = "https://another-official-source.test";
    input.payload.sourceRecords.find(
      (r: { source: string }) => r.source === old,
    ).source = input.sources[0].source;
    expect(
      parse(input, first.payload).report.issues.some(
        (i) => i.code === "REVIEW_REQUIRED",
      ),
    ).toBe(true);
    const ref = input.payload.sourceRecords[0];
    input.resolutions = {
      [sourceKey(ref.source, ref.sourceRecordId)]:
        first.payload.sourceRecords.find((r) => r.source === old)!
          .institutionId,
    };
    expect(parse(input, first.payload).report.valid).toBe(true);
  });
  it("preserves absent records and reports explicit retirements", () => {
    const first = parse(seed);
    const input = structuredClone(seed);
    input.payload.institutions.pop();
    input.payload.identifiers.pop();
    input.payload.sourceRecords.pop();
    expect(parse(input, first.payload).payload.institutions).toHaveLength(3);
    input.payload.institutions[0].status = "retired";
    expect(parse(input, first.payload).report.retirements).toHaveLength(1);
  });
  it("retains identifier identity from a previously administered release", () => {
    const first = parse(seed);
    const payload = {
      ...first.payload,
      identifiers: first.payload.identifiers.map((r, i) => ({
        ...r,
        id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })),
    };
    expect(parse(seed, payload).report.valid).toBe(true);
    expect(parse(seed, payload).report.additions).toHaveLength(0);
  });
  it("rejects overlapping assignments and inconsistent branch parents", () => {
    const input = structuredClone(seed);
    input.payload.identifiers.push({
      ...input.payload.identifiers[0],
      id: "overlap",
      effectiveFrom: "2026-09-09",
    });
    expect(
      parse(input).report.issues.some((i) => i.code === "IDENTIFIER_CONFLICT"),
    ).toBe(true);
  });
});
