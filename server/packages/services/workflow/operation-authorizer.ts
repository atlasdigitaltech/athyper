import type { WorkflowRuntimeDb } from "./runtime.types.js";
import { WorkflowRuntimeError } from "./runtime-errors.js";

export interface RuntimePermissionDecision {
  decision: string;
  reason?: string;
}

export type RuntimeCheckPermissionFn = (
  db: WorkflowRuntimeDb,
  tenantId: string,
  principalId: string,
  permissionCode: string,
  context?: Record<string, unknown>,
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  },
) => Promise<RuntimePermissionDecision>;

export interface OperationAuthorizerDeps {
  db: WorkflowRuntimeDb;
  checkPermission?: RuntimeCheckPermissionFn;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

export interface EntityOperationMetadata {
  permissionCode: string;
  handlerType: string;
  handlerTarget: string | null;
  executionTarget?: string | null;
  isRecordRequired: boolean;
  isEnabled: boolean;
}

export interface AuthorizeOperationParams {
  tenantId: string;
  principalId: string;
  entityName: string;
  entityId: string;
  operationCode: string;
}

export class OperationAuthorizer {
  constructor(private readonly deps: OperationAuthorizerDeps) {}

  async authorize(params: AuthorizeOperationParams): Promise<EntityOperationMetadata> {
    const operation = await this.resolveOperation(
      params.entityName,
      params.operationCode,
      params.tenantId,
    );

    if (!operation) {
      throw new WorkflowRuntimeError(
        "OPERATION_NOT_FOUND",
        `Operation '${params.operationCode}' not found for entity '${params.entityName}'`,
      );
    }

    if (!operation.isEnabled) {
      throw new WorkflowRuntimeError(
        "OPERATION_DISABLED",
        `Operation '${params.operationCode}' is disabled for entity '${params.entityName}'`,
      );
    }

    if (!this.deps.checkPermission) {
      throw new WorkflowRuntimeError(
        "OPERATION_DENIED",
        "Permission checker is not wired for workflow runtime authorization",
        403,
      );
    }

    const decision = await this.deps.checkPermission(
      this.deps.db,
      params.tenantId,
      params.principalId,
      operation.permissionCode,
      {
        entity_type: params.entityName,
        entity_id: params.entityId,
        operation_code: params.operationCode,
      },
      this.deps.logger,
    );

    if (decision.decision !== "allow") {
      throw new WorkflowRuntimeError(
        "OPERATION_DENIED",
        "Permission not granted",
        403,
        {
          decision: decision.decision,
          reason: decision.reason,
          permission_code: operation.permissionCode,
        },
      );
    }

    return operation;
  }

  async resolveOperation(
    entityName: string,
    operationCode: string,
    tenantId: string,
  ): Promise<EntityOperationMetadata | null> {
    const row = await this.deps.db
      .selectFrom("control.entity_operation as eo" as never)
      .select([
        "eo.permission_code",
        "eo.handler_type",
        "eo.handler_target",
        "eo.execution_target",
        "eo.is_record_required",
        "eo.is_enabled",
      ] as never[])
      .where("eo.entity_name" as never, "=" as never, entityName as never)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((eb: any) =>
        eb.or([
          eb("eo.permission_code" as never, "=" as never, operationCode as never),
          eb("eo.permission_code" as never, "like" as never, (`%.${operationCode}`) as never),
        ]),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((eb: any) =>
        eb.or([
          eb("eo.tenant_id" as never, "is" as never, null),
          eb("eo.tenant_id" as never, "=" as never, tenantId as never),
        ]),
      )
      .orderBy("eo.tenant_id" as never, "desc")
      .limit(1)
      .executeTakeFirst() as {
        permission_code: string;
        handler_type: string;
        handler_target: string | null;
        execution_target: string | null;
        is_record_required: boolean;
        is_enabled: boolean;
      } | undefined;

    if (!row) return null;
    return {
      permissionCode: row.permission_code,
      handlerType: row.handler_type,
      handlerTarget: row.handler_target,
      executionTarget: row.execution_target,
      isRecordRequired: row.is_record_required,
      isEnabled: row.is_enabled,
    };
  }
}
