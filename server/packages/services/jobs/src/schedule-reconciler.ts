import type { JobDefinitionCatalog, JobExecutionCoordinate, JobScheduleRepository, JobScheduler, GovernedScheduleRecord } from "@athyper/server-contract-jobs";

type PlaneKey = JobExecutionCoordinate["planeKey"];

export interface JobScheduleReconcilerOptions {
  readonly planes: readonly PlaneKey[];
  readonly repository: JobScheduleRepository;
  readonly scheduler: JobScheduler & Required<Pick<JobScheduler, "listScheduleIds">>;
  readonly catalog: JobDefinitionCatalog;
  readonly now?: () => Date;
  readonly ignoreUnknownHandlers?: boolean;
  readonly onRejected?: (scheduleCode: string, reason: string) => void;
}

export interface JobScheduleReconciler {
  reconcile(): Promise<{ readonly upserted: number; readonly removed: number }>;
}

export function createJobScheduleReconciler(options: JobScheduleReconcilerOptions): JobScheduleReconciler {
  const now = options.now ?? (() => new Date());
  return {
    async reconcile() {
      const nextScheduleIds = new Set<string>();
      const schedules: GovernedScheduleRecord[] = [];
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
          const definition = { ...record.definition, scheduleId: `${planeKey}:${record.id}` };
          if (nextScheduleIds.has(definition.scheduleId)) throw new Error(`Duplicate governed schedule: ${definition.scheduleId}`);
          nextScheduleIds.add(definition.scheduleId);
          schedules.push({ ...record, definition });
        }
      }
      const ownedScheduleIds = await options.scheduler.listScheduleIds();
      // Install every tenant's replacement before retiring a shared legacy ID.
      // The durable scheduler owner registry locates the legacy queue after restart.
      for (const record of schedules) {
        await options.scheduler.upsert(record.definition);
        upserted += 1;
      }
      // Plane-qualified IDs are reserved for database-governed schedules (both
      // legacy plane:code and canonical plane:UUID). Code-owned IDs are unqualified.
      const managedPrefixes = options.planes.map((planeKey) => `${planeKey}:`);
      for (const scheduleId of ownedScheduleIds) {
        if (managedPrefixes.some((prefix) => scheduleId.startsWith(prefix))
          && !nextScheduleIds.has(scheduleId)
          && await options.scheduler.remove(scheduleId)) removed += 1;
      }
      for (const record of schedules) {
        await options.repository.markReconciled({
          planeKey: record.planeKey,
          scheduleId: record.id,
          reconciledAt: now().toISOString(),
        });
      }
      return { upserted, removed };
    },
  };
}
