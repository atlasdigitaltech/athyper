import type { JobDefinitionCatalog, JobExecutionCoordinate, JobScheduleRepository, JobScheduler, ScheduledJobDefinition } from "@athyper/server-contract-jobs";

type PlaneKey = JobExecutionCoordinate["planeKey"];

export interface JobScheduleReconcilerOptions {
  readonly planes: readonly PlaneKey[];
  readonly repository: JobScheduleRepository;
  readonly scheduler: JobScheduler;
  readonly catalog: JobDefinitionCatalog;
  readonly now?: () => Date;
  readonly ignoreUnknownHandlers?: boolean;
  readonly onRejected?: (scheduleCode: string, reason: string) => void;
}

export interface JobScheduleReconciler {
  reconcile(): Promise<{ readonly upserted: number; readonly removed: number }>;
}

export function createJobScheduleReconciler(options: JobScheduleReconcilerOptions): JobScheduleReconciler {
  const activeScheduleIds = new Set<string>();
  const now = options.now ?? (() => new Date());
  return {
    async reconcile() {
      const nextScheduleIds = new Set<string>();
      let upserted = 0;
      let removed = 0;
      for (const planeKey of options.planes) {
        const records = await options.repository.listActive(planeKey);
        for (const record of records) {
          if (record.planeKey !== planeKey) throw new Error(`Schedule ${record.code} crossed plane boundary`);
          const registered = options.catalog.get(record.definition.queue, record.definition.name);
          if (!registered) {
            const reason = `Schedule ${record.code} references unregistered handler ${record.definition.queue}/${record.definition.name}`;
            if (!options.ignoreUnknownHandlers) throw new Error(reason);
            options.onRejected?.(record.code, reason);
            continue;
          }
          if (record.handlerType !== registered.code && record.handlerType !== registered.name) {
            throw new Error(`Schedule ${record.code} handler type ${record.handlerType} does not match ${registered.code}`);
          }
          if (registered.scope === "tenant" && !record.tenantId) throw new Error(`Tenant-scoped schedule ${record.code} requires tenantId`);
          const definition = withPlaneScheduleId(planeKey, record.definition);
          if (nextScheduleIds.has(definition.scheduleId)) throw new Error(`Duplicate governed schedule: ${definition.scheduleId}`);
          nextScheduleIds.add(definition.scheduleId);
          await options.scheduler.upsert(definition);
          await options.repository.markReconciled({ planeKey, scheduleId: record.id, reconciledAt: now().toISOString() });
          upserted += 1;
        }
      }
      for (const scheduleId of activeScheduleIds) {
        if (!nextScheduleIds.has(scheduleId) && await options.scheduler.remove(scheduleId)) removed += 1;
      }
      activeScheduleIds.clear();
      for (const scheduleId of nextScheduleIds) activeScheduleIds.add(scheduleId);
      return { upserted, removed };
    },
  };
}

function withPlaneScheduleId(planeKey: PlaneKey, definition: ScheduledJobDefinition): ScheduledJobDefinition {
  const prefix = `${planeKey}:`;
  return definition.scheduleId.startsWith(prefix) ? definition : { ...definition, scheduleId: `${prefix}${definition.scheduleId}` };
}
