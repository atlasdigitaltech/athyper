// framework/runtime/src/kernel/container.adapters.test.ts
import { describe, it, expect } from "vitest";

import { createKernelContainer } from "./container";
import { registerAdapters } from "./container.adapters";
import { registerKernelDefaults } from "./container.defaults";
import { TOKENS } from "./tokens";

import type { RuntimeConfig } from "./config.schema";

describe("Adapter Registration Smoke Tests", () => {
    it("should register all adapters", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
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
                accessKey: "minioadmin",
                secretKey: "minioadmin",
                region: "us-east-1",
                bucket: "test-bucket",
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

        // Register kernel defaults first (provides healthRegistry, logger, etc.)
        registerKernelDefaults(container, mockConfig);

        // Should not throw
        await expect(registerAdapters(container, mockConfig)).resolves.not.toThrow();
    });

    it("should resolve database adapter", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
            mode: "api",
            serviceName: "test",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://test:test@localhost:5432/test", poolMax: 5 },
            redis: { url: "redis://localhost:6379" },
            s3: { endpoint: "http://localhost:9000", accessKey: "test", secretKey: "test", region: "us-east-1", bucket: "test", useSSL: false },
            iam: { strategy: "single_realm", defaultRealmKey: "test", realms: { test: { iam: { issuerUrl: "https://test", clientId: "test" }, tenants: {} } } },
            telemetry: { enabled: false },
        };

        registerKernelDefaults(container, mockConfig);
        await registerAdapters(container, mockConfig);

        const db = await container.resolve(TOKENS.db);
        expect(db).toBeDefined();
        // TOKENS.db resolves to Kysely<DB> directly (not DbAdapter wrapper)
        expect(db.selectFrom).toBeTypeOf("function");
        expect(db.insertInto).toBeTypeOf("function");
    });

    it("should register cache adapter (skip instantiation)", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
            mode: "api",
            serviceName: "test",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://localhost/test", poolMax: 5 },
            redis: { url: "redis://localhost:6379/1" },
            s3: { endpoint: "http://localhost:9000", accessKey: "test", secretKey: "test", region: "us-east-1", bucket: "test", useSSL: false },
            iam: { strategy: "single_realm", defaultRealmKey: "test", realms: { test: { iam: { issuerUrl: "https://test", clientId: "test" }, tenants: {} } } },
            telemetry: { enabled: false },
        };

        registerKernelDefaults(container, mockConfig);

        // Just verify registration doesn't throw
        await expect(registerAdapters(container, mockConfig)).resolves.not.toThrow();
        // Actual instantiation skipped (requires real Redis)
    });

    it("should register telemetry adapter", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
            mode: "api",
            serviceName: "test",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://localhost/test", poolMax: 5 },
            redis: { url: "redis://localhost:6379" },
            s3: { endpoint: "http://localhost:9000", accessKey: "test", secretKey: "test", region: "us-east-1", bucket: "test", useSSL: false },
            iam: { strategy: "single_realm", defaultRealmKey: "test", realms: { test: { iam: { issuerUrl: "https://test", clientId: "test" }, tenants: {} } } },
            telemetry: { enabled: false },
        };

        // Register kernel defaults (provides logger, healthRegistry, etc.)
        registerKernelDefaults(container, mockConfig);
        await registerAdapters(container, mockConfig);

        const telemetry = await container.resolve(TOKENS.telemetry);
        expect(telemetry).toBeDefined();
        expect(telemetry.logger).toBeDefined();
        expect(telemetry.getTraceContext).toBeTypeOf("function");
    }, 10000); // Increase timeout

    it("should register and resolve auth adapter", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
            mode: "api",
            serviceName: "test",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://localhost/test", poolMax: 5 },
            redis: { url: "redis://localhost:6379" },
            s3: { endpoint: "http://localhost:9000", accessKey: "test", secretKey: "test", region: "us-east-1", bucket: "test", useSSL: false },
            iam: {
                strategy: "single_realm",
                defaultRealmKey: "test",
                realms: {
                    test: {
                        iam: {
                            issuerUrl: "https://auth.example.com",
                            clientId: "test-client",
                        },
                        tenants: {},
                    },
                },
            },
            telemetry: { enabled: false },
        };

        registerKernelDefaults(container, mockConfig);
        await registerAdapters(container, mockConfig);

        const auth = await container.resolve(TOKENS.auth);
        expect(auth).toBeDefined();
        expect(auth.verifyToken).toBeTypeOf("function");
        expect(auth.getIssuerUrl).toBeTypeOf("function");
    });

    it("should register and resolve object storage adapter", async () => {
        const container = createKernelContainer();

        const mockConfig: RuntimeConfig = {
            env: "local",
            mode: "api",
            serviceName: "test",
            port: 3000,
            logLevel: "info",
            shutdownTimeoutMs: 5000,
            publicBaseUrl: "http://localhost:3000",
            db: { url: "postgres://localhost/test", poolMax: 5 },
            redis: { url: "redis://localhost:6379" },
            s3: {
                endpoint: "http://localhost:9000",
                accessKey: "minioadmin",
                secretKey: "minioadmin",
                region: "us-east-1",
                bucket: "test-bucket",
                useSSL: false,
            },
            iam: { strategy: "single_realm", defaultRealmKey: "test", realms: { test: { iam: { issuerUrl: "https://test", clientId: "test" }, tenants: {} } } },
            telemetry: { enabled: false },
        };

        registerKernelDefaults(container, mockConfig);
        await registerAdapters(container, mockConfig);

        const objectStorage = await container.resolve(TOKENS.objectStorage);
        expect(objectStorage).toBeDefined();
        expect(objectStorage.put).toBeTypeOf("function");
        expect(objectStorage.get).toBeTypeOf("function");
        expect(objectStorage.delete).toBeTypeOf("function");
        expect(objectStorage.list).toBeTypeOf("function");
        expect(objectStorage.healthCheck).toBeTypeOf("function");
    }, 10000); // Increase timeout
});
