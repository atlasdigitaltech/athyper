import { describe, it, expect } from "vitest";

import {
    headingParamsSchema,
    spacerParamsSchema,
    shortcutParamsSchema,
    kpiParamsSchema,
    listParamsSchema,
    chartParamsSchema,
    widgetParamsSchemaMap,
} from "./widget-params.schema.js";

// ─── Heading ────────────────────────────────────────────

describe("headingParamsSchema", () => {
    it("accepts valid heading params", () => {
        expect(headingParamsSchema.safeParse({ text_key: "dashboard.title", level: "h1" }).success).toBe(true);
    });

    it("accepts all valid levels", () => {
        for (const level of ["h1", "h2", "h3", "h4"]) {
            expect(headingParamsSchema.safeParse({ text_key: "k", level }).success).toBe(true);
        }
    });

    it("rejects invalid level", () => {
        expect(headingParamsSchema.safeParse({ text_key: "k", level: "h5" }).success).toBe(false);
    });

    it("rejects empty text_key", () => {
        expect(headingParamsSchema.safeParse({ text_key: "", level: "h1" }).success).toBe(false);
    });

    it("rejects missing text_key", () => {
        expect(headingParamsSchema.safeParse({ level: "h1" }).success).toBe(false);
    });
});

// ─── Spacer ─────────────────────────────────────────────

describe("spacerParamsSchema", () => {
    it("accepts valid spacer params", () => {
        for (const height of ["sm", "md", "lg"]) {
            expect(spacerParamsSchema.safeParse({ height }).success).toBe(true);
        }
    });

    it("rejects invalid height", () => {
        expect(spacerParamsSchema.safeParse({ height: "xl" }).success).toBe(false);
    });

    it("rejects missing height", () => {
        expect(spacerParamsSchema.safeParse({}).success).toBe(false);
    });
});

// ─── Shortcut ───────────────────────────────────────────

describe("shortcutParamsSchema", () => {
    it("accepts valid shortcut params", () => {
        const result = shortcutParamsSchema.safeParse({
            label_key: "nav.orders",
            href: "/orders",
        });
        expect(result.success).toBe(true);
    });

    it("accepts optional icon and description_key", () => {
        const result = shortcutParamsSchema.safeParse({
            label_key: "nav.orders",
            href: "/orders",
            icon: "ShoppingCart",
            description_key: "nav.orders.desc",
        });
        expect(result.success).toBe(true);
    });

    it("rejects empty label_key", () => {
        expect(shortcutParamsSchema.safeParse({ label_key: "", href: "/x" }).success).toBe(false);
    });

    it("rejects empty href", () => {
        expect(shortcutParamsSchema.safeParse({ label_key: "k", href: "" }).success).toBe(false);
    });

    it("rejects missing label_key", () => {
        expect(shortcutParamsSchema.safeParse({ href: "/x" }).success).toBe(false);
    });
});

// ─── KPI ────────────────────────────────────────────────

describe("kpiParamsSchema", () => {
    const valid = { label_key: "kpi.total", query_key: "crm.orders", format: "number" as const };

    it("accepts valid kpi params", () => {
        expect(kpiParamsSchema.safeParse(valid).success).toBe(true);
    });

    it("accepts all format types", () => {
        for (const format of ["number", "currency", "percent"]) {
            expect(kpiParamsSchema.safeParse({ ...valid, format }).success).toBe(true);
        }
    });

    it("rejects invalid format", () => {
        expect(kpiParamsSchema.safeParse({ ...valid, format: "text" }).success).toBe(false);
    });

    it("accepts optional trend_query_key", () => {
        expect(kpiParamsSchema.safeParse({ ...valid, trend_query_key: "crm.orders_prev" }).success).toBe(true);
    });

    it("accepts optional currency_code", () => {
        expect(kpiParamsSchema.safeParse({ ...valid, format: "currency", currency_code: "MYR" }).success).toBe(true);
    });

    it("rejects missing query_key", () => {
        expect(kpiParamsSchema.safeParse({ label_key: "k", format: "number" }).success).toBe(false);
    });

    it("rejects missing label_key", () => {
        expect(kpiParamsSchema.safeParse({ query_key: "q", format: "number" }).success).toBe(false);
    });
});

// ─── List ───────────────────────────────────────────────

describe("listParamsSchema", () => {
    const valid = {
        title_key: "list.orders",
        query_key: "crm.orders",
        columns: ["id", "name", "amount"],
        page_size: 10,
    };

    it("accepts valid list params", () => {
        expect(listParamsSchema.safeParse(valid).success).toBe(true);
    });

    it("accepts optional link_template", () => {
        expect(listParamsSchema.safeParse({ ...valid, link_template: "/orders/{id}" }).success).toBe(true);
    });

    it("applies default page_size of 10", () => {
        const { page_size: _page_size, ...noPageSize } = valid;
        const result = listParamsSchema.safeParse(noPageSize);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page_size).toBe(10);
        }
    });

    it("rejects page_size below 1", () => {
        expect(listParamsSchema.safeParse({ ...valid, page_size: 0 }).success).toBe(false);
    });

    it("rejects page_size above 100", () => {
        expect(listParamsSchema.safeParse({ ...valid, page_size: 101 }).success).toBe(false);
    });

    it("accepts page_size at boundaries (1 and 100)", () => {
        expect(listParamsSchema.safeParse({ ...valid, page_size: 1 }).success).toBe(true);
        expect(listParamsSchema.safeParse({ ...valid, page_size: 100 }).success).toBe(true);
    });

    it("rejects empty columns array", () => {
        expect(listParamsSchema.safeParse({ ...valid, columns: [] }).success).toBe(false);
    });

    it("rejects missing query_key", () => {
        const { query_key: _query_key, ...missing } = valid;
        expect(listParamsSchema.safeParse(missing).success).toBe(false);
    });
});

// ─── Chart ──────────────────────────────────────────────

describe("chartParamsSchema", () => {
    const valid = {
        title_key: "chart.revenue",
        query_key: "finance.monthly",
        chart_type: "bar" as const,
    };

    it("accepts valid chart params", () => {
        expect(chartParamsSchema.safeParse(valid).success).toBe(true);
    });

    it("accepts all chart types", () => {
        for (const chart_type of ["bar", "line", "area", "pie"]) {
            expect(chartParamsSchema.safeParse({ ...valid, chart_type }).success).toBe(true);
        }
    });

    it("rejects invalid chart_type", () => {
        expect(chartParamsSchema.safeParse({ ...valid, chart_type: "scatter" }).success).toBe(false);
    });

    it("accepts optional config", () => {
        const result = chartParamsSchema.safeParse({
            ...valid,
            config: { xAxis: "month", yAxis: "revenue" },
        });
        expect(result.success).toBe(true);
    });

    it("rejects missing title_key", () => {
        const { title_key: _title_key, ...missing } = valid;
        expect(chartParamsSchema.safeParse(missing).success).toBe(false);
    });

    it("rejects missing query_key", () => {
        const { query_key: _query_key, ...missing } = valid;
        expect(chartParamsSchema.safeParse(missing).success).toBe(false);
    });
});

// ─── Schema Map ─────────────────────────────────────────

describe("widgetParamsSchemaMap", () => {
    it("contains all 6 widget types", () => {
        expect(Object.keys(widgetParamsSchemaMap)).toEqual(
            expect.arrayContaining(["heading", "spacer", "shortcut", "kpi", "list", "chart"]),
        );
        expect(Object.keys(widgetParamsSchemaMap)).toHaveLength(6);
    });

    it("maps heading to headingParamsSchema", () => {
        expect(widgetParamsSchemaMap.heading).toBe(headingParamsSchema);
    });

    it("maps kpi to kpiParamsSchema", () => {
        expect(widgetParamsSchemaMap.kpi).toBe(kpiParamsSchema);
    });

    it("maps list to listParamsSchema", () => {
        expect(widgetParamsSchemaMap.list).toBe(listParamsSchema);
    });

    it("maps chart to chartParamsSchema", () => {
        expect(widgetParamsSchemaMap.chart).toBe(chartParamsSchema);
    });
});
