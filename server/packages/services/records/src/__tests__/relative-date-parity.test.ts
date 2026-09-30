import { describe, expect, it } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import { ENTITY_LIST_RELATIVE_DATE_RANGES, ENTITY_LIST_RELATIVE_DATE_VALUES } from "@athyper/contract-platform-entity-list";
import { relativeDateCondition } from "../kysely-record-repository.js";
import { relativeDateMatches } from "../in-memory-record-repository.js";

const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {} as never }) });
const day = (offset: number, hour = 12) => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour).toISOString(); };

describe("relative-date ranges share one definition", () => {
  it("compiles every shared value to a bounded SQL range and rejects anything else", () => {
    for (const value of ENTITY_LIST_RELATIVE_DATE_VALUES) {
      const compiled = relativeDateCondition(sql.ref("created_at"), value).compile(database);
      expect(compiled.sql, value).toMatch(/"created_at" >= .* AND "created_at" < /);
    }
    expect(relativeDateCondition(sql.ref("created_at"), "someday").compile(database).sql).toBe("FALSE");
  });
  it("last_7_days is today-7 through the end of today on both the SQL and in-memory sides", () => {
    expect(relativeDateCondition(sql.ref("d"), "last_7_days").compile(database).sql)
      .toContain("CURRENT_DATE + INTERVAL '-7 days'");
    expect(relativeDateCondition(sql.ref("d"), "last_7_days").compile(database).sql)
      .toContain("< CURRENT_DATE + INTERVAL '1 days'");
    expect(relativeDateMatches(day(-7), "last_7_days")).toBe(true);
    expect(relativeDateMatches(day(-8), "last_7_days")).toBe(false);
    expect(relativeDateMatches(day(0, 23), "last_7_days")).toBe(true);
    expect(relativeDateMatches(day(1, 1), "last_7_days")).toBe(false);
  });
  it("in-memory rolling ranges follow the table for every day-based value", () => {
    for (const [value, range] of Object.entries(ENTITY_LIST_RELATIVE_DATE_RANGES)) {
      if (range.kind !== "days") continue;
      expect(relativeDateMatches(day(range.from), value), value).toBe(true);
      expect(relativeDateMatches(day(range.from - 1, 23), value), value).toBe(false);
      expect(relativeDateMatches(day(range.to - 1, 23), value), value).toBe(true);
      expect(relativeDateMatches(day(range.to, 0), value), value).toBe(false);
    }
  });
  it("calendar values match the current period and exclude the neighbouring one", () => {
    const now = new Date();
    expect(relativeDateMatches(new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString(), "this_month")).toBe(true);
    expect(relativeDateMatches(new Date(now.getFullYear(), now.getMonth() + 1, 1, 12).toISOString(), "this_month")).toBe(false);
    expect(relativeDateMatches(new Date(now.getFullYear() - 1, 6, 1).toISOString(), "last_year")).toBe(true);
    expect(relativeDateMatches(new Date(now.getFullYear(), 6, 1).toISOString(), "last_year")).toBe(false);
    expect(relativeDateMatches(new Date(now.getFullYear() + 1, 0, 1, 12).toISOString(), "next_year")).toBe(true);
  });
});
