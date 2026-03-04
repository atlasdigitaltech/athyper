// framework/runtime/src/kernel/container.test.ts
import { describe, it, expect } from "vitest";

import { createKernelContainer } from "./container";
import { registerKernelDefaults } from "./container.defaults";
import { TOKENS } from "./tokens";

import type { RuntimeConfig } from "./config.schema";

describe("Container Smoke Tests", () => {
    it("should create a container", () => {
        const container = createKernelContainer();
        expect(container).toBeDefined();
        expect(container.register).toBeTypeOf("function");
        expect(container.resolve).toBeTypeOf("function");
    });

    it("should register and resolve singletons", async () => {
        const container = createKernelContainer();

        let callCount = 0;
        container.register(
            "test.token" as any,
            async () => {
                callCount++;
                return { value: 42 };
            },
            "singleton"
        );

        const instance1 = await container.resolve("test.token" as any);
        const instance2 = await container.resolve("test.token" as any);

        expect(instance1).toBe(instance2); // Same instance
        expect(callCount).toBe(1); // Factory called once
        expect(instance1.value).toBe(42);
    });

    it("should register kernel defaults", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "test",
            mode: "api",
            serviceName: "test-service",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: {
                url: "postgres://test:test@localhost:5432/test",
                poolMax: 10,
            },
            redis: {
                url: "redis://localhost:6379",
            },
            s3: {
                endpoint: "http://localhost:9000",
                accessKey: "test",
                secretKey: "test",
                region: "us-east-1",
                bucket: "test",
                useSSL: false,
            },
            iam: {
                strategy: "single_realm",
                defaultRealmKey: "test",
                realms: {
                    test: {
                        iam: {
                            issuerUrl: "https://test.example.com",
                            clientId: "test-client",
                        },
                        tenants: {},
                    },
                },
            },
            telemetry: {
                enabled: false,
            },
        };

        registerKernelDefaults(container, mockConfig, {
            bootId: "test-boot-id",
            envSnapshot: {
                NODE_ENV: "test",
                MODE: "api",
            },
        });

        // Verify registrations
        const config = await container.resolve(TOKENS.config);
        expect(config).toBe(mockConfig);

        const logger = await container.resolve(TOKENS.logger);
        expect(logger).toBeDefined();
        expect(logger.info).toBeTypeOf("function");

        const lifecycle = await container.resolve(TOKENS.lifecycle);
        expect(lifecycle).toBeDefined();

        const bootId = await container.resolve(TOKENS.bootId);
        expect(bootId).toBe("test-boot-id");

        const env = await container.resolve(TOKENS.env);
        expect(env.NODE_ENV).toBe("test");
        expect(env.MODE).toBe("api");
    });

    it("should have logger with Pino", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "test",
            mode: "api",
            serviceName: "test-service",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://localhost/test", poolMax: 10 },
            redis: { url: "redis://localhost:6379" },
            s3: {
                endpoint: "http://localhost:9000",
                accessKey: "test",
                secretKey: "test",
                region: "us-east-1",
                bucket: "test",
                useSSL: false,
            },
            iam: {
                strategy: "single_realm",
                defaultRealmKey: "test",
                realms: { test: { iam: { issuerUrl: "https://test", clientId: "test" }, tenants: {} } },
            },
            telemetry: { enabled: false },
        };

        registerKernelDefaults(container, mockConfig);

        const logger = await container.resolve(TOKENS.logger);

        // Verify it's a Pino logger (has all methods)
        expect(logger.info).toBeTypeOf("function");
        expect(logger.warn).toBeTypeOf("function");
        expect(logger.error).toBeTypeOf("function");
        expect(logger.debug).toBeTypeOf("function");
        expect(logger.trace).toBeTypeOf("function");
        expect(logger.fatal).toBeTypeOf("function");
        expect(logger.log).toBeTypeOf("function");

        // Should not throw when called
        expect(() => logger.info("test")).not.toThrow();
        expect(() => logger.info({ meta: true }, "test")).not.toThrow();
    });
});
