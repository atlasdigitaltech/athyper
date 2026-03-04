/**
 * Cron Scheduler — BullMQ Repeatable Jobs
 *
 * Reads schedule definitions from JobRegistry and creates BullMQ repeatable jobs.
 * Each schedule maps a cron pattern to a job name, causing that job to be
 * enqueued on the queue at the specified interval.
 *
 * Lifecycle:
 *   start() — registers all repeatable jobs from JobRegistry
 *   stop()  — removes all repeatable jobs for clean shutdown
 */

import type { Logger } from "../../../kernel/logger.js";
import type { JobRegistry } from "../../platform/foundation/registries/jobs.registry.js";
import type { JobQueue } from "@athyper/core";
import type { Queue } from "bullmq";

export interface CronSchedulerConfig {
    jobQueue: JobQueue;
    jobRegistry: JobRegistry;
    logger: Logger;
}

export class CronScheduler {
    private started = false;

    constructor(private config: CronSchedulerConfig) {}

    /**
     * Start the scheduler — creates BullMQ repeatable jobs for all registered schedules.
     * Must be called AFTER all modules have contributed their schedules to JobRegistry.
     */
    async start(): Promise<void> {
        if (this.started) {
            throw new Error("Scheduler already started");
        }

        const schedules = this.config.jobRegistry.listSchedules();
        this.config.logger.info({
            msg: "scheduler_starting",
            scheduleCount: schedules.length,
        });

        // Access the underlying BullMQ Queue for repeat options
        const queue = this.getBullQueue();

        for (const schedule of schedules) {
            await queue.add(
                schedule.jobName,
                {
                    type: schedule.jobName,
                    payload: {},
                    metadata: {
                        scheduleName: schedule.name,
                        scheduledBy: "cron-scheduler",
                    },
                },
                {
                    repeat: { pattern: schedule.cron },
                    jobId: `schedule:${schedule.name}`,
                },
            );

            this.config.logger.info({
                msg: "schedule_registered",
                name: schedule.name,
                cron: schedule.cron,
                jobName: schedule.jobName,
            });
        }

        this.started = true;
        this.config.logger.info({
            msg: "scheduler_started",
            scheduleCount: schedules.length,
        });
    }

    /**
     * Stop the scheduler — removes all repeatable jobs for clean shutdown.
     */
    async stop(): Promise<void> {
        if (!this.started) return;

        this.config.logger.info({ msg: "scheduler_stopping" });

        const queue = this.getBullQueue();
        const repeatableJobs = await queue.getRepeatableJobs();
        for (const rj of repeatableJobs) {
            await queue.removeRepeatableByKey(rj.key);
        }

        this.started = false;
        this.config.logger.info({ msg: "scheduler_stopped" });
    }

    isRunning(): boolean {
        return this.started;
    }

    /**
     * Get the underlying BullMQ Queue from the JobQueue adapter.
     */
    private getBullQueue(): Queue {
        const queue = (this.config.jobQueue as any).getQueue?.();
        if (!queue) {
            throw new Error(
                "jobQueue does not expose getQueue() — cannot register repeatable jobs",
            );
        }
        return queue as Queue;
    }
}
