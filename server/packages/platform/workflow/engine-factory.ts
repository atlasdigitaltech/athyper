import type { Kysely } from "kysely";
import { ApproverResolverService } from "./approver-resolver.service.js";
import { WorkflowEngine, type WorkflowEngineDeps } from "./engine.js";
import { ConventionWorkflowSourceEntityAdapter } from "./source-entity-adapter.js";

export interface WorkflowEngineFactoryDeps extends Omit<WorkflowEngineDeps, "db"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
}

export function createWorkflowEngine(deps: WorkflowEngineFactoryDeps): WorkflowEngine {
  const approverResolver =
    deps.approverResolver ?? new ApproverResolverService({
      db: deps.db,
      logger: deps.logger
        ? {
            warn: deps.logger.warn ?? deps.logger.info ?? deps.logger.error,
            error: deps.logger.error,
          }
        : undefined,
    });
  const sourceEntityAdapter =
    deps.sourceEntityAdapter ?? new ConventionWorkflowSourceEntityAdapter(deps.logger);

  return new WorkflowEngine({
    ...deps,
    approverResolver,
    sourceEntityAdapter,
  });
}
