// framework/runtime/src/kernel/logger.test.ts
import { describe, it, expect } from "vitest";

import { createPinoLogger } from "./logger";

describe("Pino Logger Smoke Tests", () => {
    it("should create a logger instance", () => {
        const logger = createPinoLogger({
            level: "info",
            serviceName: "test-service",
            env: "test",
            pretty: false,
        });

        expect(logger).toBeDefined();
        expect(logger.info).toBeTypeOf("function");
        expect(logger.warn).toBeTypeOf("function");
        expect(logger.error).toBeTypeOf("function");
        expect(logger.debug).toBeTypeOf("function");
        expect(logger.trace).toBeTypeOf("function");
        expect(logger.fatal).toBeTypeOf("function");
        expect(logger.log).toBeTypeOf("function");
    });

    it("should support (msg, meta) signature", () => {
        const logger = createPinoLogger({
            level: "info",
            serviceName: "test",
            env: "test",
        });

        // Should not throw
        expect(() => logger.info("test message", { key: "value" })).not.toThrow();
        expect(() => logger.warn("warning", { code: 123 })).not.toThrow();
        expect(() => logger.error("error", { error: true })).not.toThrow();
    });

    it("should support (meta, msg) signature", () => {
        const logger = createPinoLogger({
            level: "info",
            serviceName: "test",
            env: "test",
        });

        // Should not throw
        expect(() => logger.info({ key: "value" }, "test message")).not.toThrow();
        expect(() => logger.warn({ code: 123 }, "warning")).not.toThrow();
        expect(() => logger.error({ error: true }, "error")).not.toThrow();
    });

    it("should support single argument (msg or meta)", () => {
        const logger = createPinoLogger({
            level: "info",
            serviceName: "test",
            env: "test",
        });

        // Should not throw
        expect(() => logger.info("just a message")).not.toThrow();
        expect(() => logger.info({ just: "meta" })).not.toThrow();
        expect(() => logger.log("log message")).not.toThrow();
    });

    it("should create logger with pretty output", () => {
        const logger = createPinoLogger({
            level: "debug",
            serviceName: "test",
            env: "local",
            pretty: true,
        });

        expect(logger).toBeDefined();
        expect(() => logger.debug("pretty log")).not.toThrow();
    });

    it("should respect log level", () => {
        const logger = createPinoLogger({
            level: "error", // Only error and fatal
            serviceName: "test",
            env: "test",
        });

        // All should not throw (Pino just won't emit below threshold)
        expect(() => logger.trace("should be silent")).not.toThrow();
        expect(() => logger.debug("should be silent")).not.toThrow();
        expect(() => logger.info("should be silent")).not.toThrow();
        expect(() => logger.warn("should be silent")).not.toThrow();
        expect(() => logger.error("should emit")).not.toThrow();
        expect(() => logger.fatal("should emit")).not.toThrow();
    });
});
