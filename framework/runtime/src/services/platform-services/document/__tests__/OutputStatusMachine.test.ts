/**
 * Output Status State Machine — unit tests.
 *
 * Covers: valid transitions, invalid transitions, terminal states.
 */

import { describe, it, expect } from "vitest";

import {
    isValidOutputTransition,
    OUTPUT_STATUS_TRANSITIONS,
    type OutputStatus,
} from "../domain/types.js";

describe("Output Status State Machine", () => {
    // -----------------------------------------------------------------------
    // Valid transitions
    // -----------------------------------------------------------------------

    describe("valid transitions", () => {
        const validCases: Array<[OutputStatus, OutputStatus]> = [
            ["QUEUED", "RENDERING"],
            ["QUEUED", "FAILED"],
            ["RENDERING", "RENDERED"],
            ["RENDERING", "FAILED"],
            ["RENDERED", "DELIVERED"],
            ["RENDERED", "ARCHIVED"],
            ["RENDERED", "REVOKED"],
            ["DELIVERED", "ARCHIVED"],
            ["DELIVERED", "REVOKED"],
            ["FAILED", "ARCHIVED"],
        ];

        for (const [from, to] of validCases) {
            it(`should allow ${from} → ${to}`, () => {
                expect(isValidOutputTransition(from, to)).toBe(true);
            });
        }
    });

    // -----------------------------------------------------------------------
    // Invalid transitions
    // -----------------------------------------------------------------------

    describe("invalid transitions", () => {
        const invalidCases: Array<[OutputStatus, OutputStatus]> = [
            // No self-transitions
            ["QUEUED", "QUEUED"],
            ["RENDERING", "RENDERING"],
            ["RENDERED", "RENDERED"],

            // Cannot go backward
            ["RENDERING", "QUEUED"],
            ["RENDERED", "RENDERING"],
            ["RENDERED", "QUEUED"],
            ["DELIVERED", "RENDERED"],
            ["DELIVERED", "RENDERING"],

            // Cannot go from QUEUED directly to RENDERED/DELIVERED
            ["QUEUED", "RENDERED"],
            ["QUEUED", "DELIVERED"],
            ["QUEUED", "ARCHIVED"],
            ["QUEUED", "REVOKED"],

            // RENDERING cannot go to DELIVERED/ARCHIVED/REVOKED directly
            ["RENDERING", "DELIVERED"],
            ["RENDERING", "ARCHIVED"],
            ["RENDERING", "REVOKED"],

            // FAILED is nearly terminal — only ARCHIVED allowed
            ["FAILED", "QUEUED"],
            ["FAILED", "RENDERING"],
            ["FAILED", "RENDERED"],
            ["FAILED", "DELIVERED"],
            ["FAILED", "REVOKED"],
            ["FAILED", "FAILED"],
        ];

        for (const [from, to] of invalidCases) {
            it(`should reject ${from} → ${to}`, () => {
                expect(isValidOutputTransition(from, to)).toBe(false);
            });
        }
    });

    // -----------------------------------------------------------------------
    // Terminal states
    // -----------------------------------------------------------------------

    describe("terminal states", () => {
        it("ARCHIVED should have no valid transitions", () => {
            expect(OUTPUT_STATUS_TRANSITIONS.ARCHIVED).toEqual([]);

            const allStatuses: OutputStatus[] = [
                "QUEUED", "RENDERING", "RENDERED", "DELIVERED", "FAILED", "ARCHIVED", "REVOKED",
            ];
            for (const target of allStatuses) {
                expect(isValidOutputTransition("ARCHIVED", target)).toBe(false);
            }
        });

        it("REVOKED should have no valid transitions", () => {
            expect(OUTPUT_STATUS_TRANSITIONS.REVOKED).toEqual([]);

            const allStatuses: OutputStatus[] = [
                "QUEUED", "RENDERING", "RENDERED", "DELIVERED", "FAILED", "ARCHIVED", "REVOKED",
            ];
            for (const target of allStatuses) {
                expect(isValidOutputTransition("REVOKED", target)).toBe(false);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Transition map completeness
    // -----------------------------------------------------------------------

    describe("transition map completeness", () => {
        it("should have entries for all OutputStatus values", () => {
            const allStatuses: OutputStatus[] = [
                "QUEUED", "RENDERING", "RENDERED", "DELIVERED", "FAILED", "ARCHIVED", "REVOKED",
            ];

            for (const status of allStatuses) {
                expect(OUTPUT_STATUS_TRANSITIONS).toHaveProperty(status);
                expect(Array.isArray(OUTPUT_STATUS_TRANSITIONS[status])).toBe(true);
            }
        });

        it("should only reference valid statuses in transitions", () => {
            const allStatuses = new Set<string>([
                "QUEUED", "RENDERING", "RENDERED", "DELIVERED", "FAILED", "ARCHIVED", "REVOKED",
            ]);

            for (const [from, targets] of Object.entries(OUTPUT_STATUS_TRANSITIONS)) {
                expect(allStatuses.has(from)).toBe(true);
                for (const target of targets) {
                    expect(allStatuses.has(target)).toBe(true);
                }
            }
        });
    });

    // -----------------------------------------------------------------------
    // Error taxonomy
    // -----------------------------------------------------------------------

    describe("classifyDocError", async () => {
        const { classifyDocError, DOC_ERROR_CODES } = await import("../domain/types.js");

        it("should classify timeout errors", () => {
            const result = classifyDocError(new Error("Operation timed out after 30s"));
            expect(result.code).toBe(DOC_ERROR_CODES.RENDER_TIMEOUT);
            expect(result.category).toBe("timeout");
        });

        it("should classify Chromium crash errors", () => {
            const result = classifyDocError(new Error("Protocol error: Target closed"));
            expect(result.code).toBe(DOC_ERROR_CODES.CHROMIUM_CRASH);
            expect(result.category).toBe("crash");
        });

        it("should classify template-not-found errors", () => {
            const result = classifyDocError(new Error("Template not found for code XYZ"));
            expect(result.code).toBe(DOC_ERROR_CODES.TEMPLATE_NOT_FOUND);
            expect(result.category).toBe("permanent");
        });

        it("should classify schema validation errors", () => {
            const result = classifyDocError(new Error("Template variable validation failed: missing x"));
            expect(result.code).toBe(DOC_ERROR_CODES.SCHEMA_VALIDATION_FAILED);
            expect(result.category).toBe("permanent");
        });

        it("should classify storage errors as transient", () => {
            const result = classifyDocError(new Error("Storage put failed: MinIO unreachable"));
            expect(result.code).toBe(DOC_ERROR_CODES.STORAGE_WRITE_FAILED);
            expect(result.category).toBe("transient");
        });

        it("should classify compose errors as permanent", () => {
            const result = classifyDocError(new Error("Template render error, bad compose step"));
            expect(result.code).toBe(DOC_ERROR_CODES.COMPOSE_FAILED);
            expect(result.category).toBe("permanent");
        });

        it("should classify unknown errors as transient UNKNOWN", () => {
            const result = classifyDocError(new Error("Something unexpected happened"));
            expect(result.code).toBe(DOC_ERROR_CODES.UNKNOWN);
            expect(result.category).toBe("transient");
        });

        it("should handle non-Error values", () => {
            const result = classifyDocError("a plain string error");
            expect(result.code).toBe(DOC_ERROR_CODES.UNKNOWN);
            expect(result.category).toBe("transient");
        });
    });
});
