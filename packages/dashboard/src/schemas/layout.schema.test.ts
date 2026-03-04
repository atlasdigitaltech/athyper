import { describe, it, expect } from "vitest";

import { gridPositionSchema, layoutItemSchema, dashboardLayoutSchema } from "./layout.schema.js";

describe("gridPositionSchema", () => {
    it("accepts a valid grid position", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 3, h: 2 });
        expect(result.success).toBe(true);
    });

    it("accepts max x bound (11)", () => {
        const result = gridPositionSchema.safeParse({ x: 11, y: 0, w: 1, h: 1 });
        expect(result.success).toBe(true);
    });

    it("rejects x beyond max (12)", () => {
        const result = gridPositionSchema.safeParse({ x: 12, y: 0, w: 1, h: 1 });
        expect(result.success).toBe(false);
    });

    it("rejects negative x", () => {
        const result = gridPositionSchema.safeParse({ x: -1, y: 0, w: 1, h: 1 });
        expect(result.success).toBe(false);
    });

    it("accepts large y values", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 999, w: 1, h: 1 });
        expect(result.success).toBe(true);
    });

    it("rejects negative y", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: -1, w: 1, h: 1 });
        expect(result.success).toBe(false);
    });

    it("accepts max w (12)", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 12, h: 1 });
        expect(result.success).toBe(true);
    });

    it("rejects w beyond max (13)", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 13, h: 1 });
        expect(result.success).toBe(false);
    });

    it("rejects w of 0", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 0, h: 1 });
        expect(result.success).toBe(false);
    });

    it("rejects h of 0", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 1, h: 0 });
        expect(result.success).toBe(false);
    });

    it("accepts h of 1", () => {
        const result = gridPositionSchema.safeParse({ x: 0, y: 0, w: 1, h: 1 });
        expect(result.success).toBe(true);
    });
});

describe("layoutItemSchema", () => {
    const validItem = {
        id: "widget-1",
        widget_type: "kpi",
        params: { label_key: "sales.total", query_key: "crm.orders" },
        grid: { x: 0, y: 0, w: 3, h: 2 },
    };

    it("accepts a valid layout item", () => {
        const result = layoutItemSchema.safeParse(validItem);
        expect(result.success).toBe(true);
    });

    it("rejects empty id", () => {
        const result = layoutItemSchema.safeParse({ ...validItem, id: "" });
        expect(result.success).toBe(false);
    });

    it("rejects empty widget_type", () => {
        const result = layoutItemSchema.safeParse({ ...validItem, widget_type: "" });
        expect(result.success).toBe(false);
    });

    it("accepts empty params object", () => {
        const result = layoutItemSchema.safeParse({ ...validItem, params: {} });
        expect(result.success).toBe(true);
    });
});

describe("dashboardLayoutSchema", () => {
    const validLayout = {
        schema_version: 1,
        columns: 12,
        row_height: 80,
        items: [],
    };

    it("accepts a valid layout with empty items", () => {
        const result = dashboardLayoutSchema.safeParse(validLayout);
        expect(result.success).toBe(true);
    });

    it("accepts a layout with items", () => {
        const result = dashboardLayoutSchema.safeParse({
            ...validLayout,
            items: [
                {
                    id: "w1",
                    widget_type: "kpi",
                    params: {},
                    grid: { x: 0, y: 0, w: 3, h: 2 },
                },
            ],
        });
        expect(result.success).toBe(true);
    });

    it("rejects schema_version other than 1", () => {
        const result = dashboardLayoutSchema.safeParse({ ...validLayout, schema_version: 2 });
        expect(result.success).toBe(false);
    });

    it("rejects columns other than 12", () => {
        const result = dashboardLayoutSchema.safeParse({ ...validLayout, columns: 6 });
        expect(result.success).toBe(false);
    });

    it("rejects row_height below 20", () => {
        const result = dashboardLayoutSchema.safeParse({ ...validLayout, row_height: 19 });
        expect(result.success).toBe(false);
    });

    it("rejects row_height above 200", () => {
        const result = dashboardLayoutSchema.safeParse({ ...validLayout, row_height: 201 });
        expect(result.success).toBe(false);
    });

    it("accepts row_height at boundaries (20 and 200)", () => {
        expect(dashboardLayoutSchema.safeParse({ ...validLayout, row_height: 20 }).success).toBe(true);
        expect(dashboardLayoutSchema.safeParse({ ...validLayout, row_height: 200 }).success).toBe(true);
    });
});
