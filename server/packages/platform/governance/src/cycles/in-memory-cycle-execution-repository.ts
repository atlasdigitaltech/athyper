import type { CycleCertification, CycleDeviation, CycleExecutionRepository, CycleExecutionStore, CycleRun, CycleTask, CycleTaskDependency, PublishedCycleTemplate } from "@athyper/server-contract-governance";

interface State {
  runs: Map<string, CycleRun>; tasks: Map<string, CycleTask>; dependencies: Map<string, CycleTaskDependency>;
  deviations: Map<string, CycleDeviation>; certifications: Map<string, CycleCertification>;
  runKeys: Map<string, string>; carryKeys: Map<string, string>;
}

/** Atomic reference repository used by tests and embedded deployments. Failed transactions are rolled back. */
export class InMemoryCycleExecutionRepository implements CycleExecutionRepository {
  private state: State = emptyState(); private tail: Promise<void> = Promise.resolve();
  constructor(private readonly templates: readonly PublishedCycleTemplate[] = []) {}

  async transaction<T>(actor: { readonly tenantId: string; readonly principalId: string }, operation: (store: CycleExecutionStore) => Promise<T>): Promise<T> {
    const tenantId = actor.tenantId;
    let release!: () => void; const previous = this.tail; this.tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
    const working = cloneState(this.state);
    try { const result = await operation(this.store(tenantId, working)); this.state = working; return result; } finally { release(); }
  }

  private store(tenantId: string, state: State): CycleExecutionStore {
    const tenantValues = <T extends { readonly tenantId: string }>(values: Iterable<T>): T[] => [...values].filter((item) => item.tenantId === tenantId);
    return {
      getPublishedTemplate: async (cycleTypeId, version) => this.templates.filter((item) => item.tenantId === tenantId && item.template.cycleType.id === cycleTypeId && (version === undefined || item.version === version)).sort((a, b) => b.version - a.version)[0],
      findRunByIdempotencyKey: async (key) => findTenant(state.runs, state.runKeys.get(coordinate(tenantId, key)), tenantId),
      recordRunIdempotencyKey: async (key, runId) => { unique(state.runKeys, coordinate(tenantId, key), runId); },
      getRun: async (id) => findTenant(state.runs, id, tenantId), putRun: async (run) => { owned(run, tenantId); state.runs.set(run.id, clone(run)); },
      listChildRuns: async (parentRunId) => tenantValues(state.runs.values()).filter((item) => item.parentCycleRunId === parentRunId).map(clone),
      listTasks: async (runId) => tenantValues(state.tasks.values()).filter((item) => item.cycleRunId === runId).map(clone),
      getTask: async (id) => findTenant(state.tasks, id, tenantId), putTask: async (task) => { owned(task, tenantId); state.tasks.set(task.id, clone(task)); },
      listDependencies: async (runId) => tenantValues(state.dependencies.values()).filter((item) => item.cycleRunId === runId).map(clone),
      putDependency: async (dependency) => { owned(dependency, tenantId); state.dependencies.set(dependency.id, clone(dependency)); },
      getDeviation: async (id) => findTenant(state.deviations, id, tenantId), listDeviations: async (runId) => tenantValues(state.deviations.values()).filter((item) => item.cycleRunId === runId).map(clone), putDeviation: async (deviation) => { owned(deviation, tenantId); state.deviations.set(deviation.id, clone(deviation)); },
      findDeviationCarryByIdempotencyKey: async (key) => findTenant(state.deviations, state.carryKeys.get(coordinate(tenantId, key)), tenantId),
      recordDeviationCarryIdempotencyKey: async (key, deviationId) => { unique(state.carryKeys, coordinate(tenantId, key), deviationId); },
      getCertification: async (id) => findTenant(state.certifications, id, tenantId), listCertifications: async (runId) => tenantValues(state.certifications.values()).filter((item) => item.cycleRunId === runId).map(clone), putCertification: async (certification) => { owned(certification, tenantId); state.certifications.set(certification.id, clone(certification)); },
    };
  }
}

function emptyState(): State { return { runs: new Map(), tasks: new Map(), dependencies: new Map(), deviations: new Map(), certifications: new Map(), runKeys: new Map(), carryKeys: new Map() }; }
function cloneState(state: State): State { return { runs: cloneMap(state.runs), tasks: cloneMap(state.tasks), dependencies: cloneMap(state.dependencies), deviations: cloneMap(state.deviations), certifications: cloneMap(state.certifications), runKeys: new Map(state.runKeys), carryKeys: new Map(state.carryKeys) }; }
function cloneMap<T>(values: Map<string, T>): Map<string, T> { return new Map([...values].map(([key, value]) => [key, clone(value)])); }
function clone<T>(value: T): T { return structuredClone(value); }
function coordinate(tenantId: string, key: string): string { return `${tenantId}:${key}`; }
function findTenant<T extends { readonly tenantId: string }>(values: Map<string, T>, id: string | undefined, tenantId: string): T | undefined { const value = id ? values.get(id) : undefined; return value?.tenantId === tenantId ? clone(value) : undefined; }
function owned(value: { readonly tenantId: string }, tenantId: string): void { if (value.tenantId !== tenantId) throw Object.assign(new Error("GOVERNANCE_TENANT_MISMATCH"), { code: "GOVERNANCE_TENANT_MISMATCH" }); }
function unique(values: Map<string, string>, key: string, id: string): void { const existing = values.get(key); if (existing && existing !== id) throw Object.assign(new Error("GOVERNANCE_IDEMPOTENCY_CONFLICT"), { code: "GOVERNANCE_IDEMPOTENCY_CONFLICT" }); values.set(key, id); }
