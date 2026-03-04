/**
 * Automation Jobs Services
 *
 * Job infrastructure: worker pools, queues, and job management.
 */

export const moduleCode = "platform-automation-jobs";
export const moduleName = "Automation Jobs";

// Core job infrastructure
export * from "./redis-queue.js";
export * from "./worker-pool.js";
export * from "./cron-scheduler.js";
