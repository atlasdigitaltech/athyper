/**
 * Approval Instance Module (Run-Time)
 *
 * This module provides runtime management of approval instances:
 * - Instance creation triggered by business events
 * - Step materialization with dynamic approver resolution
 * - Entity state locking during approval
 * - Action recording and history
 *
 * @module approval/instance
 */

// Types
export type {
  // Status types
  ApprovalInstanceStatus,
  EntityLockMode,
  EntityApprovalState,
  StepInstanceStatus,
  ApproverAssignmentStatus,

  // Instance types
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
  ApprovalActionRecord,

  // Entity management types
  EntityLock,
  EntityStateTransition,

  // Input/output types
  CreateApprovalInstanceInput,
  CreateApprovalInstanceResult,
  ApprovalInstanceQueryOptions,

  // Interface types
  IApprovalInstanceRepository,
  IApprovalInstanceService,
  IEntityStateHandler,
} from "./types.js";

// Repository
export {
  InMemoryApprovalInstanceRepository,
  DatabaseApprovalInstanceRepository,
  createInMemoryApprovalInstanceRepository,
  createDatabaseApprovalInstanceRepository,
} from "./repository.js";

// Service
export {
  ApprovalInstanceService,
  ApprovalInstanceError,
  DefaultEntityStateHandler,
  createApprovalInstanceService,
} from "./service.js";

// API
export {
  ApprovalInstanceApiController,
  getApprovalInstanceRoutes,
  createApprovalInstanceApiController,
  type CreateInstanceRequest,
  type CreateInstanceResponse,
  type GetInstanceResponse,
  type ListInstancesResponse,
  type GetStepInstancesResponse,
  type GetActionHistoryResponse,
  type CancelInstanceRequest,
  type CancelInstanceResponse,
  type WithdrawInstanceRequest,
  type WithdrawInstanceResponse,
  type HoldInstanceRequest,
  type HoldInstanceResponse,
  type ReleaseInstanceResponse,
  type CheckLockResponse,
  type PendingApprovalsResponse,
  type InstanceCountsResponse,
  type RouteDefinition,
} from "./api.js";
