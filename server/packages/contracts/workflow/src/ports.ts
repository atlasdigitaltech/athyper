import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { CreateWorkItemCommand, ListInboxQuery, WorkItem, WorkItemActionCommand, WorkItemActionResult, WorkItemListResult } from "./work-items.js";

export interface WorkflowService {
  create(command: CreateWorkItemCommand): Promise<WorkItemActionResult>;
  listInbox(query: ListInboxQuery): Promise<WorkItemListResult>;
  claim(command: WorkItemActionCommand): Promise<WorkItemActionResult>;
  complete(command: WorkItemActionCommand): Promise<WorkItemActionResult>;
  cancel(command: WorkItemActionCommand): Promise<WorkItemActionResult>;
  act(command: WorkItemActionCommand & { readonly action: string; readonly expectedRowVersion: number }): Promise<WorkItemActionResult>;
  getRequestContext(context: import("@athyper/server-contract-auth").VerifiedRequestContext, requestId: string): Promise<WorkflowRequestContext | null>;
}

export interface WorkflowRepositoryCreateInput {
  readonly command: CreateWorkItemCommand;
  readonly descriptor: EntityRuntimeDescriptor;
}

export interface WorkflowRepository<Transaction = unknown> {
  create(input: WorkflowRepositoryCreateInput, transaction: Transaction): Promise<WorkItem>;
  listInbox(query: ListInboxQuery, transaction: Transaction): Promise<WorkItemListResult>;
  get(tenantId: string, workItemId: string, transaction: Transaction): Promise<WorkItem | null>;
  action(tenantId: string, workItemId: string, principalId: string, action: string, expectedRowVersion: number, outcome: Readonly<Record<string, unknown>>, transaction: Transaction): Promise<WorkItem | null>;
  getRequestContext?(tenantId: string, requestId: string, transaction: Transaction): Promise<WorkflowRequestContext | null>;
}


export interface WorkflowRequestContext {
  readonly request: Readonly<Record<string, unknown>>;
  readonly stages: readonly Readonly<Record<string, unknown>>[];
  readonly items: readonly WorkItem[];
  readonly activeRevision?: import("./work-items.js").WorkflowRevisionCoordinate;
}

export interface DomainCommand {
  readonly name: string;
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}
export interface DomainCommandHandler<Transaction = unknown> { execute(command: DomainCommand, transaction: Transaction): Promise<void>; }
export interface DomainCommandRegistry<Transaction = unknown> {
  register(name: string, handler: DomainCommandHandler<Transaction>): void;
  execute(command: DomainCommand, transaction: Transaction): Promise<void>;
}
