// framework/runtime/src/main.ts
/**
 * Entry point for athyper Runtime.
 *
 * This script bootstraps the kernel and starts the appropriate runtime mode
 * (api, worker, or scheduler) based on the kernel configuration.
 *
 * Usage:
 *   pnpm start         # Production (runs compiled dist/main.js)
 *   pnpm start:dev     # Development (runs src/main.ts via tsx)
 *
 * Environment:
 *   ATHYPER_KERNEL_CONFIG_PATH - Path to kernel config file (required)
 *   MODE - Runtime mode: api | worker | scheduler (default: api)
 *
 * Exit Codes:
 *   0  - Clean shutdown
 *   2  - Config file error
 *   3  - Config validation error
 *   4  - IAM secret reference missing
 *   5  - IAM default realm missing
 *   20 - Unknown realm
 *   21 - Unknown tenant
 *   50 - General bootstrap error
 */

import { bootstrap } from "./kernel/bootstrap.js";

async function main(): Promise<void> {
    try {
        const _result = await bootstrap();

        // Log successful boot (logger is now available via container)
        // The bootstrap function handles all logging internally

        // Keep process alive - the HTTP server / worker / scheduler
        // will keep the event loop running
        process.on("SIGTERM", () => {
            // Graceful shutdown is handled by lifecycle.onShutdown in bootstrap
            // This is just a fallback
        });

        process.on("SIGINT", () => {
            // Graceful shutdown is handled by lifecycle.onShutdown in bootstrap
            // This is just a fallback
        });

    } catch (err) {
        // Bootstrap already logs and sets process.exitCode on failure
        // Re-throw to ensure non-zero exit if not already set
        if (!process.exitCode) {
            process.exitCode = 1;
        }

        // In development, print the full error for debugging
        if (process.env.NODE_ENV !== "production") {
            console.error("\n[main] Bootstrap failed with error:\n", err);
        }

        // Don't call process.exit() - let the event loop drain naturally
        // The exitCode is already set by bootstrap's fatal() handler
    }
}

// Run the main function
main();
