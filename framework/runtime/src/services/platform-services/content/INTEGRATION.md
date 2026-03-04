# Content Management Module - Integration Guide

## Worker Registration (for Runtime Module)

When creating the content management runtime module following the RuntimeModule pattern, register the cleanup worker in the `contribute` phase:

### 1. Import Worker

```typescript
import { createCleanupOrphanedUploadsHandler } from "./jobs/workers/cleanupOrphanedUploads.worker.js";
```

### 2. Register Worker with JobQueue

In the `contribute` method:

```typescript
async contribute(c: Container) {
  const config = await c.resolve<RuntimeConfig>(TOKENS.config);
  const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
  const db = await c.resolve<Kysely<DB>>(TOKENS.db);
  const storage = await c.resolve<ObjectStorageAdapter>(TOKENS.objectStorage);
  const baseLogger = await c.resolve<Logger>(TOKENS.logger);

  // Register cleanup worker
  await jobQueue.process(
    "cleanup-orphaned-uploads",
    1, // concurrency
    createCleanupOrphanedUploadsHandler(
      db,
      storage,
      {
        orphanedThresholdHours: config.content?.cleanup?.orphanedThresholdHours ?? 24,
        maxCleanupPerRun: config.content?.cleanup?.maxCleanupPerRun ?? 100,
        deleteFromStorage: config.content?.cleanup?.deleteFromStorage ?? true,
      },
      createContentLogger(baseLogger, "cleanup"),
    ),
  );
}
```

### 3. Register Schedule

Add cron schedule to run hourly:

```typescript
const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

jobRegistry.addSchedule({
  name: "cleanup-orphaned-uploads",
  cron: "0 * * * *", // every hour at :00
  jobName: "cleanup-orphaned-uploads",
});
```

## Configuration Schema

Add to runtime config schema:

```typescript
content: {
  cleanup: {
    orphanedThresholdHours: 24,      // uploads older than this are orphaned
    maxCleanupPerRun: 100,           // safety limit per run
    deleteFromStorage: true,         // whether to delete S3 objects
  }
}
```

## Testing

### Manual Test

Trigger the worker manually:

```typescript
const handler = createCleanupOrphanedUploadsHandler(db, storage, config, logger);
await handler();
```

### Integration Test

1. Create incomplete upload (sha256 = NULL, created_at > 24h ago)
2. Run worker
3. Verify attachment deleted from DB
4. Verify S3 object deleted (if existed)

## Monitoring

The worker emits structured logs:

- `[content:worker:cleanup-orphaned] Starting cleanup`
- `[content:worker:cleanup-orphaned] Found orphaned uploads`
- `[content:worker:cleanup-orphaned] Cleanup completed`

Monitor metrics:
- `found` - total orphaned uploads found
- `deletedFromStorage` - S3 objects deleted
- `deletedFromDb` - DB records deleted
- `errors` - count of failures

## Safety Features

1. **Age Threshold**: Only deletes uploads older than configured threshold (default 24h)
2. **Batch Limit**: Processes max N records per run (default 100)
3. **Graceful S3 Failures**: If S3 object doesn't exist, logs debug and continues
4. **Error Isolation**: Failures on individual uploads don't stop the batch
5. **High Error Rate Warning**: Logs warning if >50% of batch fails
