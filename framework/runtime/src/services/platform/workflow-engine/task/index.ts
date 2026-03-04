/**
 * Approval Task Module
 *
 * This module provides task management for approval workflows including:
 *
 * Task Management:
 * - Task creation per approver when steps are activated
 * - Task ownership and SLA due date tracking
 * - Task completion, delegation, and reassignment
 *
 * Inbox & Work Queue:
 * - User inbox with filtering and sorting
 * - Work queue with urgency-based prioritization
 * - Summary views (counts by status, priority, SLA)
 *
 * Notifications:
 * - Multi-channel notifications (email, in-app, push, SMS, webhook)
 * - Task assignment, reminder, and SLA notifications
 * - User notification preferences
 * - Notification templates
 *
 * @module approval/task
 */

// Types
export type {
  // Task types
  ApprovalTask,
  ApprovalTaskStatus,
  TaskPriority,
  TaskType,

  // Inbox & Work Queue
  InboxFilterOptions,
  InboxSummary,
  WorkQueueItem,
  WorkQueueConfig,

  // Notification types
  NotificationChannel,
  NotificationType,
  NotificationPriority,
  NotificationStatus,
  NotificationRecipient,
  NotificationTemplate,
  NotificationRecord,
  NotificationPreferences,
  ReminderSchedule,

  // Service interfaces
  IApprovalTaskRepository,
  INotificationService,
  IApprovalTaskService,
  INotificationSender,
} from "./types.js";

// Constants
export { DEFAULT_WORK_QUEUE_CONFIG } from "./types.js";

// Repository
export {
  InMemoryApprovalTaskRepository,
  DatabaseApprovalTaskRepository,
  createInMemoryApprovalTaskRepository,
  createDatabaseApprovalTaskRepository,
} from "./repository.js";

// Task Service
export {
  ApprovalTaskService,
  createApprovalTaskService,
} from "./service.js";

// Notification Service
export {
  NotificationService,
  createNotificationService,
} from "./notification.service.js";

// API
export {
  ApprovalTaskApiController,
  getApprovalTaskRoutes,
  createApprovalTaskApiController,
  type GetInboxRequest,
  type GetInboxResponse,
  type GetInboxSummaryResponse,
  type GetWorkQueueRequest,
  type GetWorkQueueResponse,
  type GetTaskResponse,
  type MarkTaskReadResponse,
  type CompleteTaskRequest,
  type CompleteTaskResponse,
  type DelegateTaskRequest,
  type DelegateTaskResponse,
  type ReassignTaskRequest,
  type ReassignTaskResponse,
  type GetNotificationsRequest,
  type GetNotificationsResponse,
  type GetPreferencesResponse,
  type UpdatePreferencesRequest,
  type UpdatePreferencesResponse,
  type RouteDefinition,
} from "./api.js";
