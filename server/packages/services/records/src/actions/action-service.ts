import type { Authorizer } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordActionHandler, RecordActionService } from "@athyper/server-contract-records";
import { RecordServiceError } from "../errors.js";
import { descriptorFor } from "../query-service.js";

export function createRecordActionService(options: { readonly metadata: MetadataReader; readonly authorizer: Authorizer; readonly handlers: ReadonlyMap<string, RecordActionHandler> }): RecordActionService {
  return { async execute(command) {
    const descriptor = await descriptorFor(options.metadata, command.context, command.entityCode);
    const registration = descriptor.actions?.find((item) => item.code === command.actionCode);
    if (!registration) throw new RecordServiceError(404, "ACTION_NOT_REGISTERED", "Record action is not registered");
    if (!(await options.authorizer.authorize({ context: command.context, permissionCode: registration.permissionCode, resource: { entityCode: command.entityCode, recordId: command.recordId, actionCode: command.actionCode } })).allowed) throw new RecordServiceError(403, "FORBIDDEN", "Record action is not permitted");
    const handler = options.handlers.get(registration.handlerKey);
    if (!handler) throw new RecordServiceError(503, "ACTION_HANDLER_UNAVAILABLE", "Registered action handler is unavailable");
    return handler.execute(command);
  } };
}
