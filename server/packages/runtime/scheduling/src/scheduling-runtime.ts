import type { JobScheduler, ScheduledJobDefinition } from "@athyper/server-contract-jobs";

export interface SchedulingRuntimeOptions {
  readonly scheduler: JobScheduler;
  readonly definitions: readonly ScheduledJobDefinition[];
}

export interface SchedulingRuntime {
  start(): Promise<void>;
}

export function createSchedulingRuntime(options: SchedulingRuntimeOptions): SchedulingRuntime {
  let started = false;
  return {
    async start() {
      if (started) return;
      const ids = new Set<string>();
      for (const definition of options.definitions) {
        if (ids.has(definition.scheduleId)) {
          throw new Error(`Duplicate schedule definition: ${definition.scheduleId}`);
        }
        ids.add(definition.scheduleId);
      }
      for (const definition of options.definitions) await options.scheduler.upsert(definition);
      started = true;
    },
  };
}
