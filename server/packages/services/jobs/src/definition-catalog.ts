import type { JobDefinition, JobDefinitionCatalog } from "@athyper/server-contract-jobs";

const RESOURCE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const JOB_CODE = /^[a-z][a-z0-9_.-]{1,126}$/;

export function createJobDefinitionCatalog(definitions: readonly JobDefinition[]): JobDefinitionCatalog {
  const byHandler = new Map<string, JobDefinition>();
  const byCode = new Set<string>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (byCode.has(definition.code)) throw new Error(`Duplicate job definition code: ${definition.code}`);
    const key = handlerKey(definition.queue, definition.name);
    if (byHandler.has(key)) throw new Error(`Duplicate job handler definition: ${definition.queue}/${definition.name}`);
    byCode.add(definition.code);
    byHandler.set(key, Object.freeze({ ...definition }));
  }
  const snapshot = Object.freeze([...byHandler.values()]);
  return { get: (queue, name) => byHandler.get(handlerKey(queue, name)), list: () => snapshot };
}

function validateDefinition(definition: JobDefinition): void {
  if (!JOB_CODE.test(definition.code)) throw new Error(`Invalid job code: ${definition.code}`);
  if (!definition.owner.trim()) throw new Error(`Job ${definition.code} requires an owner`);
  if (!RESOURCE_NAME.test(definition.queue)) throw new Error(`Invalid job queue: ${definition.queue}`);
  if (!RESOURCE_NAME.test(definition.name)) throw new Error(`Invalid job name: ${definition.name}`);
  if (!definition.payloadSchema.name.trim() || !Number.isInteger(definition.payloadSchema.version)
    || definition.payloadSchema.version < 1) throw new Error(`Job ${definition.code} has an invalid payload schema`);
  if (definition.timeoutMs !== undefined && (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1)) {
    throw new Error(`Job ${definition.code} has an invalid timeout`);
  }
  if (definition.maxAttempts !== undefined && (!Number.isInteger(definition.maxAttempts) || definition.maxAttempts < 1)) {
    throw new Error(`Job ${definition.code} has invalid max attempts`);
  }
}

function handlerKey(queue: string, name: string): string {
  return `${queue}\0${name}`;
}
